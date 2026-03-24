"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dev_controller_1 = require("../controllers/dev.controller");
const router = (0, express_1.Router)();
router.post("/dev/seed", dev_controller_1.seed);
exports.default = router;
