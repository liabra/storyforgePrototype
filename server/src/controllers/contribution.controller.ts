import { Request, Response } from "express";
import * as contributionService from "../services/contribution.service";

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
  const contribution = await contributionService.createContribution(sceneId, {
    content: content.trim(),
    characterId: characterId || undefined,
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
