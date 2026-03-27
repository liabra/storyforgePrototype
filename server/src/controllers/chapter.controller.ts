import { Request, Response } from "express";
import * as chapterService from "../services/chapter.service";
import * as participantService from "../services/participant.service";
import * as storyService from "../services/story.service";

import { ContentStatus, ParticipantRole } from "../generated/prisma/client";
import { getIO } from "../socket";
import { moderateText, MOD_REFUSED } from "../services/moderation.service";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

export const getByStory = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const access = await storyService.checkStoryReadAccess(storyId, req.user?.id);
  if (access === "not_found") return res.status(404).json({ error: "Histoire introuvable" });
  if (access === "forbidden") return res.status(403).json({ error: "Cette histoire est privée" });
  const chapters = await chapterService.getChaptersByStory(storyId);
  return res.json(chapters);
};

export const create = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const { title, description, order } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const storyMeta = await storyService.getStoryMeta(storyId);
  if (!storyMeta) return res.status(404).json({ error: "Histoire introuvable" });
  if (storyMeta.isArchived) return res.status(409).json({ error: "Cette histoire est archivée." });
  if (storyMeta.status === ContentStatus.DONE) {
    return res.status(409).json({ error: "Impossible de créer un chapitre dans une histoire terminée" });
  }

  if (req.user) {
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
      return res.status(403).json({ error: "Vous devez être OWNER ou EDITOR pour créer un chapitre" });
    }
  }

  if (!moderateText(title, "chapter.title").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });
  if (description && !moderateText(description, "chapter.description").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });

  const chapter = await chapterService.createChapter(storyId, { title, description, order });
  getIO()?.to(`story:${storyId}`).emit("chapter:new", chapter);
  return res.status(201).json(chapter);
};

export const update = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const storyId = await chapterService.getStoryIdByChapter(id);
  if (!storyId) return res.status(404).json({ error: "Chapitre introuvable" });
  const role = await participantService.getUserRole(storyId, req.user!.id);

  // Le changement de statut est réservé au OWNER
  if (req.body.status !== undefined && role !== ParticipantRole.OWNER) {
    return res.status(403).json({ error: "Seul le propriétaire peut modifier le statut d'un chapitre" });
  }
  if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
    return res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour modifier un chapitre" });
  }
  if (req.body.status && !Object.values(ContentStatus).includes(req.body.status)) {
    return res.status(400).json({ error: "Statut invalide. Utilisez ACTIVE ou DONE." });
  }
  if (req.body.title && !moderateText(req.body.title, "chapter.title").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });
  if (req.body.description && !moderateText(req.body.description, "chapter.description").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });

  const chapter = await chapterService.updateChapter(id, req.body);

  if (req.body.status !== undefined) {
    const storyTitle = await storyService.getStoryTitle(storyId);
    getIO()?.to(`story:${storyId}`).emit("chapter:statusUpdate", {
      chapterId: id,
      status: chapter.status,
      chapterTitle: chapter.title,
      storyTitle: storyTitle ?? undefined,
      triggeredBy: req.user?.id,
    });
  }

  return res.json(chapter);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const storyId = await chapterService.getStoryIdByChapter(id);
  if (!storyId) return res.status(404).json({ error: "Chapitre introuvable" });
  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER) {
    return res.status(403).json({ error: "Seul le propriétaire peut supprimer un chapitre" });
  }

  await chapterService.deleteChapter(id);
  getIO()?.to(`story:${storyId}`).emit("chapter:delete", { chapterId: id, storyId });
  return res.status(204).send();
};
