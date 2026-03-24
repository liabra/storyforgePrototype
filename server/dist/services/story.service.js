"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkStoryReadAccess = exports.getStoryStatus = exports.deleteStory = exports.getPublicStories = exports.updateStory = exports.createStory = exports.getStoryById = exports.getAllStories = exports.getUserStories = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const client_2 = require("../generated/prisma/client");
const getUserStories = (userId) => client_1.default.story.findMany({
    where: { participants: { some: { userId } } },
    orderBy: { createdAt: "desc" },
});
exports.getUserStories = getUserStories;
const getAllStories = () => client_1.default.story.findMany({ orderBy: { createdAt: "desc" } });
exports.getAllStories = getAllStories;
const getStoryById = (id) => client_1.default.story.findUnique({
    where: { id },
    include: { characters: true, chapters: { orderBy: { order: "asc" } } },
});
exports.getStoryById = getStoryById;
const createStory = async (data, ownerId) => {
    const story = await client_1.default.story.create({ data });
    await client_1.default.storyParticipant.create({
        data: { storyId: story.id, userId: ownerId, role: client_2.ParticipantRole.OWNER },
    });
    return story;
};
exports.createStory = createStory;
const updateStory = (id, data) => client_1.default.story.update({ where: { id }, data });
exports.updateStory = updateStory;
const getPublicStories = () => client_1.default.story.findMany({
    where: { visibility: client_2.StoryVisibility.PUBLIC },
    orderBy: { updatedAt: "desc" },
    select: {
        id: true,
        title: true,
        description: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { chapters: true } },
    },
});
exports.getPublicStories = getPublicStories;
const deleteStory = (id) => client_1.default.story.delete({ where: { id } });
exports.deleteStory = deleteStory;
const getStoryStatus = async (storyId) => {
    const story = await client_1.default.story.findUnique({ where: { id: storyId }, select: { status: true } });
    return story?.status ?? null;
};
exports.getStoryStatus = getStoryStatus;
/**
 * Vérifie qu'un utilisateur peut lire une histoire.
 * - PUBLIC → toujours autorisé
 * - PRIVATE → requiert un userId valide et une participation active
 */
const checkStoryReadAccess = async (storyId, userId) => {
    const story = await client_1.default.story.findUnique({
        where: { id: storyId },
        select: { visibility: true },
    });
    if (!story)
        return "not_found";
    if (story.visibility === client_2.StoryVisibility.PRIVATE) {
        if (!userId)
            return "forbidden";
        const participant = await client_1.default.storyParticipant.findUnique({
            where: { storyId_userId: { storyId, userId } },
            select: { id: true },
        });
        if (!participant)
            return "forbidden";
    }
    return "ok";
};
exports.checkStoryReadAccess = checkStoryReadAccess;
