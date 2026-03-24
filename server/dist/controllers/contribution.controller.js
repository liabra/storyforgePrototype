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
exports.moderate = exports.update = exports.remove = exports.create = exports.getByScene = void 0;
const contributionService = __importStar(require("../services/contribution.service"));
const participantService = __importStar(require("../services/participant.service"));
const activityService = __importStar(require("../services/activity.service"));
const socket_1 = require("../socket");
const client_1 = __importDefault(require("../prisma/client"));
const client_2 = require("../generated/prisma/client");
const getSingleParam = (value) => {
    if (!value)
        throw new Error("Missing route parameter");
    return Array.isArray(value) ? value[0] : value;
};
const getByScene = async (req, res) => {
    const sceneId = getSingleParam(req.params.sceneId);
    const contributions = await contributionService.getContributionsByScene(sceneId);
    return res.json(contributions);
};
exports.getByScene = getByScene;
const create = async (req, res) => {
    const sceneId = getSingleParam(req.params.sceneId);
    const { content, characterId } = req.body;
    if (!content?.trim())
        return res.status(400).json({ error: "content is required" });
    const scene = await client_1.default.scene.findUnique({
        where: { id: sceneId },
        select: {
            title: true,
            status: true,
            mode: true,
            currentTurnUserId: true,
            chapter: { select: { storyId: true, story: { select: { title: true, status: true } } } },
        },
    });
    if (!scene)
        return res.status(404).json({ error: "Scene not found" });
    if (scene.status !== client_2.SceneStatus.ACTIVE) {
        return res.status(403).json({
            error: "Cette scène n'accepte pas de contributions",
            status: scene.status,
        });
    }
    const storyId = scene.chapter.storyId;
    if (scene.chapter.story.status === client_2.ContentStatus.DONE) {
        return res.status(403).json({ error: "Cette histoire est terminée et n'accepte plus de contributions" });
    }
    if (req.user) {
        const role = await participantService.getUserRole(storyId, req.user.id);
        if (role !== client_2.ParticipantRole.OWNER && role !== client_2.ParticipantRole.EDITOR) {
            return res.status(403).json({ error: "Vous devez être OWNER ou EDITOR pour contribuer à cette histoire" });
        }
        // En mode TURN, vérifier que c'est bien le tour de cet utilisateur
        if (scene.mode === client_2.SceneMode.TURN && scene.currentTurnUserId !== req.user.id) {
            return res.status(403).json({ error: "Ce n'est pas votre tour d'écrire" });
        }
    }
    const contribution = await contributionService.createContribution(sceneId, {
        content: content.trim(),
        characterId: characterId || undefined,
        userId: req.user?.id,
    });
    const io = (0, socket_1.getIO)();
    io?.to(`scene:${sceneId}`).emit("contribution:new", contribution);
    const username = req.user?.email?.split("@")[0] || "Anonyme";
    void activityService.broadcastActivityToStory(storyId, {
        type: "contribution",
        storyId,
        storyTitle: scene.chapter.story.title,
        sceneId,
        sceneTitle: scene.title,
        username,
        userId: req.user?.id,
        at: contribution.createdAt.toISOString(),
    });
    // En mode TURN : passer au participant suivant
    if (scene.mode === client_2.SceneMode.TURN && req.user) {
        const eligible = await client_1.default.storyParticipant.findMany({
            where: { storyId, role: { in: [client_2.ParticipantRole.OWNER, client_2.ParticipantRole.EDITOR] } },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
        });
        if (eligible.length > 0) {
            const currentIdx = eligible.findIndex((p) => p.userId === scene.currentTurnUserId);
            const nextIdx = (currentIdx + 1) % eligible.length;
            const nextUserId = eligible[nextIdx].userId;
            await client_1.default.scene.update({
                where: { id: sceneId },
                data: { currentTurnUserId: nextUserId },
            });
            io?.to(`story:${storyId}`).emit("turn:update", {
                sceneId,
                mode: client_2.SceneMode.TURN,
                currentTurnUserId: nextUserId,
            });
        }
    }
    return res.status(201).json(contribution);
};
exports.create = create;
const remove = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const contrib = await client_1.default.contribution.findUnique({
        where: { id },
        select: {
            sceneId: true,
            userId: true,
            scene: { select: { chapter: { select: { storyId: true } } } },
        },
    });
    if (!contrib)
        return res.status(404).json({ error: "Contribution introuvable" });
    // Seul l'auteur ou le OWNER peut supprimer
    const storyId = contrib.scene.chapter.storyId;
    const isAuthor = req.user?.id === contrib.userId;
    if (!isAuthor) {
        const role = await participantService.getUserRole(storyId, req.user.id);
        if (role !== client_2.ParticipantRole.OWNER) {
            return res.status(403).json({ error: "Seul l'auteur ou le propriétaire peut supprimer cette contribution" });
        }
    }
    await contributionService.deleteContribution(id);
    const io = (0, socket_1.getIO)();
    io?.to(`scene:${contrib.sceneId}`).emit("contribution:delete", { id });
    return res.status(204).send();
};
exports.remove = remove;
const update = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const { content } = req.body;
    if (!content?.trim())
        return res.status(400).json({ error: "content is required" });
    const existing = await client_1.default.contribution.findUnique({
        where: { id },
        select: { userId: true, sceneId: true },
    });
    if (!existing)
        return res.status(404).json({ error: "Contribution not found" });
    if (existing.userId !== req.user?.id) {
        return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres contributions" });
    }
    const contribution = await contributionService.updateContribution(id, content.trim());
    const io = (0, socket_1.getIO)();
    io?.to(`scene:${existing.sceneId}`).emit("contribution:update", contribution);
    return res.json(contribution);
};
exports.update = update;
const moderate = async (req, res) => {
    const id = getSingleParam(req.params.id);
    const { action } = req.body;
    if (action === "flag")
        return res.json(await contributionService.flagContribution(id));
    if (action === "block")
        return res.json(await contributionService.blockContribution(id));
    return res.status(400).json({ error: "action must be 'flag' or 'block'" });
};
exports.moderate = moderate;
