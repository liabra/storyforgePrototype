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
Object.defineProperty(exports, "__esModule", { value: true });
exports.remove = exports.update = exports.create = exports.getByStory = void 0;
const chapterService = __importStar(require("../services/chapter.service"));
const participantService = __importStar(require("../services/participant.service"));
const storyService = __importStar(require("../services/story.service"));
const client_1 = require("../generated/prisma/client");
const socket_1 = require("../socket");
const getSingleParam = (value) => {
    if (!value)
        throw new Error("Missing route parameter");
    return Array.isArray(value) ? value[0] : value;
};
const getByStory = async (req, res) => {
    const storyId = getSingleParam(req.params.storyId);
    const chapters = await chapterService.getChaptersByStory(storyId);
    return res.json(chapters);
};
exports.getByStory = getByStory;
const create = async (req, res) => {
    const storyId = getSingleParam(req.params.storyId);
    const { title, description, order } = req.body;
    if (!title)
        return res.status(400).json({ error: "title is required" });
    const storyStatus = await storyService.getStoryStatus(storyId);
    if (storyStatus === null)
        return res.status(404).json({ error: "Histoire introuvable" });
    if (storyStatus === client_1.ContentStatus.DONE) {
        return res.status(409).json({ error: "Impossible de créer un chapitre dans une histoire terminée" });
    }
    if (req.user) {
        const role = await participantService.getUserRole(storyId, req.user.id);
        if (role !== client_1.ParticipantRole.OWNER && role !== client_1.ParticipantRole.EDITOR) {
            return res.status(403).json({ error: "Vous devez être OWNER ou EDITOR pour créer un chapitre" });
        }
    }
    const chapter = await chapterService.createChapter(storyId, { title, description, order });
    (0, socket_1.getIO)()?.to(`story:${storyId}`).emit("chapter:new", chapter);
    return res.status(201).json(chapter);
};
exports.create = create;
const update = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const storyId = await chapterService.getStoryIdByChapter(id);
    if (!storyId)
        return res.status(404).json({ error: "Chapitre introuvable" });
    const role = await participantService.getUserRole(storyId, req.user.id);
    // Le changement de statut est réservé au OWNER
    if (req.body.status !== undefined && role !== client_1.ParticipantRole.OWNER) {
        return res.status(403).json({ error: "Seul le propriétaire peut modifier le statut d'un chapitre" });
    }
    if (role !== client_1.ParticipantRole.OWNER && role !== client_1.ParticipantRole.EDITOR) {
        return res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour modifier un chapitre" });
    }
    if (req.body.status && !Object.values(client_1.ContentStatus).includes(req.body.status)) {
        return res.status(400).json({ error: "Statut invalide. Utilisez ACTIVE ou DONE." });
    }
    const chapter = await chapterService.updateChapter(id, req.body);
    if (req.body.status !== undefined) {
        (0, socket_1.getIO)()?.to(`story:${storyId}`).emit("chapter:statusUpdate", {
            chapterId: id,
            status: chapter.status,
        });
    }
    return res.json(chapter);
};
exports.update = update;
const remove = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const storyId = await chapterService.getStoryIdByChapter(id);
    if (!storyId)
        return res.status(404).json({ error: "Chapitre introuvable" });
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        return res.status(403).json({ error: "Seul le propriétaire peut supprimer un chapitre" });
    }
    await chapterService.deleteChapter(id);
    (0, socket_1.getIO)()?.to(`story:${storyId}`).emit("chapter:delete", { chapterId: id, storyId });
    return res.status(204).send();
};
exports.remove = remove;
