import { Router } from "express";
import { getByStory, create, update, remove } from "../controllers/character.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/stories/:storyId/characters", getByStory);
router.post("/stories/:storyId/characters", requireAuth, create);
router.put("/characters/:id", requireAuth, update);
router.delete("/characters/:id", requireAuth, remove);

export default router;