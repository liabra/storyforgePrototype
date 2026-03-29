import { Request, Response } from "express";
import { generateGmSuggestion, GmMode } from "../services/ai.service";
import * as participantService from "../services/participant.service";
import { ParticipantRole } from "../generated/prisma/client";

const VALID_MODES: GmMode[] = ["twist", "nudge", "ending_hint"];

// Anti-spam MVP : cooldown de 10s par utilisateur en mémoire
const COOLDOWN_MS = 10_000;
const lastCallByUser = new Map<string, number>();

export const sceneMaster = async (req: Request, res: Response) => {
  const { sceneId, mode } = req.body as { sceneId?: string; mode?: string };

  if (!sceneId) return res.status(400).json({ error: "sceneId requis" });
  if (!mode || !VALID_MODES.includes(mode as GmMode)) {
    return res.status(400).json({ error: "mode doit être twist | nudge | ending_hint" });
  }

  // Garde anti-spam
  const userId = req.user!.id;
  const lastCall = lastCallByUser.get(userId) ?? 0;
  const elapsed = Date.now() - lastCall;
  if (elapsed < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return res.status(429).json({ error: `Veuillez patienter ${waitSec}s avant une nouvelle suggestion.` });
  }

  const storyId = await participantService.getStoryIdByScene(sceneId);
  if (!storyId) return res.status(404).json({ error: "Scène introuvable" });

  const role = await participantService.getUserRole(storyId, userId);
  if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
    return res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour invoquer le maître du jeu" });
  }

  // Enregistrer le timestamp avant l'appel pour bloquer les doubles-clics
  lastCallByUser.set(userId, Date.now());

  try {
    const suggestion = await generateGmSuggestion(sceneId, mode as GmMode);
    return res.json({ suggestion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error(`[ai.controller] sceneMaster error (user=${userId}, scene=${sceneId}):`, message);
    // Libérer le cooldown en cas d'erreur pour ne pas pénaliser l'utilisateur
    lastCallByUser.delete(userId);
    return res.status(503).json({ error: "Le maître du jeu est indisponible. Réessayez dans un instant." });
  }
};
