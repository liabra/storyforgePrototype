import { Router } from "express";
import { register, login, me, recover } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", requireAuth, me);
router.post("/auth/recover", recover);

export default router;
