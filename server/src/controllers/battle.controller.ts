import { Request, Response } from "express";
import * as battleService from "../services/battle.service";
import { BattleStatus, StoryVisibility, BattleInviteRole, PaceMode } from "../generated/prisma/client";
import { getIO } from "../socket";
import { moderateText, MOD_REFUSED } from "../services/moderation.service";
import { dispatchNotification } from "../services/notification.service";

const MIN_VOTES_TO_CLOSE = 3;

const p = (v: string | string[] | undefined): string => {
  if (!v) throw new Error("Missing param");
  return Array.isArray(v) ? v[0] : v;
};

// Applique les timeouts de tour et émet les events socket si nécessaire
async function applyAndEmitTimeouts(battleId: string): Promise<"none" | "skip" | "forfeit"> {
  const result = await battleService.checkBattleTimeouts(battleId);
  if (result.action === "none") return "none";

  if (result.action === "skip") {
    getIO()?.to(`battle:${battleId}`).emit("battle:turnSkipped", {
      battleId,
      currentTurnUserId: result.newCurrentTurnUserId,
      turnDeadlineAt: result.newTurnDeadlineAt?.toISOString() ?? null,
    });
  } else if (result.action === "forfeit") {
    getIO()?.to(`battle:${battleId}`).emit("battle:forfeit", {
      battleId,
      winner: result.winner,
    });
    getIO()?.emit("battle:updated", { id: battleId, status: "DONE", winner: result.winner });
  }
  return result.action;
}

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
    // Traiter les timeouts éventuels avant de renvoyer l'état
    await applyAndEmitTimeouts(id);

    const battle = await battleService.getBattleById(id);
    if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
    // Accès PRIVATE : joueur ou invité accepté
    if (battle.visibility === StoryVisibility.PRIVATE) {
      const isPlayer = battle.attackerId === userId || battle.defenderId === userId;
      const isInvited = battle.invites.some((inv) => inv.userId === userId && inv.status === "ACCEPTED");
      if (!isPlayer && !isInvited) {
        res.status(403).json({ error: "Accès refusé à cette battle privée" }); return;
      }
    }
    res.json(battle);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battles
