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
exports.me = exports.login = exports.register = void 0;
const authService = __importStar(require("../services/auth.service"));
const register = async (req, res) => {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
        res.status(400).json({ error: "email et password sont requis" });
        return;
    }
    if (typeof password !== "string" || password.length < 8) {
        res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
        return;
    }
    try {
        const result = await authService.register(email.trim().toLowerCase(), password);
        res.status(201).json(result);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
};
exports.register = register;
const login = async (req, res) => {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
        res.status(400).json({ error: "email et password sont requis" });
        return;
    }
    try {
        const result = await authService.login(email.trim().toLowerCase(), password);
        res.json(result);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
};
exports.login = login;
const me = async (req, res) => {
    try {
        const user = await authService.getMe(req.user.id);
        res.json(user);
    }
    catch (err) {
        const e = err;
        res.status(e.status ?? 500).json({ error: e.message });
    }
};
exports.me = me;
