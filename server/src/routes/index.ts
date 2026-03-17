import { Router } from "express";
import storyRoutes from "./story.routes";
import characterRoutes from "./character.routes";
import chapterRoutes from "./chapter.routes";
import sceneRoutes from "./scene.routes";
import contributionRoutes from "./contribution.routes";
import devRoutes from "./dev.routes";

const router = Router();

router.use(storyRoutes);
router.use(characterRoutes);
router.use(chapterRoutes);
router.use(sceneRoutes);
router.use(contributionRoutes);
router.use(devRoutes);

export default router;
