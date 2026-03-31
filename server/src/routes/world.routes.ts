import { Router } from "express";
import { getWorldMap } from "../controllers/world.controller";

const router = Router();

// Route publique — pas besoin d'auth, la carte est visible par tous
router.get("/world/map", getWorldMap);

export default router;
