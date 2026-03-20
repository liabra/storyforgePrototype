import { Request, Response } from "express";
import * as characterService from "../services/character.service";
import * as participantService from "../services/participant.service";
import { ParticipantRole } from "../generated/prisma/client";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

// Vérifie que l'utilisateur connecté est bien OWNER de la story.
// Renvoie false et écrit la réponse HTTP si ce n'est pas le cas.
async function assertOwner(storyId: string, req: Request, res: Response): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise" });
    return false;
  }
  const role = await participantService.getUserRole(storyId, req.user.id);
  if (role !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut modifier les personnages" });
    return false;
  }
  return true;
}

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

  if (!(await assertOwner(storyId, req, res))) return;

  const character = await characterService.createCharacter(storyId, data);
  return res.status(201).json(character);
};

export const update = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);
  const storyId = await characterService.getStoryIdByCharacter(characterId);
  if (!storyId) return res.status(404).json({ error: "Personnage introuvable" });

  if (!(await assertOwner(storyId, req, res))) return;

  const character = await characterService.updateCharacter(characterId, req.body);
  return res.json(character);
};

export const remove = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);
  const storyId = await characterService.getStoryIdByCharacter(characterId);
  if (!storyId) return res.status(404).json({ error: "Personnage introuvable" });

  if (!(await assertOwner(storyId, req, res))) return;

  await characterService.deleteCharacter(characterId);
  return res.status(204).send();
};
