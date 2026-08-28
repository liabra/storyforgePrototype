import { Router } from "express";
import { getByScene, create, remove, update, moderate } from "../controllers/contribution.controller";
import { requireAuth, optionalAuth, requireNotBanned } from "../middleware/auth";

const router = Router();

// optionalAuth : req.user est nécessaire pour vérifier l'accès aux histoires privées
router.get("/scenes/:sceneId/contributions", optionalAuth, getByScene);
router.post("/scenes/:sceneId/contributions", requireAuth, requireNotBanned, create);
router.delete("/contributions/:id", requireAuth, remove);
router.patch("/contributions/:id", requireAuth, requireNotBanned, update);
router.post("/contributions/:id/moderate", requireAuth, moderate);

export default router;
