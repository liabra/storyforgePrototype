import prisma from "../prisma/client";
import { ContentStatus, ParticipantRole, StoryVisibility } from "../generated/prisma/client";

export const getUserStories = (userId: string) =>
  prisma.story.findMany({
    where: { participants: { some: { userId } }, isArchived: false },
    orderBy: { createdAt: "desc" },
  });

export const getArchivedStories = (userId: string) =>
  prisma.story.findMany({
    where: { participants: { some: { userId, role: ParticipantRole.OWNER } }, isArchived: true },
    orderBy: { updatedAt: "desc" },
  });

export const getAllStories = () =>
  prisma.story.findMany({ where: { isArchived: false }, orderBy: { createdAt: "desc" } });

export const getStoryById = (id: string) =>
  prisma.story.findUnique({
    where: { id },
    include: { characters: true },
  });

export const createStory = async (data: { title: string; description?: string }, ownerId: string) => {
  const story = await prisma.story.create({ data });
  await prisma.storyParticipant.create({
    data: { storyId: story.id, userId: ownerId, role: ParticipantRole.OWNER },
  });
  return story;
};

export const updateStory = (
  id: string,
  data: { title?: string; description?: string; status?: ContentStatus; visibility?: StoryVisibility }
) => prisma.story.update({ where: { id }, data });

export const archiveStory = (id: string) =>
  prisma.story.update({ where: { id }, data: { isArchived: true } });

export const unarchiveStory = (id: string) =>
  prisma.story.update({ where: { id }, data: { isArchived: false } });

export const getPublicStories = () =>
  prisma.story.findMany({
    where: { visibility: StoryVisibility.PUBLIC, isArchived: false },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { scenes: true, participants: true } },
    },
  });

export const deleteStory = (id: string) =>
  prisma.story.delete({ where: { id } });

// Retourne status + isArchived en un seul appel (utilisé par les gardes d'écriture)
export const getStoryMeta = async (storyId: string): Promise<{ status: ContentStatus; isArchived: boolean } | null> => {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { status: true, isArchived: true } });
  return story ?? null;
};

export const getStoryStatus = async (storyId: string): Promise<ContentStatus | null> => {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { status: true } });
  return story?.status ?? null;
};

export const getStoryTitle = async (storyId: string): Promise<string | null> => {
  const story = await prisma.story.findUnique({ where: { id: storyId }, select: { title: true } });
  return story?.title ?? null;
};

/**
 * Vérifie qu'un utilisateur peut lire une histoire.
 * - PUBLIC → toujours autorisé
 * - PRIVATE → requiert un userId valide et une participation active
 */
export const checkStoryReadAccess = async (
  storyId: string,
  userId: string | undefined
): Promise<"ok" | "not_found" | "forbidden"> => {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { visibility: true },
  });
  if (!story) return "not_found";
  if (story.visibility === StoryVisibility.PRIVATE) {
    if (!userId) return "forbidden";
    const participant = await prisma.storyParticipant.findUnique({
      where: { storyId_userId: { storyId, userId } },
      select: { id: true },
    });
    if (!participant) return "forbidden";
  }
  return "ok";
};
