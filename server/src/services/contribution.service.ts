import prisma from "../prisma/client";

const characterSelect = {
  select: { id: true, name: true, nickname: true, avatarUrl: true },
} as const;

export const getContributionsByScene = (sceneId: string) =>
  prisma.contribution.findMany({
    where: { sceneId, modStatus: { not: "BLOCKED" } },
    orderBy: { createdAt: "asc" },
    include: { character: characterSelect },
  });

export const createContribution = (
  sceneId: string,
  data: { content: string; characterId?: string }
) =>
  prisma.contribution.create({
    data: { ...data, sceneId },
    include: { character: characterSelect },
  });

export const deleteContribution = (id: string) =>
  prisma.contribution.delete({ where: { id } });

export const flagContribution = (id: string) =>
  prisma.contribution.update({ where: { id }, data: { modStatus: "FLAGGED" } });

export const blockContribution = (id: string) =>
  prisma.contribution.update({ where: { id }, data: { modStatus: "BLOCKED" } });
