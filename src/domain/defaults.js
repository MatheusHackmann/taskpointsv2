// src/domain/defaults.js
// Gerencia seeds iniciais e template de tasks padrao para novos dias.

import { dayKeyFromDate } from "./dates.js";
import { newId } from "./id.js";

import {
  STORE_META,
  META_KEY_DEFAULT_TASKS_TEMPLATE,
} from "../app/constants.js";

import { withTx, reqToPromise } from "../storage/db.js";
import { upsertDay, listDays, getDay } from "../storage/repositories/daysRepo.js";
import { listTasksByDay, bulkUpsertTasks } from "../storage/repositories/tasksRepo.js";
import { listRewards, bulkUpsertRewards } from "../storage/repositories/rewardsRepo.js";

import { setCurrentDay } from "../app/state.js";
import { calculateTaskPoints } from "./pointsEngine.js";
import { logTaskCreate } from "./logs.js";
import { normalizeCategory } from "./categories.js";

const FALLBACK_DEFAULT_TASKS = [
  ["Levantar 07h", 50],
  ["15min Sol", 50],
  ["5g de creatina", 20],
  ["Cafe proteico", 20],
  ["Leitura", 20],
  ["30 flexoes + agachamentos + abdominais", 30],
  ["Bloco de trabalho 1 (3h)", 50],
  ["Almoco", 20],
  ["Bloco de trabalho 2 (3h)", 50],
  ["Bloco de trabalho 3 (2h)", 100],
  ["Jantar", 20],
  ["Lavar louca", 20],
];

export async function getDefaultTasksTemplate(db) {
  const saved = await withTx(db, [STORE_META], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_META].get(META_KEY_DEFAULT_TASKS_TEMPLATE));
  });

  const raw = Array.isArray(saved?.value) ? saved.value : [];
  const normalized = normalizeTemplateEntries(raw);
  if (normalized.length) return normalized;

  const fallback = FALLBACK_DEFAULT_TASKS.map(([name, points]) => ({
    name,
    points,
    category: "trabalho",
  }));
  await saveDefaultTasksTemplate(db, fallback);
  return fallback;
}

export async function saveDefaultTasksTemplate(db, entries) {
  const normalized = normalizeTemplateEntries(entries);
  if (!normalized.length) throw new Error("Defina pelo menos 1 task padrao.");

  await withTx(db, [STORE_META], "readwrite", async (_tx, stores) => {
    await reqToPromise(
      stores[STORE_META].put({
        key: META_KEY_DEFAULT_TASKS_TEMPLATE,
        value: normalized,
      })
    );
  });

  return normalized;
}

export async function buildDefaultTasksForDay(db, dayKey) {
  const template = await getDefaultTasksTemplate(db);
  return template.map((item, idx) => ({
    id: newId("t"),
    day: dayKey,
    name: item.name,
    points: item.points,
    priority: getPriority(item.points),
    completed: false,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    complexity: item.complexity || null,
    aversion: item.aversion || null,
    impact: item.impact || null,
    category: normalizeCategory(item?.category),
    sort: idx,
  }));
}

export function defaultRewardsSeedFromTasks(_tasks) {
  return [
    { id: newId("r"), name: "1 mapa completo de CS", cost: 150, createdAt: new Date().toISOString() },
    { id: newId("r"), name: "1 episodio de serie", cost: 200, createdAt: new Date().toISOString() },
  ];
}

export function getPriority(points) {
  const p = Number(points) || 0;
  if (p >= 50) return "high";
  if (p >= 20) return "medium";
  return "low";
}

export async function ensureBootstrapData(state) {
  const db = state.db;

  await getDefaultTasksTemplate(db);

  let days = await listDays(db);
  if (days.length === 0) {
    const today = dayKeyFromDate(new Date());
    await createDayWithDefaults(db, today);
    days = [today];
  }

  const lastDay = days[days.length - 1];
  setCurrentDay(state, lastDay);

  const existingTasks = await listTasksByDay(db, lastDay);
  if (!existingTasks || existingTasks.length === 0) {
    await ensureDayExists(db, lastDay);
    await seedTasksForDay(db, lastDay);
  }

  const rewards = await listRewards(db);
  if (!rewards || rewards.length === 0) {
    const tasks = await listTasksByDay(db, lastDay);
    const seed = defaultRewardsSeedFromTasks(tasks);
    await bulkUpsertRewards(db, seed);
  }
}

export async function ensureDayWithDefaults(db, dayKey) {
  const day = await getDay(db, dayKey);
  if (!day) {
    await upsertDay(db, {
      day: dayKey,
      totalPoints: 0,
      createdAt: new Date().toISOString(),
      notes: "",
    });
  }

  const tasks = await listTasksByDay(db, dayKey);
  if (!tasks || tasks.length === 0) {
    await seedTasksForDay(db, dayKey);
  }
}

