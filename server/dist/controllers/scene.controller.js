"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestIdea = exports.updateCharacters = exports.generateImage = exports.remove = exports.update = exports.create = exports.getOne = exports.getByChapter = void 0;
const sceneService = __importStar(require("../services/scene.service"));
const chapterService = __importStar(require("../services/chapter.service"));
const participantService = __importStar(require("../services/participant.service"));
const activityService = __importStar(require("../services/activity.service"));
const socket_1 = require("../socket");
const client_1 = require("../generated/prisma/client");
const client_2 = __importDefault(require("../prisma/client"));
const getSingleParam = (value) => {
    if (!value)
        throw new Error("Missing route parameter");
    return Array.isArray(value) ? value[0] : value;
};
/** Vérifie que l'utilisateur a au moins le rôle EDITOR sur cette histoire. */
async function assertEditorOrOwner(storyId, req, res) {
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER && role !== client_1.ParticipantRole.EDITOR) {
        res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour cette action" });
        return false;
    }
    return true;
}
/** Vérifie que l'utilisateur est OWNER sur cette histoire. */
async function assertOwner(storyId, req, res) {
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        res.status(403).json({ error: "Seul le propriétaire peut effectuer cette action" });
        return false;
    }
    return true;
}
const getByChapter = async (req, res) => {
    const chapterId = getSingleParam(req.params.chapterId);
    const scenes = await sceneService.getScenesByChapter(chapterId);
    return res.json(scenes);
};
exports.getByChapter = getByChapter;
const getOne = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const scene = await sceneService.getSceneWithContributions(id);
    return res.json(scene);
};
exports.getOne = getOne;
const create = async (req, res) => {
    const chapterId = getSingleParam(req.params.chapterId);
    const { title, description, order } = req.body;
    if (!title)
        return res.status(400).json({ error: "title is required" });
    const chapterInfo = await client_2.default.chapter.findUnique({
        where: { id: chapterId },
        select: { storyId: true, status: true, story: { select: { status: true } } },
    });
    if (!chapterInfo)
        return res.status(404).json({ error: "Chapitre introuvable" });
    const storyId = chapterInfo.storyId;
    if (chapterInfo.story.status === client_1.ContentStatus.DONE) {
        return res.status(409).json({ error: "Impossible de créer une scène dans une histoire terminée" });
    }
    if (chapterInfo.status === client_1.ContentStatus.DONE) {
        return res.status(409).json({ error: "Impossible de créer une scène dans un chapitre terminé" });
    }
    if (!await assertEditorOrOwner(storyId, req, res))
        return;
    const scene = await sceneService.createScene(chapterId, { title, description, order });
    const storyInfo = await chapterService.getStoryInfoByChapter(chapterId);
    if (storyInfo) {
        const io = (0, socket_1.getIO)();
        io?.to(`story:${storyInfo.id}`).emit("scene:new", { chapterId, scene });
        // Diffuse le feed d'activité aux participants de l'histoire uniquement
        const username = req.user?.email?.split("@")[0] || "Anonyme";
        void activityService.broadcastActivityToStory(storyInfo.id, {
            type: "scene",
            storyId: storyInfo.id,
            storyTitle: storyInfo.title,
            sceneId: scene.id,
            sceneTitle: scene.title,
            username,
            userId: req.user?.id,
            at: scene.createdAt.toISOString(),
        });
    }
    return res.status(201).json(scene);
};
exports.create = create;
const update = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const storyId = await participantService.getStoryIdByScene(id);
    if (!storyId)
        return res.status(404).json({ error: "Scène introuvable" });
    if (!await assertOwner(storyId, req, res))
        return;
    // Gestion du changement de mode (FREE ↔ TURN)
    const updateData = { ...req.body };
    if (updateData.mode === client_1.SceneMode.TURN) {
        // Initialiser le tour sur le premier OWNER+EDITOR (par date d'entrée)
        const eligible = await client_2.default.storyParticipant.findMany({
            where: { storyId, role: { in: [client_1.ParticipantRole.OWNER, client_1.ParticipantRole.EDITOR] } },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
        });
        updateData.currentTurnUserId = eligible[0]?.userId ?? null;
    }
    else if (updateData.mode === client_1.SceneMode.FREE) {
        updateData.currentTurnUserId = null;
    }
    const scene = await sceneService.updateScene(id, updateData);
    const io = (0, socket_1.getIO)();
    // Émettre turn:update si le mode ou le tour a changé
    if (updateData.mode !== undefined) {
        io?.to(`story:${storyId}`).emit("turn:update", {
            sceneId: id,
            mode: scene.mode,
            currentTurnUserId: scene.currentTurnUserId,
        });
    }
    // Émettre scene:statusUpdate si le statut a changé
    if (updateData.status !== undefined) {
        io?.to(`story:${storyId}`).emit("scene:statusUpdate", {
            sceneId: id,
            chapterId: scene.chapterId,
            status: scene.status,
        });
    }
    return res.json(scene);
};
exports.update = update;
const remove = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const scene = await client_2.default.scene.findUnique({
        where: { id },
        select: { chapterId: true, chapter: { select: { storyId: true } } },
    });
    if (!scene)
        return res.status(404).json({ error: "Scène introuvable" });
    const storyId = scene.chapter.storyId;
    if (!await assertOwner(storyId, req, res))
        return;
    await sceneService.deleteScene(id);
    const io = (0, socket_1.getIO)();
    io?.to(`story:${storyId}`).emit("scene:delete", { sceneId: id, chapterId: scene.chapterId });
    return res.status(204).send();
};
exports.remove = remove;
const generateImage = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const storyId = await participantService.getStoryIdByScene(id);
    if (!storyId)
        return res.status(404).json({ error: "Scène introuvable" });
    if (!await assertEditorOrOwner(storyId, req, res))
        return;
    const scene = await sceneService.generateSceneImage(id);
    return res.json(scene);
};
exports.generateImage = generateImage;
const updateCharacters = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const { characterIds } = req.body;
    if (!Array.isArray(characterIds)) {
        return res.status(400).json({ error: "characterIds must be an array" });
    }
    const storyId = await participantService.getStoryIdByScene(id);
    if (!storyId)
        return res.status(404).json({ error: "Scène introuvable" });
    if (!await assertEditorOrOwner(storyId, req, res))
        return;
    const scene = await sceneService.updateSceneCharacters(id, characterIds);
    // Diffuse à tous les participants de l'histoire (vue scène + vue chapitre)
    const io = (0, socket_1.getIO)();
    if (io) {
        io.to(`story:${storyId}`).emit("scene:characters:update", {
            sceneId: id,
            characters: scene.characters,
        });
    }
    return res.json(scene);
};
exports.updateCharacters = updateCharacters;
const suggestIdea = async (req, res) => {
    const { storyId, sceneTitle } = req.body;
    if (!storyId)
        return res.status(400).json({ error: "storyId is required" });
    if (!await assertEditorOrOwner(storyId, req, res))
        return;
    const idea = await sceneService.suggestSceneIdea(storyId, sceneTitle);
    return res.json({ idea });
};
exports.suggestIdea = suggestIdea;
