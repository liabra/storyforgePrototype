import { Router } from "express";
import { getByStory, create, update, remove } from "../controllers/character.controller";

const router = Router();

router.get("/stories/:storyId/characters", getByStory);
router.post("/stories/:storyId/characters", create);
router.put("/characters/:id", update);
router.delete("/characters/:id", remove);

export default router;