import { Request, Response } from "express";
import * as notifService from "../services/notification.service";

// GET /api/notifications/mine
export const mine = async (req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await notifService.getMyNotifications(req.user!.id);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/notifications/:id/read
export const markRead = async (req: Request, res: Response): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const updated = await notifService.markRead(id, req.user!.id);
    res.json(updated);
  } catch (err) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};
