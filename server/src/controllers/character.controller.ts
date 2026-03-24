import { Request, Response } from "express";
import * as characterService from "../services/character.service";
import * as participantService from "../services/participant.service";
import { ParticipantRole } from "../generated/prisma/client";

const getSingleParam = (value: string | string[] | undefined): string => {
  if (!value) throw new Error("Missing route parameter");
  return Array.isArray(value) ? value[0] : value;
};

/** OWNER ou EDITOR peuvent créer des personnages. */
async function assertEditorOrOwner(storyId: string, req: Request, res: Response): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise" });
    return false;
  }
  const role = await participantService.getUserRole(storyId, req.user.id);
  if (role !== ParticipantRole.OWNER && role !== ParticipantRole.EDITOR) {
    res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour créer un personnage" });
    return false;
  }
  return true;
}

/**
 * Vérifie que l'utilisateur connecté est l'auteur du personnage.
 * Cas particulier : si le personnage n'a pas d'auteur (données legacy, userId = null),
 * seul le OWNER de l'histoire peut encore le modifier/supprimer.
 */
async function assertCharacterAuthor(
  characterId: string,
  req: Request,
  res: Response,
): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise" });
    return false;
  }

  const meta = await characterService.getCharacterMeta(characterId);
  if (!meta) {
    res.status(404).json({ error: "Personnage introuvable" });
    return false;
  }

  // Auteur connu → seul lui peut agir
  if (meta.userId !== null) {
    if (meta.userId !== req.user.id) {
      res.status(403).json({ error: "Seul l'auteur de ce personnage peut le modifier" });
      return false;
    }
    return true;
  }

  // Personnage sans auteur (legacy) → OWNER uniquement
  const role = await participantService.getUserRole(meta.storyId, req.user.id);
  if (role !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut modifier ce personnage (auteur inconnu)" });
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

  if (!(await assertEditorOrOwner(storyId, req, res))) return;

  const character = await characterService.createCharacter(storyId, req.user!.id, data);
  return res.status(201).json(character);
};

export const update = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);

  if (!(await assertCharacterAuthor(characterId, req, res))) return;

  const character = await characterService.updateCharacter(characterId, req.body);
  return res.json(character);
};

export const remove = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);

  if (!(await assertCharacterAuthor(characterId, req, res))) return;

  await characterService.deleteCharacter(characterId);
  return res.status(204).send();
};
