import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../prisma/client";

const SALT_ROUNDS = 12;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET non configuré");
  return secret;
}

function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, getSecret(), { expiresIn: "7d" });
}

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

const USER_SELECT = { id: true, email: true, displayName: true, color: true, bio: true, createdAt: true } as const;

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw httpError("Email déjà utilisé", 409);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: USER_SELECT,
  });

  return { token: signToken(user.id, user.email), user };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw httpError("Identifiants invalides", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw httpError("Identifiants invalides", 401);

  return {
    token: signToken(user.id, user.email),
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });
  if (!user) throw httpError("Utilisateur introuvable", 404);
  return user;
}
