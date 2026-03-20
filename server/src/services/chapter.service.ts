import prisma from "../prisma/client";

export type ChapterData = {
  title: string;
  description?: string;
  order?: number;
};

export const getChaptersByStory = (storyId: string) =>
  prisma.chapter.findMany({
    where: { storyId },
    orderBy: { order: "asc" },
    include: {
      scenes: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          status: true,
          _count: { select: { contributions: true } },
          characters: { select: { id: true, name: true, nickname: true } },
        },
      },
    },
  });

export const createChapter = (storyId: string, data: ChapterData) =>
  prisma.chapter.create({
    data: { ...data, storyId },
    include: {
      scenes: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          order: true,
          status: true,
          _count: { select: { contributions: true } },
          characters: { select: { id: true, name: true, nickname: true } },
        },
      },
    },
  });

export const updateChapter = (id: string, data: Partial<ChapterData>) =>
  prisma.chapter.update({ where: { id }, data });

export const deleteChapter = (id: string) =>
  prisma.chapter.delete({ where: { id } });

export const getStoryIdByChapter = async (chapterId: string): Promise<string | null> => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { storyId: true },
  });
  return chapter?.storyId ?? null;
};
