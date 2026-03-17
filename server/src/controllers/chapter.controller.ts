import { Request, Response } from "express";
import * as chapterService from "../services/chapter.service";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

export const getByStory = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const chapters = await chapterService.getChaptersByStory(storyId);
  return res.json(chapters);
};

export const create = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const { title, description, order } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const chapter = await chapterService.createChapter(storyId, { title, description, order });
  return res.status(201).json(chapter);
};

export const update = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  const chapter = await chapterService.updateChapter(id, req.body);
  return res.json(chapter);
};

export const remove = async (req: Request, res: Response) => {
  const id = getSingleParam(req.params.id);
  await chapterService.deleteChapter(id);
  return res.status(204).send();
};
