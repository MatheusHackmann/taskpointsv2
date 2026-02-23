// src/domain/pointsEngine.js
// Motor de pontuacao e precificacao adaptativa baseado em faixas comportamentais.

import { listDays, getDay } from "../storage/repositories/daysRepo.js";
import { listEventsByDayAndType } from "../storage/repositories/eventsRepo.js";
import { EVENT } from "../app/constants.js";

const TASK_COMPLEXITY_MULT = Object.freeze({
  baixa: 1.0,
  media: 1.35,
  alta: 1.7,
});

const TASK_AVERSION_MULT = Object.freeze({
  baixa: 1.0,
  media: 1.25,
  alta: 1.45,
});

const TASK_IMPACT_MULT = Object.freeze({
  baixo: 1.0,
  medio: 1.35,
  alto: 1.65,
});

const HABIT_TIER_BASE = Object.freeze({
  micro: 4,
  moderado: 14,
  profundo: 30,
});

const HABIT_EFFORT_MULT = Object.freeze({
  baixa: 1.0,
  media: 1.2,
  alta: 1.4,
});

const REWARD_TIER_FACTOR = Object.freeze({
  imediata: 1.2,
  intermediaria: 2.8,
  premium: 5.5,
});

const REWARD_VALUE_FACTOR = Object.freeze({
  baixo: 0.9,
  medio: 1.0,
  alto: 1.15,
});

const DAILY_REDEEM_FACTOR = [1.0, 1.25, 1.55, 1.9, 2.25];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTier(raw, fallback, allowed) {
  const key = String(raw || "").trim().toLowerCase();
  return allowed.includes(key) ? key : fallback;
}

export function calculateTaskPoints({
  complexity = "media",
  aversion = "media",
  impact = "medio",
} = {}) {
  const complexityKey = normalizeTier(complexity, "media", ["baixa", "media", "alta"]);
  const aversionKey = normalizeTier(aversion, "media", ["baixa", "media", "alta"]);
  const impactKey = normalizeTier(impact, "medio", ["baixo", "medio", "alto"]);

  const base = 20;
  const raw = base
    * TASK_COMPLEXITY_MULT[complexityKey]
    * TASK_AVERSION_MULT[aversionKey]
    * TASK_IMPACT_MULT[impactKey];

  return clamp(Math.round(raw), 5, 140);
}

export function calculateHabitPoints({
  habitTier = "moderado",
  effort = "media",
  dailyTarget = 1,
} = {}) {
  const tierKey = normalizeTier(habitTier, "moderado", ["micro", "moderado", "profundo"]);
  const effortKey = normalizeTier(effort, "media", ["baixa", "media", "alta"]);
  const target = Math.max(1, Math.round(Number(dailyTarget) || 1));

  let targetFactor = 1.0;
  if (target <= 3) targetFactor = 0.9;
  if (target >= 4 && target <= 6) targetFactor = 0.8;
  if (target > 6) targetFactor = 0.7;

  const raw = HABIT_TIER_BASE[tierKey] * HABIT_EFFORT_MULT[effortKey] * targetFactor;
  return clamp(Math.round(raw), 2, 60);
}

export async function estimateAverageDailyPoints(db, lookbackDays = 14) {
  const keys = (await listDays(db)).slice().sort();
  const recent = keys.slice(-Math.max(1, lookbackDays));
  if (!recent.length) return 60;

  const rows = await Promise.all(recent.map((dayKey) => getDay(db, dayKey)));
  const values = rows
    .map((row) => Math.max(0, Number(row?.totalPoints) || 0))
    .filter((n) => Number.isFinite(n));

  if (!values.length) return 60;

  const total = values.reduce((sum, n) => sum + n, 0);
  return Math.max(30, Math.round(total / values.length));
}

export async function getOnboardingFactor(db, referenceDayKey = null) {
  const keys = (await listDays(db)).slice().sort();
  if (!keys.length) return 0.7;

  const firstDay = keys[0];
  const currentDay = referenceDayKey && /^\d{4}-\d{2}-\d{2}$/.test(referenceDayKey)
    ? referenceDayKey
    : keys[keys.length - 1];

  const start = new Date(`${firstDay}T12:00:00`);
  const end = new Date(`${currentDay}T12:00:00`);
  const diffDays = Math.max(0, Math.floor((end - start) / 86400000));
  const weekNumber = Math.floor(diffDays / 7) + 1;

  if (weekNumber <= 1) return 0.7;
  if (weekNumber === 2) return 0.85;
  if (weekNumber === 3) return 1.0;
  if (weekNumber === 4) return 1.1;
  return clamp(1.1 + (weekNumber - 4) * 0.05, 1.1, 1.25);
}

export function calculateRewardBaseCost({
  avgDailyPoints = 60,
  rewardTier = "intermediaria",
  valueTier = "medio",
} = {}) {
  const tierKey = normalizeTier(rewardTier, "intermediaria", ["imediata", "intermediaria", "premium"]);
  const valueKey = normalizeTier(valueTier, "medio", ["baixo", "medio", "alto"]);

  const avg = Math.max(20, Math.round(Number(avgDailyPoints) || 60));
  const raw = avg * REWARD_TIER_FACTOR[tierKey] * REWARD_VALUE_FACTOR[valueKey];
  const base = Math.max(20, Math.round(raw));

  if (tierKey === "premium") {
    return Math.max(base, Math.round(avg * 4.5));
  }
  return base;
}

export function calculateAdaptiveRewardCost({
  baseCost = 0,
  onboardingFactor = 1,
  redemptionsTodayCount = 0,
} = {}) {
  const base = Math.max(1, Math.round(Number(baseCost) || 0));
  const phase = clamp(Number(onboardingFactor) || 1, 0.7, 1.25);
  const idx = clamp(Number(redemptionsTodayCount) || 0, 0, DAILY_REDEEM_FACTOR.length - 1);
  const redeemFactor = DAILY_REDEEM_FACTOR[idx];
  return Math.max(1, Math.round(base * phase * redeemFactor));
}

export async function getRewardRedemptionsCountForDay(db, dayKey) {
  if (!dayKey) return 0;
  const events = await listEventsByDayAndType(db, dayKey, EVENT.REWARD_REDEEM);
  return (events || []).length;
}
