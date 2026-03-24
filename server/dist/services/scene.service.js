"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestSceneIdea = exports.generateSceneImage = exports.updateSceneCharacters = exports.deleteScene = exports.updateScene = exports.createScene = exports.getSceneWithContributions = exports.getScenesByChapter = void 0;
const openai_1 = __importDefault(require("openai"));
const client_1 = __importDefault(require("../prisma/client"));
const image_service_1 = require("./image.service");
const characterSelect = {
    select: { id: true, name: true, nickname: true },
};
const charFullSelect = {
    select: { id: true, name: true, nickname: true, avatarUrl: true },
};
const getScenesByChapter = (chapterId) => client_1.default.scene.findMany({
    where: { chapterId },
    orderBy: { order: "asc" },
    include: {
        characters: characterSelect,
        _count: { select: { contributions: true } },
    },
});
exports.getScenesByChapter = getScenesByChapter;
const getSceneWithContributions = (sceneId) => client_1.default.scene.findUniqueOrThrow({
    where: { id: sceneId },
    include: {
        characters: characterSelect,
        contributions: {
            where: { modStatus: { not: "BLOCKED" } },
            orderBy: { createdAt: "asc" },
            include: {
                character: charFullSelect,
                user: { select: { id: true, email: true, displayName: true, color: true } },
            },
        },
    },
});
exports.getSceneWithContributions = getSceneWithContributions;
const createScene = async (chapterId, data) => {
    const scene = await client_1.default.scene.create({
        data: { ...data, chapterId },
        include: {
            characters: characterSelect,
            _count: { select: { contributions: true } },
        },
    });
    return scene;
};
exports.createScene = createScene;
const updateScene = (id, data) => client_1.default.scene.update({
    where: { id },
    data,
    include: {
        characters: characterSelect,
        _count: { select: { contributions: true } },
    },
});
exports.updateScene = updateScene;
const deleteScene = (id) => client_1.default.scene.delete({ where: { id } });
exports.deleteScene = deleteScene;
const updateSceneCharacters = (id, characterIds) => client_1.default.scene.update({
    where: { id },
    data: { characters: { set: characterIds.map((cid) => ({ id: cid })) } },
    include: {
        characters: characterSelect,
        _count: { select: { contributions: true } },
    },
});
exports.updateSceneCharacters = updateSceneCharacters;
const generateSceneImage = async (id) => {
    const scene = await client_1.default.scene.findUniqueOrThrow({
        where: { id },
        include: {
            chapter: { include: { story: true } },
            characters: true,
        },
    });
    const characterNames = scene.characters
        .map((c) => c.name || c.nickname)
        .filter((n) => !!n);
    const imageUrl = await (0, image_service_1.generateImage)({
        sceneTitle: scene.title,
        storyTitle: scene.chapter.story.title,
        content: scene.description,
        characterNames,
    });
    return client_1.default.scene.update({
        where: { id },
        data: { imageUrl },
        include: {
            characters: characterSelect,
            _count: { select: { contributions: true } },
        },
    });
};
exports.generateSceneImage = generateSceneImage;
const suggestSceneIdea = async (storyId, sceneTitle) => {
    const story = await client_1.default.story.findUniqueOrThrow({
        where: { id: storyId },
        include: {
            characters: true,
            chapters: {
                orderBy: { order: "asc" },
                include: { scenes: { orderBy: { order: "asc" } } },
            },
        },
    });
    const charactersList = story.characters
        .map((c) => c.name || c.nickname)
        .filter(Boolean)
        .join(", ");
    const allScenes = story.chapters.flatMap((ch) => ch.scenes);
    const scenesList = allScenes.map((s) => `"${s.title}"`).join(", ");
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: "Tu es un assistant créatif pour les auteurs. Tu proposes des idées courtes et inspirantes, sans jamais écrire à leur place. Réponds en une seule phrase courte (max 2 lignes).",
            },
            {
                role: "user",
                content: [
                    `Histoire : "${story.title}"`,
                    story.description ? `Description : ${story.description}` : "",
                    charactersList ? `Personnages : ${charactersList}` : "",
                    scenesList ? `Scènes existantes : ${scenesList}` : "",
                    sceneTitle ? `Scène en cours : "${sceneTitle}"` : "",
                    "\nSuggère une idée courte pour inspirer l'auteur.",
                ]
                    .filter(Boolean)
                    .join("\n"),
            },
        ],
    });
    return completion.choices[0].message.content ?? "Aucune idée générée.";
};
exports.suggestSceneIdea = suggestSceneIdea;