export async function syncMissingDefaultTasksForCurrentDay(state) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const [template, existingTasks] = await Promise.all([
    getDefaultTasksTemplate(state.db),
    listTasksByDay(state.db, dayKey),
  ]);

  const existingByName = countByNormalizedName(existingTasks || []);
  const templateByName = countByNormalizedName(template || []);
  const createdByName = new Map();

  const created = [];
  let nextSort = (existingTasks || []).length;

  for (const item of template || []) {
    const name = String(item?.name || "").trim();
    if (!name) continue;

    const key = normalizeName(name);
    const existingCount = existingByName.get(key) || 0;
    const expectedCount = templateByName.get(key) || 0;
    const alreadyCreatedForName = createdByName.get(key) || 0;

    if (existingCount + alreadyCreatedForName >= expectedCount) continue;

    const points = Math.round(Number(item?.points));
    if (!Number.isFinite(points) || points <= 0) continue;

    created.push({
      id: newId("t"),
      day: dayKey,
      name,
      points,
      priority: getPriority(points),
      completed: false,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      complexity: item?.complexity || null,
      aversion: item?.aversion || null,
      impact: item?.impact || null,
      category: normalizeCategory(item?.category),
      sort: nextSort++,
    });
    createdByName.set(key, alreadyCreatedForName + 1);
  }

  if (!created.length) {
    return { createdCount: 0 };
  }

  await bulkUpsertTasks(state.db, created);
  for (const task of created) {
    await logTaskCreate(state, {
      taskId: task.id,
      day: dayKey,
      name: task.name,
      points: task.points,
      priority: task.priority,
      sort: task.sort,
      category: task.category,
    });
  }

  return { createdCount: created.length };
}

async function ensureDayExists(db, dayKey) {
  const day = await getDay(db, dayKey);
  if (day) return;
  await upsertDay(db, {
    day: dayKey,
    totalPoints: 0,
    createdAt: new Date().toISOString(),
    notes: "",
  });
}

async function createDayWithDefaults(db, dayKey) {
  await ensureDayExists(db, dayKey);
  await seedTasksForDay(db, dayKey);
}

async function seedTasksForDay(db, dayKey) {
  const tasks = await buildDefaultTasksForDay(db, dayKey);
  await bulkUpsertTasks(db, tasks);
}

function normalizeTemplateEntries(entries) {
  const arr = Array.isArray(entries) ? entries : [];
  const out = [];

  for (const item of arr) {
    const name = String(item?.name || "").trim();
    if (!name) continue;

    const factors = normalizeTaskFactors(item);
    if (factors) {
      out.push({
        name,
        complexity: factors.complexity,
        aversion: factors.aversion,
        impact: factors.impact,
        points: calculateTaskPoints(factors),
        category: normalizeCategory(item?.category),
      });
      continue;
    }

    const manualPoints = Math.round(Number(item?.points));
    if (!Number.isFinite(manualPoints) || manualPoints <= 0) continue;
    const inferred = inferTaskFactorsFromPoints(manualPoints);
    out.push({
      name,
      complexity: inferred.complexity,
      aversion: inferred.aversion,
      impact: inferred.impact,
      points: calculateTaskPoints(inferred),
      category: normalizeCategory(item?.category),
    });
  }

  return out;
}

function normalizeTaskFactors(item) {
  const complexity = normalizeTaskComplexity(item?.complexity);
  const aversion = normalizeTaskAversion(item?.aversion);
  const impact = normalizeTaskImpact(item?.impact);
  if (!complexity || !aversion || !impact) return null;
  return { complexity, aversion, impact };
}

function normalizeTaskComplexity(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return ["baixa", "media", "alta"].includes(value) ? value : "";
}

function normalizeTaskAversion(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return ["baixa", "media", "alta"].includes(value) ? value : "";
}

function normalizeTaskImpact(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return ["baixo", "medio", "alto"].includes(value) ? value : "";
}

function inferTaskFactorsFromPoints(points) {
  const complexityLevels = ["baixa", "media", "alta"];
  const aversionLevels = ["baixa", "media", "alta"];
  const impactLevels = ["baixo", "medio", "alto"];

  let best = { complexity: "media", aversion: "media", impact: "medio" };
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const complexity of complexityLevels) {
    for (const aversion of aversionLevels) {
      for (const impact of impactLevels) {
        const candidatePoints = calculateTaskPoints({ complexity, aversion, impact });
        const diff = Math.abs(candidatePoints - points);
        if (diff < bestDiff) {
          best = { complexity, aversion, impact };
          bestDiff = diff;
        }
      }
    }
  }

  return best;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function countByNormalizedName(items) {
  const map = new Map();
  for (const item of items || []) {
    const key = normalizeName(item?.name);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}
