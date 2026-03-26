import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { mine, markRead } from "../controllers/notification.controller";

const router = Router();

router.get("/notifications/mine", requireAuth, mine);
router.post("/notifications/:id/read", requireAuth, markRead);

export default router;
