// src/domain/habits.js
// Regras de negócio para hábitos:
// - CRUD de templates (catálogo global) com desativar/ativar (não apagar)
// - Executar hábito (cria execução no dia e soma pontos no total do dia)
// - Editar/remover execução com delta de pontos
// - Totais do dia por hábito (ml/min/etc.) sem poluir tasks

import { EVENT } from "../app/constants.js";
import { newId } from "./id.js";
import { isoNow } from "./dates.js";
import { normalizeCategory, ensureCategoryExists } from "./categories.js";

import {
  getHabitTemplate,
  upsertHabitTemplate,
  deleteHabitTemplate as repoDeleteHabitTemplate,
  listHabitTemplates,
  listActiveHabitTemplates,
} from "../storage/repositories/habitsRepo.js";

import {
  getHabitExecution,
  addHabitExecution,
  upsertHabitExecution,
  listHabitExecutionsByDay,
  listHabitExecutionsByDayAndHabit,
  softDeleteHabitExecution,
} from "../storage/repositories/habitExecutionsRepo.js";

import { getDay, upsertDay } from "../storage/repositories/daysRepo.js";

import {
  logHabitTemplateCreate,
  logHabitTemplateUpdate,
  logHabitExecute,
  logHabitUndo,
  logHabitEdit,
} from "./logs.js";

/* ===========================
   Helpers/validações
=========================== */

function toInt(n) {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? x : NaN;
}

function normalizeStr(s) {
  return String(s ?? "").trim();
}

function ensureDayKey(state) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");
  return dayKey;
}

/* ===========================
   Templates (CRUD)
=========================== */

export async function listAllHabitTemplates(state) {
  const templates = await listHabitTemplates(state.db);
  return (templates || []).map((template) => ({
    ...template,
    category: normalizeCategory(template?.category),
  }));
}

export async function listActiveHabits(state) {
  const templates = await listActiveHabitTemplates(state.db);
  return (templates || []).map((template) => ({
    ...template,
    category: normalizeCategory(template?.category),
  }));
}

