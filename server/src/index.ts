import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import apiRoutes from "./routes/index";
import { initIO } from "./socket";
import * as presence from "./presence";
import prisma from "./prisma/client";
import { getUserRole, getStoryIdByScene } from "./services/participant.service";

const JWT_SECRET = process.env.JWT_SECRET;

// ── Origines autorisées
// En production : variable ALLOWED_ORIGINS="https://foo.railway.app,https://autre.domaine.com"
// En dev        : localhost:5173 par défaut
const ALLOWED_ORIGINS: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173"];

const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
};

const app = express();

// Derrière le proxy Railway : nécessaire pour que le rate limiter
// clé sur l'IP réelle du client et non celle du proxy
app.set("trust proxy", 1);

app.use(cors(corsOptions));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "StoryForge API running" });
});

app.use("/api", apiRoutes);

// ── HTTP server (requis pour socket.io)
const httpServer = http.createServer(app);

// ── Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

initIO(io);

// ── Auth socket : décode le JWT s'il est fourni, mais ne bloque JAMAIS
// (token absent/invalide = utilisateur anonyme)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token && JWT_SECRET) {
    try {
      const p = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
      socket.data.userId = p.userId;
      socket.data.email = p.email;
    } catch { /* token invalide → anonyme */ }
  }
  next();
});

// ── Autorisation : une histoire PUBLIC est ouverte à tous (même anonymes),
// une histoire PRIVATE est réservée à ses participants authentifiés
async function canAccessStory(storyId: string, userId?: string): Promise<boolean> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { visibility: true },
  });
  if (!story) return false;
  if (story.visibility === "PUBLIC") return true;
  if (!userId) return false;
  return (await getUserRole(storyId, userId)) !== null;
}

io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // ── Room story (structure narrative en live + présence snapshot)
  socket.on("story:join", async ({ storyId }: { storyId: string }) => {
    try {
      if (!(await canAccessStory(storyId, socket.data.userId))) {
        socket.emit("access:denied", { scope: "story", storyId });
        return;
      }
    } catch (err) {
      console.error("[socket] story:join — échec de vérification d'accès:", err);
      return;
    }
    socket.join(`story:${storyId}`);
    // Envoyer le snapshot de présence au socket qui rejoint
    const snapshot = presence.getStoryPresenceSnapshot(storyId);
    socket.emit("story:presence:snapshot", { storyId, snapshot });
  });

  socket.on("story:leave", ({ storyId }: { storyId: string }) => {
    socket.leave(`story:${storyId}`);
  });

  // ── Rooms scènes
  socket.on("scene:join", async ({ sceneId }: { sceneId: string }) => {
    try {
      // Autorisation AVANT de rejoindre et AVANT tout envoi de contenu
      const storyId = await getStoryIdByScene(sceneId);
      if (!storyId || !(await canAccessStory(storyId, socket.data.userId))) {
        socket.emit("access:denied", { scope: "scene", sceneId });
        return;
      }

      socket.join(`scene:${sceneId}`);
      console.log(`[socket] ${socket.id} joined scene:${sceneId}`);

      // Envoyer la graine d'ouverture si la scène est vide et en a une
      const sceneData = await prisma.scene.findUnique({
        where: { id: sceneId },
        select: { openingLine: true, contributions: { take: 1, select: { id: true } } },
      });

      if (sceneData?.openingLine && sceneData.contributions.length === 0) {
        socket.emit("gm_intervention", { text: sceneData.openingLine });
        console.log(`[socket] Graine d'ouverture envoyée à ${socket.id}`);
      }
    } catch (err) {
      console.error("[socket] scene:join — échec:", err);
    }
  });

  socket.on("scene:leave", ({ sceneId }: { sceneId: string }) => {
    socket.leave(`scene:${sceneId}`);
    console.log(`[socket] ${socket.id} left scene:${sceneId}`);
  });

  // ── Rooms battle
  socket.on("battle:join", ({ battleId }: { battleId: string }) => {
    socket.join(`battle:${battleId}`);
  });

  socket.on("battle:leave", ({ battleId }: { battleId: string }) => {
    socket.leave(`battle:${battleId}`);
  });

  // ── Typing
  socket.on("typing:start", ({ sceneId, userId, username }: { sceneId: string; userId: string; username: string }) => {
    socket.to(`scene:${sceneId}`).emit("typing:start", { sceneId, userId, username });
  });

  socket.on("typing:stop", ({ sceneId, userId }: { sceneId: string; userId: string }) => {
    socket.to(`scene:${sceneId}`).emit("typing:stop", { sceneId, userId });
  });

  // ── Présence globale : identification
  socket.on(
    "presence:identify",
    ({ userId, username, color }: { userId: string; username: string; color?: string | null }) => {
      // Socket authentifié : on ne fait pas confiance au userId déclaré par le client
      const trustedUserId = socket.data.userId ?? userId;
      presence.identify(socket.id, trustedUserId, username, color);
      // Room personnelle : permet de cibler ce user depuis n'importe quel contexte
      socket.join(`user:${trustedUserId}`);
      io.emit("presence:update", { count: presence.getOnlineCount() });
    },
  );

  // ── Présence par scène
  socket.on("presence:scene:join", ({ sceneId, storyId }: { sceneId: string; storyId?: string }) => {
    presence.joinScene(socket.id, sceneId, storyId);
    const users = presence.getScenePresence(sceneId);
    const payload = { sceneId, users };
    io.to(`scene:${sceneId}`).emit("scene:presence:update", payload);
    // Propager aussi à la room story pour les badges sur les cartes
    const sid = storyId ?? presence.getStoryIdForScene(sceneId);
    if (sid) io.to(`story:${sid}`).emit("scene:presence:update", payload);
  });

  socket.on("presence:scene:leave", ({ sceneId }: { sceneId: string }) => {
    presence.leaveScene(socket.id, sceneId);
    const users = presence.getScenePresence(sceneId);
    const payload = { sceneId, users };
    io.to(`scene:${sceneId}`).emit("scene:presence:update", payload);
    const sid = presence.getStoryIdForScene(sceneId);
    if (sid) io.to(`story:${sid}`).emit("scene:presence:update", payload);
  });

  // ── Déconnexion
  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);

    const { sceneIds } = presence.disconnect(socket.id);

    // Mettre à jour le compteur global pour tous
    io.emit("presence:update", { count: presence.getOnlineCount() });

    // Mettre à jour la présence dans chaque scène affectée
    for (const sceneId of sceneIds) {
      const users = presence.getScenePresence(sceneId);
      const payload = { sceneId, users };
      io.to(`scene:${sceneId}`).emit("scene:presence:update", payload);
      const storyId = presence.getStoryIdForScene(sceneId);
      if (storyId) io.to(`story:${storyId}`).emit("scene:presence:update", payload);
    }
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
