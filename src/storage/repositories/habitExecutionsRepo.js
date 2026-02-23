// src/storage/repositories/habitExecutionsRepo.js
// CRUD de execuções de hábitos (registros diários)

import { STORE_HABIT_EXECUTIONS } from "../../app/constants.js";
import { withTx, reqToPromise } from "../db.js";

export async function getHabitExecution(db, id) {
  return withTx(db, [STORE_HABIT_EXECUTIONS], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_HABIT_EXECUTIONS].get(id));
  });
}

export async function addHabitExecution(db, execution) {
  if (!execution?.id) throw new Error("addHabitExecution: execution.id é obrigatório");
  if (!execution?.day) throw new Error("addHabitExecution: execution.day é obrigatório");
  if (!execution?.habitId) throw new Error("addHabitExecution: execution.habitId é obrigatório");

  return withTx(db, [STORE_HABIT_EXECUTIONS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_HABIT_EXECUTIONS].add(execution));
    return execution;
  });
}

export async function upsertHabitExecution(db, execution) {
  if (!execution?.id) throw new Error("upsertHabitExecution: execution.id é obrigatório");

  return withTx(db, [STORE_HABIT_EXECUTIONS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_HABIT_EXECUTIONS].put(execution));
    return execution;
  });
}

export async function listHabitExecutionsByDay(db, dayKey, { includeDeleted = false } = {}) {
  return withTx(db, [STORE_HABIT_EXECUTIONS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_HABIT_EXECUTIONS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const items = await reqToPromise(idx.getAll(range));

    const filtered = (items || []).filter((x) => {
      if (includeDeleted) return true;
      return !x.deletedAt;
    });

    // ordena por ts desc (mais recente primeiro)
    filtered.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return filtered;
  });
}

export async function listHabitExecutionsByDayAndHabit(db, dayKey, habitId, { includeDeleted = false } = {}) {
  return withTx(db, [STORE_HABIT_EXECUTIONS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_HABIT_EXECUTIONS].index("by_day_habit");
    const range = IDBKeyRange.only([dayKey, habitId]);
    const items = await reqToPromise(idx.getAll(range));

    const filtered = (items || []).filter((x) => {
      if (includeDeleted) return true;
      return !x.deletedAt;
    });

    // ordena por ts asc (para somas/linha do tempo, tanto faz)
    filtered.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    return filtered;
  });
}

/**
 * Soft delete: marca deletedAt (não apaga)
 */
export async function softDeleteHabitExecution(db, id, deletedAtIso) {
  return withTx(db, [STORE_HABIT_EXECUTIONS], "readwrite", async (_tx, stores) => {
    const store = stores[STORE_HABIT_EXECUTIONS];
    const existing = await reqToPromise(store.get(id));
    if (!existing) return null;

    const updated = { ...existing, deletedAt: deletedAtIso };
    await reqToPromise(store.put(updated));
    return updated;
  });
}

export async function deleteHabitExecutionsByDay(db, dayKey) {
  return withTx(db, [STORE_HABIT_EXECUTIONS], "readwrite", async (_tx, stores) => {
    const store = stores[STORE_HABIT_EXECUTIONS];
    const idx = store.index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const items = await reqToPromise(idx.getAll(range));

    for (const entry of items || []) {
      await reqToPromise(store.delete(entry.id));
    }
  });
}
