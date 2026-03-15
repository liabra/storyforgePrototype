import { Request, Response } from "express";
import * as sceneService from "../services/scene.service";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

export const getByStory = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const scenes = await sceneService.getScenesByStory(storyId);
  return res.json(scenes);
};

export const create = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const { title, content, order } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const scene = await sceneService.createScene(storyId, { title, content, order });
  return res.status(201).json(scene);
};

export const update = async (req: Request, res: Response) => {
  const sceneId = getSingleParam(req.params.id);
  const scene = await sceneService.updateScene(sceneId, req.body);
  return res.json(scene);
};

export const remove = async (req: Request, res: Response) => {
  const sceneId = getSingleParam(req.params.id);
  await sceneService.deleteScene(sceneId);
  return res.status(204).send();
};

export const generateImage = async (req: Request, res: Response) => {
  const sceneId = getSingleParam(req.params.id);
  const scene = await sceneService.generateSceneImage(sceneId);
  return res.json(scene);
};

export const suggestIdea = async (req: Request, res: Response) => {
  const { storyId, sceneTitle } = req.body;
  if (!storyId) return res.status(400).json({ error: "storyId is required" });
  const idea = await sceneService.suggestSceneIdea(storyId, sceneTitle);
  return res.json({ idea });
};
