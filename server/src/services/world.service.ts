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
      characters: {
        select: {
          name: true,
          nickname: true,
          role: true,
          shortDescription: true,
          appearance: true,
          personality: true,
          traits: true,
          accessories: true,
        },
      },
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
    .slice(0, 2500);

  if (allText.trim().length < 100) return;

  // Résumé des personnages
  const characterContext = story.characters.length > 0
    ? story.characters.map((c) => {
        const name = c.name ?? c.nickname ?? "Personnage sans nom";
        const details = [c.role, c.shortDescription, c.appearance, c.personality, c.traits, c.accessories]
          .filter(Boolean).join(", ");
        return details ? `${name} (${details})` : name;
      }).join("\n")
    : null;

  const prompt = `Tu lis une histoire de fiction collaborative terminée.
${characterContext ? `\nPersonnages de l'histoire :\n${characterContext}\n` : ""}
Extrait de l'histoire :
"""
${allText}
"""

Identifie 2 à 3 éléments mémorables et réutilisables de cette histoire.
Chaque élément doit être :
- Suffisamment original pour enrichir une autre histoire
- Suffisamment vague pour ne pas trahir l'histoire source
- Anonymisé : aucun nom de joueur, aucun contexte identifiable
- Peut être inspiré des personnages, des lieux, des objets ou des phrases marquantes

Réponds UNIQUEMENT avec un tableau JSON valide, sans explication, sans balise markdown :
[
  { "type": "OBJECT|PLACE|PHRASE|CHARACTER", "genre": "FANTASY|HORROR|CONTEMPORARY|SF|ROMANCE|MYSTERY|MIXED", "label": "description courte en français" }
]`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  });

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    console.log("[world.service] Réponse brute Gemini :", raw.slice(0, 500));

    // Nettoyage robuste du JSON
    let clean = raw.replace(/```json|```/g, "").trim();

    // Trouver le tableau JSON même si la réponse est tronquée
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");

    if (start === -1) {
      console.warn("[world.service] Pas de tableau JSON dans la réponse");
      return;
    }

    // Si le JSON est tronqué, essayer de le réparer
    if (end === -1 || end < start) {
      // Tenter de fermer le JSON tronqué
      clean = clean.slice(start);
      // Fermer les objets et tableaux ouverts
      const openBraces = (clean.match(/{/g) ?? []).length;
      const closeBraces = (clean.match(/}/g) ?? []).length;
      const missing = openBraces - closeBraces;
      if (missing > 0) clean += "}".repeat(missing);
      clean += "]";
    } else {
      clean = clean.slice(start, end + 1);
    }

    let fragments: RawFragment[] = [];
    try {
      fragments = JSON.parse(clean);
    } catch {
      console.warn("[world.service] JSON invalide même après réparation, abandon");
      return;
    }

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

// ── Données pour la carte du monde ────────────────────────────────────────────

export async function getWorldMapData() {
  const fragments = await prisma.worldFragment.findMany({
    orderBy: { weight: "desc" },
    select: {
      id: true,
      type: true,
      genre: true,
      label: true,
      weight: true,
      createdAt: true,
    },
  });

  const stats = {
    total: fragments.length,
    byType: {
      OBJECT:    fragments.filter(f => f.type === "OBJECT").length,
      PLACE:     fragments.filter(f => f.type === "PLACE").length,
      PHRASE:    fragments.filter(f => f.type === "PHRASE").length,
      CHARACTER: fragments.filter(f => f.type === "CHARACTER").length,
    },
    byGenre: {
      FANTASY:      fragments.filter(f => f.genre === "FANTASY").length,
      HORROR:       fragments.filter(f => f.genre === "HORROR").length,
      CONTEMPORARY: fragments.filter(f => f.genre === "CONTEMPORARY").length,
      SF:           fragments.filter(f => f.genre === "SF").length,
      ROMANCE:      fragments.filter(f => f.genre === "ROMANCE").length,
      MYSTERY:      fragments.filter(f => f.genre === "MYSTERY").length,
      MIXED:        fragments.filter(f => f.genre === "MIXED").length,
    },
  };

  return { fragments, stats };
}
