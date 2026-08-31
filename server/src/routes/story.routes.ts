import { Router } from "express";
import { getAll, getById, getPublic, getArchived, create, update, archive, unarchive, remove, generateIllustration } from "../controllers/story.controller";
import { requireAuth, optionalAuth, requireNotBanned } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimiters";

const router = Router();

router.get("/stories", requireAuth, getAll);
router.get("/stories/public", getPublic);    // AVANT /:id
router.get("/stories/archived", requireAuth, getArchived); // AVANT /:id
router.get("/stories/:id", optionalAuth, getById);
router.post("/stories", requireAuth, requireNotBanned, create);
router.put("/stories/:id", requireAuth, update);
router.patch("/stories/:id/archive", requireAuth, archive);
router.patch("/stories/:id/unarchive", requireAuth, unarchive);
router.post("/stories/:id/generate-illustration", requireAuth, aiLimiter, generateIllustration);
router.delete("/stories/:id", requireAuth, remove);

export default router;
