import { Router } from "express";
import { getByStory, create, update, remove } from "../controllers/character.controller";
import { requireAuth, optionalAuth, requireNotBanned } from "../middleware/auth";

const router = Router();

router.get("/stories/:storyId/characters", optionalAuth, getByStory);
router.post("/stories/:storyId/characters", requireAuth, requireNotBanned, create);
router.put("/characters/:id", requireAuth, requireNotBanned, update);
router.delete("/characters/:id", requireAuth, remove);

export default router;