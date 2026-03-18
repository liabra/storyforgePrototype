import { Request, Response } from "express";
import * as participantService from "../services/participant.service";
import prisma from "../prisma/client";
import { ParticipantRole } from "../generated/prisma/client";

const ASSIGNABLE_ROLES: ParticipantRole[] = [ParticipantRole.EDITOR, ParticipantRole.VIEWER];

const p = (v: string | string[]): string => (Array.isArray(v) ? v[0] : v);

export const list = async (req: Request, res: Response): Promise<void> => {
  try {
    const participants = await participantService.getParticipants(p(req.params.storyId));
    res.json(participants);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
};

export const add = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);
  const { email, role = "VIEWER" } = req.body;

  if (!email) { res.status(400).json({ error: "email est requis" }); return; }
  if (!ASSIGNABLE_ROLES.includes(role as ParticipantRole)) {
    res.status(400).json({ error: "Rôle invalide. Utilisez EDITOR ou VIEWER." }); return;
  }

  const requesterRole = await participantService.getUserRole(storyId, req.user!.id);
  if (requesterRole !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut gérer les participants" }); return;
  }

  const targetUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!targetUser) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

  try {
    const participant = await participantService.addParticipant(storyId, targetUser.id, role as ParticipantRole);
    res.status(201).json(participant);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "Cet utilisateur participe déjà à cette histoire" }); return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
};

export const updateRole = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);
  const userId = p(req.params.userId);
  const { role } = req.body;

  if (!ASSIGNABLE_ROLES.includes(role as ParticipantRole)) {
    res.status(400).json({ error: "Rôle invalide. Utilisez EDITOR ou VIEWER." }); return;
  }

  const requesterRole = await participantService.getUserRole(storyId, req.user!.id);
  if (requesterRole !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut changer les rôles" }); return;
  }

  const targetRole = await participantService.getUserRole(storyId, userId);
  if (targetRole === ParticipantRole.OWNER) {
    res.status(400).json({ error: "Impossible de changer le rôle du propriétaire" }); return;
  }

  try {
    const participant = await participantService.updateRole(storyId, userId, role as ParticipantRole);
    res.json(participant);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);
  const userId = p(req.params.userId);

  const requesterRole = await participantService.getUserRole(storyId, req.user!.id);
  const isSelf = req.user!.id === userId;

  if (requesterRole !== ParticipantRole.OWNER && !isSelf) {
    res.status(403).json({ error: "Non autorisé" }); return;
  }

  const targetRole = await participantService.getUserRole(storyId, userId);
  if (targetRole === ParticipantRole.OWNER) {
    res.status(400).json({ error: "Impossible de retirer le propriétaire de l'histoire" }); return;
  }

  try {
    await participantService.removeParticipant(storyId, userId);
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
};
