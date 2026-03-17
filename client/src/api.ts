const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export interface Story {
  id: string;
  title: string;
  description?: string;
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
  status: string;
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
  storyId: string;
  scenes: ChapterSceneItem[];
}

export interface Contribution {
  id: string;
  content: string;
  sceneId: string;
  characterId?: string | null;
  character?: CharacterFull | null;
  modStatus: string;
  createdAt: string;
}

export interface Scene {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  order: number;
  status: string;
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  stories: {
    list: () => request<Story[]>("/stories"),
    create: (data: { title: string; description?: string }) =>
      request<Story>("/stories", { method: "POST", body: JSON.stringify(data) }),
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
