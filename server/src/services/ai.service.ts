/**
 * ai.service.ts — V2
 *
 * Service "Maître du jeu" — génère une courte intervention narrative
 * à partir d'un contexte de scène enrichi (personnages, locuteurs, phase).
 *
 * Provider : Google Gemini Flash (économique, réponse courte)
 * Clé      : process.env.GEMINI_API_KEY
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prisma/client";

export type GmMode = "twist" | "nudge" | "ending_hint";

// ── Prompt système V2 ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es le maître du jeu discret d'une application d'écriture collaborative de fiction.
Tu lis une scène de fiction en cours : certaines lignes sont de la narration, d'autres sont des dialogues ou des actions attribuées à des personnages.
Ton rôle est d'enrichir la scène sans jamais écrire à la place des joueurs.

Règles absolues :
- Tu produis exactement 1 à 2 phrases, jamais plus, jamais moins.
- Ta réponse doit toujours être une phrase complète et grammaticalement terminée, se terminant obligatoirement par un signe de ponctuation (. ! ?).
- Chaque intervention doit apporter au moins l'un de ces éléments : un élément nouveau dans la scène, une tension narrative, ou une information inattendue. Les observations vagues ou purement décoratives sont interdites.
- Tu ne fais jamais parler ou agir un personnage de façon contradictoire avec ce qui a déjà été établi.
- Tu respectes le ton dominant de la scène : si elle est légère ou absurde, tu restes dans ce registre ; si elle est tendue ou dramatique, tu amplifies sans brutaliser.
- Tu ne résous jamais l'histoire : tu ouvres, tu suggères, tu relances.
- Tu retournes uniquement le texte final, sans explication, sans balise, sans guillemets englobants.
- Si des personnages sont listés, ton intervention doit être cohérente avec leur présence et leur nature.

Selon le mode demandé :
- twist : introduis un rebondissement ou un élément inattendu, cohérent avec le ton et les personnages présents — ne change pas de registre dramatique sans raison
- nudge : relance doucement la scène si elle semble stagner, sans forcer la main des joueurs ni rompre le ton établi
- ending_hint : suggère subtilement qu'une fin de scène approche, en respectant l'atmosphère`;

// ── Instructions par mode ──────────────────────────────────────────────────────

const MODE_INSTRUCTION: Record<GmMode, string> = {
  twist:
    "Propose un rebondissement ou un élément imprévu, cohérent avec le ton de la scène et les personnages présents. Ne bascule pas dans un registre dramatique différent sans justification narrative.",
  nudge:
    "La scène semble stagner. Relance-la subtilement sans imposer une direction aux joueurs, en restant fidèle au ton et à l'ambiance déjà installés.",
  ending_hint:
    "Suggère discrètement qu'une fin de scène semble proche, en respectant l'atmosphère et en laissant la porte ouverte.",
};

// ── Anti-spam cooldown ────────────────────────────────────────────────────────

const GM_COOLDOWN_MS = 10_000; // 10 secondes minimum entre deux appels

interface CooldownEntry {
  lastCallAt: number;
  contribCountAtLastCall: number;
}

const cooldownMap = new Map<string, CooldownEntry>();

/**
 * Vérifie si un appel GM est autorisé pour cette scène.
 * Retourne null si OK, ou un message d'erreur si le cooldown est actif
 * ou si aucune nouvelle contribution n'a été ajoutée depuis le dernier appel.
 */
function checkCooldown(sceneId: string, currentContribCount: number): string | null {
  const entry = cooldownMap.get(sceneId);
  if (!entry) return null;

  const elapsed = Date.now() - entry.lastCallAt;
  if (elapsed < GM_COOLDOWN_MS) {
    const remaining = Math.ceil((GM_COOLDOWN_MS - elapsed) / 1000);
    return `Le maître du jeu se repose encore… (${remaining}s)`;
  }

  if (currentContribCount <= entry.contribCountAtLastCall) {
    return "Le maître du jeu attend que la scène progresse avant d'intervenir à nouveau.";
  }

  return null;
}

