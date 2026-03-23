import { Request, Response } from "express";
import * as joinRequestService from "../services/joinRequest.service";
import * as participantService from "../services/participant.service";
import { ParticipantRole } from "../generated/prisma/client";
import { getIO } from "../socket";

const p = (v: string | string[]): string => (Array.isArray(v) ? v[0] : v);

/**
 * POST /api/stories/:storyId/join-requests
 * Un VIEWER crée une demande de participation (pour devenir EDITOR).
 */
export const create = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);
  const userId = req.user!.id;

  // Vérifier que l'utilisateur est bien VIEWER (pas OWNER ou EDITOR)
  const role = await participantService.getUserRole(storyId, userId);
  if (!role) {
    res.status(403).json({ error: "Vous n'êtes pas participant à cette histoire" });
    return;
  }
  if (role !== ParticipantRole.VIEWER) {
    res.status(409).json({ error: "Vous êtes déjà éditeur ou propriétaire de cette histoire" });
    return;
  }

  // Vérifier qu'il n'y a pas déjà une demande en cours
  const existing = await joinRequestService.getMyRequest(storyId, userId);
  if (existing && existing.status === "PENDING") {
    res.status(409).json({ error: "Vous avez déjà une demande en attente pour cette histoire" });
    return;
  }

  try {
    const request = await joinRequestService.createRequest(storyId, userId);

    // Notifier le propriétaire via socket
    const ownerId = await joinRequestService.getStoryOwnerUserId(storyId);
    if (ownerId) {
      const io = getIO();
      if (io) {
        io.to(`user:${ownerId}`).emit("join-request:received", {
          requestId: request.id,
          storyId,
          storyTitle: request.story.title,
          userId,
          userDisplayName: request.user.displayName || request.user.email,
        });
      }
    }

    res.status(201).json(request);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "Vous avez déjà une demande pour cette histoire" });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * GET /api/stories/:storyId/join-requests
 * Le propriétaire liste les demandes en attente.
 */
export const list = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);

  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut voir les demandes" });
    return;
  }

  try {
    const requests = await joinRequestService.getPendingRequests(storyId);
    res.json(requests);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * GET /api/stories/:storyId/join-requests/mine
 * Un participant consulte sa propre demande.
 */
export const getMine = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);
  const userId = req.user!.id;

  try {
    const request = await joinRequestService.getMyRequest(storyId, userId);
    res.json(request ?? null);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
};

/**
 * PATCH /api/stories/:storyId/join-requests/:requestId
 * Le propriétaire accepte ou refuse une demande.
 * Body: { action: "accept" | "decline" }
 */
export const respond = async (req: Request, res: Response): Promise<void> => {
  const storyId = p(req.params.storyId);
  const requestId = p(req.params.requestId);
  const { action } = req.body;

  if (action !== "accept" && action !== "decline") {
    res.status(400).json({ error: "action doit être 'accept' ou 'decline'" });
    return;
  }

  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut répondre aux demandes" });
    return;
  }

  // Vérifier que la demande appartient à cette histoire
  const request = await joinRequestService.getRequestById(requestId);
  if (!request || request.storyId !== storyId) {
    res.status(404).json({ error: "Demande introuvable" });
    return;
  }
  if (request.status !== "PENDING") {
    res.status(409).json({ error: "Cette demande a déjà été traitée" });
    return;
  }

  try {
    const updated = action === "accept"
      ? await joinRequestService.acceptRequest(requestId)
      : await joinRequestService.declineRequest(requestId);

    // Notifier l'utilisateur concerné via socket
    const io = getIO();
    if (io) {
      io.to(`user:${request.userId}`).emit("join-request:response", {
        requestId,
        storyId,
        storyTitle: request.story.title,
        accepted: action === "accept",
      });

      // Si accepté : diffuser la mise à jour du rôle
      if (action === "accept") {
        const payload = { userId: request.userId, storyId, role: "EDITOR" };
        // Room story → met à jour la liste participants pour tous (y compris le owner)
        io.to(`story:${storyId}`).emit("participant:update", payload);
        // Room personnelle → canal de secours direct si le demandeur n'est pas dans la room story
        io.to(`user:${request.userId}`).emit("participant:update", payload);
      }
    }

    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
};
