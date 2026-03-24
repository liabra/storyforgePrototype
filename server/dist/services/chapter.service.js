"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoryInfoByChapter = exports.getStoryIdByChapter = exports.deleteChapter = exports.updateChapter = exports.createChapter = exports.getChaptersByStory = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const getChaptersByStory = (storyId) => client_1.default.chapter.findMany({
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
exports.getChaptersByStory = getChaptersByStory;
const createChapter = (storyId, data) => client_1.default.chapter.create({
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
exports.createChapter = createChapter;
const updateChapter = (id, data) => client_1.default.chapter.update({ where: { id }, data });
exports.updateChapter = updateChapter;
const deleteChapter = (id) => client_1.default.chapter.delete({ where: { id } });
exports.deleteChapter = deleteChapter;
const getStoryIdByChapter = async (chapterId) => {
    const chapter = await client_1.default.chapter.findUnique({
        where: { id: chapterId },
        select: { storyId: true },
    });
    return chapter?.storyId ?? null;
};
exports.getStoryIdByChapter = getStoryIdByChapter;
const getStoryInfoByChapter = async (chapterId) => {
    const chapter = await client_1.default.chapter.findUnique({
        where: { id: chapterId },
        select: { story: { select: { id: true, title: true } } },
    });
    return chapter?.story ?? null;
};
exports.getStoryInfoByChapter = getStoryInfoByChapter;
