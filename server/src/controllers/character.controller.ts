import { Request, Response } from "express";
import * as characterService from "../services/character.service";
import * as participantService from "../services/participant.service";
import * as storyService from "../services/story.service";
import { ParticipantRole } from "../generated/prisma/client";
import { getIO } from "../socket";

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
 * Retourne le meta { storyId, userId } si autorisé, false sinon.
 * Cas legacy (userId = null) : seul le OWNER peut agir.
 */
async function assertCharacterAuthor(
  characterId: string,
  req: Request,
  res: Response,
): Promise<{ storyId: string; userId: string | null } | false> {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise" });
    return false;
  }

  const meta = await characterService.getCharacterMeta(characterId);
  if (!meta) {
    res.status(404).json({ error: "Personnage introuvable" });
    return false;
  }

  if (meta.userId !== null) {
    if (meta.userId !== req.user.id) {
      res.status(403).json({ error: "Seul l'auteur de ce personnage peut le modifier" });
      return false;
    }
    return meta;
  }

  // Personnage sans auteur (legacy) → OWNER uniquement
  const role = await participantService.getUserRole(meta.storyId, req.user.id);
  if (role !== ParticipantRole.OWNER) {
    res.status(403).json({ error: "Seul le propriétaire peut modifier ce personnage (auteur inconnu)" });
    return false;
  }
  return meta;
}

export const getByStory = async (req: Request, res: Response) => {
  const storyId = getSingleParam(req.params.storyId);
  const access = await storyService.checkStoryReadAccess(storyId, req.user?.id);
  if (access === "not_found") return res.status(404).json({ error: "Histoire introuvable" });
  if (access === "forbidden") return res.status(403).json({ error: "Cette histoire est privée" });
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
  getIO()?.to(`story:${storyId}`).emit("character:new", character);
  return res.status(201).json(character);
};

export const update = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);

  const meta = await assertCharacterAuthor(characterId, req, res);
  if (!meta) return;

  const character = await characterService.updateCharacter(characterId, req.body);
  getIO()?.to(`story:${meta.storyId}`).emit("character:update", character);
  return res.json(character);
};

export const remove = async (req: Request, res: Response) => {
  const characterId = getSingleParam(req.params.id);

  const meta = await assertCharacterAuthor(characterId, req, res);
  if (!meta) return;

  await characterService.deleteCharacter(characterId);
  getIO()?.to(`story:${meta.storyId}`).emit("character:delete", { id: characterId });
  return res.status(204).send();
};
