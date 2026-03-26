const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// ─── Token storage ─────────────────────────────────────────────────────────────
const TOKEN_KEY = "sf_token";
export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (t: string): void => { localStorage.setItem(TOKEN_KEY, t); },
  clear: (): void => { localStorage.removeItem(TOKEN_KEY); },
};

export type SceneStatus = "DRAFT" | "ACTIVE" | "DONE";

export type ContentStatus = "ACTIVE" | "DONE";

export type StoryVisibility = "PRIVATE" | "PUBLIC";

export interface Story {
  id: string;
  title: string;
  description?: string;
  status: ContentStatus;
  visibility: StoryVisibility;
}

export interface PublicStory {
  id: string;
  title: string;
  description?: string;
  visibility: StoryVisibility;
  createdAt: string;
  updatedAt: string;
  _count: { chapters: number; participants: number };
}

export interface CharacterRef {
  id: string;
  name?: string;
  nickname?: string;
}

export interface CharacterFull extends CharacterRef {
  avatarUrl?: string;
}

export interface SceneRef {
  id: string;
  title: string;
  order: number;
  status: SceneStatus;
}

export interface ChapterSceneItem extends SceneRef {
  _count: { contributions: number };
  characters: CharacterRef[];
}

export interface Chapter {
  id: string;
  title: string;
  description?: string;
  order: number;
  status: ContentStatus;
  storyId: string;
  scenes: ChapterSceneItem[];
}

export interface Contribution {
  id: string;
  content: string;
  sceneId: string;
  characterId?: string | null;
  character?: CharacterFull | null;
  userId?: string | null;
  user?: { id: string; email: string; displayName?: string | null; color?: string | null } | null;
  modStatus: string;
  createdAt: string;
}

export type SceneMode = "FREE" | "TURN";

export interface Scene {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  order: number;
  status: SceneStatus;
  mode: SceneMode;
  currentTurnUserId?: string | null;
  visibilityMode: string;
  visibleCount: number;
  chapterId: string;
  characters: CharacterRef[];
  contributions?: Contribution[];
  _count?: { contributions: number };
}

export interface Character {
  id: string;
  storyId: string;
  userId?: string | null;
  user?: { id: string; displayName?: string | null; email: string } | null;
  name?: string;
  nickname?: string;
  role?: string;
  shortDescription?: string;
  appearance?: string;
  outfit?: string;
  accessories?: string;
  personality?: string;
  traits?: string;
  faction?: string;
  visualNotes?: string;
  avatarUrl?: string;
  scenes?: SceneRef[];
}

export type CharacterInput = Omit<Partial<Character>, "id" | "storyId" | "scenes">;

export type ParticipantRole = "OWNER" | "EDITOR" | "VIEWER";

export interface Participant {
  id: string;
  storyId: string;
  userId: string;
  role: ParticipantRole;
  createdAt: string;
  user: { id: string; email: string; displayName?: string | null; color?: string | null };
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
  color?: string | null;
  bio?: string | null;
  isAdmin?: boolean;
  isBanned?: boolean;
  notifBattleEnabled?: boolean;
  notifInvitesEnabled?: boolean;
  notifGeneralEnabled?: boolean;
  createdAt: string;
}

export type ReportStatus = "OPEN" | "IGNORED" | "RESOLVED";

export type NotificationType =
  | "CONTENT_REMOVED"
  | "USER_BANNED"
  | "USER_UNBANNED"
  | "BATTLE_INVITE"
  | "STORY_INVITE"
  | "GENERAL";

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminReport {
  id: string;
  targetType: "CONTRIBUTION" | "BATTLE_MOVE" | "STORY";
  targetId: string;
  reason: string | null;
  status: ReportStatus;
  createdAt: string;
  user: { id: string; email: string; displayName: string | null };
  contentPreview: string | null;
  contentAuthor: { id: string; email: string; displayName: string | null; isBanned: boolean } | null;
}

