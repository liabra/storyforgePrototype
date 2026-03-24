"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.getProfile = void 0;
const userService = __importStar(require("../services/user.service"));
const isValidHex = (s) => /^#[0-9a-f]{6}$/i.test(s);
const getProfile = async (req, res) => {
    try {
        const user = await userService.getProfile(req.user.id);
        if (!user) {
            res.status(404).json({ error: "Utilisateur introuvable" });
            return;
        }
        res.json(user);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    const { displayName, color, bio } = req.body;
    if (color !== undefined && color !== null && !isValidHex(color)) {
        res.status(400).json({ error: "La couleur doit être au format #rrggbb" });
        return;
    }
    const data = {};
    if (displayName !== undefined)
        data.displayName = typeof displayName === "string" ? displayName.trim() || null : null;
    if (color !== undefined)
        data.color = typeof color === "string" ? color.trim() || null : null;
    if (bio !== undefined)
        data.bio = typeof bio === "string" ? bio.trim() || null : null;
    try {
        const user = await userService.updateProfile(req.user.id, data);
        res.json(user);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
};
exports.updateProfile = updateProfile;
