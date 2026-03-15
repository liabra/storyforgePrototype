import { Request, Response } from "express";
import * as characterService from "../services/character.service";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

export const getByStory = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const characters = await characterService.getCharactersByStory(storyId);
  return res.json(characters);
};

export const create = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const data: characterService.CharacterData = req.body;

  if (!data.name && !data.nickname) {
    return res.status(400).json({ error: "name or nickname is required" });
  }

  const character = await characterService.createCharacter(storyId, data);
  return res.status(201).json(character);
};

export const update = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);
  const character = await characterService.updateCharacter(characterId, req.body);
  return res.json(character);
};

export const remove = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);
  await characterService.deleteCharacter(characterId);
  return res.status(204).send();
};
