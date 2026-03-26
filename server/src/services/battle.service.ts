import prisma from "../prisma/client";
import { BattleStatus, BattleWinner, StoryVisibility, BattleInviteRole, BattleInviteStatus } from "../generated/prisma/client";

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  color: true,
} as const;

// Includes pour la liste (léger)
const battleListInclude = {
  attacker: { select: userSelect },
  defender: { select: userSelect },
  _count: { select: { moves: true, votes: true } },
} as const;

// Includes pour le détail (complet)
const battleDetailInclude = {
  attacker: { select: userSelect },
  defender: { select: userSelect },
  moves: {
    include: { user: { select: userSelect } },
    orderBy: { createdAt: "asc" as const },
  },
  votes: {
    include: { user: { select: userSelect } },
    orderBy: { createdAt: "asc" as const },
  },
  invites: {
    include: { user: { select: userSelect } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export const listBattles = (userId: string) =>
  prisma.battle.findMany({
    where: {
      OR: [
        { visibility: StoryVisibility.PUBLIC },
        { attackerId: userId },
        { defenderId: userId },
        { invites: { some: { userId, status: BattleInviteStatus.ACCEPTED } } },
      ],
    },
    include: battleListInclude,
    orderBy: { createdAt: "desc" },
  });

export const getBattleById = (id: string) =>
  prisma.battle.findUnique({ where: { id }, include: battleDetailInclude });

export const createBattle = (data: {
  title: string;
  goal: string;
  attackerId: string;
  minTurns?: number;
  maxTurns?: number;
  visibility?: StoryVisibility;
}) =>
  prisma.battle.create({
    data: {
      title: data.title,
      goal: data.goal,
      attackerId: data.attackerId,
      minTurns: data.minTurns ?? 4,
      maxTurns: data.maxTurns ?? 8,
      status: BattleStatus.WAITING,
      visibility: data.visibility ?? StoryVisibility.PRIVATE,
    },
    include: battleDetailInclude,
  });

// Rejoindre comme défenseur → active la battle, premier tour à l'attaquant
export const joinAndActivate = (id: string, defenderId: string, attackerId: string) =>
  prisma.battle.update({
    where: { id },
    data: {
      defenderId,
      status: BattleStatus.ACTIVE,
      currentTurnUserId: attackerId,
    },
    include: battleDetailInclude,
  });

// Créer un move et mettre à jour le state de la battle (transaction)
export const createMove = async (battleId: string, userId: string, content: string) => {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    select: {
      attackerId: true,
      defenderId: true,
      turnCount: true,
      maxTurns: true,
    },
  });
  if (!battle) throw new Error("Battle introuvable");

  const newTurnCount = battle.turnCount + 1;
  const reachedMax = newTurnCount >= battle.maxTurns;
  const nextUserId =
    userId === battle.attackerId ? battle.defenderId : battle.attackerId;

  const [move, updatedBattle] = await prisma.$transaction([
    prisma.battleMove.create({
      data: { battleId, userId, content, turnNumber: newTurnCount },
      include: { user: { select: userSelect } },
    }),
    prisma.battle.update({
      where: { id: battleId },
      data: {
        turnCount: newTurnCount,
        currentTurnUserId: reachedMax ? null : nextUserId,
        status: reachedMax ? BattleStatus.VOTING : BattleStatus.ACTIVE,
      },
      select: { id: true, turnCount: true, currentTurnUserId: true, status: true },
    }),
  ]);

  return { move, updatedBattle };
};

// Lancer le vote manuellement (avant maxTurns, à partir de minTurns)
export const startVoting = (id: string) =>
  prisma.battle.update({
    where: { id },
    data: { status: BattleStatus.VOTING, currentTurnUserId: null },
    include: battleDetailInclude,
  });

// Voter (spectateurs uniquement — vérification en amont dans le contrôleur)
export const castVote = (battleId: string, userId: string, vote: boolean) =>
  prisma.battleVote.create({
    data: { battleId, userId, vote },
    include: { user: { select: userSelect } },
  });

export const getUserVote = (battleId: string, userId: string) =>
  prisma.battleVote.findUnique({
    where: { battleId_userId: { battleId, userId } },
  });

// Clore le vote et calculer le gagnant sur les seuls votes spectateurs
export const closeVoting = async (battleId: string) => {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    select: { attackerId: true, defenderId: true },
  });
  if (!battle) throw new Error("Battle introuvable");

  const votes = await prisma.battleVote.findMany({ where: { battleId } });
  // Seuls les votes des spectateurs (non joueurs) comptent
  const spectatorVotes = votes.filter(
    (v) => v.userId !== battle.attackerId && v.userId !== battle.defenderId,
  );
  const yesCount = spectatorVotes.filter((v) => v.vote).length;
  const noCount = spectatorVotes.filter((v) => !v.vote).length;
  // En cas d'égalité → victoire défenseur (l'objectif n'est pas atteint)
  const winner = yesCount > noCount ? BattleWinner.ATTACKER : BattleWinner.DEFENDER;

  return prisma.battle.update({
    where: { id: battleId },
    data: { status: BattleStatus.DONE, winner },
    include: battleDetailInclude,
  });
};

