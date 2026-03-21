import { Router } from "express";
import { getRecent } from "../controllers/activity.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/activity/recent", requireAuth, getRecent);

export default router;
