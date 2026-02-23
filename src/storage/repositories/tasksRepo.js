// src/storage/repositories/tasksRepo.js

import { STORE_TASKS } from "../../app/constants.js";
import { withTx, reqToPromise } from "../db.js";

const MIN_SORT_KEY = Number.MIN_SAFE_INTEGER;
const MAX_SORT_KEY = Number.MAX_SAFE_INTEGER;

export async function getTask(db, taskId) {
  return withTx(db, [STORE_TASKS], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_TASKS].get(taskId));
  });
}

export async function upsertTask(db, task) {
  if (!task?.id) throw new Error("upsertTask: task.id é obrigatório");
  if (!task?.day) throw new Error("upsertTask: task.day é obrigatório");

  return withTx(db, [STORE_TASKS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_TASKS].put(task));
    return task;
  });
}

export async function bulkUpsertTasks(db, tasks) {
  const arr = Array.isArray(tasks) ? tasks : [];
  return withTx(db, [STORE_TASKS], "readwrite", async (_tx, stores) => {
    const s = stores[STORE_TASKS];
    for (const t of arr) {
      if (!t?.id || !t?.day) continue;
      await reqToPromise(s.put(t));
    }
  });
}

export async function deleteTask(db, taskId) {
  return withTx(db, [STORE_TASKS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_TASKS].delete(taskId));
  });
}

export async function listTasksByDay(db, dayKey) {
  return withTx(db, [STORE_TASKS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_TASKS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const tasks = await reqToPromise(idx.getAll(range));
    return (tasks || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  });
}

export async function listTasksByDaySorted(db, dayKey) {
  return withTx(db, [STORE_TASKS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_TASKS].index("by_day_sort");
    const range = IDBKeyRange.bound([dayKey, MIN_SORT_KEY], [dayKey, MAX_SORT_KEY]);
    const tasks = await reqToPromise(idx.getAll(range));
    return tasks || [];
  });
}

/**
 * ✅ Novo: deletar todas as tasks de um dia (uso: excluir dia futuro)
 */
export async function deleteTasksByDay(db, dayKey) {
  return withTx(db, [STORE_TASKS], "readwrite", async (_tx, stores) => {
    const idx = stores[STORE_TASKS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const tasks = await reqToPromise(idx.getAll(range));

    for (const t of tasks || []) {
      await reqToPromise(stores[STORE_TASKS].delete(t.id));
    }
  });
}
