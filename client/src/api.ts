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

export interface Story {
  id: string;
  title: string;
  description?: string;
  status: ContentStatus;
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
  createdAt: string;
}

export interface UserProfileInput {
  displayName?: string | null;
  color?: string | null;
  bio?: string | null;
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
  if (res.status === 401) {
    tokenStore.clear();
    throw new Error(`API error 401`);
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
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
    create: (data: { title: string; description?: string }) =>
      request<Story>("/stories", { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: string, status: ContentStatus) =>
      request<Story>(`/stories/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
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
};
