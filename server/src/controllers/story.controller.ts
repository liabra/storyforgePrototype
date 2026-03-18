import { Request, Response } from "express";
import * as storyService from "../services/story.service";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) {
    throw new Error("Missing route parameter");
  }

  return Array.isArray(value) ? value[0] : value;
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

  if (!story) {
    return res.status(404).json({ error: "Story not found" });
  }

  return res.json(story);
};

export const create = async (req: Request, res: Response) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const story = await storyService.createStory({ title, description }, req.user.id);
  return res.status(201).json(story);
};

export const update = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.id);
  const story = await storyService.updateStory(storyId, req.body);
  return res.json(story);
};

export const remove = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.id);
  await storyService.deleteStory(storyId);
  return res.status(204).send();
};