import prisma from "../prisma/client";
import { BattleStatus, BattleWinner } from "../generated/prisma/client";

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
} as const;

export const listBattles = () =>
  prisma.battle.findMany({
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
}) =>
  prisma.battle.create({
    data: {
      title: data.title,
      goal: data.goal,
      attackerId: data.attackerId,
      minTurns: data.minTurns ?? 4,
      maxTurns: data.maxTurns ?? 8,
      status: BattleStatus.WAITING,
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

// Voter
export const castVote = (battleId: string, userId: string, vote: boolean) =>
  prisma.battleVote.create({
    data: { battleId, userId, vote },
    include: { user: { select: userSelect } },
  });

export const getUserVote = (battleId: string, userId: string) =>
  prisma.battleVote.findUnique({
    where: { battleId_userId: { battleId, userId } },
  });

// Clore le vote et calculer le gagnant
export const closeVoting = async (battleId: string) => {
  const votes = await prisma.battleVote.findMany({ where: { battleId } });
  const yesCount = votes.filter((v) => v.vote).length;
  const noCount = votes.filter((v) => !v.vote).length;
  // En cas d'égalité → victoire défenseur (l'objectif n'est pas atteint)
  const winner = yesCount > noCount ? BattleWinner.ATTACKER : BattleWinner.DEFENDER;

  return prisma.battle.update({
    where: { id: battleId },
    data: { status: BattleStatus.DONE, winner },
    include: battleDetailInclude,
  });
};
