import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import prisma from "../prisma/client";

const SALT_ROUNDS = 12;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET non configuré");
  return secret;
}

function signToken(userId: string, subject: string): string {
  return jwt.sign({ userId, email: subject }, getSecret(), { expiresIn: "7d" });
}

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

const USER_SELECT = {
  id: true,
  email: true,
  pseudonym: true,
  displayName: true,
  color: true,
  bio: true,
  isAdmin: true,
  isBanned: true,
  createdAt: true,
} as const;

// ── Code de récupération ───────────────────────────────────────────────────────

const WORD_LIST = [
  "forêt","lune","cristal","vague","ombre","tour","encre","fil","pierre",
  "voile","brume","seuil","flamme","carte","épée","clé","pont","nuage",
  "rivière","étoile","crépuscule","aube","sentier","caverne","tempête",
  "miroir","plume","ancre","lanterne","silence"
];

function generateRecoveryCode(): string {
  const words: string[] = [];
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    words.push(WORD_LIST[bytes[i] % WORD_LIST.length]);
  }
  return words.join(" · ");
}

async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS);
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(
  password: string,
  email?: string,
  pseudonym?: string
) {
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) throw httpError("Email déjà utilisé", 409);
  }

  if (!email && !pseudonym?.trim()) {
    throw httpError("Un pseudonyme est requis sans email", 400);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashRecoveryCode(recoveryCode);

  const user = await prisma.user.create({
    data: {
      email: email ?? null,
      pseudonym: pseudonym?.trim() ?? null,
      displayName: pseudonym?.trim() ?? email?.split("@")[0] ?? null,
      passwordHash,
      recoveryCodeHash,
    },
    select: USER_SELECT,
  });

  return {
    token: signToken(user.id, user.email ?? user.id),
    user,
    recoveryCode, // affiché une seule fois à l'utilisateur
  };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function login(identifier: string, password: string) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { pseudonym: identifier },
      ],
    },
  });
  if (!user) throw httpError("Identifiants invalides", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw httpError("Identifiants invalides", 401);

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: USER_SELECT,
  });
  return { token: signToken(user.id, user.email ?? user.id), user: profile };
}

// ── Récupération de compte ────────────────────────────────────────────────────

export async function recoverAccount(
  identifier: string,
  recoveryCode: string,
  newPassword: string
) {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { pseudonym: identifier },
      ],
    },
  });
  if (!user || !user.recoveryCodeHash) {
    throw httpError("Compte introuvable ou sans code de récupération", 404);
  }

  const valid = await bcrypt.compare(recoveryCode, user.recoveryCodeHash);
  if (!valid) throw httpError("Code de récupération invalide", 401);

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const profile = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
    select: USER_SELECT,
  });

  return {
    token: signToken(profile.id, profile.email ?? profile.id),
    user: profile,
  };
}

// ── Me ────────────────────────────────────────────────────────────────────────

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_SELECT,
  });
  if (!user) throw httpError("Utilisateur introuvable", 404);
  return user;
}
