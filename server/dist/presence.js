"use strict";
/**
 * Presence store — éphémère, 100% mémoire, aucune persistance DB.
 * Réinitialisé à chaque redémarrage du serveur.
 *
 * Structures :
 *   socketMeta    : socket.id → { userId, username, color }
 *   onlineUsers   : userId → { username, color, socketIds }
 *   scenePresence : sceneId → Map<userId, { username, color }>
 *
 * Un userId peut avoir plusieurs sockets (ex : onglets multiples).
 * Il n'est retiré des online users que quand tous ses sockets sont fermés.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.identify = identify;
exports.joinScene = joinScene;
exports.leaveScene = leaveScene;
exports.getStoryIdForScene = getStoryIdForScene;
exports.disconnect = disconnect;
exports.getOnlineCount = getOnlineCount;
exports.getScenePresence = getScenePresence;
exports.getStoryPresenceSnapshot = getStoryPresenceSnapshot;
const socketMeta = new Map();
const onlineUsers = new Map();
const scenePresence = new Map();
// sceneToStory : permet de retrouver la storyId d'une scène pour broadcaster
// les mises à jour de présence à toute la room story.
const sceneToStory = new Map();
// ── Identification ─────────────────────────────────────────────────────────────
function identify(socketId, userId, username, color) {
    socketMeta.set(socketId, { userId, username, color });
    const existing = onlineUsers.get(userId);
    if (existing) {
        existing.username = username;
        existing.color = color;
        existing.socketIds.add(socketId);
    }
    else {
        onlineUsers.set(userId, { username, color, socketIds: new Set([socketId]) });
    }
}
// ── Scène ──────────────────────────────────────────────────────────────────────
function joinScene(socketId, sceneId, storyId) {
    const meta = socketMeta.get(socketId);
    if (!meta)
        return;
    if (storyId)
        sceneToStory.set(sceneId, storyId);
    if (!scenePresence.has(sceneId)) {
        scenePresence.set(sceneId, new Map());
    }
    scenePresence.get(sceneId).set(meta.userId, {
        username: meta.username,
        color: meta.color,
    });
}
function leaveScene(socketId, sceneId) {
    const meta = socketMeta.get(socketId);
    if (!meta)
        return;
    const map = scenePresence.get(sceneId);
    if (!map)
        return;
    map.delete(meta.userId);
    if (map.size === 0)
        scenePresence.delete(sceneId);
}
// ── Déconnexion ────────────────────────────────────────────────────────────────
/**
 * Retire le socket. Si l'utilisateur n'a plus de socket actif :
 * - le retire des online users
 * - le retire de toutes les scènes où il était présent
 * Retourne les scènes impactées pour permettre au caller de les re-broadcaster.
 */
function getStoryIdForScene(sceneId) {
    return sceneToStory.get(sceneId);
}
function disconnect(socketId) {
    const meta = socketMeta.get(socketId);
    if (!meta)
        return { sceneIds: [] };
    socketMeta.delete(socketId);
    const { userId } = meta;
    const user = onlineUsers.get(userId);
    if (user) {
        user.socketIds.delete(socketId);
        if (user.socketIds.size === 0) {
            onlineUsers.delete(userId);
        }
    }
    // Retirer de la présence par scène seulement si plus aucun socket actif
    const sceneIds = [];
    if (!onlineUsers.has(userId)) {
        for (const [sceneId, map] of scenePresence.entries()) {
            if (map.has(userId)) {
                map.delete(userId);
                sceneIds.push(sceneId);
                if (map.size === 0)
                    scenePresence.delete(sceneId);
            }
        }
    }
    return { sceneIds };
}
// ── Lectures ───────────────────────────────────────────────────────────────────
function getOnlineCount() {
    return onlineUsers.size;
}
function getScenePresence(sceneId) {
    const map = scenePresence.get(sceneId);
    if (!map)
        return [];
    return Array.from(map.entries()).map(([userId, data]) => ({
        userId,
        username: data.username,
        color: data.color,
    }));
}
/**
 * Retourne un snapshot complet de la présence pour toutes les scènes d'une story.
 * Format : { [sceneId]: PresenceUserData[] }
 */
function getStoryPresenceSnapshot(storyId) {
    const result = {};
    for (const [sceneId, sid] of sceneToStory.entries()) {
        if (sid !== storyId)
            continue;
        result[sceneId] = getScenePresence(sceneId);
    }
    return result;
}
