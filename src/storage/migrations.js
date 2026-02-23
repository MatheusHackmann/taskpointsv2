// src/storage/migrations.js
// Migrações de dados (app-level) após o DB abrir.
// Como estamos começando "do zero" em IndexedDB v1, aqui vamos:
// - garantir meta schemaVersion e lastEventSeq
// - limpar/normalizar estruturas se já existirem (caso usuário reutilize DB antigo)
// - opcional: migrar do localStorage legado (depois, se você quiser)

import {
  STORE_META,
  STORE_TASKS,
  STORE_HABIT_TEMPLATES,
  META_KEY_SCHEMA,
  META_KEY_LAST_EVENT_SEQ,
  SCHEMA_VERSION,
} from "../app/constants.js";
import { getCategories, normalizeCategory } from "../domain/categories.js";

import { withTx, reqToPromise } from "./db.js";

/**
 * Executa migrações. Deve ser idempotente (rodar várias vezes sem estragar).
 */
export async function runMigrations(db) {
  // 1) Garantir meta keys
  await ensureMeta(db);

  // 2) Garantir catalogo de categorias
  await getCategories(db);

  // 3) Normalizar categorias legadas em tasks/habitos
  await normalizeLegacyCategories(db);

  // 4) (Opcional futuro) migrar localStorage legado -> indexedDB
  // await migrateLegacyLocalStorage(db);

  // 5) No futuro: normalizações adicionais
  // await normalizeSomething(db);
}

async function ensureMeta(db) {
  await withTx(db, [STORE_META], "readwrite", async (tx, stores) => {
    const meta = stores[STORE_META];

    const schemaRow = await reqToPromise(meta.get(META_KEY_SCHEMA));
    if (!schemaRow) {
      await reqToPromise(meta.put({ key: META_KEY_SCHEMA, value: SCHEMA_VERSION }));
    } else if (Number(schemaRow.value) !== SCHEMA_VERSION) {
      // Se você subir SCHEMA_VERSION futuramente, dá pra usar aqui pra disparar migrações app-level
      await reqToPromise(meta.put({ key: META_KEY_SCHEMA, value: SCHEMA_VERSION }));
    }

    const seqRow = await reqToPromise(meta.get(META_KEY_LAST_EVENT_SEQ));
    if (!seqRow) {
      await reqToPromise(meta.put({ key: META_KEY_LAST_EVENT_SEQ, value: 0 }));
    } else if (!Number.isFinite(Number(seqRow.value))) {
      await reqToPromise(meta.put({ key: META_KEY_LAST_EVENT_SEQ, value: 0 }));
    }
  });
}

async function normalizeLegacyCategories(db) {
  await withTx(
    db,
    [STORE_TASKS, STORE_HABIT_TEMPLATES],
    "readwrite",
    async (_tx, stores) => {
      const tasksStore = stores[STORE_TASKS];
      const habitsStore = stores[STORE_HABIT_TEMPLATES];

      const tasks = await reqToPromise(tasksStore.getAll());
      for (const task of tasks || []) {
        const normalized = normalizeCategory(task?.category);
        if (task?.category === normalized) continue;
        await reqToPromise(tasksStore.put({ ...task, category: normalized }));
      }

      const habitTemplates = await reqToPromise(habitsStore.getAll());
      for (const template of habitTemplates || []) {
        const normalized = normalizeCategory(template?.category);
        if (template?.category === normalized) continue;
        await reqToPromise(habitsStore.put({ ...template, category: normalized }));
      }
    }
  );
}
