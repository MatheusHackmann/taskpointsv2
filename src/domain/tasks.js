// src/domain/tasks.js
// Regras de negocio para tasks (criar, concluir, desfazer, deletar, reorder).
// Persiste em IndexedDB via repos + emite logs.
// Atualiza totalPoints do dia.

import { newId } from "./id.js";
import { isoNow, dayKeyFromDate } from "./dates.js";
import { getPriority } from "./defaults.js";
import { normalizeCategory, ensureCategoryExists } from "./categories.js";

import {
  listTasksByDay,
  getTask,
  upsertTask,
  deleteTask as repoDeleteTask,
  bulkUpsertTasks,
} from "../storage/repositories/tasksRepo.js";

import { getDay, upsertDay } from "../storage/repositories/daysRepo.js";

import {
  logTaskCreate,
  logTaskStart,
  logTaskComplete,
  logTaskUncomplete,
  logTaskDelete,
  logTaskCategoryUpdate,
  logTaskReorder,
} from "./logs.js";

/**
 * Retorna tasks do dia (ordenadas por sort).
 */
export async function getTasksForCurrentDay(state) {
  const dayKey = state.currentDay;
  if (!dayKey) return [];
  const tasks = await listTasksByDay(state.db, dayKey);
  return (tasks || [])
    .map((task) => ({
      ...task,
      category: normalizeCategory(task?.category),
    }))
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
}

/**
 * Cria uma task no dia atual (pendente).
 */
export async function createTask(state, { name, points, category }) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const cleanName = String(name || "").trim();
  const cleanPoints = Math.round(Number(points));

  if (!cleanName) throw new Error("Nome da task e obrigatorio.");
  if (!Number.isFinite(cleanPoints) || cleanPoints <= 0) throw new Error("Pontos invalidos.");
  const cleanCategory = await ensureCategoryExists(state.db, category, "Categoria da task");

  const existing = await listTasksByDay(state.db, dayKey);
  const nextSort = existing?.length || 0;

  const task = {
    id: newId("t"),
    day: dayKey,
    name: cleanName,
    points: cleanPoints,
    priority: getPriority(cleanPoints),
    completed: false,
    createdAt: isoNow(),
    startedAt: null,
    completedAt: null,
    sort: nextSort,
    category: cleanCategory,
  };

  await upsertTask(state.db, task);
  await logTaskCreate(state, {
    taskId: task.id,
    day: dayKey,
    name: task.name,
    points: task.points,
    priority: task.priority,
    sort: task.sort,
    category: task.category,
  });

  return task;
}

export async function startTask(state, taskId, { auto = false } = {}) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const task = await getTask(state.db, taskId);
  if (!task) throw new Error("Task nao encontrada.");
  task.category = normalizeCategory(task.category);
  if (task.day !== dayKey) throw new Error("Task nao pertence ao dia atual.");
  if (isPendingTaskLockedByDayTurn(task)) {
    throw new Error("Dia encerrado: task pendente bloqueada para iniciar.");
  }

  if (task.startedAt || task.completed) {
    return { startedAt: task.startedAt || null, alreadyStarted: true };
  }

  const startedAt = isoNow();
  const updatedTask = { ...task, startedAt };

  await upsertTask(state.db, updatedTask);
  await logTaskStart(state, { taskId: task.id, day: dayKey, startedAt, auto });

  return { startedAt };
}

/**
 * Alterna concluido/pendente e ajusta pontos do dia.
 */
export async function toggleTaskCompletion(state, taskId) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const task = await getTask(state.db, taskId);
  if (!task) throw new Error("Task nao encontrada.");
  task.category = normalizeCategory(task.category);
  if (task.day !== dayKey) throw new Error("Task nao pertence ao dia atual.");
  if (isPendingTaskLockedByDayTurn(task)) {
    throw new Error("Dia encerrado: task pendente bloqueada para conclusao.");
  }

  const day = await getDay(state.db, dayKey);
  if (!day) throw new Error("Dia nao encontrado.");

  const currentlyCompleted = !!task.completed;
  const nextCompleted = !currentlyCompleted;
  const pts = Number(task.points) || 0;

  const delta = nextCompleted ? pts : -pts;
  const before = Number(day.totalPoints) || 0;
  const after = before + delta;

  const completedAt = nextCompleted ? isoNow() : null;

  const autoStart = nextCompleted && !task.startedAt;
  const startedAt = nextCompleted
    ? task.startedAt || (autoStart ? completedAt : null)
    : task.startedAt;

  const updatedTask = {
    ...task,
    startedAt,
    completed: nextCompleted,
    completedAt,
  };
  await upsertTask(state.db, updatedTask);

  await upsertDay(state.db, {
    ...day,
    totalPoints: after,
  });

  if (autoStart) {
    await logTaskStart(state, { taskId: task.id, day: dayKey, startedAt, auto: true });
  }

  if (nextCompleted) {
    await logTaskComplete(state, {
      taskId: task.id,
      day: dayKey,
      pointsDelta: delta,
      startedAt,
      completedAt,
      category: task.category,
    });
  } else {
    await logTaskUncomplete(state, {
      taskId: task.id,
      day: dayKey,
      pointsDelta: delta,
      category: task.category,
    });
  }

  return { pointsAfter: after, completed: nextCompleted };
}

