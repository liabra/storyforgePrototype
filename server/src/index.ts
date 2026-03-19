import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import apiRoutes from "./routes/index";
import { initIO } from "./socket";

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

  socket.on("scene:join", ({ sceneId }: { sceneId: string }) => {
    socket.join(`scene:${sceneId}`);
    console.log(`[socket] ${socket.id} joined scene:${sceneId}`);
  });

  socket.on("scene:leave", ({ sceneId }: { sceneId: string }) => {
    socket.leave(`scene:${sceneId}`);
    console.log(`[socket] ${socket.id} left scene:${sceneId}`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected: ${socket.id} (${reason})`);
  });
});

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
