import { Router } from "express";
import { list, add, updateRole, remove } from "../controllers/participant.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/stories/:storyId/participants", requireAuth, list);
router.post("/stories/:storyId/participants", requireAuth, add);
router.patch("/stories/:storyId/participants/:userId", requireAuth, updateRole);
router.delete("/stories/:storyId/participants/:userId", requireAuth, remove);

export default router;