export const create = async (req: Request, res: Response): Promise<void> => {
  const { title, goal, minTurns, maxTurns, visibility, paceMode } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: "title requis" }); return; }
  if (!goal?.trim()) { res.status(400).json({ error: "goal requis" }); return; }
  if (!moderateText(title, "battle.title").isAllowed) { res.status(400).json({ error: MOD_REFUSED }); return; }
  if (!moderateText(goal, "battle.goal").isAllowed) { res.status(400).json({ error: MOD_REFUSED }); return; }
  if (minTurns !== undefined && (!Number.isInteger(minTurns) || minTurns < 2)) {
    res.status(400).json({ error: "minTurns doit être un entier ≥ 2" }); return;
  }
  if (maxTurns !== undefined && (!Number.isInteger(maxTurns) || maxTurns < (minTurns ?? 4))) {
    res.status(400).json({ error: "maxTurns doit être ≥ minTurns" }); return;
  }
  const parsedVisibility = visibility === "PUBLIC" ? StoryVisibility.PUBLIC : StoryVisibility.PRIVATE;
  const parsedPaceMode = paceMode === "SYNC" ? PaceMode.SYNC : PaceMode.ASYNC;

  try {
    const battle = await battleService.createBattle({
      title: title.trim(),
      goal: goal.trim(),
      attackerId: req.user!.id,
      minTurns,
      maxTurns,
      visibility: parsedVisibility,
      paceMode: parsedPaceMode,
    });
    if (parsedVisibility === StoryVisibility.PUBLIC) {
      getIO()?.emit("battle:created", battle);
    } else {
      getIO()?.to(`user:${req.user!.id}`).emit("battle:created", battle);
    }
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
    const updated = await battleService.joinAndActivate(id, userId, battle.attackerId, battle.paceMode);
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
  if (!moderateText(content, "battle.move").isAllowed) { res.status(400).json({ error: MOD_REFUSED }); return; }

  // Traiter les timeouts avant d'accepter le move
  const timeoutAction = await applyAndEmitTimeouts(id);
  if (timeoutAction === "forfeit") {
    res.status(409).json({ error: "La battle s'est terminée par forfait." }); return;
  }

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
      lastTurnAt: updatedBattle.lastTurnAt?.toISOString() ?? null,
      turnDeadlineAt: updatedBattle.turnDeadlineAt?.toISOString() ?? null,
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

  // Les joueurs ne votent pas
  if (battle.attackerId === userId || battle.defenderId === userId) {
    res.status(403).json({ error: "Les joueurs ne participent pas au vote" }); return;
  }

  const existing = await battleService.getUserVote(id, userId);
  if (existing) {
    res.status(409).json({ error: "Vous avez déjà voté pour cette battle" }); return;
  }

  try {
    const newVote = await battleService.castVote(id, userId, vote);
    const spectatorVotes = battle.votes.filter(
      (v) => v.userId !== battle.attackerId && v.userId !== battle.defenderId,
    );
    const yesCount = spectatorVotes.filter((v) => v.vote).length + (vote ? 1 : 0);
    const noCount = spectatorVotes.filter((v) => !v.vote).length + (vote ? 0 : 1);
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

  const spectatorVotes = battle.votes.filter(
    (v) => v.userId !== battle.attackerId && v.userId !== battle.defenderId,
  );
  if (spectatorVotes.length < MIN_VOTES_TO_CLOSE) {
    res.status(409).json({
      error: `Il faut au moins ${MIN_VOTES_TO_CLOSE} votes spectateurs pour clore le scrutin (actuellement ${spectatorVotes.length})`,
    }); return;
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

// ── Invitations ───────────────────────────────────────────────────────────────

// POST /api/battles/:id/invite
export const sendInvite = async (req: Request, res: Response): Promise<void> => {
  const battleId = p(req.params.id);
  const senderId = req.user!.id;
  const { email, role } = req.body;

  if (!email?.trim()) { res.status(400).json({ error: "email requis" }); return; }
  if (role !== "PLAYER" && role !== "SPECTATOR") {
    res.status(400).json({ error: "role doit être PLAYER ou SPECTATOR" }); return;
  }

  const battle = await battleService.getBattleById(battleId);
  if (!battle) { res.status(404).json({ error: "Battle introuvable" }); return; }
  if (battle.attackerId !== senderId && battle.defenderId !== senderId) {
    res.status(403).json({ error: "Seuls les joueurs peuvent inviter" }); return;
  }
  if (role === BattleInviteRole.PLAYER) {
    if (battle.defenderId) {
      res.status(409).json({ error: "La place de défenseur est déjà prise" }); return;
    }
    // Max 3 invitations joueur simultanées
    const pendingPlayerInvites = (battle.invites ?? []).filter(
      (i) => i.role === "PLAYER" && i.status === "PENDING",
    );
    if (pendingPlayerInvites.length >= 3) {
      res.status(409).json({ error: "Maximum 3 invitations joueur simultanées" }); return;
    }
  }

  const prismaClient = (await import("../prisma/client")).default;
  const targetUser = await prismaClient.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true },
  });
  if (!targetUser) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }
  if (targetUser.id === senderId) {
    res.status(409).json({ error: "Vous ne pouvez pas vous inviter vous-même" }); return;
  }
  if (targetUser.id === battle.attackerId || targetUser.id === battle.defenderId) {
    res.status(409).json({ error: "Cet utilisateur est déjà joueur" }); return;
  }

  try {
    const invite = await battleService.createInvite(battleId, targetUser.id, role as BattleInviteRole);
    const notif = await dispatchNotification(
      targetUser.id,
      "BATTLE_INVITE",
      `Vous avez été invité à rejoindre la battle « ${battle.title} ».`,
    );
    if (notif) {
      getIO()?.to(`user:${targetUser.id}`).emit("battle:invited", {
        invite,
        battle: { id: battle.id, title: battle.title, attacker: battle.attacker },
      });
      getIO()?.to(`user:${targetUser.id}`).emit("notification:new", notif);
    }
    res.status(201).json(invite);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "Cet utilisateur a déjà une invitation pour cette battle" }); return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
};

// GET /api/battle-invites/mine
export const myInvites = async (req: Request, res: Response): Promise<void> => {
  try {
    const invites = await battleService.getMyPendingInvites(req.user!.id);
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/battle-invites/:id/accept
export const acceptInvite = async (req: Request, res: Response): Promise<void> => {
  const inviteId = p(req.params.id);
  const userId = req.user!.id;

  const invite = await battleService.getInviteById(inviteId);
  if (!invite) { res.status(404).json({ error: "Invitation introuvable" }); return; }
  if (invite.userId !== userId) { res.status(403).json({ error: "Cette invitation ne vous est pas destinée" }); return; }
  if (invite.status !== "PENDING") { res.status(409).json({ error: "Cette invitation a déjà été traitée" }); return; }
  // Vérifier l'expiration
  if (invite.expiresAt && new Date() > invite.expiresAt) {
    res.status(409).json({ error: "Cette invitation a expiré" }); return;
  }

  try {
    const updatedBattle = await battleService.acceptInvite(inviteId);
    if (updatedBattle) {
      getIO()?.to(`battle:${invite.battle.id}`).emit("battle:joined", updatedBattle);
      getIO()?.emit("battle:updated", {
        id: invite.battle.id,
        status: updatedBattle.status,
        defenderId: updatedBattle.defenderId,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
};

// POST /api/battle-invites/:id/decline
export const declineInvite = async (req: Request, res: Response): Promise<void> => {
  const inviteId = p(req.params.id);
  const userId = req.user!.id;

  const invite = await battleService.getInviteById(inviteId);
  if (!invite) { res.status(404).json({ error: "Invitation introuvable" }); return; }
  if (invite.userId !== userId) { res.status(403).json({ error: "Cette invitation ne vous est pas destinée" }); return; }
  if (invite.status !== "PENDING") { res.status(409).json({ error: "Cette invitation a déjà été traitée" }); return; }

  try {
    await battleService.declineInvite(inviteId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
