"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoryStatus = exports.deleteStory = exports.updateStory = exports.createStory = exports.getStoryById = exports.getAllStories = exports.getUserStories = void 0;
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
const deleteStory = (id) => client_1.default.story.delete({ where: { id } });
exports.deleteStory = deleteStory;
const getStoryStatus = async (storyId) => {
    const story = await client_1.default.story.findUnique({ where: { id: storyId }, select: { status: true } });
    return story?.status ?? null;
};
exports.getStoryStatus = getStoryStatus;
