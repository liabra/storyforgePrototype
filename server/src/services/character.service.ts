import prisma from "../prisma/client";

export type CharacterData = {
  name?: string;
  nickname?: string;
  role?: string;
  shortDescription?: string;
  appearance?: string;
  outfit?: string;
  accessories?: string;
  personality?: string;
  traits?: string;
  faction?: string;
  visualNotes?: string;
};

export const getCharactersByStory = (storyId: string) =>
  prisma.character.findMany({
    where: { storyId },
    orderBy: { createdAt: "asc" },
    include: {
      scenes: {
        select: { id: true, title: true, order: true, status: true },
        orderBy: { order: "asc" },
      },
    },
  });

export const createCharacter = (storyId: string, data: CharacterData) =>
  prisma.character.create({ data: { ...data, storyId } });

export const updateCharacter = (id: string, data: CharacterData) =>
  prisma.character.update({ where: { id }, data });

export const deleteCharacter = (id: string) =>
  prisma.character.delete({ where: { id } });

export const getStoryIdByCharacter = async (characterId: string): Promise<string | null> => {
  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: { storyId: true },
  });
  return char?.storyId ?? null;
};
