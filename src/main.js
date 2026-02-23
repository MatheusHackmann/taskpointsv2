// src/main.js
// Bootstrap do app: abre IndexedDB, roda migrações, garante dados mínimos, faz bind de eventos e render inicial.

import { initAppState } from "./app/state.js";
import { DB_NAME, DB_VERSION, EVENT } from "./app/constants.js";

import { openDB } from "./storage/db.js";
import { runMigrations } from "./storage/migrations.js";

import { ensureBootstrapData } from "./domain/defaults.js";
import { maybeSeedReportsData } from "./domain/seedReportsData.js";
import { addWeeklyWalletAdjustment } from "./domain/weeklyGoals.js";
import { syncCurrentDayWithClock, startDayRolloverLoop } from "./domain/dayRollover.js";
import { getDay, upsertDay } from "./storage/repositories/daysRepo.js";
import { listEventsByType, listEventsByDayAndType } from "./storage/repositories/eventsRepo.js";
import { logPointsRecompute } from "./domain/logs.js";

import { bindUIEvents } from "./ui/events.js";
import { renderApp } from "./ui/render.js";
import { startHabitReminderLoop } from "./ui/habitReminders.js";
import { showSystemAlert } from "./ui/feedback.js";

async function main() {
  try {
    // 1) Abre DB (IndexedDB) e guarda no estado global do app
    const db = await openDB(DB_NAME, DB_VERSION);

    // 2) Migra dados antigos (se existirem) e normaliza schema
    await runMigrations(db);

    // 3) Estado em memória (currentDay etc.)
    const appState = initAppState({ db });

    // 4) Garante que existe pelo menos 1 dia (hoje) e recompensas seed
    await ensureBootstrapData(appState);
    await syncCurrentDayWithClock(appState);
    const todayRow = await getDay(db, appState.currentDay);
    // Hotfix: corrige saldo do dia atual afetado por bug antigo (76 -> 66).
    if (todayRow && Number(todayRow.totalPoints) === 76) {
      await upsertDay(db, {
        ...todayRow,
        totalPoints: 66,
      });
    }
    await maybeSeedReportsData(appState);
    await addWeeklyWalletAdjustment(appState, {
      points: 150,
      reason: "Reembolso: desconto indevido da carteira semanal",
      idempotencyKey: "wallet-refund-150-2026-02-23",
    }).catch(() => null);
    await maybeRevertKnownPenaltyIncident(appState).catch(() => null);

    // 5) Eventos de UI (sem onclick inline)
    bindUIEvents(appState);

    // 6) Render inicial
    await renderApp(appState);

    // 7) Lembretes de habitos com meta diaria (visual + sonoro)
    startHabitReminderLoop(appState);

    // 8) Virada automatica de dia (00h): bloqueio de pendentes do dia passado + novo dia
    startDayRolloverLoop(appState, async () => {
      await renderApp(appState);
    });
  } catch (err) {
    console.error("[TaskPoints] Falha ao iniciar:", err);
    await showSystemAlert({
      tone: "danger",
      title: "Falha ao iniciar",
      confirmLabel: "Fechar",
      message:
      "Falha ao iniciar o TaskPoints. Veja o console (F12) para detalhes.\n\n" +
      (err?.message || String(err))
    });
  }
}

// Inicia após o DOM carregar
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

async function maybeRevertKnownPenaltyIncident(state) {
  const INCIDENT_ID = "penalty-revert-117-169-286-2026-02-23";

  const penaltyEvents = await listEventsByType(state.db, EVENT.PENALTY_MAX_TRIGGER);
  const target = (penaltyEvents || []).find((event) => {
    const meta = event?.meta || {};
    return (
      Number(meta.penalizedDayPoints) === 117 &&
      Number(meta.penalizedWalletPoints) === 169 &&
      Number(meta.totalPenalizedPoints) === 286 &&
      Number(meta.dayPointsBefore) === 117 &&
      Number(meta.walletBefore) === 169 &&
      Number(meta.dayPointsAfter) === 0 &&
      Number(meta.walletAfter) === 0
    );
  });

  if (!target?.day) return;

  const alreadyApplied = await listEventsByDayAndType(state.db, target.day, EVENT.POINTS_RECOMPUTE);
  const hasMarker = (alreadyApplied || []).some(
    (event) => String(event?.meta?.reason || "").includes(INCIDENT_ID)
  );
  if (hasMarker) return;

  const day = await getDay(state.db, target.day);
  const dayBefore = Number(day?.totalPoints) || 0;
  const dayAfter = dayBefore + 117;

  await upsertDay(state.db, {
    ...(day || {}),
    day: target.day,
    totalPoints: dayAfter,
  });

  await addWeeklyWalletAdjustment(state, {
    points: 169,
    reason: `Reversao de penalidade maxima (${INCIDENT_ID})`,
    idempotencyKey: INCIDENT_ID,
  });

  const prevCurrentDay = state.currentDay;
  state.currentDay = target.day;
  await logPointsRecompute(state, {
    day: target.day,
    before: dayBefore,
    after: dayAfter,
    reason: `Reversao de penalidade maxima aplicada automaticamente (${INCIDENT_ID})`,
  });
  state.currentDay = prevCurrentDay;
}
