import { Request, Response } from "express";
import * as authService from "../services/auth.service";

export const register = async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "email et password sont requis" });
    return;
  }

  try {
    const result = await authService.login(email.trim().toLowerCase(), password);
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
