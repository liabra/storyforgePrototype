/**
 * world.service.ts
 * Extraction de fragments narratifs après une histoire terminée.
 * Injection de fragments dans une nouvelle session.
 * Aucun identifiant joueur — anonymat total.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prisma/client";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Types locaux ──────────────────────────────────────────────────────────────

interface RawFragment {
  type: "OBJECT" | "PLACE" | "PHRASE" | "CHARACTER";
  genre: "FANTASY" | "HORROR" | "CONTEMPORARY" | "SF" | "ROMANCE" | "MYSTERY" | "MIXED";
  label: string;
}

// ── Extraction post-session ────────────────────────────────────────────────────

export async function extractFragmentsFromStory(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      scenes: {
        include: {
          contributions: {
            orderBy: { createdAt: "asc" },
            take: 20,
            select: { content: true },
          },
        },
        where: { status: "DONE" },
      },
    },
  });

  if (!story) return;

  const allText = story.scenes
    .flatMap((s) => s.contributions.map((c) => c.content))
    .join("\n")
    .slice(0, 3000);

  if (allText.trim().length < 100) return;

  const prompt = `Tu lis un extrait d'une histoire de fiction collaborative.
Extrait : """
${allText}
"""

Identifie 2 à 3 éléments mémorables et réutilisables de cette histoire.
Chaque élément doit être :
- Suffisamment original pour enrichir une autre histoire
- Suffisamment vague pour ne pas trahir l'histoire source
- Anonymisé : aucun nom de joueur, aucun contexte identifiable

Réponds UNIQUEMENT avec un tableau JSON valide, sans explication, sans balise markdown :
[
  { "type": "OBJECT|PLACE|PHRASE|CHARACTER", "genre": "FANTASY|HORROR|CONTEMPORARY|SF|ROMANCE|MYSTERY|MIXED", "label": "description courte en français" }
]`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
  });

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    const fragments: RawFragment[] = JSON.parse(clean);

    for (const f of fragments) {
      if (!f.type || !f.label || f.label.length < 3) continue;

      await prisma.worldFragment.create({
        data: {
          type: f.type,
          genre: f.genre ?? "MIXED",
          label: f.label.slice(0, 200),
          sourceStoryId: storyId,
        },
      });
    }

    console.log(`[world.service] ${fragments.length} fragments extraits de l'histoire ${storyId}`);
  } catch (err) {
    console.error("[world.service] Erreur extraction fragments :", err);
  }
}

// ── Injection au démarrage d'une session ──────────────────────────────────────

export async function getWorldSeed(genre?: string): Promise<string | null> {
  try {
    const genreFilter = genre?.toUpperCase() as any;

    const fragments = await prisma.worldFragment.findMany({
      where: genreFilter && genreFilter !== "MIXED"
        ? { OR: [{ genre: genreFilter }, { genre: "MIXED" }] }
        : {},
      orderBy: { weight: "desc" },
      take: 20,
    });

    if (fragments.length === 0) return null;

    const pool = fragments.slice(0, Math.min(10, fragments.length));
    const picked = pool[Math.floor(Math.random() * pool.length)];

    await prisma.worldFragment.update({
      where: { id: picked.id },
      data: { weight: { increment: 1 } },
    });

    return picked.label;
  } catch (err) {
    console.error("[world.service] Erreur injection fragment :", err);
    return null;
  }
}
