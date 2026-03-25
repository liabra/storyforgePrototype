import { Router } from "express";
import { list, getOne, create, join, createMove, startVoting, castVote, closeVoting } from "../controllers/battle.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Littéraux avant les routes paramétrées
router.get("/battles", requireAuth, list);
router.post("/battles", requireAuth, create);
router.get("/battles/:id", requireAuth, getOne);
router.post("/battles/:id/join", requireAuth, join);
router.post("/battles/:id/moves", requireAuth, createMove);
router.post("/battles/:id/vote/start", requireAuth, startVoting);
router.post("/battles/:id/vote", requireAuth, castVote);
router.post("/battles/:id/vote/close", requireAuth, closeVoting);

export default router;
