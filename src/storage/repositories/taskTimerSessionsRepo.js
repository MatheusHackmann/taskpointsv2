import { STORE_TASK_TIMER_SESSIONS } from "../../app/constants.js";
import { reqToPromise, withTx } from "../db.js";

const OPEN_STATUSES = new Set(["active", "paused"]);

function hasTaskTimerStore(db) {
  return !!db?.objectStoreNames?.contains?.(STORE_TASK_TIMER_SESSIONS);
}

export async function getTaskTimerSession(db, sessionId) {
  if (!hasTaskTimerStore(db)) return null;
  return withTx(db, [STORE_TASK_TIMER_SESSIONS], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_TASK_TIMER_SESSIONS].get(sessionId));
  });
}

export async function upsertTaskTimerSession(db, session) {
  if (!hasTaskTimerStore(db)) return session;
  if (!session?.id) throw new Error("upsertTaskTimerSession: session.id e obrigatorio");
  if (!session?.day) throw new Error("upsertTaskTimerSession: session.day e obrigatorio");
  if (!session?.taskId) throw new Error("upsertTaskTimerSession: session.taskId e obrigatorio");

  return withTx(db, [STORE_TASK_TIMER_SESSIONS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_TASK_TIMER_SESSIONS].put(session));
    return session;
  });
}

export async function listTaskTimerSessionsByDay(db, dayKey) {
  if (!hasTaskTimerStore(db)) return [];
  return withTx(db, [STORE_TASK_TIMER_SESSIONS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_TASK_TIMER_SESSIONS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const sessions = await reqToPromise(idx.getAll(range));
    return (sessions || []).slice().sort((a, b) => String(a.startedAt || "").localeCompare(String(b.startedAt || "")));
  });
}

export async function getOpenTaskTimerSessionByTask(db, dayKey, taskId) {
  if (!hasTaskTimerStore(db)) return null;
  return withTx(db, [STORE_TASK_TIMER_SESSIONS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_TASK_TIMER_SESSIONS].index("by_day_task");
    const range = IDBKeyRange.only([dayKey, taskId]);
    const sessions = await reqToPromise(idx.getAll(range));
    const openSessions = (sessions || [])
      .filter((session) => OPEN_STATUSES.has(String(session?.status || "")))
      .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
    return openSessions[0] || null;
  });
}

export async function deleteTaskTimerSessionsByDay(db, dayKey) {
  if (!hasTaskTimerStore(db)) return;
  return withTx(db, [STORE_TASK_TIMER_SESSIONS], "readwrite", async (_tx, stores) => {
    const idx = stores[STORE_TASK_TIMER_SESSIONS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const sessions = await reqToPromise(idx.getAll(range));

    for (const session of sessions || []) {
      await reqToPromise(stores[STORE_TASK_TIMER_SESSIONS].delete(session.id));
    }
  });
}
