/**
 * ai.service.ts
 *
 * Service "Maître du jeu" — génère une courte intervention narrative
 * à partir du contexte d'une scène collaborative.
 *
 * Provider : Google Gemini Flash (économique, réponse courte)
 * Clé      : process.env.GEMINI_API_KEY
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prisma/client";

export type GmMode = "twist" | "nudge" | "ending_hint";

const SYSTEM_PROMPT = `Tu es le maître du jeu discret d'une application d'écriture collaborative.
Ton rôle est d'enrichir l'histoire sans jamais écrire à la place des joueurs.
Tu produis exactement 1 à 2 phrases, jamais plus.
Selon le mode demandé :
- twist : introduis un rebondissement, un obstacle inattendu ou un mystère qui relance la scène
- nudge : relance doucement la scène si elle semble stagner, sans brusquer les joueurs
- ending_hint : suggère subtilement qu'une fin de scène approche, laisse la porte ouverte
Tu restes strictement cohérent avec le contexte fourni.
Tu ne résous jamais totalement l'histoire.
Tu retournes uniquement le texte final, sans explication ni balise.`;

const MODE_INSTRUCTION: Record<GmMode, string> = {
  twist: "Propose un rebondissement ou un élément imprévu qui relance la scène.",
  nudge: "La scène stagne. Relance-la subtilement sans forcer la main des joueurs.",
  ending_hint: "Suggère discrètement qu'une fin de scène semble proche.",
};

/**
 * Garantit que la réponse ne dépasse pas 2 phrases.
 * Découpe sur les fins de phrase (. ! ?) et reconstruit proprement.
 */
function truncateToTwoSentences(text: string): string {
  // Découpe en phrases en conservant le signe de ponctuation
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length <= 2) return text.trim();
  return sentences.slice(0, 2).join(" ").trim();
}

export async function generateGmSuggestion(
  sceneId: string,
  mode: GmMode
): Promise<string> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: {
      title: true,
      description: true,
      story: { select: { title: true, description: true } },
      contributions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { content: true },
      },
    },
  });

  if (!scene) throw new Error("Scène introuvable");

  const lastContribs = [...scene.contributions]
    .reverse()
    .map((c) => `- ${c.content.slice(0, 200)}`)
    .join("\n");

  const contextBlock = [
    `Histoire : "${scene.story.title}"`,
    scene.story.description ? `Contexte : ${scene.story.description}` : "",
    `Scène : "${scene.title}"`,
    scene.description ? `Description de la scène : ${scene.description}` : "",
    lastContribs
      ? `Dernières contributions :\n${lastContribs}`
      : "Aucune contribution encore.",
    `\nInstruction : ${MODE_INSTRUCTION[mode]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante dans l'environnement");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 120,
      temperature: 0.85,
    },
  });

  const result = await model.generateContent(contextBlock);
  const raw = result.response.text().trim();
  const text = truncateToTwoSentences(raw);

  console.log(`[ai.service] GM (${mode}) scène ${sceneId} : ${text.slice(0, 80)}…`);

  return text || "Le destin hésite encore…";
}
