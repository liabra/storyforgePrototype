import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, me, recover } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

// ── Rate limiting anti brute-force
// login/recover : 10 tentatives / 15 min par IP — les cibles principales
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessaie dans quelques minutes." },
});

// register : 10 créations de compte / heure par IP — protection plus légère
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessaie dans quelques minutes." },
});

const router = Router();

router.post("/auth/register", registerLimiter, register);
router.post("/auth/login", loginLimiter, login);
router.get("/auth/me", requireAuth, me);
router.post("/auth/recover", loginLimiter, recover);

export default router;
