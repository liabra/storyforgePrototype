import prisma from "../prisma/client";
import { ParticipantRole } from "../generated/prisma/client";

const participantInclude = {
  user: { select: { id: true, email: true, displayName: true, color: true } },
} as const;

export const getParticipants = (storyId: string) =>
  prisma.storyParticipant.findMany({
    where: { storyId },
    include: participantInclude,
    orderBy: { createdAt: "asc" },
  });

export const addParticipant = (storyId: string, userId: string, role: ParticipantRole) =>
  prisma.storyParticipant.create({
    data: { storyId, userId, role },
    include: participantInclude,
  });

export const updateRole = (storyId: string, userId: string, role: ParticipantRole) =>
  prisma.storyParticipant.update({
    where: { storyId_userId: { storyId, userId } },
    data: { role },
    include: participantInclude,
  });

export const removeParticipant = (storyId: string, userId: string) =>
  prisma.storyParticipant.delete({
    where: { storyId_userId: { storyId, userId } },
  });

export const getUserRole = async (
  storyId: string,
  userId: string
): Promise<ParticipantRole | null> => {
  const p = await prisma.storyParticipant.findUnique({
    where: { storyId_userId: { storyId, userId } },
    select: { role: true },
  });
  return p?.role ?? null;
};

export const getStoryIdByScene = async (sceneId: string): Promise<string | null> => {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { chapter: { select: { storyId: true } } },
  });
  return scene?.chapter.storyId ?? null;
};
