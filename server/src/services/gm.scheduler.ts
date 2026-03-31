import { generateGmSuggestion, selectGmMode } from "./ai.service";
import prisma from "../prisma/client";

const SILENCE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const CONTRIB_INTERVAL = 5; // toutes les 5 contributions

interface SceneState {
  lastContribAt: number;
  lastContribCount: number;
  lastGmAt: number;
  silenceTimerId?: ReturnType<typeof setTimeout>;
}

const sceneStates = new Map<string, SceneState>();

/**
 * Appelé à chaque nouvelle contribution dans une scène.
 * Gère les deux déclencheurs : compteur de contributions et silence.
 */
export async function onNewContribution(
  sceneId: string,
  contribCount: number,
  emitGmMessage: (sceneId: string, text: string) => void
): Promise<void> {
  const now = Date.now();
  const state = sceneStates.get(sceneId) ?? {
    lastContribAt: now,
    lastContribCount: contribCount,
    lastGmAt: 0,
  };

  // Annule le timer de silence précédent
  if (state.silenceTimerId) clearTimeout(state.silenceTimerId);

  state.lastContribAt = now;
  state.lastContribCount = contribCount;

  // Déclencheur 1 — compteur de contributions
  if (contribCount % CONTRIB_INTERVAL === 0) {
    const mode = selectGmMode(contribCount);
    const text = await generateGmSuggestion(sceneId, mode);
    emitGmMessage(sceneId, text);
    state.lastGmAt = Date.now();
  }

  // Déclencheur 2 — timer de silence (repart à zéro à chaque contribution)
  state.silenceTimerId = setTimeout(async () => {
    const text = await generateGmSuggestion(sceneId, "nudge");
    emitGmMessage(sceneId, text);
    state.lastGmAt = Date.now();
  }, SILENCE_THRESHOLD_MS);

  sceneStates.set(sceneId, state);
}

/**
 * Nettoie l'état d'une scène quand elle se termine.
 */
export function cleanupScene(sceneId: string): void {
  const state = sceneStates.get(sceneId);
  if (state?.silenceTimerId) clearTimeout(state.silenceTimerId);
  sceneStates.delete(sceneId);
}
