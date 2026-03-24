"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const PROFILE_SELECT = {
    id: true,
    email: true,
    displayName: true,
    color: true,
    bio: true,
    createdAt: true,
};
const getProfile = (userId) => client_1.default.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
exports.getProfile = getProfile;
const updateProfile = (userId, data) => client_1.default.user.update({ where: { id: userId }, data, select: PROFILE_SELECT });
exports.updateProfile = updateProfile;
