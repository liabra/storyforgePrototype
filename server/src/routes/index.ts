import { Router } from "express";
import storyRoutes from "./story.routes";
import characterRoutes from "./character.routes";
import sceneRoutes from "./scene.routes";

const router = Router();

router.use(storyRoutes);
router.use(characterRoutes);
router.use(sceneRoutes);

export default router;  