const BASE = "/api";

export interface Story {
  id: string;
  title: string;
  description?: string;
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
}

export type CharacterInput = Omit<Partial<Character>, "id" | "storyId">;

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
