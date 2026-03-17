import prisma from "../prisma/client";

export const getAllStories = () =>
  prisma.story.findMany({ orderBy: { createdAt: "desc" } });

export const getStoryById = (id: string) =>
  prisma.story.findUnique({
    where: { id },
    include: { characters: true, chapters: { orderBy: { order: "asc" } } },
  });

export const createStory = (data: { title: string; description?: string }) =>
  prisma.story.create({ data });

export const updateStory = (
  id: string,
  data: { title?: string; description?: string }
) => prisma.story.update({ where: { id }, data });

export const deleteStory = (id: string) =>
  prisma.story.delete({ where: { id } });
