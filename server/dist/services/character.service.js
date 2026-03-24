"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCharacterMeta = exports.getStoryIdByCharacter = exports.deleteCharacter = exports.updateCharacter = exports.createCharacter = exports.getCharactersByStory = void 0;
const client_1 = __importDefault(require("../prisma/client"));
/** Include commun : scènes + auteur. */
const characterInclude = {
    scenes: {
        select: { id: true, title: true, order: true, status: true },
        orderBy: { order: "asc" },
    },
    user: {
        select: { id: true, displayName: true, email: true },
    },
};
const getCharactersByStory = (storyId) => client_1.default.character.findMany({
    where: { storyId },
    orderBy: { createdAt: "asc" },
    include: characterInclude,
});
exports.getCharactersByStory = getCharactersByStory;
const createCharacter = (storyId, userId, data) => client_1.default.character.create({
    data: { ...data, storyId, userId },
    include: characterInclude,
});
exports.createCharacter = createCharacter;
const updateCharacter = (id, data) => {
    // Destructurer explicitement pour éviter que des champs parasites (user, scenes, id…)
    // issus du body HTTP ne soient transmis à Prisma et provoquent une erreur.
    const { name, nickname, role, shortDescription, appearance, outfit, accessories, personality, traits, faction, visualNotes, } = data;
    return client_1.default.character.update({
        where: { id },
        data: { name, nickname, role, shortDescription, appearance, outfit, accessories, personality, traits, faction, visualNotes },
        include: characterInclude,
    });
};
exports.updateCharacter = updateCharacter;
const deleteCharacter = (id) => client_1.default.character.delete({ where: { id } });
exports.deleteCharacter = deleteCharacter;
const getStoryIdByCharacter = async (characterId) => {
    const char = await client_1.default.character.findUnique({
        where: { id: characterId },
        select: { storyId: true },
    });
    return char?.storyId ?? null;
};
exports.getStoryIdByCharacter = getStoryIdByCharacter;
const getCharacterMeta = async (characterId) => {
    const char = await client_1.default.character.findUnique({
        where: { id: characterId },
        select: { storyId: true, userId: true },
    });
    return char ?? null;
};
exports.getCharacterMeta = getCharacterMeta;
