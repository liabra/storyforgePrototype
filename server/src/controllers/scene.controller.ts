import { Request, Response } from "express";
import * as sceneService from "../services/scene.service";
import * as chapterService from "../services/chapter.service";
import { getIO } from "../socket";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

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
  const scene = await sceneService.createScene(chapterId, { title, description, order });
  const storyInfo = await chapterService.getStoryInfoByChapter(chapterId);
  if (storyInfo) {
    const io = getIO();
    io?.to(`story:${storyInfo.id}`).emit("scene:new", { chapterId, scene });
    const username = req.user?.email?.split("@")[0] || "Anonyme";
    io?.emit("activity:new", {
      type: "scene",
      storyId: storyInfo.id,
      storyTitle: storyInfo.title,
      sceneId: scene.id,
      sceneTitle: scene.title,
      username,
      at: scene.createdAt,
    });
  }
  return res.status(201).json(scene);
};

export const update = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const scene = await sceneService.updateScene(id, req.body);
  return res.json(scene);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  await sceneService.deleteScene(id);
  return res.status(204).send();
};

export const generateImage = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const scene = await sceneService.generateSceneImage(id);
  return res.json(scene);
};

export const updateCharacters = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const { characterIds } = req.body;
  if (!Array.isArray(characterIds)) {
    return res.status(400).json({ error: "characterIds must be an array" });
  }
  const scene = await sceneService.updateSceneCharacters(id, characterIds);
  return res.json(scene);
};

export const suggestIdea = async (req: Request, res: Response) => {
  const { storyId, sceneTitle } = req.body;
  if (!storyId) return res.status(400).json({ error: "storyId is required" });
  const idea = await sceneService.suggestSceneIdea(storyId, sceneTitle);
  return res.json({ idea });
};
