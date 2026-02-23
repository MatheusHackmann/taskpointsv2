// src/storage/repositories/habitsRepo.js
// CRUD de Habit Templates (catálogo global)

import { STORE_HABIT_TEMPLATES } from "../../app/constants.js";
import { withTx, reqToPromise } from "../db.js";

export async function getHabitTemplate(db, id) {
  return withTx(db, [STORE_HABIT_TEMPLATES], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_HABIT_TEMPLATES].get(id));
  });
}

export async function upsertHabitTemplate(db, template) {
  if (!template?.id) throw new Error("upsertHabitTemplate: template.id é obrigatório");
  if (!template?.name) throw new Error("upsertHabitTemplate: template.name é obrigatório");

  return withTx(db, [STORE_HABIT_TEMPLATES], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_HABIT_TEMPLATES].put(template));
    return template;
  });
}

export async function deleteHabitTemplate(db, id) {
  return withTx(db, [STORE_HABIT_TEMPLATES], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_HABIT_TEMPLATES].delete(id));
  });
}

export async function listHabitTemplates(db) {
  return withTx(db, [STORE_HABIT_TEMPLATES], "readonly", async (_tx, stores) => {
    const all = await reqToPromise(stores[STORE_HABIT_TEMPLATES].getAll());
    return (all || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  });
}

export async function listActiveHabitTemplates(db) {
  return withTx(db, [STORE_HABIT_TEMPLATES], "readonly", async (_tx, stores) => {
    const all = await reqToPromise(stores[STORE_HABIT_TEMPLATES].getAll());
    return (all || [])
      .filter((x) => !!x?.isActive)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));
  });
}
