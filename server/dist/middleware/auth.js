"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.optionalAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET;
/** Decode the token if present but never block the request. */
const optionalAuth = (req, _res, next) => {
    if (!JWT_SECRET) {
        next();
        return;
    }
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
        const token = header.slice(7);
        try {
            const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            req.user = { id: payload.userId, email: payload.email };
        }
        catch { /* token invalid — proceed as anonymous */ }
    }
    next();
};
exports.optionalAuth = optionalAuth;
const requireAuth = (req, res, next) => {
    if (!JWT_SECRET) {
        res.status(500).json({ error: "JWT_SECRET non configuré" });
        return;
    }
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Token manquant" });
        return;
    }
    const token = header.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = { id: payload.userId, email: payload.email };
        next();
    }
    catch {
        res.status(401).json({ error: "Token invalide ou expiré" });
    }
};
exports.requireAuth = requireAuth;
