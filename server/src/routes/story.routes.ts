import { Router } from "express";
import { getAll, getById, getPublic, getArchived, create, update, archive, unarchive, remove } from "../controllers/story.controller";
import { requireAuth, optionalAuth, requireNotBanned } from "../middleware/auth";

const router = Router();

router.get("/stories", requireAuth, getAll);
router.get("/stories/public", getPublic);    // AVANT /:id
router.get("/stories/archived", requireAuth, getArchived); // AVANT /:id
router.get("/stories/:id", optionalAuth, getById);
router.post("/stories", requireAuth, requireNotBanned, create);
router.put("/stories/:id", requireAuth, update);
router.patch("/stories/:id/archive", requireAuth, archive);
router.patch("/stories/:id/unarchive", requireAuth, unarchive);
router.delete("/stories/:id", requireAuth, remove);

export default router;
