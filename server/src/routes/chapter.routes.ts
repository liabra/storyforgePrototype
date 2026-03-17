import { Router } from "express";
import { getByStory, create, update, remove } from "../controllers/chapter.controller";

const router = Router();

router.get("/stories/:storyId/chapters", getByStory);
router.post("/stories/:storyId/chapters", create);
router.put("/chapters/:id", update);
router.delete("/chapters/:id", remove);

export default router;
