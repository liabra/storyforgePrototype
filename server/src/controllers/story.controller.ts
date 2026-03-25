import { Request, Response } from "express";
import * as storyService from "../services/story.service";
import * as participantService from "../services/participant.service";
import { ContentStatus, ParticipantRole, StoryVisibility } from "../generated/prisma/client";
import { getIO } from "../socket";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

export const getPublic = async (_req: Request, res: Response) => {
  const stories = await storyService.getPublicStories();
  return res.json(stories);
};

export const getAll = async (req: Request, res: Response) => {
  if (req.user) {
    const stories = await storyService.getUserStories(req.user.id);
    return res.json(stories);
  }
  const stories = await storyService.getAllStories();
  return res.json(stories);
};

export const getById = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.id);
  const story = await storyService.getStoryById(storyId);
  if (!story) return res.status(404).json({ error: "Story not found" });
  if (story.visibility === StoryVisibility.PRIVATE) {
    if (!req.user) return res.status(403).json({ error: "Cette histoire est privée" });
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (!role) return res.status(403).json({ error: "Cette histoire est privée" });
  }
  return res.json(story);
};

export const create = async (req: Request, res: Response) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  if (!req.user) return res.status(401).json({ error: "Authentification requise" });
  const story = await storyService.createStory({ title, description }, req.user.id);
  return res.status(201).json(story);
};

export const update = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.id);

  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER) {
    return res.status(403).json({ error: "Seul le propriétaire peut modifier cette histoire" });
  }
  if (req.body.status && !Object.values(ContentStatus).includes(req.body.status)) {
    return res.status(400).json({ error: "Statut invalide. Utilisez ACTIVE ou DONE." });
  }
  if (req.body.visibility && !Object.values(StoryVisibility).includes(req.body.visibility)) {
    return res.status(400).json({ error: "Visibilité invalide. Utilisez PRIVATE ou PUBLIC." });
  }

  const story = await storyService.updateStory(storyId, req.body);
  const io = getIO();

  if (req.body.status !== undefined) {
    io?.to(`story:${storyId}`).emit("story:statusUpdate", {
      storyId,
      status: story.status,
      triggeredBy: req.user?.id,
    });
  }

  if (req.body.visibility !== undefined) {
    io?.to(`story:${storyId}`).emit("story:visibilityUpdate", {
      storyId,
      visibility: story.visibility,
    });
  }

  return res.json(story);
};

export const remove = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.id);

  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER) {
    return res.status(403).json({ error: "Seul le propriétaire peut supprimer cette histoire" });
  }

  await storyService.deleteStory(storyId);
  return res.status(204).send();
};
