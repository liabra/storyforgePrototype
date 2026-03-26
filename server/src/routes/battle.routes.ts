import { Router } from "express";
import {
  list, getOne, create, join, createMove, startVoting, castVote, closeVoting,
  sendInvite, myInvites, acceptInvite, declineInvite,
} from "../controllers/battle.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ── Battles ──────────────────────────────────────────────────────────────────
router.get("/battles", requireAuth, list);
router.post("/battles", requireAuth, create);
router.get("/battles/:id", requireAuth, getOne);
router.post("/battles/:id/join", requireAuth, join);
router.post("/battles/:id/moves", requireAuth, createMove);
router.post("/battles/:id/vote/start", requireAuth, startVoting);
router.post("/battles/:id/vote", requireAuth, castVote);
router.post("/battles/:id/vote/close", requireAuth, closeVoting);
router.post("/battles/:id/invite", requireAuth, sendInvite);

// ── Invitations ───────────────────────────────────────────────────────────────
router.get("/battle-invites/mine", requireAuth, myInvites);
router.post("/battle-invites/:id/accept", requireAuth, acceptInvite);
router.post("/battle-invites/:id/decline", requireAuth, declineInvite);

export default router;
