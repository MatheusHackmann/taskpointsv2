import { newId } from "./id.js";
import { isoNow } from "./dates.js";
import { getTask } from "../storage/repositories/tasksRepo.js";
import { getOpenTaskTimerSessionByTask, upsertTaskTimerSession } from "../storage/repositories/taskTimerSessionsRepo.js";
import { isTaskTimerEnabled } from "../app/featureFlags.js";
import {
  logTaskTimerStarted,
  logTaskTimerPaused,
  logTaskTimerResumed,
  logTaskTimerStopped,
  validateTaskTimerEventPayload,
} from "./logs.js";

const STOP_REASONS = new Set(["completed", "deleted", "manual"]);

export async function startTaskTimer(state, taskId, day = state.currentDay, options = {}) {
  if (!isTaskTimerEnabled(state)) {
    return { changed: false, disabled: true };
  }

  const task = await getTask(state.db, taskId);
  if (!task) throw new Error("Task nao encontrada.");
  if (task.day !== day) throw new Error("Task nao pertence ao dia atual.");

  const current = await getOpenTaskTimerSessionByTask(state.db, day, taskId);
  if (current) {
    return {
      changed: false,
      alreadyActive: current.status === "active",
      alreadyPaused: current.status === "paused",
      session: current,
      snapshot: buildTimerSnapshot(current),
    };
  }

  const startedAt = isoNow();
  const session = {
    id: newId("tts"),
    day,
    taskId,
    status: "active",
    startedAt,
    stoppedAt: null,
    stopReason: null,
    pauseCount: 0,
    pauses: [],
    activeDurationMs: 0,
    pausedDurationMs: 0,
    totalDurationMs: 0,
    updatedAt: startedAt,
  };

  await upsertTaskTimerSession(state.db, session);

  const payload = {
    who: "local-user",
    what: "task_timer_started",
    when: { ts: startedAt, day },
    context: {
      taskId,
      origin: options.origin || "task_start",
      pauseCount: 0,
      category: String(task?.category || ""),
    },
    outcome: {
      activeDurationMs: 0,
      pausedDurationMs: 0,
      totalDurationMs: 0,
      reason: null,
    },
  };
  validateTaskTimerEventPayload(payload);
  await logTaskTimerStarted(state, payload);

  return { changed: true, session, snapshot: buildTimerSnapshot(session) };
}

export async function pauseTaskTimer(state, taskId, day = state.currentDay, options = {}) {
  if (!isTaskTimerEnabled(state)) {
    return { changed: false, disabled: true };
  }

  const session = await getOpenTaskTimerSessionByTask(state.db, day, taskId);
  if (!session) return { changed: false, missingSession: true };
  if (session.status === "paused") return { changed: false, alreadyPaused: true, session, snapshot: buildTimerSnapshot(session) };

  const pausedAt = isoNow();
  const pauses = [...(session.pauses || []), { pausedAt, resumedAt: null }];
  const pauseCount = Number(session.pauseCount || 0) + 1;
  const durations = computeDurations({ ...session, pauses }, pausedAt);

  const updated = {
    ...session,
    status: "paused",
    pauses,
    pauseCount,
    activeDurationMs: durations.activeDurationMs,
    pausedDurationMs: durations.pausedDurationMs,
    totalDurationMs: durations.totalDurationMs,
    updatedAt: pausedAt,
  };

  await upsertTaskTimerSession(state.db, updated);

  const payload = {
    who: "local-user",
    what: "task_timer_paused",
    when: { ts: pausedAt, day },
    context: {
      taskId,
      origin: options.origin || "task_pause",
      pauseCount,
      category: String(options.category || ""),
    },
    outcome: {
      activeDurationMs: updated.activeDurationMs,
      pausedDurationMs: updated.pausedDurationMs,
      totalDurationMs: updated.totalDurationMs,
      reason: null,
    },
  };
  validateTaskTimerEventPayload(payload);
  await logTaskTimerPaused(state, payload);

  return { changed: true, session: updated, snapshot: buildTimerSnapshot(updated) };
}

export async function resumeTaskTimer(state, taskId, day = state.currentDay, options = {}) {
  if (!isTaskTimerEnabled(state)) {
    return { changed: false, disabled: true };
  }

  const session = await getOpenTaskTimerSessionByTask(state.db, day, taskId);
  if (!session) return { changed: false, missingSession: true };
  if (session.status === "active") return { changed: false, alreadyActive: true, session, snapshot: buildTimerSnapshot(session) };

  const resumedAt = isoNow();
  const pauses = [...(session.pauses || [])];
  const openPauseIndex = findLastOpenPauseIndex(pauses);
  if (openPauseIndex < 0) return { changed: false, invalidState: true, session, snapshot: buildTimerSnapshot(session) };
  pauses[openPauseIndex] = {
    ...pauses[openPauseIndex],
    resumedAt,
  };

  const durations = computeDurations({ ...session, pauses }, resumedAt);

  const updated = {
    ...session,
    status: "active",
    pauses,
    activeDurationMs: durations.activeDurationMs,
    pausedDurationMs: durations.pausedDurationMs,
    totalDurationMs: durations.totalDurationMs,
    updatedAt: resumedAt,
  };

  await upsertTaskTimerSession(state.db, updated);

  const payload = {
    who: "local-user",
    what: "task_timer_resumed",
    when: { ts: resumedAt, day },
    context: {
      taskId,
      origin: options.origin || "task_resume",
      pauseCount: Number(updated.pauseCount || 0),
      category: String(options.category || ""),
    },
    outcome: {
      activeDurationMs: updated.activeDurationMs,
      pausedDurationMs: updated.pausedDurationMs,
      totalDurationMs: updated.totalDurationMs,
      reason: null,
    },
  };
  validateTaskTimerEventPayload(payload);
  await logTaskTimerResumed(state, payload);

  return { changed: true, session: updated, snapshot: buildTimerSnapshot(updated) };
}

