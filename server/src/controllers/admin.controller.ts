import { Request, Response } from "express";
import prisma from "../prisma/client";
import { ReportStatus } from "../generated/prisma/client";
import { createNotification } from "../services/notification.service";
import { getIO } from "../socket";

const p = (v: string | string[] | undefined): string => {
  if (!v) throw new Error("Missing param");
  return Array.isArray(v) ? v[0] : v;
};

// GET /api/admin/reports?status=OPEN
export const listReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const statusParam = req.query.status as string | undefined;
    const validStatuses: ReportStatus[] = ["OPEN", "IGNORED", "RESOLVED"];
    const statusFilter: ReportStatus | undefined =
      statusParam && validStatuses.includes(statusParam as ReportStatus)
        ? (statusParam as ReportStatus)
        : "OPEN";

    const reports = await prisma.report.findMany({
      where: { status: statusFilter },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });

    // Enrichir chaque report avec le contenu cible
    const enriched = await Promise.all(
      reports.map(async (r) => {
        let contentPreview: string | null = null;
        let contentAuthor: { id: string; email: string; displayName: string | null; isBanned: boolean } | null = null;

        if (r.targetType === "CONTRIBUTION") {
          const item = await prisma.contribution.findUnique({
            where: { id: r.targetId },
            select: {
              content: true,
              user: { select: { id: true, email: true, displayName: true, isBanned: true } },
            },
          });
          if (item) {
            contentPreview = item.content.slice(0, 300);
            if (item.user) contentAuthor = item.user;
          }
        } else if (r.targetType === "BATTLE_MOVE") {
          const item = await prisma.battleMove.findUnique({
            where: { id: r.targetId },
            select: {
              content: true,
              user: { select: { id: true, email: true, displayName: true, isBanned: true } },
            },
          });
          if (item) {
            contentPreview = item.content.slice(0, 300);
            contentAuthor = item.user;
          }
        } else if (r.targetType === "STORY") {
          const item = await prisma.story.findUnique({
            where: { id: r.targetId },
            select: { title: true, description: true },
          });
          if (item) contentPreview = item.title + (item.description ? ` — ${item.description}` : "");
        }

        return { ...r, contentPreview, contentAuthor };
      }),
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/admin/reports/:id/ignore
export const ignoreReport = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  try {
    const report = await prisma.report.findUnique({ where: { id }, select: { id: true } });
    if (!report) { res.status(404).json({ error: "Signalement introuvable" }); return; }

    const updated = await prisma.report.update({
      where: { id },
      data: { status: "IGNORED" },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// DELETE /api/admin/content  body: { targetType, targetId }
export const deleteContent = async (req: Request, res: Response): Promise<void> => {
  const { targetType, targetId } = req.body;

  if (!targetType || !targetId?.trim()) {
    res.status(400).json({ error: "targetType et targetId sont requis" });
    return;
  }

  const validTypes = ["CONTRIBUTION", "BATTLE_MOVE", "STORY"];
  if (!validTypes.includes(targetType)) {
    res.status(400).json({ error: "targetType invalide" });
    return;
  }

  try {
    let authorId: string | null = null;

    if (targetType === "CONTRIBUTION") {
      const item = await prisma.contribution.findUnique({ where: { id: targetId }, select: { id: true, userId: true } });
      if (!item) { res.status(404).json({ error: "Contribution introuvable" }); return; }
      authorId = item.userId;
      await prisma.contribution.delete({ where: { id: targetId } });
    } else if (targetType === "BATTLE_MOVE") {
      const item = await prisma.battleMove.findUnique({ where: { id: targetId }, select: { id: true, userId: true } });
      if (!item) { res.status(404).json({ error: "Move introuvable" }); return; }
      authorId = item.userId;
      await prisma.battleMove.delete({ where: { id: targetId } });
    } else if (targetType === "STORY") {
      const item = await prisma.story.findUnique({
        where: { id: targetId },
        select: { id: true, participants: { where: { role: "OWNER" }, select: { userId: true }, take: 1 } },
      });
      if (!item) { res.status(404).json({ error: "Histoire introuvable" }); return; }
      authorId = item.participants[0]?.userId ?? null;
      await prisma.story.delete({ where: { id: targetId } });
    }

    // Marquer les reports liés comme RESOLVED
    await prisma.report.updateMany({
      where: { targetType, targetId, status: "OPEN" },
      data: { status: "RESOLVED" },
    });

    // Notifier l'auteur du contenu supprimé
    if (authorId) {
      const notif = await createNotification(
        authorId,
        "CONTENT_REMOVED",
        "Un de vos contenus a été retiré car il ne respecte pas les règles de Storyforge.",
      );
      getIO()?.to(`user:${authorId}`).emit("notification:new", notif);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/admin/users/:id/ban
export const banUser = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isAdmin: true } });
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }
    if (user.isAdmin) { res.status(409).json({ error: "Impossible de bannir un admin" }); return; }

    const updated = await prisma.user.update({
      where: { id },
      data: { isBanned: true },
      select: { id: true, email: true, displayName: true, isBanned: true },
    });

    const notif = await createNotification(
      id,
      "USER_BANNED",
      "Votre compte a été suspendu pour non-respect des règles de Storyforge.",
    );
    getIO()?.to(`user:${id}`).emit("notification:new", notif);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};

// POST /api/admin/users/:id/unban
export const unbanUser = async (req: Request, res: Response): Promise<void> => {
  const id = p(req.params.id);
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) { res.status(404).json({ error: "Utilisateur introuvable" }); return; }

    const updated = await prisma.user.update({
      where: { id },
      data: { isBanned: false },
      select: { id: true, email: true, displayName: true, isBanned: true },
    });

    const notif = await createNotification(
      id,
      "USER_UNBANNED",
      "Votre compte a de nouveau accès aux interactions sur Storyforge.",
    );
    getIO()?.to(`user:${id}`).emit("notification:new", notif);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
};
