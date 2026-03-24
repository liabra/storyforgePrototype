import { Request, Response } from "express";
import * as sceneService from "../services/scene.service";
import * as chapterService from "../services/chapter.service";
import * as participantService from "../services/participant.service";
import * as activityService from "../services/activity.service";
import { getIO } from "../socket";
import { ParticipantRole, SceneMode } from "../generated/prisma/client";
import prisma from "../prisma/client";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

/** Vérifie que l'utilisateur a au moins le rôle EDITOR sur cette histoire. */
async function assertEditorOrOwner(storyId: string, req: Request, res: Response): Promise<boolean> {
  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
    res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour cette action" });
    return false;
  }
  return true;
}

/** Vérifie que l'utilisateur est OWNER sur cette histoire. */
async function assertOwner(storyId: string, req: Request, res: Response): Promise<boolean> {
  const role = await participantService.getUserRole(storyId, req.user!.id);
  if (role !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut effectuer cette action" });
    return false;
  }
  return true;
}

export const getByChapter = async (req: Request, res: Response) => {
  const chapterId = getSingleParam(req.params.chapterId);
  const scenes = await sceneService.getScenesByChapter(chapterId);
  return res.json(scenes);
};

export const getOne = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const scene = await sceneService.getSceneWithContributions(id);
  return res.json(scene);
};

export const create = async (req: Request, res: Response) => {
  const chapterId = getSingleParam(req.params.chapterId);
  const { title, description, order } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const storyId = await chapterService.getStoryIdByChapter(chapterId);
  if (!storyId) return res.status(404).json({ error: "Chapitre introuvable" });
  if (!await assertEditorOrOwner(storyId, req, res)) return;

  const scene = await sceneService.createScene(chapterId, { title, description, order });
  const storyInfo = await chapterService.getStoryInfoByChapter(chapterId);
  if (storyInfo) {
    const io = getIO();
    io?.to(`story:${storyInfo.id}`).emit("scene:new", { chapterId, scene });
    // Diffuse le feed d'activité aux participants de l'histoire uniquement
    const username = req.user?.email?.split("@")[0] || "Anonyme";
    void activityService.broadcastActivityToStory(storyInfo.id, {
      type: "scene",
      storyId: storyInfo.id,
      storyTitle: storyInfo.title,
      sceneId: scene.id,
      sceneTitle: scene.title,
      username,
      userId: req.user?.id,
      at: scene.createdAt.toISOString(),
    });
  }
  return res.status(201).json(scene);
};

export const update = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const storyId = await participantService.getStoryIdByScene(id);
  if (!storyId) return res.status(404).json({ error: "Scène introuvable" });
  if (!await assertOwner(storyId, req, res)) return;

  // Gestion du changement de mode (FREE ↔ TURN)
  const updateData = { ...req.body };
  if (updateData.mode === SceneMode.TURN) {
    // Initialiser le tour sur le premier OWNER+EDITOR (par date d'entrée)
    const eligible = await prisma.storyParticipant.findMany({
      where: { storyId, role: { in: [ParticipantRole.OWNER, ParticipantRole.EDITOR] } },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    updateData.currentTurnUserId = eligible[0]?.userId ?? null;
  } else if (updateData.mode === SceneMode.FREE) {
    updateData.currentTurnUserId = null;
  }

  const scene = await sceneService.updateScene(id, updateData);
  const io = getIO();

  // Émettre turn:update si le mode ou le tour a changé
  if (updateData.mode !== undefined) {
    io?.to(`story:${storyId}`).emit("turn:update", {
      sceneId: id,
      mode: scene.mode,
      currentTurnUserId: scene.currentTurnUserId,
    });
  }

  // Émettre scene:statusUpdate si le statut a changé
  if (updateData.status !== undefined) {
    io?.to(`story:${storyId}`).emit("scene:statusUpdate", {
      sceneId: id,
      chapterId: scene.chapterId,
      status: scene.status,
    });
  }

  return res.json(scene);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const scene = await prisma.scene.findUnique({
    where: { id },
    select: { chapterId: true, chapter: { select: { storyId: true } } },
  });
  if (!scene) return res.status(404).json({ error: "Scène introuvable" });
  const storyId = scene.chapter.storyId;
  if (!await assertOwner(storyId, req, res)) return;

  await sceneService.deleteScene(id);
  const io = getIO();
  io?.to(`story:${storyId}`).emit("scene:delete", { sceneId: id, chapterId: scene.chapterId });
  return res.status(204).send();
};

export const generateImage = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const storyId = await participantService.getStoryIdByScene(id);
  if (!storyId) return res.status(404).json({ error: "Scène introuvable" });
  if (!await assertEditorOrOwner(storyId, req, res)) return;

  const scene = await sceneService.generateSceneImage(id);
  return res.json(scene);
};

export const updateCharacters = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const { characterIds } = req.body;
  if (!Array.isArray(characterIds)) {
    return res.status(400).json({ error: "characterIds must be an array" });
  }

  const storyId = await participantService.getStoryIdByScene(id);
  if (!storyId) return res.status(404).json({ error: "Scène introuvable" });
  if (!await assertEditorOrOwner(storyId, req, res)) return;

  const scene = await sceneService.updateSceneCharacters(id, characterIds);

  // Diffuse à tous les participants de l'histoire (vue scène + vue chapitre)
  const io = getIO();
  if (io) {
    io.to(`story:${storyId}`).emit("scene:characters:update", {
      sceneId: id,
      characters: scene.characters,
    });
  }

  return res.json(scene);
};

export const suggestIdea = async (req: Request, res: Response) => {
  const { storyId, sceneTitle } = req.body;
  if (!storyId) return res.status(400).json({ error: "storyId is required" });
  if (!await assertEditorOrOwner(storyId, req, res)) return;
  const idea = await sceneService.suggestSceneIdea(storyId, sceneTitle);
  return res.json({ idea });
};
