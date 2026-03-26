import { Request, Response } from "express";
import prisma from "../prisma/client";
import { ReportTargetType } from "../generated/prisma/client";

const VALID_TYPES: ReportTargetType[] = ["CONTRIBUTION", "BATTLE_MOVE", "STORY"];

// POST /api/reports
export const create = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { targetType, targetId, reason } = req.body;

  if (!targetType || !targetId?.trim()) {
    res.status(400).json({ error: "targetType et targetId sont requis" });
    return;
  }
  if (!VALID_TYPES.includes(targetType as ReportTargetType)) {
    res.status(400).json({ error: "targetType invalide" });
    return;
  }

  // Vérifier que la cible existe
  try {
    if (targetType === "CONTRIBUTION") {
      const item = await prisma.contribution.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!item) { res.status(404).json({ error: "Contribution introuvable" }); return; }
    } else if (targetType === "BATTLE_MOVE") {
      const item = await prisma.battleMove.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!item) { res.status(404).json({ error: "Move introuvable" }); return; }
    } else if (targetType === "STORY") {
      const item = await prisma.story.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!item) { res.status(404).json({ error: "Histoire introuvable" }); return; }
    }

    const report = await prisma.report.create({
      data: {
        userId,
        targetType: targetType as ReportTargetType,
        targetId: targetId.trim(),
        reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      },
    });
    res.status(201).json(report);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "Vous avez déjà signalé ce contenu." });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
};
