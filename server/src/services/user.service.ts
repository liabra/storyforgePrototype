import prisma from "../prisma/client";

const PROFILE_SELECT = {
  id: true,
  email: true,
  displayName: true,
  color: true,
  bio: true,
  isAdmin: true,
  isBanned: true,
  notifBattleEnabled: true,
  notifInvitesEnabled: true,
  notifGeneralEnabled: true,
  createdAt: true,
} as const;

export const getProfile = (userId: string) =>
  prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });

export const updateProfile = (
  userId: string,
  data: {
    displayName?: string | null;
    color?: string | null;
    bio?: string | null;
    notifBattleEnabled?: boolean;
    notifInvitesEnabled?: boolean;
    notifGeneralEnabled?: boolean;
  }
) => prisma.user.update({ where: { id: userId }, data, select: PROFILE_SELECT });