// ── Invitations ──────────────────────────────────────────────────────────────

export const getInviteById = (id: string) =>
  prisma.battleInvite.findUnique({
    where: { id },
    include: {
      battle: { select: { id: true, title: true, attackerId: true, defenderId: true, status: true, visibility: true } },
      user: { select: userSelect },
    },
  });

export const createInvite = (battleId: string, userId: string, role: BattleInviteRole) =>
  prisma.battleInvite.create({
    data: { battleId, userId, role, status: BattleInviteStatus.PENDING },
    include: { user: { select: userSelect } },
  });

export const getMyPendingInvites = (userId: string) =>
  prisma.battleInvite.findMany({
    where: { userId, status: BattleInviteStatus.PENDING },
    include: {
      user: { select: userSelect },
      battle: {
        select: {
          id: true,
          title: true,
          visibility: true,
          attacker: { select: userSelect },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

// Accepter une invitation
export const acceptInvite = async (inviteId: string) => {
  const invite = await prisma.battleInvite.findUnique({
    where: { id: inviteId },
    include: { battle: { select: { id: true, attackerId: true, defenderId: true, status: true } } },
  });
  if (!invite) throw new Error("Invitation introuvable");

  if (invite.role === BattleInviteRole.PLAYER) {
    if (invite.battle.defenderId) throw new Error("La place de défenseur est déjà prise");
    // Transaction : accepter + activer la battle
    const [, , updatedBattle] = await prisma.$transaction([
      prisma.battleInvite.update({ where: { id: inviteId }, data: { status: BattleInviteStatus.ACCEPTED } }),
      prisma.battleInvite.updateMany({
        where: { battleId: invite.battle.id, role: BattleInviteRole.PLAYER, status: BattleInviteStatus.PENDING, id: { not: inviteId } },
        data: { status: BattleInviteStatus.DECLINED },
      }),
      prisma.battle.update({
        where: { id: invite.battle.id },
        data: {
          defenderId: invite.userId,
          status: BattleStatus.ACTIVE,
          currentTurnUserId: invite.battle.attackerId,
        },
        include: battleDetailInclude,
      }),
    ]);
    return updatedBattle;
  } else {
    // SPECTATOR : juste accepter
    await prisma.battleInvite.update({ where: { id: inviteId }, data: { status: BattleInviteStatus.ACCEPTED } });
    return prisma.battle.findUnique({ where: { id: invite.battle.id }, include: battleDetailInclude });
  }
};

export const declineInvite = (inviteId: string) =>
  prisma.battleInvite.update({
    where: { id: inviteId },
    data: { status: BattleInviteStatus.DECLINED },
  });
