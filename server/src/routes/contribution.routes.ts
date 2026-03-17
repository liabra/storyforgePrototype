import { Router } from "express";
import { getByScene, create, remove, moderate } from "../controllers/contribution.controller";

const router = Router();

router.get("/scenes/:sceneId/contributions", getByScene);
router.post("/scenes/:sceneId/contributions", create);
router.delete("/contributions/:id", remove);
router.post("/contributions/:id/moderate", moderate);

export default router;
