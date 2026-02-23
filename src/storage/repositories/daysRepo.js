// src/storage/repositories/daysRepo.js
// CRUD de "days" no IndexedDB

import { STORE_DAYS } from "../../app/constants.js";
import { withTx, reqToPromise } from "../db.js";

export async function getDay(db, dayKey) {
  return withTx(db, [STORE_DAYS], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_DAYS].get(dayKey));
  });
}

export async function upsertDay(db, dayData) {
  if (!dayData?.day) throw new Error("upsertDay: dayData.day é obrigatório");

  return withTx(db, [STORE_DAYS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_DAYS].put(dayData));
    return dayData;
  });
}

export async function listDays(db) {
  return withTx(db, [STORE_DAYS], "readonly", async (_tx, stores) => {
    const keys = await reqToPromise(stores[STORE_DAYS].getAllKeys());
    return (keys || []).slice().sort();
  });
}

export async function deleteDay(db, dayKey) {
  return withTx(db, [STORE_DAYS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_DAYS].delete(dayKey));
  });
}