/**
 * Deleta a task e ajusta pontos se ela estava concluida.
 */
export async function deleteTask(state, taskId) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const task = await getTask(state.db, taskId);
  if (!task) return;
  task.category = normalizeCategory(task.category);
  if (task.day !== dayKey) throw new Error("Task nao pertence ao dia atual.");
  if (isPendingTaskLockedByDayTurn(task)) {
    throw new Error("Dia encerrado: task pendente bloqueada para exclusao.");
  }

  const day = await getDay(state.db, dayKey);
  if (!day) throw new Error("Dia nao encontrado.");

  const wasCompleted = !!task.completed;
  const pts = Number(task.points) || 0;

  const delta = wasCompleted ? -pts : 0;
  const before = Number(day.totalPoints) || 0;
  const after = before + delta;

  await repoDeleteTask(state.db, taskId);

  const remaining = (await listTasksByDay(state.db, dayKey))
    .slice()
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const normalized = remaining.map((t, idx) => ({ ...t, sort: idx }));
  await bulkUpsertTasks(state.db, normalized);

  if (delta !== 0) {
    await upsertDay(state.db, { ...day, totalPoints: after });
  }

  await logTaskDelete(state, {
    taskId: task.id,
    day: dayKey,
    nameSnapshot: task.name,
    pointsSnapshot: pts,
    wasCompleted,
    pointsDelta: delta,
    category: task.category,
  });

  return { pointsAfter: after };
}

/**
 * Reordena tasks (drag and drop).
 * Recebe fromIndex/toIndex baseado na lista ordenada atual.
 */
export async function reorderTaskByIndex(state, { fromIndex, toIndex }) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  if (fromIndex === toIndex) return;

  const tasks = await getTasksForCurrentDay(state);
  if (fromIndex < 0 || fromIndex >= tasks.length) return;
  if (toIndex < 0 || toIndex >= tasks.length) return;

  const moved = tasks.splice(fromIndex, 1)[0];
  tasks.splice(toIndex, 0, moved);

  const updated = tasks.map((t, idx) => ({ ...t, sort: idx }));
  await bulkUpsertTasks(state.db, updated);

  await logTaskReorder(state, {
    day: dayKey,
    order: updated.map((t) => t.id),
    fromIndex,
    toIndex,
  });
}

export async function updateTaskCategory(state, taskId, category) {
  const dayKey = state.currentDay;
  if (!dayKey) throw new Error("Nenhum dia selecionado.");

  const task = await getTask(state.db, taskId);
  if (!task) throw new Error("Task nao encontrada.");
  if (task.day !== dayKey) throw new Error("Task nao pertence ao dia atual.");
  if (task.completed) throw new Error("Somente tasks pendentes podem trocar categoria.");

  const nextCategory = await ensureCategoryExists(state.db, category, "Categoria da task");
  const currentCategory = normalizeCategory(task.category);
  if (currentCategory === nextCategory) {
    return { changed: false, category: currentCategory };
  }

  const updatedTask = {
    ...task,
    category: nextCategory,
  };
  await upsertTask(state.db, updatedTask);

  await logTaskCategoryUpdate(state, {
    taskId: task.id,
    day: dayKey,
    beforeCategory: currentCategory,
    afterCategory: nextCategory,
  });

  return { changed: true, category: nextCategory };
}

function isPendingTaskLockedByDayTurn(task) {
  if (!task || task.completed) return false;
  const today = dayKeyFromDate(new Date());
  return String(task.day || "") < today;
}
