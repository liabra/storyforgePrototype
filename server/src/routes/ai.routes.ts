import { Router } from "express";
import { sceneMaster } from "../controllers/ai.controller";
import { requireAuth, requireNotBanned } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimiters";

const router = Router();

router.post("/ai/scene-master", requireAuth, requireNotBanned, aiLimiter, sceneMaster);

export default router;
