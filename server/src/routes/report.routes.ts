import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { create } from "../controllers/report.controller";

const router = Router();

router.post("/reports", requireAuth, create);

export default router;
