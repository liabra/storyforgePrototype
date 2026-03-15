import { Router } from "express";
import { getAll, getById, create, update, remove } from "../controllers/story.controller";

const router = Router();

router.get("/stories", getAll);
router.get("/stories/:id", getById);
router.post("/stories", create);
router.put("/stories/:id", update);
router.delete("/stories/:id", remove);

export default router;