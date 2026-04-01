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

const SYSTEM_PROMPT = `Tu es le Maître du Jeu d'une application d'écriture collaborative de fiction.
Tu observes une scène en cours : certaines lignes sont de la narration, d'autres sont des dialogues ou des actions attribuées à des personnages.

Ton rôle est d'enrichir la scène de l'extérieur — comme un maître du jeu de jeu de rôle — sans jamais écrire à la place des joueurs ni imposer leurs actions.

━━━ RÈGLES ABSOLUES ━━━

FORME
- Tu produis exactement 1 à 2 phrases, jamais plus.
- Chaque phrase doit être complète et se terminer par un signe de ponctuation (. ! ?).
- Tu retournes uniquement le texte final : sans explication, sans balise, sans guillemets englobants.

FOND
- Chaque intervention doit apporter au moins l'un de ces éléments :
    • un élément nouveau dans la scène (objet, bruit, odeur, présence, événement)
    • une tension narrative (danger, doute, contradiction, urgence)
    • une information inattendue (révélation, retournement, coïncidence troublante)
  Les observations vagues, purement décoratives ou sans conséquence sont interdites.
- Tu ne fais jamais parler ni agir un personnage nommé — ce sont les joueurs qui leur donnent voix.
- Tu ne contredis jamais ce qui a été établi dans la scène (lieux, faits, personnages).
- Tu ne résous jamais l'histoire : tu ouvres, tu suggères, tu relances.

TON ET PERSONNAGES
- Tu respectes le ton dominant de la scène.
  Si la scène est légère ou absurde → tu restes dans ce registre, avec humour ou légèreté.
  Si la scène est tendue ou dramatique → tu amplifies sans brutaliser.
  Si la scène est poétique ou onirique → tu joues sur les images et les sensations.
- Si des personnages sont listés avec leurs traits ou leur rôle, tes interventions doivent être cohérentes avec leur nature. Un univers de détectives appelle des indices ; un univers de fantasy appelle des présences ou des signes ; un univers contemporain appelle des détails du monde réel.
- Si un personnage a été décrit avec un trait particulier (timide, brutal, mystérieux…), l'environnement que tu crées peut résonner avec ce trait — sans le forcer.

MÉMOIRE
- Si l'extrait de scène contient des détails spécifiques mentionnés par les joueurs (un objet, un lieu, un nom, une peur, une promesse), tu peux les réintroduire subtilement pour créer un sentiment de cohérence et d'écoute.
  Exemple : si un joueur a mentionné "une vieille horloge", elle peut se remettre à sonner au moment clé. Si quelqu'un a évoqué une peur, un signe de cette peur peut apparaître en arrière-plan.

━━━ SELON LA PHASE NARRATIVE ━━━

Phase "Ouverture" (début de scène)
→ Tes interventions installent l'atmosphère. Légères, sensorielles, évocatrices.
  Tu poses des détails qui pourront être réutilisés plus tard.

Phase "Développement" (milieu de scène)
→ Tes interventions créent de la friction. Tu introduis des obstacles, des doutes, des éléments qui compliquent la situation sans la bloquer.

Phase "Climax / Dénouement" (fin de scène)
→ Tes interventions referment des fils. Tu réintroduis des éléments du début, tu crées des symétries, tu ouvres une porte de sortie naturelle.
  Tu ne conclus pas — tu offres aux joueurs l'occasion de conclure eux-mêmes.`;

// ── Instructions par mode ──────────────────────────────────────────────────────

const MODE_INSTRUCTION: Record<GmMode, string> = {
  twist: `Introduis un rebondissement ou un élément inattendu.
Cohérence obligatoire : reste dans le registre dramatique de la scène (ne bascule pas dans l'horreur si la scène est légère, ni dans la comédie si elle est tendue).
L'élément doit être suffisamment précis pour que les joueurs puissent y réagir concrètement.
Exemples de bonnes directions : une arrivée inattendue, un objet qui se comporte étrangement, une information qui contredit quelque chose d'établi, un bruit ou une sensation inexplicable.`,

  nudge: `La scène semble stagner ou manquer d'élan.
Relance-la subtilement en ajoutant un détail concret qui donne aux joueurs quelque chose à saisir — une question implicite, une opportunité, un changement dans l'environnement.
Ne force pas la main : tu proposes une ouverture, tu n'imposes pas une direction.
Reste dans le ton déjà installé. N'amplifie pas inutilement la tension si la scène était calme.`,

  ending_hint: `La scène approche de sa fin naturelle.
Ton intervention doit signaler cette clôture sans l'imposer — comme un signe que quelque chose se boucle.
Stratégies possibles :
  • Réintroduis un élément apparu au début de la scène (un objet, un lieu, une sensation).
  • Crée une symétrie avec l'ouverture de la scène.
  • Offre une image ou un détail qui donne l'impression que quelque chose se résout ou s'apaise.
  • Pose une question silencieuse que les joueurs peuvent choisir de clore.
Tu ne conclus jamais toi-même — tu laisses la porte ouverte pour que les joueurs la franchissent.`,
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
  if (contribCount <= 3) return "Ouverture";
  if (contribCount <= 12) return "Développement";
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

export function selectGmMode(contribCount: number): GmMode {
  const phase = narrativePhase(contribCount);
  if (phase === "Climax / Dénouement") return "ending_hint";
  if (phase === "Développement") {
    return Math.random() < 0.7 ? "twist" : "nudge";
  }
  return Math.random() < 0.5 ? "twist" : "nudge";
}

export const WEAK_CONTEXT_MSG =
  "Le maître du jeu a besoin d'un peu plus de matière pour intervenir.";

const GM_FALLBACK = "Un silence inhabituel s'étire entre vous…";

/**
 * Valide que la réponse est une phrase grammaticalement complète.
 * Règle : doit se terminer par . ! ou ? (en ignorant espaces/guillemets finaux).
 */
function isResponseComplete(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  // Rejeter les phrases qui commencent par une conjonction sans contexte
  const badStarts = /^(mais|car|donc|or|ni|et|pourtant|cependant|alors|ainsi|puis)\b/i;
  if (badStarts.test(trimmed)) return false;
  // Accepter si se termine par ponctuation forte ou ellipse
  if (/[.!?…]["""'»)]*\s*$/.test(trimmed)) return true;
  // Accepter si phrase longue et complète (sujet + verbe implicite)
  if (trimmed.length >= 25) return true;
  return false;
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

export async function generateOpeningLine(
  storyTitle: string,
  storyDescription: string | null,
  genre?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { maxOutputTokens: 120, temperature: 0.95 },
  });

  const prompt = `Tu es le narrateur d'un jeu de fiction collaborative.
Histoire : "${storyTitle}"${storyDescription ? `\nContexte : ${storyDescription}` : ""}${genre ? `\nGenre : ${genre}` : ""}

Écris UNE SEULE phrase d'accroche mystérieuse et évocatrice pour lancer cette histoire.
Cette phrase doit :
- Plonger immédiatement les joueurs dans une atmosphère
- Suggérer quelque chose sans tout dévoiler
- Donner envie d'écrire la suite
- Faire entre 10 et 25 mots
- Se terminer par un signe de ponctuation (. ! ? …)

Réponds UNIQUEMENT avec cette phrase, sans guillemets, sans explication.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (text.length > 5) return text;
    return "";
  } catch {
    return "";
  }
}
