const BASE = "/api";

export interface Story {
  id: string;
  title: string;
  description?: string;
}

// Référence légère d'un personnage embarquée dans une scène
export interface CharacterRef {
  id: string;
  name?: string;
  nickname?: string;
}

// Référence légère d'une scène embarquée dans un personnage
export interface SceneRef {
  id: string;
  title: string;
  order: number;
}

export interface Scene {
  id: string;
  title: string;
  content?: string;
  imageUrl?: string;
  order: number;
  storyId: string;
  visibilityMode: string;
  visibleLines: number;
  visibleContent: string | null;
  characters: CharacterRef[];
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
  scenes: {
    list: (storyId: string) => request<Scene[]>(`/stories/${storyId}/scenes`),
    create: (storyId: string, data: { title: string; content?: string; order?: number }) =>
      request<Scene>(`/stories/${storyId}/scenes`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (sceneId: string, data: Partial<Scene>) =>
      request<Scene>(`/scenes/${sceneId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
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
  characters: {
    list: (storyId: string) =>
      request<Character[]>(`/stories/${storyId}/characters`),
    create: (storyId: string, data: CharacterInput) =>
      request<Character>(`/stories/${storyId}/characters`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: CharacterInput) =>
      request<Character>(`/characters/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/characters/${id}`, { method: "DELETE" }),
  },
};