export interface UserProfileInput {
  displayName?: string | null;
  color?: string | null;
  bio?: string | null;
  notifBattleEnabled?: boolean;
  notifInvitesEnabled?: boolean;
  notifGeneralEnabled?: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ActivityItem {
  type: "scene" | "contribution";
  storyId: string;
  storyTitle: string;
  sceneId: string;
  sceneTitle: string;
  username: string;
  userId?: string;
  at: string;
}

export type JoinRequestStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface JoinRequest {
  id: string;
  storyId: string;
  userId: string;
  status: JoinRequestStatus;
  createdAt: string;
  user: { id: string; email: string; displayName?: string | null; color?: string | null };
  story: { id: string; title: string };
}

// ── Battle types ──────────────────────────────────────────────────────────────

export type BattleStatus = "WAITING" | "ACTIVE" | "VOTING" | "DONE";
export type BattleWinner = "ATTACKER" | "DEFENDER";

export interface BattleUser {
  id: string;
  email: string;
  displayName?: string | null;
  color?: string | null;
}

export interface BattleMove {
  id: string;
  battleId: string;
  userId: string;
  user: BattleUser;
  content: string;
  turnNumber: number;
  createdAt: string;
}

export interface BattleVote {
  id: string;
  battleId: string;
  userId: string;
  user: BattleUser;
  vote: boolean;
  createdAt: string;
}

export type BattleVisibility = "PUBLIC" | "PRIVATE";
export type BattleInviteRole = "PLAYER" | "SPECTATOR";
export type BattleInviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface BattleInvite {
  id: string;
  battleId: string;
  userId: string;
  user: BattleUser;
  role: BattleInviteRole;
  status: BattleInviteStatus;
  createdAt: string;
}

export interface BattleInviteWithContext extends BattleInvite {
  battle: {
    id: string;
    title: string;
    visibility: BattleVisibility;
    attacker: BattleUser;
  };
}

export interface Battle {
  id: string;
  title: string;
  goal: string;
  status: BattleStatus;
  visibility: BattleVisibility;
  attackerId: string;
  attacker: BattleUser;
  defenderId: string | null;
  defender: BattleUser | null;
  currentTurnUserId: string | null;
  turnCount: number;
  minTurns: number;
  maxTurns: number;
  winner: BattleWinner | null;
  moves: BattleMove[];
  votes: BattleVote[];
  invites: BattleInvite[];
  createdAt: string;
  updatedAt: string;
}

export interface BattleListItem {
  id: string;
  title: string;
  goal: string;
  status: BattleStatus;
  visibility: BattleVisibility;
  attackerId: string;
  attacker: BattleUser;
  defenderId: string | null;
  defender: BattleUser | null;
  currentTurnUserId: string | null;
  turnCount: number;
  minTurns: number;
  maxTurns: number;
  winner: BattleWinner | null;
  _count: { moves: number; votes: number };
  createdAt: string;
  updatedAt: string;
}

export interface BattleMoveResult {
  move: BattleMove;
  updatedBattle: {
    id: string;
    turnCount: number;
    currentTurnUserId: string | null;
    status: BattleStatus;
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    // Lire le message d'erreur backend si disponible
    let message = `API error ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* ignore JSON parse errors */ }
    if (res.status === 401) tokenStore.clear();
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
    login: (email: string, password: string) =>
      request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request<AuthUser>("/auth/me"),
  },
  users: {
    getProfile: () => request<AuthUser>("/users/me"),
    updateProfile: (data: UserProfileInput) =>
      request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
  },
  stories: {
    list: () => request<Story[]>("/stories"),
    listPublic: () => request<PublicStory[]>("/stories/public"),
    create: (data: { title: string; description?: string }) =>
      request<Story>("/stories", { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: string, status: ContentStatus) =>
      request<Story>(`/stories/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    updateVisibility: (id: string, visibility: StoryVisibility) =>
      request<Story>(`/stories/${id}`, { method: "PUT", body: JSON.stringify({ visibility }) }),
  },
  chapters: {
    list: (storyId: string) => request<Chapter[]>(`/stories/${storyId}/chapters`),
    create: (storyId: string, data: { title: string; description?: string; order?: number }) =>
      request<Chapter>(`/stories/${storyId}/chapters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { title?: string; description?: string; order?: number }) =>
      request<Chapter>(`/chapters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    updateStatus: (id: string, status: ContentStatus) =>
      request<Chapter>(`/chapters/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    delete: (id: string) => request<void>(`/chapters/${id}`, { method: "DELETE" }),
  },
  scenes: {
    list: (chapterId: string) => request<Scene[]>(`/chapters/${chapterId}/scenes`),
    get: (sceneId: string) => request<Scene>(`/scenes/${sceneId}`),
    create: (chapterId: string, data: { title: string; description?: string; order?: number }) =>
      request<Scene>(`/chapters/${chapterId}/scenes`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (sceneId: string, data: Partial<Scene>) =>
      request<Scene>(`/scenes/${sceneId}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (sceneId: string) => request<void>(`/scenes/${sceneId}`, { method: "DELETE" }),
    updateCharacters: (sceneId: string, characterIds: string[]) =>
      request<Scene>(`/scenes/${sceneId}/characters`, {
        method: "PUT",
        body: JSON.stringify({ characterIds }),
      }),
    suggestIdea: (storyId: string, sceneTitle?: string) =>
      request<{ idea: string }>("/scenes/suggest-idea", {
        method: "POST",
        body: JSON.stringify({ storyId, sceneTitle }),
      }),
    generateImage: (sceneId: string) =>
      request<Scene>(`/scenes/${sceneId}/generate-image`, { method: "POST" }),
  },
  contributions: {
    create: (sceneId: string, data: { content: string; characterId?: string }) =>
      request<Contribution>(`/scenes/${sceneId}/contributions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request<void>(`/contributions/${id}`, { method: "DELETE" }),
    update: (id: string, content: string) =>
      request<Contribution>(`/contributions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      }),
  },
  participants: {
    list: (storyId: string) => request<Participant[]>(`/stories/${storyId}/participants`),
    add: (storyId: string, email: string, role: "EDITOR" | "VIEWER") =>
      request<Participant>(`/stories/${storyId}/participants`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    updateRole: (storyId: string, userId: string, role: "EDITOR" | "VIEWER") =>
      request<Participant>(`/stories/${storyId}/participants/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    remove: (storyId: string, userId: string) =>
      request<void>(`/stories/${storyId}/participants/${userId}`, { method: "DELETE" }),
  },
  activity: {
    recent: () => request<ActivityItem[]>("/activity/recent"),
  },
  joinRequests: {
    create: (storyId: string) =>
      request<JoinRequest>(`/stories/${storyId}/join-requests`, { method: "POST" }),
    getMine: (storyId: string) =>
      request<JoinRequest | null>(`/stories/${storyId}/join-requests/mine`),
    list: (storyId: string) =>
      request<JoinRequest[]>(`/stories/${storyId}/join-requests`),
    respond: (storyId: string, requestId: string, action: "accept" | "decline") =>
      request<JoinRequest>(`/stories/${storyId}/join-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      }),
  },
  characters: {
    list: (storyId: string) => request<Character[]>(`/stories/${storyId}/characters`),
    create: (storyId: string, data: CharacterInput) =>
      request<Character>(`/stories/${storyId}/characters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: CharacterInput) =>
      request<Character>(`/characters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/characters/${id}`, { method: "DELETE" }),
  },
  battles: {
    list: () => request<BattleListItem[]>("/battles"),
    get: (id: string) => request<Battle>(`/battles/${id}`),
    create: (data: { title: string; goal: string; minTurns?: number; maxTurns?: number; visibility?: BattleVisibility }) =>
      request<Battle>("/battles", { method: "POST", body: JSON.stringify(data) }),
    join: (id: string) =>
      request<Battle>(`/battles/${id}/join`, { method: "POST" }),
    createMove: (id: string, content: string) =>
      request<BattleMoveResult>(`/battles/${id}/moves`, { method: "POST", body: JSON.stringify({ content }) }),
    startVoting: (id: string) =>
      request<Battle>(`/battles/${id}/vote/start`, { method: "POST" }),
    castVote: (id: string, vote: boolean) =>
      request<BattleVote>(`/battles/${id}/vote`, { method: "POST", body: JSON.stringify({ vote }) }),
    closeVoting: (id: string) =>
      request<Battle>(`/battles/${id}/vote/close`, { method: "POST" }),
    invite: (id: string, email: string, role: BattleInviteRole) =>
      request<BattleInvite>(`/battles/${id}/invite`, { method: "POST", body: JSON.stringify({ email, role }) }),
  },
  battleInvites: {
    mine: () => request<BattleInviteWithContext[]>("/battle-invites/mine"),
    accept: (inviteId: string) => request<{ ok: boolean }>(`/battle-invites/${inviteId}/accept`, { method: "POST" }),
    decline: (inviteId: string) => request<{ ok: boolean }>(`/battle-invites/${inviteId}/decline`, { method: "POST" }),
  },
  reports: {
    create: (data: { targetType: "CONTRIBUTION" | "BATTLE_MOVE" | "STORY"; targetId: string; reason?: string }) =>
      request<{ id: string }>("/reports", { method: "POST", body: JSON.stringify(data) }),
  },
  notifications: {
    mine: () => request<AppNotification[]>("/notifications/mine"),
    markRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: "POST" }),
  },
  admin: {
    listReports: (status?: ReportStatus) =>
      request<AdminReport[]>(`/admin/reports${status ? `?status=${status}` : ""}`),
    ignoreReport: (id: string) =>
      request<{ id: string; status: ReportStatus }>(`/admin/reports/${id}/ignore`, { method: "POST" }),
    deleteContent: (targetType: "CONTRIBUTION" | "BATTLE_MOVE" | "STORY", targetId: string) =>
      request<{ ok: boolean }>("/admin/content", { method: "DELETE", body: JSON.stringify({ targetType, targetId }) }),
    banUser: (id: string) =>
      request<{ id: string; isBanned: boolean }>(`/admin/users/${id}/ban`, { method: "POST" }),
    unbanUser: (id: string) =>
      request<{ id: string; isBanned: boolean }>(`/admin/users/${id}/unban`, { method: "POST" }),
  },
};
