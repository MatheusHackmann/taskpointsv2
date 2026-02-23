// src/domain/events.js
// Criação padronizada de eventos (logs) para análises futuras.

import { EVENT } from "../app/constants.js";
import { newId } from "./id.js";
import { dayKeyFromDate, getTzOffsetMin, isoNow } from "./dates.js";

import { nextEventSeq, addEvent } from "../storage/repositories/eventsRepo.js";

/**
 * Cria e persiste um evento no event log.
 * - Gera seq incremental (ordenável) via meta no IndexedDB
 * - Guarda timestamp UTC ISO + offset do usuário
 * - Guarda dayKey local (YYYY-MM-DD)
 */
export async function logEvent(state, type, meta = {}, opts = {}) {
  const now = new Date();
  const ts = isoNow();
  const tzOffsetMin = getTzOffsetMin(now);
  const day = opts.day || state.currentDay || dayKeyFromDate(now);

  const seq = await nextEventSeq(state.db);

  const event = {
    id: newId("e"),
    seq,
    ts,
    tzOffsetMin,
    day,
    type,
    actor: opts.actor || "user",
    source: opts.source || "ui",
    meta,
  };

  await addEvent(state.db, event);
  return event;
}

// Exporta tipos para uso conveniente (não obrigatório)
export { EVENT };
