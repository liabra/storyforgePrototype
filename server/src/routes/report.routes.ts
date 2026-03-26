import { Router } from "express";
import { requireAuth, requireNotBanned } from "../middleware/auth";
import { create } from "../controllers/report.controller";

const router = Router();

router.post("/reports", requireAuth, requireNotBanned, create);

export default router;
