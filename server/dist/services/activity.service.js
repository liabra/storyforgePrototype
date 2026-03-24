"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentActivity = getRecentActivity;
exports.broadcastActivityToStory = broadcastActivityToStory;
const client_1 = __importDefault(require("../prisma/client"));
const socket_1 = require("../socket");
const participant_service_1 = require("./participant.service");
async function getRecentActivity(userId) {
    const [contribs, scenes] = await Promise.all([
        client_1.default.contribution.findMany({
            where: { scene: { chapter: { story: { participants: { some: { userId } } } } } },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
                id: true,
                createdAt: true,
                user: { select: { displayName: true, email: true } },
                character: { select: { name: true, nickname: true } },
                scene: {
                    select: {
                        id: true,
                        title: true,
                        chapter: { select: { story: { select: { id: true, title: true } } } },
                    },
                },
            },
        }),
        client_1.default.scene.findMany({
            where: { chapter: { story: { participants: { some: { userId } } } } },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
                id: true,
                title: true,
                createdAt: true,
                chapter: { select: { story: { select: { id: true, title: true } } } },
            },
        }),
    ]);
    const items = [
        ...contribs.map((c) => ({
            type: "contribution",
            storyId: c.scene.chapter.story.id,
            storyTitle: c.scene.chapter.story.title,
            sceneId: c.scene.id,
            sceneTitle: c.scene.title,
            username: c.character
                ? (c.character.name || c.character.nickname || "Personnage")
                : (c.user?.displayName || c.user?.email?.split("@")[0] || "Anonyme"),
            at: c.createdAt.toISOString(),
        })),
        ...scenes.map((s) => ({
            type: "scene",
            storyId: s.chapter.story.id,
            storyTitle: s.chapter.story.title,
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
 *
 * Chaque utilisateur dispose d'une room personnelle "user:${userId}" rejointe
 * automatiquement lors du presence:identify. Cela garantit qu'il reçoit les
 * événements de toutes ses histoires, qu'il soit sur la homepage ou dans une histoire.
 *
 * Extension future : si une histoire est marquée "publique", émettre en plus
 * à une room "public-activity" sans modifier la logique privée ci-dessous.
 */
async function broadcastActivityToStory(storyId, payload) {
    const io = (0, socket_1.getIO)();
    if (!io)
        return;
    const userIds = await (0, participant_service_1.getStoryParticipantUserIds)(storyId);
    for (const userId of userIds) {
        io.to(`user:${userId}`).emit("activity:new", payload);
    }
}
