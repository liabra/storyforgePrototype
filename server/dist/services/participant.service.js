"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoryIdByScene = exports.getStoryParticipantUserIds = exports.getUserRole = exports.removeParticipant = exports.updateRole = exports.addParticipant = exports.getParticipants = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const participantInclude = {
    user: { select: { id: true, email: true, displayName: true, color: true } },
};
const getParticipants = (storyId) => client_1.default.storyParticipant.findMany({
    where: { storyId },
    include: participantInclude,
    orderBy: { createdAt: "asc" },
});
exports.getParticipants = getParticipants;
const addParticipant = (storyId, userId, role) => client_1.default.storyParticipant.create({
    data: { storyId, userId, role },
    include: participantInclude,
});
exports.addParticipant = addParticipant;
const updateRole = (storyId, userId, role) => client_1.default.storyParticipant.update({
    where: { storyId_userId: { storyId, userId } },
    data: { role },
    include: participantInclude,
});
exports.updateRole = updateRole;
const removeParticipant = (storyId, userId) => client_1.default.storyParticipant.delete({
    where: { storyId_userId: { storyId, userId } },
});
exports.removeParticipant = removeParticipant;
const getUserRole = async (storyId, userId) => {
    const p = await client_1.default.storyParticipant.findUnique({
        where: { storyId_userId: { storyId, userId } },
        select: { role: true },
    });
    return p?.role ?? null;
};
exports.getUserRole = getUserRole;
const getStoryParticipantUserIds = (storyId) => client_1.default.storyParticipant
    .findMany({ where: { storyId }, select: { userId: true } })
    .then((rows) => rows.map((r) => r.userId));
exports.getStoryParticipantUserIds = getStoryParticipantUserIds;
const getStoryIdByScene = async (sceneId) => {
    const scene = await client_1.default.scene.findUnique({
        where: { id: sceneId },
        select: { chapter: { select: { storyId: true } } },
    });
    return scene?.chapter.storyId ?? null;
};
exports.getStoryIdByScene = getStoryIdByScene;
