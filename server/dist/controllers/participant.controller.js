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
exports.remove = exports.updateRole = exports.add = exports.list = void 0;
const participantService = __importStar(require("../services/participant.service"));
const client_1 = __importDefault(require("../prisma/client"));
const client_2 = require("../generated/prisma/client");
const socket_1 = require("../socket");
const ASSIGNABLE_ROLES = [client_2.ParticipantRole.EDITOR, client_2.ParticipantRole.VIEWER];
const p = (v) => (Array.isArray(v) ? v[0] : v);
const list = async (req, res) => {
    try {
        const participants = await participantService.getParticipants(p(req.params.storyId));
        res.json(participants);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.list = list;
const add = async (req, res) => {
    const storyId = p(req.params.storyId);
    const { email, role = "VIEWER" } = req.body;
    if (!email) {
        res.status(400).json({ error: "email est requis" });
        return;
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
        res.status(400).json({ error: "Rôle invalide. Utilisez EDITOR ou VIEWER." });
        return;
    }
    const requesterRole = await participantService.getUserRole(storyId, req.user.id);
    if (requesterRole !== client_2.ParticipantRole.OWNER) {
        res.status(403).json({ error: "Seul le propriétaire peut gérer les participants" });
        return;
    }
    const targetUser = await client_1.default.user.findUnique({ where: { email }, select: { id: true } });
    if (!targetUser) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
    }
    try {
        const participant = await participantService.addParticipant(storyId, targetUser.id, role);
        // Notifier l'utilisateur invité via socket
        const story = await client_1.default.story.findUnique({ where: { id: storyId }, select: { title: true } });
        const io = (0, socket_1.getIO)();
        if (io && story) {
            io.to(`user:${targetUser.id}`).emit("invitation:received", {
                storyId,
                storyTitle: story.title,
                role: participant.role,
            });
        }
        res.status(201).json(participant);
    }
    catch (err) {
        const e = err;
        if (e.code === "P2002") {
            res.status(409).json({ error: "Cet utilisateur participe déjà à cette histoire" });
            return;
        }
        res.status(500).json({ error: err.message });
    }
};
exports.add = add;
const updateRole = async (req, res) => {
    const storyId = p(req.params.storyId);
    const userId = p(req.params.userId);
    const { role } = req.body;
    if (!ASSIGNABLE_ROLES.includes(role)) {
        res.status(400).json({ error: "Rôle invalide. Utilisez EDITOR ou VIEWER." });
        return;
    }
    const requesterRole = await participantService.getUserRole(storyId, req.user.id);
    if (requesterRole !== client_2.ParticipantRole.OWNER) {
        res.status(403).json({ error: "Seul le propriétaire peut changer les rôles" });
        return;
    }
    const targetRole = await participantService.getUserRole(storyId, userId);
    if (targetRole === client_2.ParticipantRole.OWNER) {
        res.status(400).json({ error: "Impossible de changer le rôle du propriétaire" });
        return;
    }
    try {
        const participant = await participantService.updateRole(storyId, userId, role);
        res.json(participant);
        const io = (0, socket_1.getIO)();
        if (io) {
            const payload = { userId, storyId, role: role };
            io.to(`story:${storyId}`).emit("participant:update", payload);
            io.to(`user:${userId}`).emit("participant:update", payload);
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.updateRole = updateRole;
const remove = async (req, res) => {
    const storyId = p(req.params.storyId);
    const userId = p(req.params.userId);
    const requesterRole = await participantService.getUserRole(storyId, req.user.id);
    const isSelf = req.user.id === userId;
    if (requesterRole !== client_2.ParticipantRole.OWNER && !isSelf) {
        res.status(403).json({ error: "Non autorisé" });
        return;
    }
    const targetRole = await participantService.getUserRole(storyId, userId);
    if (targetRole === client_2.ParticipantRole.OWNER) {
        res.status(400).json({ error: "Impossible de retirer le propriétaire de l'histoire" });
        return;
    }
    try {
        await participantService.removeParticipant(storyId, userId);
        res.status(204).send();
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.remove = remove;
