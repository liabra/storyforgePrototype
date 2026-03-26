import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import storyRoutes from "./story.routes";
import characterRoutes from "./character.routes";
import chapterRoutes from "./chapter.routes";
import sceneRoutes from "./scene.routes";
import contributionRoutes from "./contribution.routes";
import participantRoutes from "./participant.routes";
import joinRequestRoutes from "./joinRequest.routes";
import activityRoutes from "./activity.routes";
import devRoutes from "./dev.routes";
import battleRoutes from "./battle.routes";
import reportRoutes from "./report.routes";

const router = Router();

router.use(authRoutes);
router.use(userRoutes);
router.use(storyRoutes);
router.use(characterRoutes);
router.use(chapterRoutes);
router.use(sceneRoutes);
router.use(contributionRoutes);
router.use(participantRoutes);
router.use(joinRequestRoutes);
router.use(activityRoutes);
router.use(devRoutes);
router.use(battleRoutes);
router.use(reportRoutes);

export default router;
