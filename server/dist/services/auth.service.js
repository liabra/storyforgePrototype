"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.getMe = getMe;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = __importDefault(require("../prisma/client"));
const SALT_ROUNDS = 12;
function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET non configuré");
    return secret;
}
function signToken(userId, email) {
    return jsonwebtoken_1.default.sign({ userId, email }, getSecret(), { expiresIn: "7d" });
}
function httpError(message, status) {
    return Object.assign(new Error(message), { status });
}
const USER_SELECT = { id: true, email: true, displayName: true, color: true, bio: true, createdAt: true };
async function register(email, password) {
    const existing = await client_1.default.user.findUnique({ where: { email } });
    if (existing)
        throw httpError("Email déjà utilisé", 409);
    const passwordHash = await bcrypt_1.default.hash(password, SALT_ROUNDS);
    const user = await client_1.default.user.create({
        data: { email, passwordHash },
        select: USER_SELECT,
    });
    return { token: signToken(user.id, user.email), user };
}
async function login(email, password) {
    const user = await client_1.default.user.findUnique({ where: { email } });
    if (!user)
        throw httpError("Identifiants invalides", 401);
    const valid = await bcrypt_1.default.compare(password, user.passwordHash);
    if (!valid)
        throw httpError("Identifiants invalides", 401);
    const profile = await client_1.default.user.findUniqueOrThrow({
        where: { id: user.id },
        select: USER_SELECT,
    });
    return { token: signToken(user.id, user.email), user: profile };
}
async function getMe(userId) {
    const user = await client_1.default.user.findUnique({
        where: { id: userId },
        select: USER_SELECT,
    });
    if (!user)
        throw httpError("Utilisateur introuvable", 404);
    return user;
}
