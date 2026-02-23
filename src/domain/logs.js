// src/domain/logs.js
// Camada "amigável" por cima do domain/events.js
// Aqui você cria funções semânticas que já padronizam meta, para ficar consistente e fácil de consultar.

import { EVENT } from "../app/constants.js";
import { logEvent } from "./events.js";
import { listEventsByDay, listEventsByDayAndType } from "../storage/repositories/eventsRepo.js";

/* ===========================
   DIA
=========================== */
export async function logDayCreate(state, day) {
  return logEvent(state, EVENT.DAY_CREATE, { day }, { day });
}

/* ===========================
   TASKS
=========================== */
export async function logTaskCreate(state, { taskId, day, name, points, priority, sort, category }) {
  return logEvent(
    state,
    EVENT.TASK_CREATE,
    { taskId, name, points, priority, sort, category },
    { day }
  );
}

export async function logTaskStart(state, { taskId, day, startedAt, auto = false }) {
  return logEvent(
    state,
    EVENT.TASK_START,
    { taskId, startedAt, auto },
    { day }
  );
}

export async function logTaskComplete(state, { taskId, day, pointsDelta, startedAt, completedAt, category }) {
  return logEvent(
    state,
    EVENT.TASK_COMPLETE,
    { taskId, pointsDelta, startedAt, completedAt, category },
    { day }
  );
}

export async function logTaskUncomplete(state, { taskId, day, pointsDelta, category }) {
  return logEvent(
    state,
    EVENT.TASK_UNCOMPLETE,
    { taskId, pointsDelta, category },
    { day }
  );
}

export async function logTaskDelete(state, { taskId, day, nameSnapshot, pointsSnapshot, wasCompleted, pointsDelta, category }) {
  return logEvent(
    state,
    EVENT.TASK_DELETE,
    { taskId, nameSnapshot, pointsSnapshot, wasCompleted, pointsDelta, category },
    { day }
  );
}

export async function logTaskReorder(state, { day, order, fromIndex, toIndex }) {
  return logEvent(
    state,
    EVENT.TASK_REORDER,
    { order, fromIndex, toIndex },
    { day }
  );
}

/* ===========================
   RECOMPENSAS
=========================== */
export async function logRewardCreate(state, { rewardId, name, cost }) {
  return logEvent(
    state,
    EVENT.REWARD_CREATE,
    { rewardId, name, cost },
    { day: state.currentDay }
  );
}

export async function logTaskTimerStarted(state, payload) {
  validateTaskTimerEventPayload(payload);
  return logEvent(state, EVENT.TASK_TIMER_STARTED, payload, { day: payload?.when?.day || state.currentDay });
}

export async function logTaskTimerPaused(state, payload) {
  validateTaskTimerEventPayload(payload);
  return logEvent(state, EVENT.TASK_TIMER_PAUSED, payload, { day: payload?.when?.day || state.currentDay });
}

export async function logTaskTimerResumed(state, payload) {
  validateTaskTimerEventPayload(payload);
  return logEvent(state, EVENT.TASK_TIMER_RESUMED, payload, { day: payload?.when?.day || state.currentDay });
}

export async function logTaskTimerStopped(state, payload) {
  validateTaskTimerEventPayload(payload);
  return logEvent(state, EVENT.TASK_TIMER_STOPPED, payload, { day: payload?.when?.day || state.currentDay });
}

export async function logTaskCategoryUpdate(state, { taskId, day, beforeCategory, afterCategory }) {
  return logEvent(
    state,
    EVENT.TASK_CATEGORY_UPDATE,
    { taskId, beforeCategory, afterCategory, category: afterCategory },
    { day }
  );
}

export async function logRewardDelete(state, { rewardId, nameSnapshot, costSnapshot }) {
  return logEvent(
    state,
    EVENT.REWARD_DELETE,
    { rewardId, nameSnapshot, costSnapshot },
    { day: state.currentDay }
  );
}

export async function logRewardRedeem(
  state,
  {
    day,
    rewardId,
    nameSnapshot,
    cost,
    baseCost = null,
    onboardingFactor = null,
    redemptionsTodayCount = null,
    consumeFromDay = 0,
    consumeFromWallet = 0,
    pointsAfter,
    dayPointsAfter,
    walletPointsAfter,
  }
) {
  return logEvent(
    state,
    EVENT.REWARD_REDEEM,
    {
      rewardId,
      nameSnapshot,
      cost,
      baseCost,
      onboardingFactor,
      redemptionsTodayCount,
      consumeFromDay,
      consumeFromWallet,
      pointsAfter,
      dayPointsAfter,
      walletPointsAfter,
    },
    { day }
  );
}

/* ===========================
   HÁBITOS (Templates)
=========================== */

export async function logHabitTemplateCreate(state, payload) {
  return logEvent(
    state,
    EVENT.HABIT_TEMPLATE_CREATE,
    payload,
    { day: state.currentDay }
  );
}

export async function logHabitTemplateUpdate(state, { habitId, before, after }) {
  return logEvent(
    state,
    EVENT.HABIT_TEMPLATE_UPDATE,
    { habitId, before, after },
    { day: state.currentDay }
  );
}

