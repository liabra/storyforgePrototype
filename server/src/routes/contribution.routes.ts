import { Router } from "express";
import { getByScene, create, remove, update, moderate } from "../controllers/contribution.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/scenes/:sceneId/contributions", getByScene);
router.post("/scenes/:sceneId/contributions", requireAuth, create);
router.delete("/contributions/:id", requireAuth, remove);
router.patch("/contributions/:id", requireAuth, update);
router.post("/contributions/:id/moderate", requireAuth, moderate);

export default router;
