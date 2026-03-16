import { Router } from "express";
import {
  getByStory,
  create,
  update,
  updateCharacters,
  remove,
  generateImage,
  suggestIdea,
} from "../controllers/scene.controller";

const router = Router();

// Routes littérales avant toute route avec :id
router.post("/scenes/suggest-idea", suggestIdea);

router.get("/stories/:storyId/scenes", getByStory);
router.post("/stories/:storyId/scenes", create);
router.put("/scenes/:id", update);
router.put("/scenes/:id/characters", updateCharacters);
router.delete("/scenes/:id", remove);
router.post("/scenes/:id/generate-image", generateImage);

export default router;
