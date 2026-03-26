import prisma from "../prisma/client";
import { NotificationType } from "../generated/prisma/client";

export const createNotification = (userId: string, type: NotificationType, message: string) =>
  prisma.notification.create({ data: { userId, type, message } });

export const getMyNotifications = (userId: string) =>
  prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

export const markRead = async (id: string, userId: string) => {
  const notif = await prisma.notification.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!notif) throw Object.assign(new Error("Notification introuvable"), { status: 404 });
  if (notif.userId !== userId) throw Object.assign(new Error("Accès refusé"), { status: 403 });
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
};
