import { Router } from "express";
import { getByStory, create, update, remove } from "../controllers/chapter.controller";
import { requireAuth, optionalAuth } from "../middleware/auth";

const router = Router();

router.get("/stories/:storyId/chapters", optionalAuth, getByStory);
router.post("/stories/:storyId/chapters", requireAuth, create);
router.put("/chapters/:id", requireAuth, update);
router.delete("/chapters/:id", requireAuth, remove);

export default router;
