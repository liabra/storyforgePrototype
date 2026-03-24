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
const characterService = __importStar(require("../services/character.service"));
const participantService = __importStar(require("../services/participant.service"));
const storyService = __importStar(require("../services/story.service"));
const client_1 = require("../generated/prisma/client");
const socket_1 = require("../socket");
const getSingleParam = (value) => {
    if (!value)
        throw new Error("Missing route parameter");
    return Array.isArray(value) ? value[0] : value;
};
/** OWNER ou EDITOR peuvent créer des personnages. */
async function assertEditorOrOwner(storyId, req, res) {
    if (!req.user) {
        res.status(401).json({ error: "Authentification requise" });
        return false;
    }
    const role = await participantService.getUserRole(storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER && role !== client_1.ParticipantRole.EDITOR) {
        res.status(403).json({ error: "Vous devez être éditeur ou propriétaire pour créer un personnage" });
        return false;
    }
    return true;
}
/**
 * Vérifie que l'utilisateur connecté est l'auteur du personnage.
 * Retourne le meta { storyId, userId } si autorisé, false sinon.
 * Cas legacy (userId = null) : seul le OWNER peut agir.
 */
async function assertCharacterAuthor(characterId, req, res) {
    if (!req.user) {
        res.status(401).json({ error: "Authentification requise" });
        return false;
    }
    const meta = await characterService.getCharacterMeta(characterId);
    if (!meta) {
        res.status(404).json({ error: "Personnage introuvable" });
        return false;
    }
    if (meta.userId !== null) {
        if (meta.userId !== req.user.id) {
            res.status(403).json({ error: "Seul l'auteur de ce personnage peut le modifier" });
            return false;
        }
        return meta;
    }
    // Personnage sans auteur (legacy) → OWNER uniquement
    const role = await participantService.getUserRole(meta.storyId, req.user.id);
    if (role !== client_1.ParticipantRole.OWNER) {
        res.status(403).json({ error: "Seul le propriétaire peut modifier ce personnage (auteur inconnu)" });
        return false;
    }
    return meta;
}
const getByStory = async (req, res) => {
    const storyId = getSingleParam(req.params.storyId);
    const access = await storyService.checkStoryReadAccess(storyId, req.user?.id);
    if (access === "not_found")
        return res.status(404).json({ error: "Histoire introuvable" });
    if (access === "forbidden")
        return res.status(403).json({ error: "Cette histoire est privée" });
    const characters = await characterService.getCharactersByStory(storyId);
    return res.json(characters);
};
exports.getByStory = getByStory;
const create = async (req, res) => {
    const storyId = getSingleParam(req.params.storyId);
    const data = req.body;
    if (!data.name && !data.nickname) {
        return res.status(400).json({ error: "name or nickname is required" });
    }
    if (!(await assertEditorOrOwner(storyId, req, res)))
        return;
    const character = await characterService.createCharacter(storyId, req.user.id, data);
    (0, socket_1.getIO)()?.to(`story:${storyId}`).emit("character:new", character);
    return res.status(201).json(character);
};
exports.create = create;
const update = async (req, res) => {
    const characterId = getSingleParam(req.params.id);
    const meta = await assertCharacterAuthor(characterId, req, res);
    if (!meta)
        return;
    const character = await characterService.updateCharacter(characterId, req.body);
    (0, socket_1.getIO)()?.to(`story:${meta.storyId}`).emit("character:update", character);
    return res.json(character);
};
exports.update = update;
const remove = async (req, res) => {
    const characterId = getSingleParam(req.params.id);
    const meta = await assertCharacterAuthor(characterId, req, res);
    if (!meta)
        return;
    await characterService.deleteCharacter(characterId);
    (0, socket_1.getIO)()?.to(`story:${meta.storyId}`).emit("character:delete", { id: characterId });
    return res.status(204).send();
};
exports.remove = remove;
