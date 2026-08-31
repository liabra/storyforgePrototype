import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prisma/client";
import { SceneMode, SceneStatus } from "../generated/prisma/client";
import { generateImage } from "./image.service";

const characterSelect = {
  select: { id: true, name: true, nickname: true },
} as const;

const charFullSelect = {
  select: { id: true, name: true, nickname: true, avatarUrl: true },
} as const;

// ── Phase A : source de vérité = storyId ──────────────────────────────────────

export const getScenesByStory = (storyId: string) =>
  prisma.scene.findMany({
    where: { storyId },
    orderBy: { order: "asc" },
    include: {
      characters: characterSelect,
      _count: { select: { contributions: true } },
    },
  });

// Conservé en Phase A pour la compatibilité des anciennes routes /chapters/:id/scenes
export const getScenesByChapter = (chapterId: string) =>
  prisma.scene.findMany({
    where: { chapterId },
    orderBy: { order: "asc" },
    include: {
      characters: characterSelect,
      _count: { select: { contributions: true } },
    },
  });

export const getSceneWithContributions = (sceneId: string) =>
  prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
      characters: characterSelect,
      contributions: {
        where: { modStatus: { not: "BLOCKED" } },
        orderBy: { createdAt: "asc" },
        include: {
          character: charFullSelect,
          user: { select: { id: true, email: true, displayName: true, color: true } },
        },
      },
    },
  });

// Phase A : createScene prend storyId comme source de vérité
// chapterId reste optionnel pour la compatibilité avec les scènes existantes
export const createScene = async (
  storyId: string,
  data: { title: string; description?: string; order?: number },
  chapterId?: string,
) => {
  const scene = await prisma.scene.create({
    data: { ...data, storyId, ...(chapterId ? { chapterId } : {}) },
    include: {
      characters: characterSelect,
      _count: { select: { contributions: true } },
    },
  });
  return scene;
};

export const updateScene = (
  id: string,
  data: {
    title?: string;
    description?: string;
    order?: number;
    imageUrl?: string;
    status?: SceneStatus;
    visibilityMode?: string;
    visibleCount?: number;
    mode?: SceneMode;
    currentTurnUserId?: string | null;
  }
) =>
  prisma.scene.update({
    where: { id },
    data,
    include: {
      characters: characterSelect,
      _count: { select: { contributions: true } },
    },
  });

export const deleteScene = (id: string) =>
  prisma.scene.delete({ where: { id } });

export const updateSceneCharacters = (id: string, characterIds: string[]) =>
  prisma.scene.update({
    where: { id },
    data: { characters: { set: characterIds.map((cid) => ({ id: cid })) } },
    include: {
      characters: characterSelect,
      _count: { select: { contributions: true } },
    },
  });

export const generateSceneImage = async (id: string) => {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id },
    include: {
      story: true,   // Phase A : via storyId direct
      characters: true,
    },
  });

  const characterNames = scene.characters
    .map((c) => c.name || c.nickname)
    .filter((n): n is string => !!n);

  const imageUrl = await generateImage({
    sceneTitle: scene.title,
    storyTitle: scene.story.title,
    content: scene.description,
    characterNames,
  });

  return prisma.scene.update({
    where: { id },
    data: { imageUrl },
    include: {
      characters: characterSelect,
      _count: { select: { contributions: true } },
    },
  });
};

export const suggestSceneIdea = async (
  storyId: string,
  sceneTitle?: string
): Promise<string> => {
  const story = await prisma.story.findUniqueOrThrow({
    where: { id: storyId },
    include: {
      characters: true,
      scenes: { orderBy: { order: "asc" } }, // Phase A : via relation directe
    },
  });

  const charactersList = story.characters
    .map((c) => c.name || c.nickname)
    .filter(Boolean)
    .join(", ");

  const scenesList = story.scenes.map((s) => `"${s.title}"`).join(", ");

  const prompt = [
    `Histoire : "${story.title}"`,
    story.description ? `Description : ${story.description}` : "",
    charactersList ? `Personnages : ${charactersList}` : "",
    scenesList ? `Scènes existantes : ${scenesList}` : "",
    sceneTitle ? `Scène en cours : "${sceneTitle}"` : "",
    "\nSuggère une idée courte pour inspirer l'auteur.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      systemInstruction:
        "Tu es un assistant créatif pour les auteurs. Tu proposes des idées courtes et inspirantes, sans jamais écrire à leur place. Réponds en une seule phrase courte (max 2 lignes).",
      generationConfig: { maxOutputTokens: 120, temperature: 0.9 },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || "Aucune idée générée.";
  } catch (err) {
    console.error("[suggestSceneIdea] échec Gemini:", err);
    return "Aucune idée pour l'instant — réessaie dans un instant.";
  }
};