export async function createHabitTemplate(state, { name, unit, increment, points, icon, dailyTarget, tier, effort, category }) {
  const cleanName = normalizeStr(name);
  const cleanUnit = normalizeStr(unit);
  const cleanIcon = normalizeStr(icon);

  const inc = toInt(increment);
  const pts = toInt(points);
  const target = dailyTarget === undefined || dailyTarget === null || String(dailyTarget).trim() === ""
    ? 0
    : toInt(dailyTarget);

  if (!cleanName) throw new Error("Nome do hábito é obrigatório.");
  if (!cleanUnit) throw new Error("Unidade é obrigatória (ex: ml, min).");
  if (!Number.isFinite(inc) || inc <= 0) throw new Error("Incremento inválido (ex: 500).");
  if (!Number.isFinite(pts) || pts <= 0) throw new Error("Pontos inválidos (ex: 10).");
  if (!Number.isFinite(target) || target < 0) throw new Error("Meta diaria invalida.");
  const cleanCategory = await ensureCategoryExists(state.db, category, "Categoria do habito");

  const now = isoNow();
  const normalizedTier = normalizeStr(tier || "moderado").toLowerCase() || "moderado";
  const normalizedEffort = normalizeStr(effort || "media").toLowerCase() || "media";
  const template = {
    id: newId("h"),
    name: cleanName,
    unit: cleanUnit,
    increment: inc,
    points: pts,
    dailyTarget: target,
    tier: normalizedTier,
    effort: normalizedEffort,
    icon: cleanIcon || "⚡",
    category: cleanCategory,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await upsertHabitTemplate(state.db, template);
  await logHabitTemplateCreate(state, {
    habitId: template.id,
    name: template.name,
    unit: template.unit,
    increment: template.increment,
    dailyTarget: template.dailyTarget,
    points: template.points,
    tier: template.tier,
    effort: template.effort,
    icon: template.icon,
    category: template.category,
    isActive: template.isActive,
  });

  return template;
}

export async function updateHabitTemplate(state, habitId, patch) {
  const existing = await getHabitTemplate(state.db, habitId);
  if (!existing) throw new Error("Hábito não encontrado.");

  const next = {
    ...existing,
    category: normalizeCategory(existing.category),
  };

  if (patch?.name !== undefined) {
    const v = normalizeStr(patch.name);
    if (!v) throw new Error("Nome inválido.");
    next.name = v;
  }

  if (patch?.unit !== undefined) {
    const v = normalizeStr(patch.unit);
    if (!v) throw new Error("Unidade inválida.");
    next.unit = v;
  }

  if (patch?.icon !== undefined) {
    const v = normalizeStr(patch.icon);
    next.icon = v || "⚡";
  }

  if (patch?.increment !== undefined) {
    const v = toInt(patch.increment);
    if (!Number.isFinite(v) || v <= 0) throw new Error("Incremento inválido.");
    next.increment = v;
  }

  if (patch?.points !== undefined) {
    const v = toInt(patch.points);
    if (!Number.isFinite(v) || v <= 0) throw new Error("Pontos inválidos.");
    next.points = v;
  }

  if (patch?.dailyTarget !== undefined) {
    const raw = patch.dailyTarget;
    const hasValue = !(raw === null || raw === undefined || String(raw).trim() === "");
    if (!hasValue) {
      next.dailyTarget = 0;
    } else {
      const v = toInt(raw);
      if (!Number.isFinite(v) || v < 0) throw new Error("Meta diaria invalida.");
      next.dailyTarget = v;
    }
  }

  if (patch?.tier !== undefined) {
    const v = normalizeStr(patch.tier).toLowerCase();
    if (!v) throw new Error("Nivel do habito invalido.");
    next.tier = v;
  }

  if (patch?.effort !== undefined) {
    const v = normalizeStr(patch.effort).toLowerCase();
    if (!v) throw new Error("Esforco do habito invalido.");
    next.effort = v;
  }

  if (patch?.category !== undefined) {
    next.category = await ensureCategoryExists(state.db, patch.category, "Categoria do habito");
  }

  next.updatedAt = isoNow();

  await upsertHabitTemplate(state.db, next);

  await logHabitTemplateUpdate(state, {
    habitId,
    before: pickTemplateSnapshot(existing),
    after: pickTemplateSnapshot(next),
  });

  return next;
}

export async function deleteHabitTemplate(state, habitId) {
  const existing = await getHabitTemplate(state.db, habitId);
  if (!existing) return;
  await repoDeleteHabitTemplate(state.db, habitId);
  return {
    habitId: existing.id,
    habitName: existing.name,
  };
}

function pickTemplateSnapshot(t) {
  return {
    id: t.id,
    name: t.name,
    unit: t.unit,
    increment: t.increment,
    points: t.points,
    dailyTarget: Number(t.dailyTarget) || 0,
    tier: t.tier || "moderado",
    effort: t.effort || "media",
    icon: t.icon,
    category: normalizeCategory(t.category),
    isActive: !!t.isActive,
  };
}

/* ===========================
   Execuções (registrar/editar/remover)
=========================== */

export async function executeHabit(state, habitId) {
  const dayKey = ensureDayKey(state);

  const template = await getHabitTemplate(state.db, habitId);
  if (!template) throw new Error("Hábito não encontrado.");
  if (!template.isActive) throw new Error("Este hábito está desativado.");
  template.category = normalizeCategory(template.category);

  const day = await getDay(state.db, dayKey);
  if (!day) throw new Error("Dia não encontrado.");

  const value = Number(template.increment) || 0;
  const points = Number(template.points) || 0;

  if (value <= 0 || points <= 0) throw new Error("Template inválido (increment/points).");

  const now = isoNow();
  const execution = {
    id: newId("hx"),
    day: dayKey,
    habitId: template.id,
    value,
    points,
    ts: now,
    deletedAt: null,
    note: "",
  };

  // 1) salva execução
  await addHabitExecution(state.db, execution);

  // 2) soma pontos no dia
  const before = Number(day.totalPoints) || 0;
  const after = before + points;
  await upsertDay(state.db, { ...day, totalPoints: after });

  // 3) log
  await logHabitExecute(state, {
    day: dayKey,
    executionId: execution.id,
    habitId: template.id,
    templateSnapshot: pickTemplateSnapshot(template),
    value,
    points,
    category: template.category,
    pointsAfter: after,
  });

  return {
    execution,
    pointsAfter: after,
    habitId: template.id,
    habitName: template.name,
    pointsDelta: points,
  };
}

export async function undoHabitExecution(state, executionId) {
  const dayKey = ensureDayKey(state);

  const execution = await getHabitExecution(state.db, executionId);
  if (!execution) throw new Error("Registro não encontrado.");
  if (execution.day !== dayKey) throw new Error("Registro não pertence ao dia atual.");
  if (execution.deletedAt) return { alreadyDeleted: true };

  const day = await getDay(state.db, dayKey);
  if (!day) throw new Error("Dia não encontrado.");

  const now = isoNow();
  const updated = await softDeleteHabitExecution(state.db, executionId, now);
  if (!updated) throw new Error("Falha ao remover registro.");

  // delta pontos (remove)
  const delta = -(Number(execution.points) || 0);
  const before = Number(day.totalPoints) || 0;
  const after = before + delta;

  await upsertDay(state.db, { ...day, totalPoints: after });

  await logHabitUndo(state, {
    day: dayKey,
    executionId,
    habitId: execution.habitId,
    value: execution.value,
    pointsDelta: delta,
    pointsAfter: after,
  });

  return {
    pointsAfter: after,
    executionId,
    habitId: execution.habitId,
    pointsDelta: delta,
    value: execution.value,
  };
}

export async function editHabitExecution(state, executionId, patch) {
  const dayKey = ensureDayKey(state);

  const execution = await getHabitExecution(state.db, executionId);
  if (!execution) throw new Error("Registro não encontrado.");
  if (execution.day !== dayKey) throw new Error("Registro não pertence ao dia atual.");
  if (execution.deletedAt) throw new Error("Registro removido não pode ser editado.");

  const day = await getDay(state.db, dayKey);
  if (!day) throw new Error("Dia não encontrado.");

  const next = { ...execution };

  if (patch?.value !== undefined) {
    const v = toInt(patch.value);
    if (!Number.isFinite(v) || v <= 0) throw new Error("Valor inválido.");
    next.value = v;
  }

  if (patch?.points !== undefined) {
    const v = toInt(patch.points);
    if (!Number.isFinite(v) || v < 0) throw new Error("Pontos inválidos.");
    next.points = v;
  }

  if (patch?.note !== undefined) {
    next.note = normalizeStr(patch.note);
  }

  next.updatedAt = isoNow();

  // Ajuste de pontos no dia via delta
  const beforePoints = Number(execution.points) || 0;
  const afterPoints = Number(next.points) || 0;
  const delta = afterPoints - beforePoints;

  const beforeDayPts = Number(day.totalPoints) || 0;
  const afterDayPts = beforeDayPts + delta;

  await upsertHabitExecution(state.db, next);
  if (delta !== 0) {
    await upsertDay(state.db, { ...day, totalPoints: afterDayPts });
  }

  await logHabitEdit(state, {
    day: dayKey,
    executionId,
    habitId: execution.habitId,
    before: pickExecutionSnapshot(execution),
    after: pickExecutionSnapshot(next),
    pointsDelta: delta,
    pointsAfter: afterDayPts,
  });

  return { pointsAfter: afterDayPts };
}

function pickExecutionSnapshot(x) {
  return {
    id: x.id,
    day: x.day,
    habitId: x.habitId,
    value: x.value,
    points: x.points,
    ts: x.ts,
    deletedAt: x.deletedAt || null,
    note: x.note || "",
  };
}

/* ===========================
   Consultas para UI/Relatórios
=========================== */

export async function listHabitExecutionsToday(state, { includeDeleted = false } = {}) {
  const dayKey = ensureDayKey(state);
  return listHabitExecutionsByDay(state.db, dayKey, { includeDeleted });
}

/**
 * Totais do dia (acumulado por hábito):
 * - totalValue: soma de value (ml/min/...)
 * - totalPoints: soma de points (bônus de hábitos hoje)
 * - count: número de execuções válidas
 */
export async function getHabitTotalsForDay(state, dayKey) {
  const templates = await listActiveHabitTemplates(state.db);
  const results = [];

  for (const t of templates || []) {
    const execs = await listHabitExecutionsByDayAndHabit(state.db, dayKey, t.id, { includeDeleted: false });

    const totalValue = execs.reduce((acc, e) => acc + (Number(e.value) || 0), 0);
    const totalPoints = execs.reduce((acc, e) => acc + (Number(e.points) || 0), 0);

    results.push({
      habit: pickTemplateSnapshot(t),
      totalValue,
      totalPoints,
      count: execs.length,
    });
  }

  // ordena por nome
  results.sort((a, b) => String(a.habit.name).localeCompare(String(b.habit.name), "pt-BR"));
  return results;
}

