import { Request, Response } from "express";
import * as contributionService from "../services/contribution.service";
import * as participantService from "../services/participant.service";
import * as activityService from "../services/activity.service";
import { getIO } from "../socket";
import prisma from "../prisma/client";
import { ContentStatus, SceneMode, SceneStatus, ParticipantRole } from "../generated/prisma/client";


const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

export const getByScene = async (req: Request, res: Response) => {
  const sceneId = getSingleParam(req.params.sceneId);
  const contributions = await contributionService.getContributionsByScene(sceneId);
  return res.json(contributions);
};

export const create = async (req: Request, res: Response) => {
  const sceneId = getSingleParam(req.params.sceneId);
  const { content, characterId } = req.body;

  if (!content?.trim()) return res.status(400).json({ error: "content is required" });

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: {
      title: true,
      status: true,
      mode: true,
      currentTurnUserId: true,
      chapter: { select: { storyId: true, story: { select: { title: true, status: true } } } },
    },
  });
  if (!scene) return res.status(404).json({ error: "Scene not found" });
  if (scene.status !== SceneStatus.ACTIVE) {
    return res.status(403).json({
      error: "Cette scène n'accepte pas de contributions",
      status: scene.status,
    });
  }

  const storyId = scene.chapter.storyId;
  if (scene.chapter.story.status === ContentStatus.DONE) {
    return res.status(403).json({ error: "Cette histoire est terminée et n'accepte plus de contributions" });
  }
  if (req.user) {
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
      return res.status(403).json({ error: "Vous devez être OWNER ou EDITOR pour contribuer à cette histoire" });
    }
    // En mode TURN, vérifier que c'est bien le tour de cet utilisateur
    if (scene.mode === SceneMode.TURN && scene.currentTurnUserId !== req.user.id) {
      return res.status(403).json({ error: "Ce n'est pas votre tour d'écrire" });
    }
  }

  const contribution = await contributionService.createContribution(sceneId, {
    content: content.trim(),
    characterId: characterId || undefined,
    userId: req.user?.id,
  });

  const io = getIO();
  io?.to(`scene:${sceneId}`).emit("contribution:new", contribution);
  const username = req.user?.email?.split("@")[0] || "Anonyme";
  void activityService.broadcastActivityToStory(storyId, {
    type: "contribution",
    storyId,
    storyTitle: scene.chapter.story.title,
    sceneId,
    sceneTitle: scene.title,
    username,
    userId: req.user?.id,
    at: contribution.createdAt.toISOString(),
  });

  // En mode TURN : passer au participant suivant
  if (scene.mode === SceneMode.TURN && req.user) {
    const eligible = await prisma.storyParticipant.findMany({
      where: { storyId, role: { in: [ParticipantRole.OWNER, ParticipantRole.EDITOR] } },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (eligible.length > 0) {
      const currentIdx = eligible.findIndex((p) => p.userId === scene.currentTurnUserId);
      const nextIdx = (currentIdx + 1) % eligible.length;
      const nextUserId = eligible[nextIdx].userId;
      await prisma.scene.update({
        where: { id: sceneId },
        data: { currentTurnUserId: nextUserId },
      });
      io?.to(`story:${storyId}`).emit("turn:update", {
        sceneId,
        mode: SceneMode.TURN,
        currentTurnUserId: nextUserId,
      });
    }
  }

  return res.status(201).json(contribution);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const contrib = await prisma.contribution.findUnique({
    where: { id },
    select: {
      sceneId: true,
      userId: true,
      scene: { select: { chapter: { select: { storyId: true } } } },
    },
  });
  if (!contrib) return res.status(404).json({ error: "Contribution introuvable" });

  // Seul l'auteur ou le OWNER peut supprimer
  const storyId = contrib.scene.chapter.storyId;
  const isAuthor = req.user?.id === contrib.userId;
  if (!isAuthor) {
    const role = await participantService.getUserRole(storyId, req.user!.id);
    if (role !== ParticipantRole.OWNER) {
      return res.status(403).json({ error: "Seul l'auteur ou le propriétaire peut supprimer cette contribution" });
    }
  }

  await contributionService.deleteContribution(id);
  const io = getIO();
  io?.to(`scene:${contrib.sceneId}`).emit("contribution:delete", { id });
  return res.status(204).send();
};

export const update = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "content is required" });

  const existing = await prisma.contribution.findUnique({
    where: { id },
    select: { userId: true, sceneId: true },
  });
  if (!existing) return res.status(404).json({ error: "Contribution not found" });
  if (existing.userId !== req.user?.id) {
    return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres contributions" });
  }

  const contribution = await contributionService.updateContribution(id, content.trim());
  const io = getIO();
  io?.to(`scene:${existing.sceneId}`).emit("contribution:update", contribution);
  return res.json(contribution);
};

export const moderate = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const { action } = req.body;
  if (action === "flag") return res.json(await contributionService.flagContribution(id));
  if (action === "block") return res.json(await contributionService.blockContribution(id));
  return res.status(400).json({ error: "action must be 'flag' or 'block'" });
};
