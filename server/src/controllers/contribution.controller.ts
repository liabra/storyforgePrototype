import { Request, Response } from "express";
import * as contributionService from "../services/contribution.service";
import * as participantService from "../services/participant.service";
import prisma from "../prisma/client";
import { SceneStatus, ParticipantRole } from "../generated/prisma/client";

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
    select: { status: true, chapter: { select: { storyId: true } } },
  });
  if (!scene) return res.status(404).json({ error: "Scene not found" });
  if (scene.status !== SceneStatus.ACTIVE) {
    return res.status(403).json({
      error: "Cette scène n'accepte pas de contributions",
      status: scene.status,
    });
  }

  if (req.user) {
    const role = await participantService.getUserRole(scene.chapter.storyId, req.user.id);
    if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
      return res.status(403).json({ error: "Vous devez être OWNER ou EDITOR pour contribuer à cette histoire" });
    }
  }

  const contribution = await contributionService.createContribution(sceneId, {
    content: content.trim(),
    characterId: characterId || undefined,
    userId: req.user?.id,
  });
  return res.status(201).json(contribution);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  await contributionService.deleteContribution(id);
  return res.status(204).send();
};

export const moderate = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const { action } = req.body;
  if (action === "flag") return res.json(await contributionService.flagContribution(id));
  if (action === "block") return res.json(await contributionService.blockContribution(id));
  return res.status(400).json({ error: "action must be 'flag' or 'block'" });
};
