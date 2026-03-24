"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const joinRequest_controller_1 = require("../controllers/joinRequest.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// VIEWER soumet une demande de participation
router.post("/stories/:storyId/join-requests", auth_1.requireAuth, joinRequest_controller_1.create);
// VIEWER consulte sa propre demande
router.get("/stories/:storyId/join-requests/mine", auth_1.requireAuth, joinRequest_controller_1.getMine);
// OWNER liste les demandes en attente
router.get("/stories/:storyId/join-requests", auth_1.requireAuth, joinRequest_controller_1.list);
// OWNER accepte ou refuse une demande
router.patch("/stories/:storyId/join-requests/:requestId", auth_1.requireAuth, joinRequest_controller_1.respond);
exports.default = router;
