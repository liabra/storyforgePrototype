"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const activity_controller_1 = require("../controllers/activity.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get("/activity/recent", auth_1.requireAuth, activity_controller_1.getRecent);
exports.default = router;
