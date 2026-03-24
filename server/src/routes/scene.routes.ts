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
import { requireAuth, optionalAuth } from "../middleware/auth";

const router = Router();

// Literal avant toute route avec :id
router.post("/scenes/suggest-idea", requireAuth, suggestIdea);

router.get("/chapters/:chapterId/scenes", optionalAuth, getByChapter);
router.get("/scenes/:id", optionalAuth, getOne);
router.post("/chapters/:chapterId/scenes", requireAuth, create);
router.put("/scenes/:id", requireAuth, update);
router.put("/scenes/:id/characters", requireAuth, updateCharacters);
router.delete("/scenes/:id", requireAuth, remove);
router.post("/scenes/:id/generate-image", requireAuth, generateImage);

export default router;
