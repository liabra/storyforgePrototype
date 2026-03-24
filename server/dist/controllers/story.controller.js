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
exports.remove = exports.update = exports.create = exports.getById = exports.getAll = exports.getPublic = void 0;
const storyService = __importStar(require("../services/story.service"));
const participantService = __importStar(require("../services/participant.service"));
const client_1 = require("../generated/prisma/client");
const socket_1 = require("../socket");
const getSingleParam = (value) => {
    if (!value)
        throw new Error("Missing route parameter");
    return Array.isArray(value) ? value[0] : value;
};
const getPublic = async (_req, res) => {
    const stories = await storyService.getPublicStories();
    return res.json(stories);
};
exports.getPublic = getPublic;
const getAll = async (req, res) => {
    if (req.user) {
        const stories = await storyService.getUserStories(req.user.id);
        return res.json(stories);
    }
    const stories = await storyService.getAllStories();
    return res.json(stories);
};
exports.getAll = getAll;
const getById = async (req, res) => {
    const storyId = getSingleParam(req.params.id);
    const story = await storyService.getStoryById(storyId);
    if (!story)
        return res.status(404).json({ error: "Story not found" });
    if (story.visibility === client_1.StoryVisibility.PRIVATE) {
        if (!req.user)
            return res.status(403).json({ error: "Cette histoire est privée" });
        const role = await participantService.getUserRole(storyId, req.user.id);
        if (!role)
            return res.status(403).json({ error: "Cette histoire est privée" });
    }
    return res.json(story);
};
exports.getById = getById;
const create = async (req, res) => {
    const { title, description } = req.body;
    if (!title)
        return res.status(400).json({ error: "title is required" });
    if (!req.user)
        return res.status(401).json({ error: "Authentification requise" });
    const story = await storyService.createStory({ title, description }, req.user.id);
    return res.status(201).json(story);
};
exports.create = create;
const update = async (req, res) => {
    const storyId = getSingleParam(req.params.id);
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        return res.status(403).json({ error: "Seul le propriétaire peut modifier cette histoire" });
    }
    if (req.body.status && !Object.values(client_1.ContentStatus).includes(req.body.status)) {
        return res.status(400).json({ error: "Statut invalide. Utilisez ACTIVE ou DONE." });
    }
    if (req.body.visibility && !Object.values(client_1.StoryVisibility).includes(req.body.visibility)) {
        return res.status(400).json({ error: "Visibilité invalide. Utilisez PRIVATE ou PUBLIC." });
    }
    const story = await storyService.updateStory(storyId, req.body);
    const io = (0, socket_1.getIO)();
    if (req.body.status !== undefined) {
        io?.to(`story:${storyId}`).emit("story:statusUpdate", {
            storyId,
            status: story.status,
        });
    }
    if (req.body.visibility !== undefined) {
        io?.to(`story:${storyId}`).emit("story:visibilityUpdate", {
            storyId,
            visibility: story.visibility,
        });
    }
    return res.json(story);
};
exports.update = update;
const remove = async (req, res) => {
    const storyId = getSingleParam(req.params.id);
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        return res.status(403).json({ error: "Seul le propriétaire peut supprimer cette histoire" });
    }
    await storyService.deleteStory(storyId);
    return res.status(204).send();
};
exports.remove = remove;
