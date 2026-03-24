import OpenAI from "openai";
import prisma from "../prisma/client";
import { SceneMode, SceneStatus } from "../generated/prisma/client";
import { generateImage } from "./image.service";

const characterSelect = {
  select: { id: true, name: true, nickname: true },
} as const;

const charFullSelect = {
  select: { id: true, name: true, nickname: true, avatarUrl: true },
} as const;

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

export const createScene = async (
  chapterId: string,
  data: { title: string; description?: string; order?: number }
) => {
  const scene = await prisma.scene.create({
    data: { ...data, chapterId },
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
      chapter: { include: { story: true } },
      characters: true,
    },
  });

  const characterNames = scene.characters
    .map((c) => c.name || c.nickname)
    .filter((n): n is string => !!n);

  const imageUrl = await generateImage({
    sceneTitle: scene.title,
    storyTitle: scene.chapter.story.title,
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
      chapters: {
        orderBy: { order: "asc" },
        include: { scenes: { orderBy: { order: "asc" } } },
      },
    },
  });

  const charactersList = story.characters
    .map((c) => c.name || c.nickname)
    .filter(Boolean)
    .join(", ");

  const allScenes = story.chapters.flatMap((ch) => ch.scenes);
  const scenesList = allScenes.map((s) => `"${s.title}"`).join(", ");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Tu es un assistant créatif pour les auteurs. Tu proposes des idées courtes et inspirantes, sans jamais écrire à leur place. Réponds en une seule phrase courte (max 2 lignes).",
      },
      {
        role: "user",
        content: [
          `Histoire : "${story.title}"`,
          story.description ? `Description : ${story.description}` : "",
          charactersList ? `Personnages : ${charactersList}` : "",
          scenesList ? `Scènes existantes : ${scenesList}` : "",
          sceneTitle ? `Scène en cours : "${sceneTitle}"` : "",
          "\nSuggère une idée courte pour inspirer l'auteur.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return completion.choices[0].message.content ?? "Aucune idée générée.";
};
