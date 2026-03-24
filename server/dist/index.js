"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const index_1 = __importDefault(require("./routes/index"));
const socket_1 = require("./socket");
const presence = __importStar(require("./presence"));
// ── Origines autorisées
// En production : variable ALLOWED_ORIGINS="https://foo.railway.app,https://autre.domaine.com"
// En dev        : localhost:5173 par défaut
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5173"];
const corsOptions = {
    origin: ALLOWED_ORIGINS,
    credentials: true,
};
const app = (0, express_1.default)();
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "StoryForge API running" });
});
app.use("/api", index_1.default);
// ── HTTP server (requis pour socket.io)
const httpServer = http_1.default.createServer(app);
// ── Socket.IO
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ["GET", "POST"],
        credentials: true,
    },
});
(0, socket_1.initIO)(io);
io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);
    // ── Room story (structure narrative en live + présence snapshot)
    socket.on("story:join", ({ storyId }) => {
        socket.join(`story:${storyId}`);
        // Envoyer le snapshot de présence au socket qui rejoint
        const snapshot = presence.getStoryPresenceSnapshot(storyId);
        socket.emit("story:presence:snapshot", { storyId, snapshot });
    });
    socket.on("story:leave", ({ storyId }) => {
        socket.leave(`story:${storyId}`);
    });
    // ── Rooms scènes
    socket.on("scene:join", ({ sceneId }) => {
        socket.join(`scene:${sceneId}`);
        console.log(`[socket] ${socket.id} joined scene:${sceneId}`);
    });
    socket.on("scene:leave", ({ sceneId }) => {
        socket.leave(`scene:${sceneId}`);
        console.log(`[socket] ${socket.id} left scene:${sceneId}`);
    });
    // ── Typing
    socket.on("typing:start", ({ sceneId, userId, username }) => {
        socket.to(`scene:${sceneId}`).emit("typing:start", { sceneId, userId, username });
    });
    socket.on("typing:stop", ({ sceneId, userId }) => {
        socket.to(`scene:${sceneId}`).emit("typing:stop", { sceneId, userId });
    });
    // ── Présence globale : identification
    socket.on("presence:identify", ({ userId, username, color }) => {
        presence.identify(socket.id, userId, username, color);
        // Room personnelle : permet de cibler ce user depuis n'importe quel contexte
        socket.join(`user:${userId}`);
        io.emit("presence:update", { count: presence.getOnlineCount() });
    });
    // ── Présence par scène
    socket.on("presence:scene:join", ({ sceneId, storyId }) => {
        presence.joinScene(socket.id, sceneId, storyId);
        const users = presence.getScenePresence(sceneId);
        const payload = { sceneId, users };
        io.to(`scene:${sceneId}`).emit("scene:presence:update", payload);
        // Propager aussi à la room story pour les badges sur les cartes
        const sid = storyId ?? presence.getStoryIdForScene(sceneId);
        if (sid)
            io.to(`story:${sid}`).emit("scene:presence:update", payload);
    });
    socket.on("presence:scene:leave", ({ sceneId }) => {
        presence.leaveScene(socket.id, sceneId);
        const users = presence.getScenePresence(sceneId);
        const payload = { sceneId, users };
        io.to(`scene:${sceneId}`).emit("scene:presence:update", payload);
        const sid = presence.getStoryIdForScene(sceneId);
        if (sid)
            io.to(`story:${sid}`).emit("scene:presence:update", payload);
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
            if (storyId)
                io.to(`story:${storyId}`).emit("scene:presence:update", payload);
        }
    });
});
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
