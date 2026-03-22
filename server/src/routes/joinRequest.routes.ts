import { Router } from "express";
import { create, list, getMine, respond } from "../controllers/joinRequest.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

// VIEWER soumet une demande de participation
router.post("/stories/:storyId/join-requests", requireAuth, create);

// VIEWER consulte sa propre demande
router.get("/stories/:storyId/join-requests/mine", requireAuth, getMine);

// OWNER liste les demandes en attente
router.get("/stories/:storyId/join-requests", requireAuth, list);

// OWNER accepte ou refuse une demande
router.patch("/stories/:storyId/join-requests/:requestId", requireAuth, respond);

export default router;
