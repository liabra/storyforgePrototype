import prisma from "../prisma/client";
import { getIO } from "../socket";
import { getStoryParticipantUserIds } from "./participant.service";

export interface ActivityItem {
  type: "scene" | "contribution";
  storyId: string;
  storyTitle: string;
  sceneId: string;
  sceneTitle: string;
  username: string;
  userId?: string;
  at: string; // ISO
}

export async function getRecentActivity(userId: string): Promise<ActivityItem[]> {
  const [contribs, scenes] = await Promise.all([
    // Phase A : chemin direct via scene.story (storyId)
    prisma.contribution.findMany({
      where: { scene: { story: { participants: { some: { userId } } } } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        user: { select: { displayName: true, email: true, pseudonym: true } },
        character: { select: { name: true, nickname: true } },
        scene: {
          select: {
            id: true,
            title: true,
            story: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.scene.findMany({
      where: { story: { participants: { some: { userId } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        createdAt: true,
        story: { select: { id: true, title: true } },
      },
    }),
  ]);

  const items: ActivityItem[] = [
    ...contribs.map((c) => ({
      type: "contribution" as const,
      storyId: c.scene.story.id,
      storyTitle: c.scene.story.title,
      sceneId: c.scene.id,
      sceneTitle: c.scene.title,
      username: c.character
        ? (c.character.name || c.character.nickname || "Personnage")
        : (c.user?.displayName || c.user?.email?.split("@")[0] || (c.user as any)?.pseudonym || "Joueur"),
      at: c.createdAt.toISOString(),
    })),
    ...scenes.map((s) => ({
      type: "scene" as const,
      storyId: s.story.id,
      storyTitle: s.story.title,
      sceneId: s.id,
      sceneTitle: s.title,
      username: "",
      at: s.createdAt.toISOString(),
    })),
  ];

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
}

/**
 * Diffuse un événement activity:new uniquement aux participants de l'histoire.
 */
export async function broadcastActivityToStory(
  storyId: string,
  payload: ActivityItem,
): Promise<void> {
  const io = getIO();
  if (!io) return;
  const userIds = await getStoryParticipantUserIds(storyId);
  for (const userId of userIds) {
    io.to(`user:${userId}`).emit("activity:new", payload);
  }
}
