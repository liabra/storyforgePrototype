import OpenAI from "openai";
import prisma from "../prisma/client";
import { generateImage } from "./image.service";

// Calcule le texte visible selon le mode de visibilité.
// Fonction pure — n'accède pas à la base.
export function applyVisibility(
  content: string | null,
  mode: string,
  visibleLines: number
): string | null {
  if (!content) return null;
  if (mode === "full") return content;
  // "last_lines" : retourne les N dernières lignes
  const lines = content.split("\n");
  return lines.slice(-visibleLines).join("\n");
}

export const getScenesByStory = async (storyId: string) => {
  const scenes = await prisma.scene.findMany({
    where: { storyId },
    orderBy: { order: "asc" },
  });
  return scenes.map((scene) => ({
    ...scene,
    visibleContent: applyVisibility(
      scene.content,
      scene.visibilityMode,
      scene.visibleLines
    ),
  }));
};

export const createScene = (
  storyId: string,
  data: { title: string; content?: string; order?: number }
) => prisma.scene.create({ data: { ...data, storyId } });

export const updateScene = (
  id: string,
  data: {
    title?: string;
    content?: string;
    order?: number;
    imageUrl?: string;
    visibilityMode?: string;
    visibleLines?: number;
  }
) => prisma.scene.update({ where: { id }, data });

export const deleteScene = (id: string) =>
  prisma.scene.delete({ where: { id } });

// Génère une image pour la scène via image.service (provider sélectionné par IMAGE_PROVIDER).
// Retourne la scène mise à jour avec l'imageUrl.
export const generateSceneImage = async (id: string) => {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id },
    include: { story: { include: { characters: true } } },
  });

  const characterNames = scene.story.characters
    .map((c) => c.name || c.nickname)
    .filter((n): n is string => !!n);

  const imageUrl = await generateImage({
    sceneTitle: scene.title,
    storyTitle: scene.story.title,
    content: scene.content,
    characterNames,
  });

  return prisma.scene.update({ where: { id }, data: { imageUrl } });
};

// Suggère une courte idée de scène pour inspirer le joueur.
// Ne modifie pas la base — retourne seulement { idea: string }.
export const suggestSceneIdea = async (
  storyId: string,
  sceneTitle?: string
): Promise<string> => {
  const story = await prisma.story.findUniqueOrThrow({
    where: { id: storyId },
    include: { characters: true, scenes: { orderBy: { order: "asc" } } },
  });

  const charactersList = story.characters
    .map((c) => c.name || c.nickname)
    .filter(Boolean)
    .join(", ");

  const scenesList = story.scenes
    .map((s) => `"${s.title}"`)
    .join(", ");

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
          "\nSuggère une idée courte pour inspirer l'auteur dans l'écriture de sa prochaine scène.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  return completion.choices[0].message.content ?? "Aucune idée générée.";
};
