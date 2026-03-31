import { Request, Response } from "express";
import * as authService from "../services/auth.service";

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password, pseudonym } = req.body;

  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères" });
    return;
  }

  if (!email?.trim() && !pseudonym?.trim()) {
    res.status(400).json({ error: "Un email ou un pseudonyme est requis" });
    return;
  }

  try {
    const result = await authService.register(
      password,
      email?.trim().toLowerCase(),
      pseudonym?.trim()
    );
    // result.recoveryCode est présent — le client doit l'afficher une seule fois
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { identifier, password } = req.body;

  if (!identifier?.trim() || !password) {
    res.status(400).json({ error: "Identifiant et mot de passe requis" });
    return;
  }

  try {
    const result = await authService.login(identifier.trim().toLowerCase(), password);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.getMe(req.user!.id);
    res.json(user);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};

export const recover = async (req: Request, res: Response): Promise<void> => {
  const { identifier, recoveryCode, newPassword } = req.body;

  if (!identifier?.trim() || !recoveryCode?.trim() || !newPassword) {
    res.status(400).json({ error: "Tous les champs sont requis" });
    return;
  }

  try {
    const result = await authService.recoverAccount(
      identifier.trim().toLowerCase(),
      recoveryCode.trim(),
      newPassword
    );
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};
