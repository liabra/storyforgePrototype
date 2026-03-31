import { Request, Response } from "express";
import * as sceneService from "../services/scene.service";
import * as chapterService from "../services/chapter.service";
import * as participantService from "../services/participant.service";
import * as activityService from "../services/activity.service";
import * as storyService from "../services/story.service";
import { getIO } from "../socket";
import { ContentStatus, ParticipantRole, SceneMode } from "../generated/prisma/client";
import { extractFragmentsFromStory, getWorldSeed } from "../services/world.service";
import prisma from "../prisma/client";
import { moderateText, MOD_REFUSED } from "../services/moderation.service";

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

// ── Phase A : route principale — GET /stories/:storyId/scenes ─────────────────

export const getByStory = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const access = await storyService.checkStoryReadAccess(storyId, req.user?.id);
  if (access === "not_found") return res.status(404).json({ error: "Histoire introuvable" });
  if (access === "forbidden") return res.status(403).json({ error: "Cette histoire est privée" });
  const scenes = await sceneService.getScenesByStory(storyId);
  return res.json(scenes);
};

// Conservé en Phase A pour les anciens clients — GET /chapters/:chapterId/scenes
export const getByChapter = async (req: Request, res: Response) => {
  const chapterId = getSingleParam(req.params.chapterId);
  const storyId = await chapterService.getStoryIdByChapter(chapterId);
  if (!storyId) return res.status(404).json({ error: "Chapitre introuvable" });
  const access = await storyService.checkStoryReadAccess(storyId, req.user?.id);
  if (access === "forbidden") return res.status(403).json({ error: "Cette histoire est privée" });
  const scenes = await sceneService.getScenesByChapter(chapterId);
  return res.json(scenes);
};

export const getOne = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const storyId = await participantService.getStoryIdByScene(id);
  if (!storyId) return res.status(404).json({ error: "Scène introuvable" });
  const access = await storyService.checkStoryReadAccess(storyId, req.user?.id);
  if (access === "forbidden") return res.status(403).json({ error: "Cette histoire est privée" });
  const scene = await sceneService.getSceneWithContributions(id);
  return res.json(scene);
};

// ── Phase A : route principale — POST /stories/:storyId/scenes ───────────────

export const create = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const { title, description, order } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const storyMeta = await storyService.getStoryMeta(storyId);
  if (!storyMeta) return res.status(404).json({ error: "Histoire introuvable" });
  if (storyMeta.isArchived) return res.status(409).json({ error: "Cette histoire est archivée." });
  if (storyMeta.status === ContentStatus.DONE) {
    return res.status(409).json({ error: "Impossible de créer une scène dans une histoire terminée" });
  }

  if (!await assertEditorOrOwner(storyId, req, res)) return;

  if (!moderateText(title, "scene.title").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });
  if (description && !moderateText(description, "scene.description").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });

  const scene = await sceneService.createScene(storyId, { title, description, order });
  const storyTitle = await storyService.getStoryTitle(storyId) ?? "";

  const io = getIO();
  // Phase A : payload contient storyId (plus chapterId)
  io?.to(`story:${storyId}`).emit("scene:new", { storyId, scene });
  const username = req.user?.email?.split("@")[0] || "Anonyme";
  void activityService.broadcastActivityToStory(storyId, {
    type: "scene",
    storyId,
    storyTitle,
    sceneId: scene.id,
    sceneTitle: scene.title,
    username,
    userId: req.user?.id,
    at: scene.createdAt.toISOString(),
  });

  // Injection World Seed — fire and forget
  getWorldSeed().then((seed) => {
    if (seed) {
      const io = getIO();
      io?.to(`story:${storyId}`).emit("gm_intervention", {
        text: seed,
      });
    }
  }).catch(console.error);

  return res.status(201).json(scene);
};

// Conservé en Phase A — POST /chapters/:chapterId/scenes (anciens clients)
export const createUnderChapter = async (req: Request, res: Response) => {
  const chapterId = getSingleParam(req.params.chapterId);
  const { title, description, order } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const chapterInfo = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { storyId: true, status: true, story: { select: { status: true, isArchived: true } } },
  });
  if (!chapterInfo) return res.status(404).json({ error: "Chapitre introuvable" });
  const storyId = chapterInfo.storyId;

  if (chapterInfo.story.isArchived) return res.status(409).json({ error: "Cette histoire est archivée." });
  if (chapterInfo.story.status === ContentStatus.DONE) {
    return res.status(409).json({ error: "Impossible de créer une scène dans une histoire terminée" });
  }
  if (chapterInfo.status === ContentStatus.DONE) {
    return res.status(409).json({ error: "Impossible de créer une scène dans un chapitre terminé" });
  }

  if (!await assertEditorOrOwner(storyId, req, res)) return;

  if (!moderateText(title, "scene.title").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });
  if (description && !moderateText(description, "scene.description").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });

  // Phase A : storyId est la source de vérité, chapterId conservé pour compatibilité
  const scene = await sceneService.createScene(storyId, { title, description, order }, chapterId);
  const storyTitle = await storyService.getStoryTitle(storyId) ?? "";

  const io = getIO();
  io?.to(`story:${storyId}`).emit("scene:new", { storyId, scene });
  const username = req.user?.email?.split("@")[0] || "Anonyme";
  void activityService.broadcastActivityToStory(storyId, {
    type: "scene",
    storyId,
    storyTitle,
    sceneId: scene.id,
    sceneTitle: scene.title,
    username,
    userId: req.user?.id,
    at: scene.createdAt.toISOString(),
  });

  // Injection World Seed — fire and forget
  getWorldSeed().then((seed) => {
    if (seed) {
      const io = getIO();
      io?.to(`story:${storyId}`).emit("gm_intervention", {
        text: seed,
      });
    }
  }).catch(console.error);

  return res.status(201).json(scene);
};

export const update = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  const storyId = await participantService.getStoryIdByScene(id);
  if (!storyId) return res.status(404).json({ error: "Scène introuvable" });
  if (!await assertOwner(storyId, req, res)) return;

  if (req.body.title && !moderateText(req.body.title, "scene.title").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });
  if (req.body.description && !moderateText(req.body.description, "scene.description").isAllowed)
    return res.status(400).json({ error: MOD_REFUSED });

  const updateData = { ...req.body };
  if (updateData.mode === SceneMode.TURN) {
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

  if (updateData.mode !== undefined) {
    io?.to(`story:${storyId}`).emit("turn:update", {
      sceneId: id,
      mode: scene.mode,
      currentTurnUserId: scene.currentTurnUserId,
    });
  }

  if (updateData.status !== undefined) {
    // Phase A : payload contient storyId (plus chapterId)
    io?.to(`story:${storyId}`).emit("scene:statusUpdate", {
      sceneId: id,
      storyId,
      status: scene.status,
      sceneTitle: scene.title,
      triggeredBy: req.user?.id,
    });

    if (updateData.status === "DONE" && storyId) {
      extractFragmentsFromStory(storyId).catch(console.error);
    }
  }

  return res.json(scene);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);

  // Phase A : storyId directement sur Scene
  const scene = await prisma.scene.findUnique({
    where: { id },
    select: { storyId: true },
  });
  if (!scene) return res.status(404).json({ error: "Scène introuvable" });
  const storyId = scene.storyId;
  if (!await assertOwner(storyId, req, res)) return;

  await sceneService.deleteScene(id);
  const io = getIO();
  // Phase A : payload contient storyId (plus chapterId)
  io?.to(`story:${storyId}`).emit("scene:delete", { sceneId: id, storyId });
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