/* ===========================
   HÁBITOS (Execuções)
=========================== */

export async function logHabitExecute(
  state,
  { day, executionId, habitId, templateSnapshot, value, points, category, pointsAfter }
) {
  return logEvent(
    state,
    EVENT.HABIT_EXECUTE,
    { executionId, habitId, templateSnapshot, value, points, category, pointsAfter },
    { day }
  );
}

export async function logHabitUndo(state, { day, executionId, habitId, value, pointsDelta, pointsAfter }) {
  return logEvent(
    state,
    EVENT.HABIT_UNDO,
    { executionId, habitId, value, pointsDelta, pointsAfter },
    { day }
  );
}

export async function logHabitEdit(state, { day, executionId, habitId, before, after, pointsDelta, pointsAfter }) {
  return logEvent(
    state,
    EVENT.HABIT_EDIT,
    { executionId, habitId, before, after, pointsDelta, pointsAfter },
    { day }
  );
}

/* ===========================
   SISTEMA
=========================== */
export async function logMigrationRun(state, { fromVersion, toVersion }) {
  return logEvent(
    state,
    EVENT.MIGRATION_RUN,
    { fromVersion, toVersion },
    { actor: "system", source: "migration" }
  );
}

export async function logPointsRecompute(state, { day, before, after, reason }) {
  return logEvent(
    state,
    EVENT.POINTS_RECOMPUTE,
    { before, after, reason },
    { actor: "system", source: "system", day }
  );
}

export async function logBackupExport(state, { stores, exportedAt }) {
  return logEvent(
    state,
    EVENT.BACKUP_EXPORT,
    { stores, exportedAt },
    { actor: "user", source: "ui", day: state.currentDay }
  );
}

export async function logBackupImport(state, { stores, importedAt }) {
  return logEvent(
    state,
    EVENT.BACKUP_IMPORT,
    { stores, importedAt },
    { actor: "user", source: "ui", day: state.currentDay }
  );
}

export async function logWeeklyGoalSet(state, { points, rewardPoints, penaltyPercent }) {
  return logEvent(
    state,
    EVENT.WEEKLY_GOAL_SET,
    { points, rewardPoints, penaltyPercent },
    { actor: "user", source: "ui", day: state.currentDay }
  );
}

export async function logWeeklyGoalPresetSelect(state, { presetId, presetName, points }) {
  return logEvent(
    state,
    EVENT.WEEKLY_GOAL_PRESET_SELECT,
    { presetId, presetName, points },
    { actor: "user", source: "ui", day: state.currentDay }
  );
}

export async function logPenaltyMaxTrigger(
  state,
  {
    day,
    penalizedDayPoints,
    penalizedWalletPoints,
    totalPenalizedPoints,
    dayPointsBefore,
    walletBefore,
    dayPointsAfter = 0,
    walletAfter = 0,
  }
) {
  return logEvent(
    state,
    EVENT.PENALTY_MAX_TRIGGER,
    {
      penalizedDayPoints,
      penalizedWalletPoints,
      totalPenalizedPoints,
      dayPointsBefore,
      walletBefore,
      dayPointsAfter,
      walletAfter,
    },
    { actor: "user", source: "ui", day }
  );
}

export async function getPenalizedPointsForDay(state, dayKey = state.currentDay) {
  if (!dayKey) return 0;
  const items = await listEventsByDayAndType(state.db, dayKey, EVENT.PENALTY_MAX_TRIGGER);
  return (items || []).reduce((sum, item) => {
    return sum + Math.max(0, Number(item?.meta?.totalPenalizedPoints) || 0);
  }, 0);
}

export async function listEventsForDay(state, dayKey = state.currentDay) {
  if (!dayKey) return [];
  return listEventsByDay(state.db, dayKey);
}

export function validateTaskTimerEventPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload de timer invalido.");
  }

  const hasWho = typeof payload.who === "string" && payload.who.trim().length > 0;
  const hasWhat = typeof payload.what === "string" && payload.what.trim().length > 0;
  const hasWhen = payload.when && typeof payload.when === "object";
  const hasContext = payload.context && typeof payload.context === "object";
  const hasOutcome = payload.outcome && typeof payload.outcome === "object";

  if (!hasWho || !hasWhat || !hasWhen || !hasContext || !hasOutcome) {
    throw new Error("Payload de timer deve conter who/what/when/context/outcome.");
  }

  const hasDurations =
    Number.isFinite(Number(payload?.outcome?.activeDurationMs)) &&
    Number.isFinite(Number(payload?.outcome?.pausedDurationMs)) &&
    Number.isFinite(Number(payload?.outcome?.totalDurationMs));
  if (!hasDurations) {
    throw new Error("Payload de timer deve conter duracoes numericas (active/paused/total).");
  }

  const validReason =
    payload.what !== "task_timer_stopped" ||
    ["completed", "deleted", "manual"].includes(String(payload?.outcome?.reason || ""));
  if (!validReason) {
    throw new Error("Reason de task_timer_stopped invalido.");
  }
}
