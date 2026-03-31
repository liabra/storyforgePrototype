import { Request, Response } from "express";
import { getWorldMapData } from "../services/world.service";

export const getWorldMap = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await getWorldMapData();
    res.json(data);
  } catch (err: unknown) {
    const e = err as { status?: number; message: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
};
