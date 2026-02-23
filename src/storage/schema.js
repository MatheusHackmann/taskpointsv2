// src/storage/schema.js
// Define stores + indexes do IndexedDB (v1).
// Importante: nunca remover stores/índices antigos sem migração.

import {
  STORE_META,
  STORE_DAYS,
  STORE_TASKS,
  STORE_REWARDS,
  STORE_EVENTS,
  STORE_HABIT_TEMPLATES,
  STORE_HABIT_EXECUTIONS,
  STORE_TASK_TIMER_SESSIONS,
} from "../app/constants.js";

function ensureTaskTimerSessionStore(db, upgradeTx = null) {
  if (!db.objectStoreNames.contains(STORE_TASK_TIMER_SESSIONS)) {
    const s = db.createObjectStore(STORE_TASK_TIMER_SESSIONS, { keyPath: "id" });
    s.createIndex("by_day", "day", { unique: false });
    s.createIndex("by_day_status", ["day", "status"], { unique: false });
    s.createIndex("by_day_task", ["day", "taskId"], { unique: false });
    s.createIndex("by_day_task_status", ["day", "taskId", "status"], { unique: false });
    return;
  }

  if (!upgradeTx) return;
  const s = upgradeTx.objectStore(STORE_TASK_TIMER_SESSIONS);
  if (!s.indexNames.contains("by_day")) {
    s.createIndex("by_day", "day", { unique: false });
  }
  if (!s.indexNames.contains("by_day_status")) {
    s.createIndex("by_day_status", ["day", "status"], { unique: false });
  }
  if (!s.indexNames.contains("by_day_task")) {
    s.createIndex("by_day_task", ["day", "taskId"], { unique: false });
  }
  if (!s.indexNames.contains("by_day_task_status")) {
    s.createIndex("by_day_task_status", ["day", "taskId", "status"], { unique: false });
  }
}

export function applySchema(db, oldVersion, newVersion, upgradeTx = null) {
  // v1: criação inicial
  if (oldVersion < 1) {
    // META
    // key: string
    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META, { keyPath: "key" });
    }

    // DAYS
    // key: day (YYYY-MM-DD)
    if (!db.objectStoreNames.contains(STORE_DAYS)) {
      db.createObjectStore(STORE_DAYS, { keyPath: "day" });
    }

    // TASKS
    // key: id
    // indexes: day, completed, priority, sort
    if (!db.objectStoreNames.contains(STORE_TASKS)) {
      const s = db.createObjectStore(STORE_TASKS, { keyPath: "id" });
      s.createIndex("by_day", "day", { unique: false });
      s.createIndex("by_day_sort", ["day", "sort"], { unique: false });
      s.createIndex("by_day_completed", ["day", "completed"], { unique: false });
      s.createIndex("by_priority", "priority", { unique: false });
    }

    // REWARDS
    // key: id
    // index: cost (para ordenar / filtrar)
    if (!db.objectStoreNames.contains(STORE_REWARDS)) {
      const s = db.createObjectStore(STORE_REWARDS, { keyPath: "id" });
      s.createIndex("by_cost", "cost", { unique: false });
    }

    // EVENTS (logs)
    // key: id (string)
    // indexes: by_day, by_type, by_ts, by_day_type, by_day_ts
    if (!db.objectStoreNames.contains(STORE_EVENTS)) {
      const s = db.createObjectStore(STORE_EVENTS, { keyPath: "id" });
      s.createIndex("by_seq", "seq", { unique: true });
      s.createIndex("by_day", "day", { unique: false });
      s.createIndex("by_type", "type", { unique: false });
      s.createIndex("by_ts", "ts", { unique: false });
      s.createIndex("by_day_type", ["day", "type"], { unique: false });
      s.createIndex("by_day_ts", ["day", "ts"], { unique: false });
    }
  }

  // v2: hábitos
  if (oldVersion < 2) {
    if (!db.objectStoreNames.contains(STORE_HABIT_TEMPLATES)) {
      const s = db.createObjectStore(STORE_HABIT_TEMPLATES, { keyPath: "id" });
      s.createIndex("by_name", "name", { unique: false });
      s.createIndex("by_active_name", ["isActive", "name"], { unique: false });
    }

    if (!db.objectStoreNames.contains(STORE_HABIT_EXECUTIONS)) {
      const s = db.createObjectStore(STORE_HABIT_EXECUTIONS, { keyPath: "id" });
      s.createIndex("by_day", "day", { unique: false });
      s.createIndex("by_day_habit", ["day", "habitId"], { unique: false });
      s.createIndex("by_habit_ts", ["habitId", "ts"], { unique: false });
    }
  }

  // v3: categorias (tasks + habit templates)
  if (oldVersion < 3) {
    if (upgradeTx && db.objectStoreNames.contains(STORE_TASKS)) {
      const tasksStore = upgradeTx.objectStore(STORE_TASKS);
      if (!tasksStore.indexNames.contains("by_day_category")) {
        tasksStore.createIndex("by_day_category", ["day", "category"], { unique: false });
      }
    }

    if (upgradeTx && db.objectStoreNames.contains(STORE_HABIT_TEMPLATES)) {
      const habitsStore = upgradeTx.objectStore(STORE_HABIT_TEMPLATES);
      if (!habitsStore.indexNames.contains("by_category_name")) {
        habitsStore.createIndex("by_category_name", ["category", "name"], { unique: false });
      }
    }
  }

  // v4: sessoes de timer por task
  if (oldVersion < 4) {
    ensureTaskTimerSessionStore(db, upgradeTx);
  }

  // v8: recovery consolidado para garantir store/indexes de timer em bases legadas.
  if (oldVersion < 8) {
    ensureTaskTimerSessionStore(db, upgradeTx);
  }
}
