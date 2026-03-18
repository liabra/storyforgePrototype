import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/user.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/users/me", requireAuth, getProfile);
router.patch("/users/me", requireAuth, updateProfile);

export default router;
