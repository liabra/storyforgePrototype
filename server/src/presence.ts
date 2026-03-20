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

type UserMeta = { username: string; color?: string | null };
type SocketMeta = UserMeta & { userId: string };
type OnlineEntry = UserMeta & { socketIds: Set<string> };

const socketMeta = new Map<string, SocketMeta>();
const onlineUsers = new Map<string, OnlineEntry>();
const scenePresence = new Map<string, Map<string, UserMeta>>();

// ── Identification ─────────────────────────────────────────────────────────────

export function identify(
  socketId: string,
  userId: string,
  username: string,
  color?: string | null,
): void {
  socketMeta.set(socketId, { userId, username, color });

  const existing = onlineUsers.get(userId);
  if (existing) {
    existing.username = username;
    existing.color = color;
    existing.socketIds.add(socketId);
  } else {
    onlineUsers.set(userId, { username, color, socketIds: new Set([socketId]) });
  }
}

// ── Scène ──────────────────────────────────────────────────────────────────────

export function joinScene(socketId: string, sceneId: string): void {
  const meta = socketMeta.get(socketId);
  if (!meta) return;

  if (!scenePresence.has(sceneId)) {
    scenePresence.set(sceneId, new Map());
  }
  scenePresence.get(sceneId)!.set(meta.userId, {
    username: meta.username,
    color: meta.color,
  });
}

export function leaveScene(socketId: string, sceneId: string): void {
  const meta = socketMeta.get(socketId);
  if (!meta) return;

  const map = scenePresence.get(sceneId);
  if (!map) return;

  map.delete(meta.userId);
  if (map.size === 0) scenePresence.delete(sceneId);
}

// ── Déconnexion ────────────────────────────────────────────────────────────────

/**
 * Retire le socket. Si l'utilisateur n'a plus de socket actif :
 * - le retire des online users
 * - le retire de toutes les scènes où il était présent
 * Retourne les scènes impactées pour permettre au caller de les re-broadcaster.
 */
export function disconnect(socketId: string): { sceneIds: string[] } {
  const meta = socketMeta.get(socketId);
  if (!meta) return { sceneIds: [] };

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
  const sceneIds: string[] = [];
  if (!onlineUsers.has(userId)) {
    for (const [sceneId, map] of scenePresence.entries()) {
      if (map.has(userId)) {
        map.delete(userId);
        sceneIds.push(sceneId);
        if (map.size === 0) scenePresence.delete(sceneId);
      }
    }
  }

  return { sceneIds };
}

// ── Lectures ───────────────────────────────────────────────────────────────────

export function getOnlineCount(): number {
  return onlineUsers.size;
}

export interface PresenceUserData {
  userId: string;
  username: string;
  color?: string | null;
}

export function getScenePresence(sceneId: string): PresenceUserData[] {
  const map = scenePresence.get(sceneId);
  if (!map) return [];
  return Array.from(map.entries()).map(([userId, data]) => ({
    userId,
    username: data.username,
    color: data.color,
  }));
}
