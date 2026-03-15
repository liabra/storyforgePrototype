import { Router } from "express";
import { seed } from "../controllers/dev.controller";

const router = Router();

router.post("/dev/seed", seed);

export default router;
