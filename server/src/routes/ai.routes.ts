import { Router } from "express";
import { sceneMaster } from "../controllers/ai.controller";
import { requireAuth, requireNotBanned } from "../middleware/auth";

const router = Router();

router.post("/ai/scene-master", requireAuth, requireNotBanned, sceneMaster);

export default router;
