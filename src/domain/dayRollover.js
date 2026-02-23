// src/domain/dayRollover.js
// Monitora virada de dia em runtime e garante criacao automatica do novo dia.

import { dayKeyFromDate } from "./dates.js";
import { ensureDayWithDefaults } from "./defaults.js";
import { setCurrentDay } from "../app/state.js";
import { logDayCreate } from "./logs.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function syncCurrentDayWithClock(state) {
  const todayKey = dayKeyFromDate(new Date());
  const previousCurrentDay = state.currentDay;

  await ensureDayWithDefaults(state.db, todayKey);

  if (previousCurrentDay !== todayKey) {
    setCurrentDay(state, todayKey);
    if (previousCurrentDay && previousCurrentDay < todayKey) {
      await logDayCreate(state, todayKey);
    }
    return { changed: true, dayKey: todayKey };
  }

  return { changed: false, dayKey: todayKey };
}

export function startDayRolloverLoop(state, onDayChanged) {
  let timerId = null;
  let stopped = false;
  let lastObservedDay = dayKeyFromDate(new Date());

  const runSync = async () => {
    if (stopped) return;
    try {
      const result = await syncCurrentDayWithClock(state);
      if (result.changed && typeof onDayChanged === "function") {
        await onDayChanged(result.dayKey);
      }
      lastObservedDay = result.dayKey;
    } catch (err) {
      console.error("[TaskPoints] Falha no monitor de virada de dia:", err);
    }
  };

  const scheduleNextMidnight = () => {
    if (stopped) return;
    if (timerId) {
      window.clearTimeout(timerId);
    }
    const delay = msUntilNextLocalMidnight();
    timerId = window.setTimeout(async () => {
      await runSync();
      scheduleNextMidnight();
    }, delay);
  };

  const onVisibilityChange = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    const nowDay = dayKeyFromDate(new Date());
    if (nowDay !== lastObservedDay) {
      await runSync();
      scheduleNextMidnight();
    }
  };

  scheduleNextMidnight();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stopped = true;
    if (timerId) {
      window.clearTimeout(timerId);
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

function msUntilNextLocalMidnight(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  const diff = nextMidnight.getTime() - now.getTime();
  return Math.min(Math.max(diff, 1000), DAY_MS);
}
