import prisma from "../prisma/client";
import { ParticipantRole } from "../generated/prisma/client";

export const getUserStories = (userId: string) =>
  prisma.story.findMany({
    where: { participants: { some: { userId } } },
    orderBy: { createdAt: "desc" },
  });

export const getAllStories = () =>
  prisma.story.findMany({ orderBy: { createdAt: "desc" } });

export const getStoryById = (id: string) =>
  prisma.story.findUnique({
    where: { id },
    include: { characters: true, chapters: { orderBy: { order: "asc" } } },
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
  data: { title?: string; description?: string }
) => prisma.story.update({ where: { id }, data });

export const deleteStory = (id: string) =>
  prisma.story.delete({ where: { id } });
