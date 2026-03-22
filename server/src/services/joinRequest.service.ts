import prisma from "../prisma/client";
import { JoinRequestStatus, ParticipantRole } from "../generated/prisma/client";

const joinRequestInclude = {
  user: { select: { id: true, email: true, displayName: true, color: true } },
  story: { select: { id: true, title: true } },
} as const;

/** Crée une demande de participation (uniquement pour les VIEWERs) */
export const createRequest = (storyId: string, userId: string) =>
  prisma.joinRequest.create({
    data: { storyId, userId, status: JoinRequestStatus.PENDING },
    include: joinRequestInclude,
  });

/** Liste les demandes PENDING d'une histoire (pour le propriétaire) */
export const getPendingRequests = (storyId: string) =>
  prisma.joinRequest.findMany({
    where: { storyId, status: JoinRequestStatus.PENDING },
    include: joinRequestInclude,
    orderBy: { createdAt: "asc" },
  });

/** Récupère la demande en cours d'un utilisateur pour une histoire */
export const getMyRequest = (storyId: string, userId: string) =>
  prisma.joinRequest.findUnique({
    where: { storyId_userId: { storyId, userId } },
    include: joinRequestInclude,
  });

/** Récupère une demande par son id */
export const getRequestById = (requestId: string) =>
  prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: joinRequestInclude,
  });

/**
 * Accepte une demande : met à jour le rôle du participant à EDITOR,
 * puis marque la demande comme ACCEPTED.
 */
export const acceptRequest = async (requestId: string) => {
  const request = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    select: { storyId: true, userId: true },
  });
  if (!request) throw new Error("Demande introuvable");

  // Met à jour le rôle du participant en EDITOR
  await prisma.storyParticipant.update({
    where: { storyId_userId: { storyId: request.storyId, userId: request.userId } },
    data: { role: ParticipantRole.EDITOR },
  });

  // Marque la demande comme acceptée
  return prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: JoinRequestStatus.ACCEPTED },
    include: joinRequestInclude,
  });
};

/** Refuse une demande */
export const declineRequest = (requestId: string) =>
  prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: JoinRequestStatus.DECLINED },
    include: joinRequestInclude,
  });

/** Retourne l'userId du propriétaire d'une histoire */
export const getStoryOwnerUserId = async (storyId: string): Promise<string | null> => {
  const owner = await prisma.storyParticipant.findFirst({
    where: { storyId, role: ParticipantRole.OWNER },
    select: { userId: true },
  });
  return owner?.userId ?? null;
};
