import {
  EVENT,
  STORE_META,
  META_KEY_WEEKLY_BONUS_WALLET,
  META_KEY_WEEKLY_GOALS_V2,
  META_KEY_WEEKLY_PROGRESS_ADJUSTMENTS_V1,
  META_KEY_WEEKLY_WALLET_ADJUSTMENTS_V1,
} from "../app/constants.js";
import { withTx, reqToPromise } from "../storage/db.js";
import { listDays, getDay } from "../storage/repositories/daysRepo.js";
import { listEventsByDayAndType } from "../storage/repositories/eventsRepo.js";
import { dayKeyFromDate } from "./dates.js";
import { logEvent } from "./events.js";
import { newId } from "./id.js";

const WEEKLY_PENALTY_DEFAULT_PERCENT = 50;
const WEEKLY_OVERTAKE_DAILY_BONUS = 50;

export function getWeeklyPenaltyDefaultPercent() {
  return WEEKLY_PENALTY_DEFAULT_PERCENT;
}

export function getWeeklyOvertakeDailyBonus() {
  return WEEKLY_OVERTAKE_DAILY_BONUS;
}

export async function listWeeklyGoals(state) {
  const goals = await readGoals(state.db);
  return goals
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function createWeeklyGoal(state, payload, referenceDate = null) {
  const baseDate = referenceDate || new Date();
  await applyWeeklyGoalSettlementIfNeeded(state, baseDate);
  const { startKey, endKey } = getWeekRange(baseDate);
  const goals = await readGoals(state.db);
  const activeGoal = goals.find((goal) => !goal?.settlement && goal.weekEndKey >= startKey);
  if (activeGoal) {
    throw new Error("Existe meta semanal ativa. Nova meta so pode ser cadastrada apos conclusao da meta atual.");
  }

  const normalized = normalizeGoalPayload(payload);
  const now = new Date().toISOString();
  const goal = {
    id: newId("wg"),
    weekStartKey: startKey,
    weekEndKey: endKey,
    name: normalized.name,
    targetPoints: normalized.targetPoints,
    rewardPoints: normalized.rewardPoints,
    penaltyPercent: normalized.penaltyPercent,
    createdAt: now,
    updatedAt: now,
    reachedAt: null,
    dailyBonusAwardedDayKeys: [],
    settlement: null,
  };

  goals.push(goal);
  await writeMeta(state.db, META_KEY_WEEKLY_GOALS_V2, goals);
  return goal;
}

export async function updateWeeklyGoal() {
  throw new Error("Metas semanais nao podem ser atualizadas.");
}

export async function deleteWeeklyGoal() {
  throw new Error("Metas semanais nao podem ser excluidas.");
}

export async function getWeeklyGoal(state) {
  const config = await getWeeklyGoalConfig(state);
  return config.points;
}

export async function getWeeklyGoalConfig(state, referenceDate = null) {
  const baseDate = referenceDate || toReferenceDate(state.currentDay);
  const { startKey, endKey } = getWeekRange(baseDate);
  const goals = await readGoals(state.db);
  const goal = goals.find((item) => item.weekStartKey === startKey) || null;
  return {
    id: goal?.id || null,
    name: goal?.name || "",
    points: Number(goal?.targetPoints) || 0,
    rewardPoints: Number(goal?.rewardPoints) || 0,
    penaltyPercent: Number(goal?.penaltyPercent) || WEEKLY_PENALTY_DEFAULT_PERCENT,
    weekStartKey: startKey,
    weekEndKey: endKey,
    createdAt: goal?.createdAt || null,
  };
}

export async function getWeeklyProgress(state, referenceDate = new Date()) {
  const { start, end, startKey, endKey } = getWeekRange(referenceDate);
  const goals = await readGoals(state.db);
  const goal = goals.find((item) => item.weekStartKey === startKey) || null;
  const points = await sumWeekPoints(state.db, startKey, endKey, goal?.id || null);
  const walletBalance = await getLifetimeWeeklyBonusBalance(state);

  if (!goal) {
    return {
      goal: 0,
      goalId: null,
      goalName: "",
      rewardPoints: 0,
      penaltyPercent: WEEKLY_PENALTY_DEFAULT_PERCENT,
      penaltyPoints: 0,
      points,
      percent: 0,
      status: "no_goal",
      weekStart: start,
      weekEnd: end,
      weekStartKey: startKey,
      weekEndKey: endKey,
      walletBalance,
      settlement: null,
      createdAt: null,
      overtakeDailyBonus: WEEKLY_OVERTAKE_DAILY_BONUS,
      overtakeBonusAwardedPoints: 0,
    };
  }

  const goalPoints = Number(goal.targetPoints) || 0;
  const rewardPoints = Number(goal.rewardPoints) || 0;
  const penaltyPercent = Number(goal.penaltyPercent) || WEEKLY_PENALTY_DEFAULT_PERCENT;
  const penaltyPoints = Math.round(rewardPoints * (penaltyPercent / 100));
  const percent = goalPoints > 0 ? Math.max(0, Math.min(100, (points / goalPoints) * 100)) : 0;
  const overtakeBonusAwardedCount = Array.isArray(goal.dailyBonusAwardedDayKeys)
    ? goal.dailyBonusAwardedDayKeys.length
    : 0;

  return {
    goal: goalPoints,
    goalId: goal.id,
    goalName: goal.name || "",
    rewardPoints,
    penaltyPercent,
    penaltyPoints,
    points,
    percent,
    status: points >= goalPoints ? "reached" : "in_progress",
    weekStart: start,
    weekEnd: end,
    weekStartKey: startKey,
    weekEndKey: endKey,
    walletBalance,
    settlement: goal.settlement || null,
    createdAt: goal.createdAt || null,
    overtakeDailyBonus: WEEKLY_OVERTAKE_DAILY_BONUS,
    overtakeBonusAwardedPoints: overtakeBonusAwardedCount * WEEKLY_OVERTAKE_DAILY_BONUS,
    manualAdjustmentPoints: await getWeekProgressAdjustmentPoints(state.db, startKey, goal.id),
  };
}

export async function applyWeeklyGoalSettlementIfNeeded(state, referenceDate = null) {
  const baseDate = referenceDate || new Date();
  const currentDayKey = dayKeyFromDate(baseDate);
  const { startKey: currentWeekStartKey } = getWeekRange(baseDate);
  const goals = await readGoals(state.db);
  if (!goals.length) return { applied: [] };

  let changed = false;
  const applied = [];

  for (let i = 0; i < goals.length; i += 1) {
    const goal = goals[i];
    if (!goal || goal.settlement) continue;

    const weekPoints = await sumWeekPoints(state.db, goal.weekStartKey, goal.weekEndKey, goal.id);
    const reachedInfo = await findReachedInfo(state.db, goal);
    if (reachedInfo.reachedDayKey && goal.reachedAt !== reachedInfo.reachedDayKey) {
      goal.reachedAt = reachedInfo.reachedDayKey;
      changed = true;
    }

    if (reachedInfo.reachedDayKey) {
      const maxBonusDay = currentDayKey < goal.weekEndKey ? currentDayKey : goal.weekEndKey;
      const eligibleBonusDays = buildRemainingDaysAfter(reachedInfo.reachedDayKey, maxBonusDay);
      const awardedSet = new Set(Array.isArray(goal.dailyBonusAwardedDayKeys) ? goal.dailyBonusAwardedDayKeys : []);
      const newDays = eligibleBonusDays.filter((dayKey) => !awardedSet.has(dayKey));

      if (newDays.length) {
        const bonusDelta = newDays.length * WEEKLY_OVERTAKE_DAILY_BONUS;
        const walletAfterBonus = await addLifetimeWeeklyBonusBalance(state, bonusDelta);
        goal.dailyBonusAwardedDayKeys = [...awardedSet, ...newDays];
        changed = true;

        await logEvent(
          state,
          EVENT.WEEKLY_LEVEL_REWARD,
          {
            goalId: goal.id,
            goalName: goal.name,
            weekStart: goal.weekStartKey,
            weekEnd: goal.weekEndKey,
            reachedAt: reachedInfo.reachedDayKey,
            bonusType: "overtake_daily",
            daysAwarded: newDays,
            bonus: bonusDelta,
            walletAfter: walletAfterBonus,
          },
          { day: state.currentDay || currentDayKey, actor: "system", source: "weekly-goals" }
        );
      }
    }

    if (goal.weekEndKey >= currentWeekStartKey) {
      continue;
    }

    const reached = weekPoints >= (Number(goal.targetPoints) || 0);
    const rewardPoints = Number(goal.rewardPoints) || 0;
    const penaltyPercent = Number(goal.penaltyPercent) || WEEKLY_PENALTY_DEFAULT_PERCENT;
    const penaltyConfigured = Math.round(rewardPoints * (penaltyPercent / 100));

    const walletBefore = await getLifetimeWeeklyBonusBalance(state);
    let walletAfter = walletBefore;
    let rewardApplied = 0;
    let penaltyApplied = 0;
    let outcome = "none";

    if (reached) {
      rewardApplied = rewardPoints;
      walletAfter = rewardApplied > 0
        ? await addLifetimeWeeklyBonusBalance(state, rewardApplied)
        : walletBefore;
      outcome = "reward";
    } else {
      penaltyApplied = Math.min(walletBefore, penaltyConfigured);
      walletAfter = penaltyApplied > 0
        ? await spendLifetimeWeeklyBonusBalance(state, penaltyApplied)
        : walletBefore;
      outcome = "penalty";
    }

    const settlement = {
      outcome,
      reached,
      pointsAchieved: weekPoints,
      rewardApplied,
      penaltyConfigured,
      penaltyApplied,
      walletAfter,
      settledAt: new Date().toISOString(),
    };

    goals[i] = {
      ...goal,
      settlement,
      updatedAt: settlement.settledAt,
    };
    changed = true;

    await logEvent(
      state,
      EVENT.WEEKLY_GOAL_SETTLEMENT,
      {
        goalId: goal.id,
        goalName: goal.name,
        weekStart: goal.weekStartKey,
        weekEnd: goal.weekEndKey,
        reached,
        pointsAchieved: weekPoints,
        rewardConfigured: rewardPoints,
        rewardApplied,
        penaltyConfigured,
        penaltyApplied,
        walletAfter,
      },
      { day: state.currentDay || goal.weekEndKey, actor: "system", source: "weekly-goals" }
    );

    applied.push({
      goalId: goal.id,
      reached,
      rewardApplied,
      penaltyApplied,
      walletAfter,
    });
  }

  if (changed) {
    await writeMeta(state.db, META_KEY_WEEKLY_GOALS_V2, goals);
  }

  return { applied };
}

export async function applyWeeklyLevelRewardsIfNeeded(state, referenceDate = null) {
  return applyWeeklyGoalSettlementIfNeeded(state, referenceDate);
}

export async function addWeeklyProgressAdjustmentForActiveGoal(
  state,
  { points, reason = "Ajuste manual", idempotencyKey = null } = {}
) {
  const value = Math.round(Number(points));
  if (!Number.isFinite(value) || value === 0) {
    throw new Error("Ajuste de progresso semanal invalido.");
  }

  const goals = await readGoals(state.db);
  const activeGoal = goals
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .find((goal) => !goal?.settlement);

  if (!activeGoal) {
    throw new Error("Nao existe meta semanal ativa para aplicar ajuste.");
  }

  const adjustments = await readWeeklyProgressAdjustments(state.db);
  if (idempotencyKey) {
    const existing = adjustments.find((item) => item?.idempotencyKey === idempotencyKey);
    if (existing) return existing;
  }

  const adjustment = {
    id: newId("wga"),
    goalId: activeGoal.id,
    weekStartKey: activeGoal.weekStartKey,
    points: value,
    reason: String(reason || "Ajuste manual"),
    idempotencyKey: idempotencyKey || null,
    createdAt: new Date().toISOString(),
  };

  adjustments.push(adjustment);
  await writeMeta(state.db, META_KEY_WEEKLY_PROGRESS_ADJUSTMENTS_V1, adjustments);
  return adjustment;
}

export async function getLifetimeWeeklyBonusBalance(state) {
  const value = await readMetaNumber(state.db, META_KEY_WEEKLY_BONUS_WALLET, 0);
  return value > 0 ? value : 0;
}

export async function addLifetimeWeeklyBonusBalance(state, delta) {
  const value = Math.round(Number(delta));
  if (!Number.isFinite(value) || value <= 0) return getLifetimeWeeklyBonusBalance(state);
  const current = await getLifetimeWeeklyBonusBalance(state);
  const next = current + value;
  await writeMeta(state.db, META_KEY_WEEKLY_BONUS_WALLET, next);
  return next;
}

export async function spendLifetimeWeeklyBonusBalance(state, amount) {
  const value = Math.round(Number(amount));
  if (!Number.isFinite(value) || value < 0) throw new Error("Valor de gasto invalido.");
  const current = await getLifetimeWeeklyBonusBalance(state);
  if (value > current) throw new Error("Saldo acumulado insuficiente.");
  const next = current - value;
  await writeMeta(state.db, META_KEY_WEEKLY_BONUS_WALLET, next);
  return next;
}

export async function addWeeklyWalletAdjustment(
  state,
  { points, reason = "Ajuste manual de carteira semanal", idempotencyKey = null } = {}
) {
  const value = Math.round(Number(points));
  if (!Number.isFinite(value) || value === 0) {
    throw new Error("Ajuste de carteira semanal invalido.");
  }

  const adjustments = await readWeeklyWalletAdjustments(state.db);
  if (idempotencyKey) {
    const existing = adjustments.find((item) => item?.idempotencyKey === idempotencyKey);
    if (existing) return existing;
  }

  const walletBefore = await getLifetimeWeeklyBonusBalance(state);
  let walletAfter = walletBefore;

  if (value > 0) {
    walletAfter = await addLifetimeWeeklyBonusBalance(state, value);
  } else {
    const spend = Math.min(walletBefore, Math.abs(value));
    walletAfter = spend > 0 ? await spendLifetimeWeeklyBonusBalance(state, spend) : walletBefore;
  }

  const adjustment = {
    id: newId("wwa"),
    points: value,
    reason: String(reason || "Ajuste manual de carteira semanal"),
    idempotencyKey: idempotencyKey || null,
    walletBefore,
    walletAfter,
    createdAt: new Date().toISOString(),
  };

  adjustments.push(adjustment);
  await writeMeta(state.db, META_KEY_WEEKLY_WALLET_ADJUSTMENTS_V1, adjustments);
  return adjustment;
}

function normalizeGoalPayload(payload) {
  const targetPoints = Math.round(Number(payload?.targetPoints ?? payload?.points));
  const rewardPoints = Math.round(Number(payload?.rewardPoints));
  const penaltyPercent = WEEKLY_PENALTY_DEFAULT_PERCENT;
  const name = String(payload?.name || "").trim() || "Meta semanal";

  if (!Number.isFinite(targetPoints) || targetPoints <= 0) {
    throw new Error("Informe uma meta semanal valida (pontos > 0).");
  }
  if (!Number.isFinite(rewardPoints) || rewardPoints <= 0) {
    throw new Error("Informe uma recompensa valida (pontos > 0).");
  }

  return {
    name,
    targetPoints,
    rewardPoints,
    penaltyPercent,
  };
}

async function findReachedInfo(db, goal) {
  const days = await listWeekDaysWithPoints(db, goal.weekStartKey, goal.weekEndKey);
  const adjustmentPoints = await getWeekProgressAdjustmentPoints(db, goal.weekStartKey, goal.id);
  let acc = 0;
  const target = Number(goal.targetPoints) || 0;
  for (const item of days) {
    acc += item.points;
    if (acc >= target) {
      return { reachedDayKey: item.dayKey, cumulative: acc };
    }
  }
  const adjustedAcc = acc + adjustmentPoints;
  if (adjustmentPoints > 0 && adjustedAcc >= target) {
    return { reachedDayKey: goal.weekEndKey, cumulative: adjustedAcc };
  }
  return { reachedDayKey: null, cumulative: adjustedAcc };
}

function buildRemainingDaysAfter(startDayKey, endDayKey) {
  if (!startDayKey || !endDayKey || startDayKey >= endDayKey) return [];
  const start = new Date(`${startDayKey}T12:00:00`);
  const end = new Date(`${endDayKey}T12:00:00`);
  const result = [];
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= end) {
    result.push(dayKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

async function sumWeekPoints(db, startKey, endKey, goalId = null) {
  const days = await listWeekDaysWithPoints(db, startKey, endKey);
  const basePoints = days.reduce((sum, item) => sum + item.points, 0);
  const adjustmentPoints = await getWeekProgressAdjustmentPoints(db, startKey, goalId);
  return basePoints + adjustmentPoints;
}

async function listWeekDaysWithPoints(db, startKey, endKey) {
  const keys = await listDays(db);
  const weekKeys = (keys || []).filter((k) => k >= startKey && k <= endKey).sort();
  const rows = [];
  for (const dayKey of weekKeys) {
    const [day, redeemEvents] = await Promise.all([
      getDay(db, dayKey),
      listEventsByDayAndType(db, dayKey, EVENT.REWARD_REDEEM),
    ]);
    const redeemedFromDay = (redeemEvents || []).reduce((sum, event) => {
      return sum + (Number(event?.meta?.consumeFromDay) || 0);
    }, 0);
    rows.push({
      dayKey,
      points: (Number(day?.totalPoints) || 0) + redeemedFromDay,
    });
  }
  return rows;
}

function toReferenceDate(dayKey) {
  if (typeof dayKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return new Date(`${dayKey}T12:00:00`);
  }
  return new Date();
}

function getWeekRange(referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  ref.setHours(12, 0, 0, 0);
  const day = ref.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const start = new Date(ref);
  start.setDate(ref.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
    startKey: dayKeyFromDate(start),
    endKey: dayKeyFromDate(end),
  };
}

async function readGoals(db) {
  const value = await readMeta(db, META_KEY_WEEKLY_GOALS_V2, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object" && item.id && item.weekStartKey && item.weekEndKey);
}

async function readWeeklyProgressAdjustments(db) {
  const value = await readMeta(db, META_KEY_WEEKLY_PROGRESS_ADJUSTMENTS_V1, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object" && item.weekStartKey);
}

async function readWeeklyWalletAdjustments(db) {
  const value = await readMeta(db, META_KEY_WEEKLY_WALLET_ADJUSTMENTS_V1, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object" && item.id);
}

async function getWeekProgressAdjustmentPoints(db, weekStartKey, goalId = null) {
  const adjustments = await readWeeklyProgressAdjustments(db);
  return adjustments.reduce((sum, item) => {
    if (item.weekStartKey !== weekStartKey) return sum;
    if (goalId && item.goalId && item.goalId !== goalId) return sum;
    return sum + (Number(item.points) || 0);
  }, 0);
}

async function readMetaNumber(db, key, fallback = 0) {
  const value = await readMeta(db, key, fallback);
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function readMeta(db, key, fallback = null) {
  return withTx(db, [STORE_META], "readonly", async (_tx, stores) => {
    const row = await reqToPromise(stores[STORE_META].get(key));
    return row?.value ?? fallback;
  });
}

async function writeMeta(db, key, value) {
  await withTx(db, [STORE_META], "readwrite", async (_tx, stores) => {
    await reqToPromise(
      stores[STORE_META].put({
        key,
        value,
      })
    );
  });
}
