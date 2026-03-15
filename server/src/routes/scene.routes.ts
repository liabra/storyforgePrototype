import { Router } from "express";
import {
  getByStory,
  create,
  update,
  remove,
  generateImage,
  suggestIdea,
} from "../controllers/scene.controller";

const router = Router();

// Route littérale avant toute route avec :id
router.post("/scenes/suggest-idea", suggestIdea);

router.get("/stories/:storyId/scenes", getByStory);
router.post("/stories/:storyId/scenes", create);
router.put("/scenes/:id", update);
router.delete("/scenes/:id", remove);
router.post("/scenes/:id/generate-image", generateImage);

export default router;
