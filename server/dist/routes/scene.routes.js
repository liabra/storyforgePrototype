"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const scene_controller_1 = require("../controllers/scene.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Literal avant toute route avec :id
router.post("/scenes/suggest-idea", auth_1.requireAuth, scene_controller_1.suggestIdea);
router.get("/chapters/:chapterId/scenes", scene_controller_1.getByChapter);
router.get("/scenes/:id", scene_controller_1.getOne);
router.post("/chapters/:chapterId/scenes", auth_1.requireAuth, scene_controller_1.create);
router.put("/scenes/:id", auth_1.requireAuth, scene_controller_1.update);
router.put("/scenes/:id/characters", auth_1.requireAuth, scene_controller_1.updateCharacters);
router.delete("/scenes/:id", auth_1.requireAuth, scene_controller_1.remove);
router.post("/scenes/:id/generate-image", auth_1.requireAuth, scene_controller_1.generateImage);
exports.default = router;