export async function stopTaskTimer(state, taskId, day = state.currentDay, reason = "manual", options = {}) {
  ensureValidStopReason(reason);

  const session = await getOpenTaskTimerSessionByTask(state.db, day, taskId);
  if (!session) return { changed: false, missingSession: true };

  const stoppedAt = isoNow();
  const durations = computeDurations(session, stoppedAt);
  const updated = {
    ...session,
    status: "stopped",
    stopReason: reason,
    stoppedAt,
    activeDurationMs: durations.activeDurationMs,
    pausedDurationMs: durations.pausedDurationMs,
    totalDurationMs: durations.totalDurationMs,
    updatedAt: stoppedAt,
  };

  await upsertTaskTimerSession(state.db, updated);

  const payload = {
    who: "local-user",
    what: "task_timer_stopped",
    when: { ts: stoppedAt, day },
    context: {
      taskId,
      origin: options.origin || "task_stop",
      pauseCount: Number(updated.pauseCount || 0),
      category: String(options.category || ""),
    },
    outcome: {
      activeDurationMs: updated.activeDurationMs,
      pausedDurationMs: updated.pausedDurationMs,
      totalDurationMs: updated.totalDurationMs,
      reason,
    },
  };
  validateTaskTimerEventPayload(payload);
  await logTaskTimerStopped(state, payload);

  return { changed: true, session: updated, snapshot: buildTimerSnapshot(updated, stoppedAt) };
}

export async function getTaskTimerState(state, taskId, day = state.currentDay) {
  if (!isTaskTimerEnabled(state)) {
    return {
      enabled: false,
      status: "disabled",
      activeDurationMs: 0,
      pausedDurationMs: 0,
      totalDurationMs: 0,
      pauseCount: 0,
      startedAt: null,
      stoppedAt: null,
      stopReason: null,
    };
  }

  const session = await getOpenTaskTimerSessionByTask(state.db, day, taskId);
  if (!session) {
    return {
      enabled: true,
      status: "idle",
      activeDurationMs: 0,
      pausedDurationMs: 0,
      totalDurationMs: 0,
      pauseCount: 0,
      startedAt: null,
      stoppedAt: null,
      stopReason: null,
    };
  }

  return buildTimerSnapshot(session);
}

function buildTimerSnapshot(session, nowIso = isoNow()) {
  const durations = computeDurations(session, nowIso);
  return {
    enabled: true,
    sessionId: session.id,
    status: session.status,
    activeDurationMs: durations.activeDurationMs,
    pausedDurationMs: durations.pausedDurationMs,
    totalDurationMs: durations.totalDurationMs,
    pauseCount: Number(session.pauseCount || 0),
    startedAt: session.startedAt || null,
    stoppedAt: session.stoppedAt || null,
    stopReason: session.stopReason || null,
  };
}

function computeDurations(session, nowIso = isoNow()) {
  const startMs = toMs(session?.startedAt);
  if (!Number.isFinite(startMs)) {
    return { activeDurationMs: 0, pausedDurationMs: 0, totalDurationMs: 0 };
  }

  const status = String(session?.status || "active");
  const stoppedMs = toMs(session?.stoppedAt);
  const nowMs = toMs(nowIso);
  const endMs = Number.isFinite(stoppedMs)
    ? stoppedMs
    : (Number.isFinite(nowMs) ? nowMs : Date.now());

  const pauses = Array.isArray(session?.pauses) ? session.pauses : [];
  let activeDurationMs = 0;
  let pausedDurationMs = 0;
  let cursorMs = startMs;

  for (const pause of pauses) {
    const pausedAtMs = toMs(pause?.pausedAt);
    if (!Number.isFinite(pausedAtMs)) continue;

    const pauseStartMs = clamp(pausedAtMs, cursorMs, endMs);
    if (pauseStartMs > cursorMs) {
      activeDurationMs += pauseStartMs - cursorMs;
    }

    const resumedAtMs = toMs(pause?.resumedAt);
    if (Number.isFinite(resumedAtMs)) {
      const pauseEndMs = clamp(resumedAtMs, pauseStartMs, endMs);
      pausedDurationMs += Math.max(0, pauseEndMs - pauseStartMs);
      cursorMs = pauseEndMs;
      continue;
    }

    pausedDurationMs += Math.max(0, endMs - pauseStartMs);
    cursorMs = endMs;
    break;
  }

  if (cursorMs < endMs && status !== "paused") {
    activeDurationMs += endMs - cursorMs;
  }

  const totalDurationMs = Math.max(0, endMs - startMs);
  return {
    activeDurationMs: Math.max(0, activeDurationMs),
    pausedDurationMs: Math.max(0, pausedDurationMs),
    totalDurationMs,
  };
}

function ensureValidStopReason(reason) {
  if (!STOP_REASONS.has(String(reason || "").toLowerCase())) {
    throw new Error("Motivo de encerramento invalido.");
  }
}

function toMs(isoValue) {
  if (!isoValue) return NaN;
  const value = new Date(isoValue).getTime();
  return Number.isFinite(value) ? value : NaN;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function findLastOpenPauseIndex(pauses) {
  for (let index = pauses.length - 1; index >= 0; index -= 1) {
    const item = pauses[index];
    if (item && item.pausedAt && !item.resumedAt) return index;
  }
  return -1;
}
