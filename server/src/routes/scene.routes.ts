import { Router } from "express";
import {
  getByStory,
  getByChapter,
  getOne,
  create,
  createUnderChapter,
  update,
  updateCharacters,
  remove,
  generateImage,
  suggestIdea,
} from "../controllers/scene.controller";
import { requireAuth, optionalAuth, requireNotBanned } from "../middleware/auth";

const router = Router();

// Literal avant toute route avec :id
router.post("/scenes/suggest-idea", requireAuth, suggestIdea);

// ── Phase A : routes principales (source de vérité = storyId) ──────────────
router.get("/stories/:storyId/scenes", optionalAuth, getByStory);
router.post("/stories/:storyId/scenes", requireAuth, requireNotBanned, create);

// ── Conservées en Phase A pour compatibilité descendante ───────────────────
router.get("/chapters/:chapterId/scenes", optionalAuth, getByChapter);
router.post("/chapters/:chapterId/scenes", requireAuth, requireNotBanned, createUnderChapter);

// ── Routes scène individuelle (inchangées) ─────────────────────────────────
router.get("/scenes/:id", optionalAuth, getOne);
router.put("/scenes/:id", requireAuth, requireNotBanned, update);
router.put("/scenes/:id/characters", requireAuth, updateCharacters);
router.delete("/scenes/:id", requireAuth, remove);
router.post("/scenes/:id/generate-image", requireAuth, generateImage);

export default router;
