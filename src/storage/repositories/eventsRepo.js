// src/storage/repositories/eventsRepo.js

import {
  STORE_EVENTS,
  STORE_META,
  META_KEY_LAST_EVENT_SEQ,
} from "../../app/constants.js";

import { withTx, reqToPromise } from "../db.js";

export async function addEvent(db, event) {
  if (!event?.id) throw new Error("addEvent: event.id é obrigatório");

  return withTx(db, [STORE_EVENTS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_EVENTS].add(event));
    return event;
  });
}

export async function nextEventSeq(db) {
  return withTx(db, [STORE_META], "readwrite", async (_tx, stores) => {
    const meta = stores[STORE_META];

    const row = await reqToPromise(meta.get(META_KEY_LAST_EVENT_SEQ));
    const last = Number(row?.value) || 0;
    const next = last + 1;

    await reqToPromise(meta.put({ key: META_KEY_LAST_EVENT_SEQ, value: next }));
    return next;
  });
}

export async function listEventsByDay(db, dayKey) {
  return withTx(db, [STORE_EVENTS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_EVENTS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const items = await reqToPromise(idx.getAll(range));
    return (items || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  });
}

export async function listEventsByDayAndType(db, dayKey, type) {
  return withTx(db, [STORE_EVENTS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_EVENTS].index("by_day_type");
    const range = IDBKeyRange.only([dayKey, type]);
    const items = await reqToPromise(idx.getAll(range));
    return (items || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  });
}

export async function listEventsByType(db, type) {
  return withTx(db, [STORE_EVENTS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_EVENTS].index("by_type");
    const range = IDBKeyRange.only(type);
    const items = await reqToPromise(idx.getAll(range));
    return (items || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  });
}

export async function listEventsByTsRange(db, startIso, endIso) {
  return withTx(db, [STORE_EVENTS], "readonly", async (_tx, stores) => {
    const idx = stores[STORE_EVENTS].index("by_ts");
    const range = IDBKeyRange.bound(startIso, endIso, false, false);
    const items = await reqToPromise(idx.getAll(range));
    return (items || []).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  });
}

/**
 * ✅ Novo: deletar todos os eventos de um dia (uso: excluir dia futuro)
 */
export async function deleteEventsByDay(db, dayKey) {
  return withTx(db, [STORE_EVENTS], "readwrite", async (_tx, stores) => {
    const idx = stores[STORE_EVENTS].index("by_day");
    const range = IDBKeyRange.only(dayKey);
    const items = await reqToPromise(idx.getAll(range));

    for (const e of items || []) {
      await reqToPromise(stores[STORE_EVENTS].delete(e.id));
    }
  });
}