function recordCooldown(sceneId: string, contribCount: number): void {
  cooldownMap.set(sceneId, { lastCallAt: Date.now(), contribCountAtLastCall: contribCount });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Garantit que la réponse ne dépasse pas 2 phrases.
 */
function truncateToTwoSentences(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  if (sentences.length <= 2) return text.trim();
  return sentences.slice(0, 2).join(" ").trim();
}

/**
 * Détermine le label du locuteur pour une contribution.
 * Priorité : character.name > character.nickname > user.displayName (narration) > "Narration"
 */
function speakerLabel(contrib: {
  character: { name: string | null; nickname: string | null } | null;
  user: { displayName: string | null } | null;
}): string {
  if (contrib.character?.name) return contrib.character.name;
  if (contrib.character?.nickname) return contrib.character.nickname;
  if (contrib.user?.displayName) return `${contrib.user.displayName} (narration)`;
  return "Narration";
}

/**
 * Phase narrative approximative basée sur le nombre de contributions de la scène.
 */
function narrativePhase(contribCount: number): string {
  if (contribCount <= 2) return "Ouverture";
  if (contribCount <= 6) return "Développement";
  return "Climax / Dénouement";
}

/**
 * Règle de matière narrative suffisante (remplace l'ancien score 80 chars) :
 * - au moins 2 contributions non-vides
 * - OU 1 contribution non-vide + description de scène ≥ 20 caractères
 */
function hasEnoughNarrativeMatter(
  sceneDesc: string | null,
  contribs: { content: string }[]
): boolean {
  const nonEmpty = contribs.filter((c) => c.content.trim().length > 0);
  if (nonEmpty.length >= 2) return true;
  if (nonEmpty.length >= 1 && (sceneDesc?.trim().length ?? 0) >= 20) return true;
  return false;
}

export const WEAK_CONTEXT_MSG =
  "Le maître du jeu a besoin d'un peu plus de matière pour intervenir.";

const GM_FALLBACK = "Un silence étrange s'installe…";

/**
 * Valide que la réponse est une phrase grammaticalement complète.
 * Règle : doit se terminer par . ! ou ? (en ignorant espaces/guillemets finaux).
 */
function isResponseComplete(text: string): boolean {
  return /[.!?]["""'»]?\s*$/.test(text.trim());
}

// ── Fonction principale ────────────────────────────────────────────────────────

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
      characters: {
        select: { name: true, nickname: true, role: true, shortDescription: true },
      },
      contributions: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          content: true,
          character: { select: { name: true, nickname: true } },
          user: { select: { displayName: true } },
        },
      },
    },
  });

  if (!scene) throw new Error("Scène introuvable");

  if (!hasEnoughNarrativeMatter(scene.description ?? null, scene.contributions)) {
    console.log(`[ai.service] matière narrative insuffisante — appel Gemini annulé`);
    return WEAK_CONTEXT_MSG;
  }

  const cooldownError = checkCooldown(sceneId, scene.contributions.length);
  if (cooldownError) {
    console.log(`[ai.service] cooldown actif — ${cooldownError}`);
    return cooldownError;
  }

  // Contributions en ordre chronologique (les plus récentes en dernier)
  const orderedContribs = [...scene.contributions].reverse();

  const contribLines = orderedContribs
    .map((c) => {
      const speaker = speakerLabel(c);
      const text = c.content.slice(0, 250).trim();
      return `${speaker} : "${text}"`;
    })
    .join("\n");

  const characterList = scene.characters
    .map((ch) => {
      const name = ch.name ?? ch.nickname ?? "Personnage sans nom";
      const details = [ch.role, ch.shortDescription].filter(Boolean).join(" — ");
      return details ? `- ${name} (${details})` : `- ${name}`;
    })
    .join("\n");

  const phase = narrativePhase(scene.contributions.length);

  // Assemblage du contexte structuré
  const storySection = [
    `=== HISTOIRE ===`,
    `Titre : "${scene.story.title}"`,
    scene.story.description ? `Contexte : ${scene.story.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const sceneSection = [
    `=== SCÈNE ===`,
    `Titre : "${scene.title}"`,
    scene.description ? `Description : ${scene.description}` : null,
    `Phase narrative : ${phase}`,
    characterList ? `Personnages présents :\n${characterList}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const contribSection = [`=== EXTRAIT DE LA SCÈNE ===`, contribLines].join("\n");

  const instructionSection = [`=== INSTRUCTION ===`, MODE_INSTRUCTION[mode]].join("\n");

  const contextBlock = [storySection, sceneSection, contribSection, instructionSection].join(
    "\n\n"
  );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante dans l'environnement");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 180,
      temperature: 0.85,
    },
  });

  const result = await model.generateContent(contextBlock);
  const raw = result.response.text().trim();
  const text = truncateToTwoSentences(raw);

  recordCooldown(sceneId, scene.contributions.length);

  if (!isResponseComplete(text)) {
    console.warn(`[ai.service] réponse tronquée rejetée : "${text.slice(0, 60)}…"`);
    return GM_FALLBACK;
  }

  console.log(`[ai.service] GM (${mode}) scène ${sceneId} : ${text.slice(0, 80)}…`);

  return text || GM_FALLBACK;
}
