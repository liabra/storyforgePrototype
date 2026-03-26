import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { listReports, ignoreReport, deleteContent, banUser, unbanUser } from "../controllers/admin.controller";

const router = Router();

const guard = [requireAuth, requireAdmin];

router.get("/admin/reports", ...guard, listReports);
router.post("/admin/reports/:id/ignore", ...guard, ignoreReport);
router.delete("/admin/content", ...guard, deleteContent);
router.post("/admin/users/:id/ban", ...guard, banUser);
router.post("/admin/users/:id/unban", ...guard, unbanUser);

export default router;
