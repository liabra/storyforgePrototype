import { Router } from "express";
import { getAll, getById, create, update, remove } from "../controllers/story.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/stories", requireAuth, getAll);
router.get("/stories/:id", getById);
router.post("/stories", requireAuth, create);
router.put("/stories/:id", requireAuth, update);
router.delete("/stories/:id", requireAuth, remove);

export default router;