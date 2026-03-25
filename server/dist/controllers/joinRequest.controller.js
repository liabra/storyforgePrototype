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
exports.respond = exports.getMine = exports.list = exports.create = void 0;
const joinRequestService = __importStar(require("../services/joinRequest.service"));
const participantService = __importStar(require("../services/participant.service"));
const client_1 = require("../generated/prisma/client");
const socket_1 = require("../socket");
const p = (v) => (Array.isArray(v) ? v[0] : v);
/**
 * POST /api/stories/:storyId/join-requests
 * Un VIEWER crée une demande de participation (pour devenir EDITOR).
 */
const create = async (req, res) => {
    const storyId = p(req.params.storyId);
    const userId = req.user.id;
    // Refuser si déjà OWNER ou EDITOR (inutile de demander)
    const role = await participantService.getUserRole(storyId, userId);
    if (role === client_1.ParticipantRole.OWNER || role === client_1.ParticipantRole.EDITOR) {
        res.status(400).json({ error: "Vous êtes déjà membre actif de cette histoire" });
        return;
    }
    // role === null (non-membre) ou VIEWER → autorisé à soumettre une demande
    // Vérifier qu'il n'y a pas déjà une demande en cours
    const existing = await joinRequestService.getMyRequest(storyId, userId);
    if (existing && existing.status === "PENDING") {
        res.status(409).json({ error: "Vous avez déjà une demande en attente pour cette histoire" });
        return;
    }
    try {
        const request = await joinRequestService.createRequest(storyId, userId);
        // Notifier le propriétaire via socket
        const ownerId = await joinRequestService.getStoryOwnerUserId(storyId);
        if (ownerId) {
            const io = (0, socket_1.getIO)();
            if (io) {
                io.to(`user:${ownerId}`).emit("join-request:received", {
                    requestId: request.id,
                    storyId,
                    storyTitle: request.story.title,
                    userId,
                    userDisplayName: request.user.displayName || request.user.email,
                });
            }
        }
        res.status(201).json(request);
    }
    catch (err) {
        const e = err;
        if (e.code === "P2002") {
            res.status(409).json({ error: "Vous avez déjà une demande pour cette histoire" });
            return;
        }
        res.status(500).json({ error: err.message });
    }
};
exports.create = create;
/**
 * GET /api/stories/:storyId/join-requests
 * Le propriétaire liste les demandes en attente.
 */
const list = async (req, res) => {
    const storyId = p(req.params.storyId);
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        res.status(403).json({ error: "Seul le propriétaire peut voir les demandes" });
        return;
    }
    try {
        const requests = await joinRequestService.getPendingRequests(storyId);
        res.json(requests);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.list = list;
/**
 * GET /api/stories/:storyId/join-requests/mine
 * Un participant consulte sa propre demande.
 */
const getMine = async (req, res) => {
    const storyId = p(req.params.storyId);
    const userId = req.user.id;
    try {
        const request = await joinRequestService.getMyRequest(storyId, userId);
        res.json(request ?? null);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getMine = getMine;
/**
 * PATCH /api/stories/:storyId/join-requests/:requestId
 * Le propriétaire accepte ou refuse une demande.
 * Body: { action: "accept" | "decline" }
 */
const respond = async (req, res) => {
    const storyId = p(req.params.storyId);
    const requestId = p(req.params.requestId);
    const { action } = req.body;
    if (action !== "accept" && action !== "decline") {
        res.status(400).json({ error: "action doit être 'accept' ou 'decline'" });
        return;
    }
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        res.status(403).json({ error: "Seul le propriétaire peut répondre aux demandes" });
        return;
    }
    // Vérifier que la demande appartient à cette histoire
    const request = await joinRequestService.getRequestById(requestId);
    if (!request || request.storyId !== storyId) {
        res.status(404).json({ error: "Demande introuvable" });
        return;
    }
    if (request.status !== "PENDING") {
        res.status(409).json({ error: "Cette demande a déjà été traitée" });
        return;
    }
    try {
        const updated = action === "accept"
            ? await joinRequestService.acceptRequest(requestId)
            : await joinRequestService.declineRequest(requestId);
        // Notifier l'utilisateur concerné via socket
        const io = (0, socket_1.getIO)();
        if (io) {
            io.to(`user:${request.userId}`).emit("join-request:response", {
                requestId,
                storyId,
                storyTitle: request.story.title,
                accepted: action === "accept",
            });
            // Si accepté : diffuser la mise à jour du rôle
            if (action === "accept") {
                const payload = { userId: request.userId, storyId, role: "EDITOR" };
                // Room story → met à jour la liste participants pour tous (y compris le owner)
                io.to(`story:${storyId}`).emit("participant:update", payload);
                // Room personnelle → canal de secours direct si le demandeur n'est pas dans la room story
                io.to(`user:${request.userId}`).emit("participant:update", payload);
            }
        }
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.respond = respond;
