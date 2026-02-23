// src/domain/rewards.js
// Regras de negocio para recompensas (catalogo) e resgates.
// Persiste em IndexedDB via repos + emite logs.

import { newId } from "./id.js";
import { isoNow } from "./dates.js";

import {
  listRewards,
  getReward,
  upsertReward,
  deleteReward as repoDeleteReward,
} from "../storage/repositories/rewardsRepo.js";

import { getDay, upsertDay } from "../storage/repositories/daysRepo.js";
import { listEventsByDayAndType } from "../storage/repositories/eventsRepo.js";
import {
  getLifetimeWeeklyBonusBalance,
  spendLifetimeWeeklyBonusBalance,
} from "./weeklyGoals.js";
import {
  calculateRewardBaseCost,
  calculateAdaptiveRewardCost,
  estimateAverageDailyPoints,
  getOnboardingFactor,
  getRewardRedemptionsCountForDay,
} from "./pointsEngine.js";

import { logRewardCreate, logRewardDelete, logRewardRedeem } from "./logs.js";
import { EVENT } from "../app/constants.js";

/**
 * Retorna catalogo de recompensas (ordenavel).
 */
export async function getRewardsCatalog(state) {
  const rewards = await listRewards(state.db);
  return (rewards || []).slice().sort((a, b) => (a.baseCost || a.cost || 0) - (b.baseCost || b.cost || 0));
}

export async function getRewardsCatalogWithDynamicCost(state) {
  const dayKey = state.currentDay;
  const rewards = await getRewardsCatalog(state);
  if (!dayKey) return rewards.map((reward) => ({ ...reward, dynamicCost: Number(reward.baseCost || reward.cost) || 0 }));

  const [onboardingFactor, redemptionsTodayCount] = await Promise.all([
    getOnboardingFactor(state.db, dayKey),
    getRewardRedemptionsCountForDay(state.db, dayKey),
  ]);

  return rewards.map((reward) => {
    const baseCost = Number(reward.baseCost || reward.cost) || 0;
    return {
      ...reward,
      baseCost,
      dynamicCost: calculateAdaptiveRewardCost({
        baseCost,
        onboardingFactor,
        redemptionsTodayCount,
      }),
      onboardingFactor,
      redemptionsTodayCount,
    };
  });
}

/**
 * Cria uma recompensa no catalogo (disponivel globalmente).
 */
export async function createReward(state, { name, rewardTier = "intermediaria", valueTier = "medio" }) {
  const cleanName = String(name || "").trim();

  if (!cleanName) throw new Error("Nome da recompensa e obrigatorio.");
  const avgDailyPoints = await estimateAverageDailyPoints(state.db);
  const baseCost = calculateRewardBaseCost({
    avgDailyPoints,
    rewardTier,
    valueTier,
  });

  const reward = {
    id: newId("r"),
    name: cleanName,
    cost: baseCost,
    baseCost,
    rewardTier,
    valueTier,
    createdAt: isoNow(),
  };

  await upsertReward(state.db, reward);
  await logRewardCreate(state, {
    rewardId: reward.id,
    name: reward.name,
    cost: reward.cost,
    baseCost,
    rewardTier,
    valueTier,
  });

  return reward;
}

/**
 * Exclui uma recompensa do catalogo.
 * Observacao: logs de resgates antigos permanecem (auditavel).
 */
export async function deleteReward(state, rewardId) {
  const reward = await getReward(state.db, rewardId);
  if (!reward) return;

  await repoDeleteReward(state.db, rewardId);
  await logRewardDelete(state, {
    rewardId: reward.id,
    nameSnapshot: reward.name,
    costSnapshot: reward.cost,
  });

  return {
    rewardId: reward.id,
    rewardName: reward.name,
    rewardCost: Number(reward.cost) || Number(reward.baseCost) || 0,
  };
}

/**
 * Resgata uma recompensa SEM remove-la do catalogo.
 * Debita a carteira escolhida no momento do resgate: dia ou carteira semanal acumulada.
 */
export async function redeemReward(state, rewardId, { source = "day" } = {}) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const reward = await getReward(state.db, rewardId);
  if (!reward) throw new Error("Recompensa nao encontrada.");

  const day = await getDay(state.db, dayKey);
  if (!day) throw new Error("Dia nao encontrado.");

  const [redemptionsTodayCount, onboardingFactor] = await Promise.all([
    getRewardRedemptionsCountForDay(state.db, dayKey),
    getOnboardingFactor(state.db, dayKey),
  ]);
  const baseCost = Number(reward.baseCost || reward.cost) || 0;
  const cost = calculateAdaptiveRewardCost({
    baseCost,
    onboardingFactor,
    redemptionsTodayCount,
  });
  const consumeSource = String(source || "day");
  if (consumeSource !== "day" && consumeSource !== "weekly") {
    throw new Error("Origem de resgate invalida.");
  }
  const dayPoints = Number(day.totalPoints) || 0;
  const walletPoints = await getLifetimeWeeklyBonusBalance(state);
  const availablePoints = consumeSource === "weekly" ? walletPoints : dayPoints;

  if (availablePoints < cost) throw new Error("Pontos insuficientes.");

  const consumeFromDay = consumeSource === "day" ? cost : 0;
  const consumeFromWallet = consumeSource === "weekly" ? cost : 0;
  const dayAfter = consumeSource === "day" ? dayPoints - cost : dayPoints;
  const walletAfter = consumeSource === "weekly"
    ? await spendLifetimeWeeklyBonusBalance(state, cost)
    : walletPoints;
  const pointsAfter = consumeSource === "day" ? dayAfter : walletAfter;

  await upsertDay(state.db, {
    ...day,
    totalPoints: dayAfter,
  });

  await logRewardRedeem(state, {
    day: dayKey,
    rewardId: reward.id,
    nameSnapshot: reward.name,
    cost,
    baseCost,
    onboardingFactor,
    redemptionsTodayCount,
    consumeSource,
    consumeFromDay,
    consumeFromWallet,
    pointsAfter,
    dayPointsAfter: dayAfter,
    walletPointsAfter: walletAfter,
  });

  return {
    pointsAfter,
    dayPointsAfter: dayAfter,
    walletPointsAfter: walletAfter,
    rewardId: reward.id,
    rewardName: reward.name,
    cost,
    baseCost,
    source: consumeSource,
  };
}

/**
 * Lista resgates do dia atual (para a secao "Resgatadas (hoje)").
 * A UI pode usar para render.
 */
export async function listRedeemedRewardsToday(state) {
  const dayKey = state.currentDay;
  if (!dayKey) return [];

  // Busca via events index (type + day)
  const events = await listEventsByDayAndType(state.db, dayKey, EVENT.REWARD_REDEEM);

  // Formato enxuto para UI
  return (events || [])
    .slice()
    .sort((a, b) => (b.seq || 0) - (a.seq || 0)) // mais recente primeiro
    .map((e) => ({
      ts: e.ts,
      rewardId: e.meta?.rewardId,
      rewardName: e.meta?.nameSnapshot,
      cost: e.meta?.cost,
    }));
}
