import { Request, Response } from "express";
import * as battleService from "../services/battle.service";
import { BattleStatus, StoryVisibility } from "../generated/prisma/client";
import { getIO } from "../socket";

const p = (v: string | string[] | undefined): string => {
  if (!v) throw new Error("Missing param");
  return Array.isArray(v) ? v[0] : v;
};

// GET /api/battles
export const list = async (req: Request, res: Response): Promise<void> => {
  try {
    const battles = await battleService.listBattles(req.user!.id);
    res.json(battles);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// GET /api/battles/:id
export const getOne = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  const userId = req.user!.id;
  try {
    const battle = await battleService.getBattleById(id);
    if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
    // Accès : PUBLIC ou joueur
    if (battle.visibility === StoryVisibility.PRIVATE && battle.attackerId !== userId && battle.defenderId !== userId) {
      res.status(403).json({ error: "Accès refusé à cette battle privée" }); return;
    }
    res.json(battle);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battles
export const create = async (req: Request, res: Response): Promise<void> => {
  const { title, goal, minTurns, maxTurns, visibility } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "title requis" }); return; }
  if (!goal?.trim()) { res.status(400).json({ error: "goal requis" }); return; }
  if (minTurns !== undefined && (!Number.isInteger(minTurns) || minTurns < 2)) {
    res.status(400).json({ error: "minTurns doit être un entier ≥ 2" }); return;
  }
  if (maxTurns !== undefined && (!Number.isInteger(maxTurns) || maxTurns < (minTurns ?? 4))) {
    res.status(400).json({ error: "maxTurns doit être ≥ minTurns" }); return;
  }
  const parsedVisibility = visibility === "PUBLIC" ? StoryVisibility.PUBLIC : StoryVisibility.PRIVATE;

  try {
    const battle = await battleService.createBattle({
      title: title.trim(),
      goal: goal.trim(),
      attackerId: req.user!.id,
      minTurns,
      maxTurns,
      visibility: parsedVisibility,
    });
    // Notifier tous les clients connectés pour la liste
    getIO()?.emit("battle:created", battle);
    res.status(201).json(battle);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battles/:id/join
export const join = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  const userId = req.user!.id;

  const battle = await battleService.getBattleById(id);
  if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
  if (battle.status !== BattleStatus.WAITING) {
    res.status(409).json({ error: "Cette battle n'est plus en attente" }); return;
  }
  if (battle.attackerId === userId) {
    res.status(409).json({ error: "Vous êtes déjà l'attaquant" }); return;
  }
  if (battle.defenderId) {
    res.status(409).json({ error: "La place de défenseur est déjà prise" }); return;
  }

  try {
    const updated = await battleService.joinAndActivate(id, userId, battle.attackerId);
    getIO()?.to(`battle:${id}`).emit("battle:joined", updated);
    getIO()?.emit("battle:updated", { id, status: updated.status, defenderId: updated.defenderId });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battles/:id/moves
export const createMove = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  const userId = req.user!.id;
  const { content } = req.body;

  if (!content?.trim()) { res.status(400).json({ error: "content requis" }); return; }

  const battle = await battleService.getBattleById(id);
  if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
  if (battle.status !== BattleStatus.ACTIVE) {
    res.status(409).json({ error: "Les moves ne sont autorisés que pendant une battle ACTIVE" }); return;
  }
  if (battle.attackerId !== userId && battle.defenderId !== userId) {
    res.status(403).json({ error: "Vous n'êtes pas joueur de cette battle" }); return;
  }
  if (battle.currentTurnUserId !== userId) {
    res.status(403).json({ error: "Ce n'est pas votre tour" }); return;
  }

  try {
    const { move, updatedBattle } = await battleService.createMove(id, userId, content.trim());
    getIO()?.to(`battle:${id}`).emit("battle:moveCreated", {
      battleId: id,
      move,
      turnCount: updatedBattle.turnCount,
      currentTurnUserId: updatedBattle.currentTurnUserId,
      status: updatedBattle.status,
    });
    res.status(201).json({ move, updatedBattle });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battles/:id/vote/start
export const startVoting = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  const userId = req.user!.id;

  const battle = await battleService.getBattleById(id);
  if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
  if (battle.status !== BattleStatus.ACTIVE) {
    res.status(409).json({ error: "La battle doit être ACTIVE pour lancer le vote" }); return;
  }
  if (battle.attackerId !== userId && battle.defenderId !== userId) {
    res.status(403).json({ error: "Seuls les joueurs peuvent lancer le vote" }); return;
  }
  if (battle.turnCount < battle.minTurns) {
    res.status(409).json({ error: `Le vote ne peut être lancé qu'à partir de ${battle.minTurns} tours` }); return;
  }

  try {
    const updated = await battleService.startVoting(id);
    getIO()?.to(`battle:${id}`).emit("battle:statusUpdated", {
      battleId: id,
      status: updated.status,
      currentTurnUserId: null,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battles/:id/vote
export const castVote = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  const userId = req.user!.id;
  const { vote } = req.body;

  if (typeof vote !== "boolean") {
    res.status(400).json({ error: "vote doit être true (Oui) ou false (Non)" }); return;
  }

  const battle = await battleService.getBattleById(id);
  if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
  if (battle.status !== BattleStatus.VOTING) {
    res.status(409).json({ error: "Le vote n'est ouvert que pendant la phase VOTING" }); return;
  }

  const existing = await battleService.getUserVote(id, userId);
  if (existing) {
    res.status(409).json({ error: "Vous avez déjà voté pour cette battle" }); return;
  }

  try {
    const newVote = await battleService.castVote(id, userId, vote);
    const yesCount = battle.votes.filter((v) => v.vote).length + (vote ? 1 : 0);
    const noCount = battle.votes.filter((v) => !v.vote).length + (vote ? 0 : 1);
    getIO()?.to(`battle:${id}`).emit("battle:voted", {
      battleId: id,
      vote: newVote,
      voteCount: { yes: yesCount, no: noCount, total: yesCount + noCount },
    });
    res.status(201).json(newVote);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "Vous avez déjà voté pour cette battle" }); return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
};

const MIN_VOTES_TO_CLOSE = 3;

// POST /api/battles/:id/vote/close
export const closeVoting = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  const userId = req.user!.id;

  const battle = await battleService.getBattleById(id);
  if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
  if (battle.status !== BattleStatus.VOTING) {
    res.status(409).json({ error: "La battle n'est pas en phase de vote" }); return;
  }
  if (battle.attackerId !== userId && battle.defenderId !== userId) {
    res.status(403).json({ error: "Seuls les joueurs peuvent clore le vote" }); return;
  }
  if (battle.votes.length < MIN_VOTES_TO_CLOSE) {
    res.status(409).json({ error: `Il faut au moins ${MIN_VOTES_TO_CLOSE} votes pour clore le scrutin (actuellement ${battle.votes.length})` }); return;
  }

  try {
    const updated = await battleService.closeVoting(id);
    getIO()?.to(`battle:${id}`).emit("battle:finished", {
      battleId: id,
      winner: updated.winner,
      status: updated.status,
    });
    getIO()?.emit("battle:updated", { id, status: updated.status, winner: updated.winner });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
