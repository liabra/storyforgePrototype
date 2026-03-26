import { Router } from "express";
import { getByStory, create, update, remove } from "../controllers/chapter.controller";
import { requireAuth, optionalAuth, requireNotBanned } from "../middleware/auth";

const router = Router();

router.get("/stories/:storyId/chapters", optionalAuth, getByStory);
router.post("/stories/:storyId/chapters", requireAuth, requireNotBanned, create);
router.put("/chapters/:id", requireAuth, requireNotBanned, update);
router.delete("/chapters/:id", requireAuth, remove);

export default router;
