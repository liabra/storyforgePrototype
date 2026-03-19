import { io } from "socket.io-client";

// En production (Railway) : même origine → ""
// En dev local : VITE_SOCKET_URL=http://localhost:4000 dans .env.local
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1500,
});
