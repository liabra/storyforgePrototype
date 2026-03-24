"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoryOwnerUserId = exports.declineRequest = exports.acceptRequest = exports.getRequestById = exports.getMyRequest = exports.getPendingRequests = exports.createRequest = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const client_2 = require("../generated/prisma/client");
const joinRequestInclude = {
    user: { select: { id: true, email: true, displayName: true, color: true } },
    story: { select: { id: true, title: true } },
};
/** Crée une demande de participation (uniquement pour les VIEWERs) */
const createRequest = (storyId, userId) => client_1.default.joinRequest.create({
    data: { storyId, userId, status: client_2.JoinRequestStatus.PENDING },
    include: joinRequestInclude,
});
exports.createRequest = createRequest;
/** Liste les demandes PENDING d'une histoire (pour le propriétaire) */
const getPendingRequests = (storyId) => client_1.default.joinRequest.findMany({
    where: { storyId, status: client_2.JoinRequestStatus.PENDING },
    include: joinRequestInclude,
    orderBy: { createdAt: "asc" },
});
exports.getPendingRequests = getPendingRequests;
/** Récupère la demande en cours d'un utilisateur pour une histoire */
const getMyRequest = (storyId, userId) => client_1.default.joinRequest.findUnique({
    where: { storyId_userId: { storyId, userId } },
    include: joinRequestInclude,
});
exports.getMyRequest = getMyRequest;
/** Récupère une demande par son id */
const getRequestById = (requestId) => client_1.default.joinRequest.findUnique({
    where: { id: requestId },
    include: joinRequestInclude,
});
exports.getRequestById = getRequestById;
/**
 * Accepte une demande : met à jour le rôle du participant à EDITOR,
 * puis marque la demande comme ACCEPTED.
 */
const acceptRequest = async (requestId) => {
    const request = await client_1.default.joinRequest.findUnique({
        where: { id: requestId },
        select: { storyId: true, userId: true },
    });
    if (!request)
        throw new Error("Demande introuvable");
    // Met à jour le rôle du participant en EDITOR
    await client_1.default.storyParticipant.update({
        where: { storyId_userId: { storyId: request.storyId, userId: request.userId } },
        data: { role: client_2.ParticipantRole.EDITOR },
    });
    // Marque la demande comme acceptée
    return client_1.default.joinRequest.update({
        where: { id: requestId },
        data: { status: client_2.JoinRequestStatus.ACCEPTED },
        include: joinRequestInclude,
    });
};
exports.acceptRequest = acceptRequest;
/** Refuse une demande */
const declineRequest = (requestId) => client_1.default.joinRequest.update({
    where: { id: requestId },
    data: { status: client_2.JoinRequestStatus.DECLINED },
    include: joinRequestInclude,
});
exports.declineRequest = declineRequest;
/** Retourne l'userId du propriétaire d'une histoire */
const getStoryOwnerUserId = async (storyId) => {
    const owner = await client_1.default.storyParticipant.findFirst({
        where: { storyId, role: client_2.ParticipantRole.OWNER },
        select: { userId: true },
    });
    return owner?.userId ?? null;
};
exports.getStoryOwnerUserId = getStoryOwnerUserId;
