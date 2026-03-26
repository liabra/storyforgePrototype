import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;

export interface JwtPayload {
  userId: string;
  email: string;
}

/** Decode the token if present but never block the request. */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  if (!JWT_SECRET) { next(); return; }
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      req.user = { id: payload.userId, email: payload.email };
    } catch { /* token invalid — proceed as anonymous */ }
  }
  next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
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
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = { id: payload.userId, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
};

/** Block banned users from write actions. Must run after requireAuth. */
export const requireNotBanned = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) { next(); return; }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isBanned: true } });
    if (user?.isBanned) {
      res.status(403).json({ error: "Votre compte ne peut pas effectuer cette action." });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Erreur de vérification du compte" });
  }
};

/** Only admin users may pass. Must run after requireAuth. */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Non authentifié" }); return; }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isAdmin: true } });
    if (!user?.isAdmin) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Erreur de vérification du compte" });
  }
};
