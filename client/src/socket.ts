import { io } from "socket.io-client";

// Priorité :
// 1. VITE_SOCKET_URL  (explicite)
// 2. VITE_API_BASE_URL sans le chemin /api  (dérivé — le plus fiable en prod Railway)
// 3. ""  (même origine — dev avec proxy Vite)
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ??
  import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") ??
  "";

console.log("[socket] URL résolue :", SOCKET_URL || "(même origine)");

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

socket.on("connect", () =>
  console.log("[socket] connecté :", socket.id)
);
socket.on("disconnect", (reason) =>
  console.log("[socket] déconnecté :", reason)
);
socket.on("connect_error", (err) =>
  console.error("[socket] erreur connexion :", err.message)
);
