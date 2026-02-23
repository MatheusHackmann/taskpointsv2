// src/app/state.js

import { STORE_DAYS } from "./constants.js";

/**
 * Estado em memória do app (não persistido).
 * Mantemos aqui referências úteis, cache e a conexão do IndexedDB.
 */
export function initAppState({ db, features = {} }) {
  return {
    db,
    features: {
      taskTimerEnabled: !!features.taskTimerEnabled,
    },

    // Dia selecionado (YYYY-MM-DD). Carregado no bootstrap.
    currentDay: null,

    // Pequeno cache (opcional). A fonte de verdade é o IndexedDB.
    cache: {
      day: null,         // snapshot do day atual
      tasks: null,       // tasks do dia atual (array)
      rewards: null,     // catálogo de recompensas (array)
    },

    // UI flags
    ui: {
      lastProgressPercent: 0,
      dragTaskId: null,
      rewardConsumeSource: "day",
    },
  };
}

/**
 * Define o dia atual no estado e invalida caches dependentes do dia.
 */
export function setCurrentDay(state, dayKey) {
  state.currentDay = dayKey;
  state.cache.day = null;
  state.cache.tasks = null;
}

/**
 * Utilitário para garantir que existe um dia selecionado no estado.
 * (normalmente chamado após bootstrap)
 */
export async function ensureCurrentDay(state) {
  if (state.currentDay) return state.currentDay;

  // fallback: pega último dia existente no DB
  const days = await listDays(state.db);
  const last = days[days.length - 1] || null;
  state.currentDay = last;
  return last;
}

async function listDays(db) {
  // acesso mínimo aqui para não acoplar com repo ainda
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DAYS], "readonly");
    const store = tx.objectStore(STORE_DAYS);

    const req = store.getAllKeys();
    req.onsuccess = () => resolve((req.result || []).sort());
    req.onerror = () => reject(req.error);

    tx.onerror = () => reject(tx.error);
  });
}
