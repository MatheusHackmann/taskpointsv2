import {
  APP_NAME,
  DB_NAME,
  DB_VERSION,
  SCHEMA_VERSION,
  STORE_META,
  STORE_DAYS,
  STORE_TASKS,
  STORE_REWARDS,
  STORE_EVENTS,
  STORE_HABIT_TEMPLATES,
  STORE_HABIT_EXECUTIONS,
  STORE_TASK_TIMER_SESSIONS,
  META_KEY_LAST_EVENT_SEQ,
} from "../app/constants.js";
import { withTx, reqToPromise } from "../storage/db.js";

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_STORES = [
  STORE_META,
  STORE_DAYS,
  STORE_TASKS,
  STORE_REWARDS,
  STORE_EVENTS,
  STORE_HABIT_TEMPLATES,
  STORE_HABIT_EXECUTIONS,
  STORE_TASK_TIMER_SESSIONS,
];

export async function exportAllData(state) {
  const payload = {
    app: APP_NAME,
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    db: {
      name: DB_NAME,
      version: DB_VERSION,
    },
    exportedAt: new Date().toISOString(),
    data: {},
  };

  for (const storeName of BACKUP_STORES) {
    payload.data[storeName] = await readStore(state.db, storeName);
  }

  return payload;
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Arquivo de backup invalido.");
  }

  const backupSchemaVersion = Number(payload.backupSchemaVersion || 0);
  if (backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("Versao de backup incompativel.");
  }

  const schemaVersion = Number(payload.schemaVersion || 0);
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Versao de schema incompativel. Esperado ${SCHEMA_VERSION}, recebido ${schemaVersion}.`
    );
  }

  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("Backup sem bloco de dados.");
  }

  for (const storeName of BACKUP_STORES) {
    const rows = payload.data[storeName];
    if (!Array.isArray(rows)) {
      throw new Error(`Store obrigatoria ausente no backup: ${storeName}.`);
    }
  }

  return payload;
}

export async function importAllData(state, payload) {
  const valid = validateBackupPayload(payload);
  const data = valid.data;

  await withTx(state.db, BACKUP_STORES, "readwrite", async (_tx, stores) => {
    for (const storeName of BACKUP_STORES) {
      await reqToPromise(stores[storeName].clear());
    }

    for (const storeName of BACKUP_STORES) {
      for (const row of data[storeName]) {
        await reqToPromise(stores[storeName].put(row));
      }
    }

    // Garante consistencia do contador de sequencia de eventos.
    const maxSeq = Array.isArray(data[STORE_EVENTS])
      ? data[STORE_EVENTS].reduce((acc, event) => Math.max(acc, Number(event?.seq) || 0), 0)
      : 0;
    await reqToPromise(
      stores[STORE_META].put({
        key: META_KEY_LAST_EVENT_SEQ,
        value: maxSeq,
      })
    );
  });

  return {
    importedAt: new Date().toISOString(),
    stores: BACKUP_STORES.length,
  };
}

export function serializeBackup(payload) {
  return JSON.stringify(payload, null, 2);
}

async function readStore(db, storeName) {
  if (!db?.objectStoreNames?.contains?.(storeName)) {
    return [];
  }
  return withTx(db, [storeName], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[storeName].getAll());
  });
}
