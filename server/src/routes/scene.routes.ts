import { Router } from "express";
import {
  getByChapter,
  getOne,
  create,
  update,
  updateCharacters,
  remove,
  generateImage,
  suggestIdea,
} from "../controllers/scene.controller";

const router = Router();

// Literal avant toute route avec :id
router.post("/scenes/suggest-idea", suggestIdea);

router.get("/chapters/:chapterId/scenes", getByChapter);
router.get("/scenes/:id", getOne);
router.post("/chapters/:chapterId/scenes", create);
router.put("/scenes/:id", update);
router.put("/scenes/:id/characters", updateCharacters);
router.delete("/scenes/:id", remove);
router.post("/scenes/:id/generate-image", generateImage);

export default router;
