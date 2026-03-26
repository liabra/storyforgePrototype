import prisma from "../prisma/client";
import { NotificationType } from "../generated/prisma/client";

// Notifications critiques — jamais filtrées par les préférences
const CRITICAL_TYPES: NotificationType[] = ["CONTENT_REMOVED", "USER_BANNED", "USER_UNBANNED"];

// Mapping type → champ de préférence utilisateur
function getPrefField(type: NotificationType): "notifBattleEnabled" | "notifInvitesEnabled" | "notifGeneralEnabled" | null {
  if (type === "BATTLE_INVITE") return "notifBattleEnabled";
  if (type === "STORY_INVITE") return "notifInvitesEnabled";
  if (type === "GENERAL") return "notifGeneralEnabled";
  return null;
}

export const createNotification = (userId: string, type: NotificationType, message: string) =>
  prisma.notification.create({ data: { userId, type, message } });

// Crée la notification uniquement si l'utilisateur a activé la catégorie correspondante.
// Les notifications critiques (modération, ban) ignorent toujours les préférences.
export const dispatchNotification = async (
  userId: string,
  type: NotificationType,
  message: string,
): Promise<Awaited<ReturnType<typeof createNotification>> | null> => {
  if (!CRITICAL_TYPES.includes(type)) {
    const prefField = getPrefField(type);
    if (prefField) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { notifBattleEnabled: true, notifInvitesEnabled: true, notifGeneralEnabled: true },
      });
      if (user && !user[prefField]) return null;
    }
  }
  return createNotification(userId, type, message);
};

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
