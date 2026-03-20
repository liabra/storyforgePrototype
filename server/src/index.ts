import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import apiRoutes from "./routes/index";
import { initIO } from "./socket";
import * as presence from "./presence";

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

io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // ── Room story (structure narrative en live)
  socket.on("story:join", ({ storyId }: { storyId: string }) => {
    socket.join(`story:${storyId}`);
  });

  socket.on("story:leave", ({ storyId }: { storyId: string }) => {
    socket.leave(`story:${storyId}`);
  });

  // ── Rooms scènes
  socket.on("scene:join", ({ sceneId }: { sceneId: string }) => {
    socket.join(`scene:${sceneId}`);
    console.log(`[socket] ${socket.id} joined scene:${sceneId}`);
  });

  socket.on("scene:leave", ({ sceneId }: { sceneId: string }) => {
    socket.leave(`scene:${sceneId}`);
    console.log(`[socket] ${socket.id} left scene:${sceneId}`);
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
      presence.identify(socket.id, userId, username, color);
      io.emit("presence:update", { count: presence.getOnlineCount() });
    },
  );

  // ── Présence par scène
  socket.on("presence:scene:join", ({ sceneId }: { sceneId: string }) => {
    presence.joinScene(socket.id, sceneId);
    io.to(`scene:${sceneId}`).emit("scene:presence:update", {
      sceneId,
      users: presence.getScenePresence(sceneId),
    });
  });

  socket.on("presence:scene:leave", ({ sceneId }: { sceneId: string }) => {
    presence.leaveScene(socket.id, sceneId);
    io.to(`scene:${sceneId}`).emit("scene:presence:update", {
      sceneId,
      users: presence.getScenePresence(sceneId),
    });
  });

  // ── Déconnexion
  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);

    const { sceneIds } = presence.disconnect(socket.id);

    // Mettre à jour le compteur global pour tous
    io.emit("presence:update", { count: presence.getOnlineCount() });

    // Mettre à jour la présence dans chaque scène affectée
    for (const sceneId of sceneIds) {
      io.to(`scene:${sceneId}`).emit("scene:presence:update", {
        sceneId,
        users: presence.getScenePresence(sceneId),
      });
    }
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
