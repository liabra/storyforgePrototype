import { Request, Response } from "express";
import * as activityService from "../services/activity.service";

export const getRecent = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Auth required" });
  const items = await activityService.getRecentActivity(req.user.id);
  return res.json(items);
};
