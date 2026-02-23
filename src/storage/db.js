// src/storage/db.js
// Wrapper Promisificado para IndexedDB + aplicação do schema (onupgradeneeded)

import { applySchema } from "./schema.js";

/**
 * Abre o IndexedDB e garante schema (stores + indexes).
 * Retorna a instância de IDBDatabase.
 */
export function openDB(dbName, version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion || 0;
      const newVersion = event.newVersion || version;
      const upgradeTx = event.target?.transaction || req.transaction || null;

      // Cria/atualiza stores/indexes conforme schema
      applySchema(db, oldVersion, newVersion, upgradeTx);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      console.warn("[IndexedDB] Upgrade bloqueado: feche outras abas usando o app.");
    };
  });
}

/**
 * Helper para executar transações com Promise.
 * mode: "readonly" | "readwrite"
 * storeNames: string[] (stores usadas)
 * fn: (tx, storesMap) => any (pode retornar promise)
 */
export function withTx(db, storeNames, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(
      storeNames.map((name) => [name, tx.objectStore(name)])
    );

    let result;
    try {
      result = fn(tx, stores);
    } catch (err) {
      tx.abort();
      reject(err);
      return;
    }

    tx.oncomplete = async () => {
      try {
        // se fn retornou promise, aguarda aqui
        if (result && typeof result.then === "function") {
          resolve(await result);
        } else {
          resolve(result);
        }
      } catch (err) {
        reject(err);
      }
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

/**
 * Helpers básicos para requests do IDB.
 */
export function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
