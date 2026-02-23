// src/ui/render.js
// Renderizacao principal da UI (days/tasks/rewards/progress) + confetti e sons

import { UI } from "../app/constants.js";
import { $, clear, escapeHtml } from "./dom.js";

import { dayKeyFromDate, formatDayDM, formatDayDMY, formatDayTitle, formatTimeHHMM, formatDateTimeDMYHM } from "../domain/dates.js";
import { computeProgress, shouldTriggerFullCompletion, progressHintText } from "../domain/progress.js";
import { getCategoryLabel, normalizeCategory } from "../domain/categories.js";

import { listDays, getDay } from "../storage/repositories/daysRepo.js";
import { getTasksForCurrentDay } from "../domain/tasks.js";
import { getRewardsCatalogWithDynamicCost, listRedeemedRewardsToday } from "../domain/rewards.js";
import {
  getWeeklyProgress,
  applyWeeklyGoalSettlementIfNeeded,
  getLifetimeWeeklyBonusBalance,
} from "../domain/weeklyGoals.js";
import {
  listEventsForDay,
  getPenalizedPointsForDay,
} from "../domain/logs.js";
import {
  listActiveHabits,
  listAllHabitTemplates,
  listHabitExecutionsToday,
  getHabitTotalsForDay,
} from "../domain/habits.js";

let audioContext = null;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

export function playRewardSound() {
  const ctx = ensureAudio();
  const now = ctx.currentTime;

  function successTone(freq, delay, duration, volume = 0.16) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + delay);

    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(volume, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + delay);
    osc.stop(now + delay + duration);
  }

  // Chime de sucesso curto e ascendente
  successTone(740, 0, 0.11);
  successTone(988, 0.08, 0.12);
  successTone(1318, 0.17, 0.16, 0.18);
}

export function playVictorySound() {
  const ctx = ensureAudio();
  const now = ctx.currentTime;

  function tone(freq, delay, duration, volume = 0.22, type = "sine") {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + delay);

    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(volume, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + delay);
    osc.stop(now + delay + duration);
  }

  // Sucesso premium: arpejo ascendente + "sparkle" final
  tone(523.25, 0.00, 0.16, 0.20, "triangle"); // C5
  tone(659.25, 0.09, 0.16, 0.22, "triangle"); // E5
  tone(783.99, 0.18, 0.17, 0.22, "triangle"); // G5
  tone(1046.5, 0.30, 0.22, 0.24, "sine");     // C6
  tone(1318.51, 0.43, 0.26, 0.20, "sine");    // E6
  tone(1567.98, 0.56, 0.30, 0.18, "sine");    // G6
  tone(2093.0, 0.74, 0.36, 0.16, "sine");     // C7 brilho final
}

export function launchConfetti(count = 60, durationMs = 2000) {
  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = `hsl(${Math.random() * 360},100%,50%)`;
    c.style.animationDuration = (Math.random() * 2 + 1) + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), durationMs);
  }
}

export function launchMegaCelebration() {
  playVictorySound();

  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }

  launchConfetti(200, 3000);
}

/* ===========================
   Render principal
=========================== */

export async function renderApp(state) {
  await applyWeeklyGoalSettlementIfNeeded(state);
  await renderDays(state);
  await renderHeader(state);
  await renderWeeklyGoal(state);
  await renderHabitsSection(state);
  await renderTasks(state);
  await renderProgress(state);
}

async function renderHeader(state) {
  const dayKey = state.currentDay;
  if (!dayKey) return;

  const [day, rewards, walletPoints, redeemedToday, penalizedPointsToday] = await Promise.all([
    getDay(state.db, dayKey),
    getRewardsCatalogWithDynamicCost(state),
    getLifetimeWeeklyBonusBalance(state),
    listRedeemedRewardsToday(state),
    getPenalizedPointsForDay(state, dayKey),
  ]);
  const dayPoints = Number(day?.totalPoints ?? 0);
  const redeemedPoints = (redeemedToday || []).reduce((sum, item) => sum + (Number(item?.cost) || 0), 0);
  const availableRewards = (rewards || []).filter((rw) => {
    const cost = Number(rw?.dynamicCost) || Number(rw?.cost) || 0;
    return dayPoints >= cost || walletPoints >= cost;
  }).length;

  $(UI.DAY_TITLE).textContent = formatDayTitle(dayKey);
  $(UI.DAY_POINTS).textContent = String(dayPoints);
  $(UI.DAY_REDEEMED_POINTS).textContent = String(redeemedPoints);
  $(UI.DAY_PENALIZED_POINTS).textContent = String(penalizedPointsToday);
  $(UI.WEEK_POINTS).textContent = String(walletPoints);
  applyReadOnlyMode(state);

  renderRewardsAvailableBadge(availableRewards);
}

function renderRewardsAvailableBadge(count) {
  const rewardsBtn = document.getElementById("btnOpenRewards");
  if (!rewardsBtn) return;

  const currentBadge = rewardsBtn.querySelector(".rewards-count-badge");
  if (count <= 0) {
    currentBadge?.remove();
    rewardsBtn.setAttribute("aria-label", "Abrir recompensas");
    return;
  }

  const badge = currentBadge || document.createElement("span");
  badge.className = "rewards-count-badge";
  badge.textContent = count > 99 ? "99+" : String(count);

  if (!currentBadge) {
    rewardsBtn.appendChild(badge);
  }

  rewardsBtn.setAttribute("aria-label", `Recompensas disponiveis: ${count}`);
}

async function renderWeeklyGoal(state) {
  const card = document.getElementById(UI.WEEKLY_GOAL_CARD);
  if (!card) return;

  const data = await getWeeklyProgress(state);
  const textEl = $(UI.WEEKLY_GOAL_TEXT);
  const barEl = $(UI.WEEKLY_GOAL_BAR);
  const statusEl = $(UI.WEEKLY_GOAL_STATUS);
  const levelsEl = $(UI.WEEKLY_GOAL_LEVELS);
  const readOnlyDay = isCurrentDayReadOnly(state);
  levelsEl.innerHTML = "";
  const weeklyBtn = document.getElementById(UI.BTN_OPEN_WEEKLY_GOAL);
  if (weeklyBtn) {
    weeklyBtn.disabled = readOnlyDay;
    weeklyBtn.title = readOnlyDay ? "Dia anterior: modo somente leitura" : "Configurar";
  }

  if (data.goal <= 0) {
    textEl.textContent = "Sem meta semanal definida.";
    statusEl.textContent = `Defina uma meta para acompanhar sua semana. Saldo acumulado: ${data.walletBalance} pts.`;
    barEl.style.width = "0%";
    barEl.style.background = "linear-gradient(90deg,#9ca3af,#6b7280)";
    return;
  }

  textEl.textContent = `${data.points} / ${data.goal} pontos (${data.percent.toFixed(1)}%)`;
  barEl.style.width = `${data.percent}%`;

  if (data.percent >= 100) {
    barEl.style.background = "linear-gradient(90deg,#22c55e,#16a34a)";
    const startKey = String(data.createdAt || "").slice(0, 10) || data.weekStartKey;
    statusEl.textContent = `Semana em andamento: ${formatDayDMY(startKey)} -> ${formatDayDMY(data.weekEndKey)}`;
  } else {
    if (data.percent >= 70) {
      barEl.style.background = "linear-gradient(90deg,#facc15,#22c55e)";
    } else {
      barEl.style.background = "linear-gradient(90deg,#ef4444,#f97316)";
    }
    const startKey = String(data.createdAt || "").slice(0, 10) || data.weekStartKey;
    statusEl.textContent = `Semana em andamento: ${formatDayDMY(startKey)} -> ${formatDayDMY(data.weekEndKey)}`;
  }

  const rewardChip = document.createElement("span");
  rewardChip.className = "weekly-level-chip unlocked";
  rewardChip.textContent = `Recompensa: +${data.rewardPoints} pts`;
  levelsEl.appendChild(rewardChip);

  const penaltyChip = document.createElement("span");
  penaltyChip.className = "weekly-level-chip rewarded";
  penaltyChip.textContent = `Prejuizo: ${data.penaltyPercent}% (-${data.penaltyPoints} pts)`;
  levelsEl.appendChild(penaltyChip);

  const overtakeChip = document.createElement("span");
  overtakeChip.className = "weekly-level-chip";
  overtakeChip.textContent = `Superacao antecipada: +${data.overtakeDailyBonus || 50} pts/dia restante (acumulado ${data.overtakeBonusAwardedPoints || 0} pts)`;
  levelsEl.appendChild(overtakeChip);

  if (data.settlement) {
    const settledChip = document.createElement("span");
    settledChip.className = "weekly-level-chip";
    settledChip.textContent = data.settlement.reached
      ? `Semana encerrada: bonus aplicado +${data.settlement.rewardApplied} pts`
      : `Semana encerrada: penalidade aplicada -${data.settlement.penaltyApplied} pts`;
    levelsEl.appendChild(settledChip);
  }
}

async function renderDays(state) {
  const days = await listDays(state.db);
  const dayListEl = $(UI.DAY_LIST);
  clear(dayListEl);

  const last7 = days.slice(-7);
  for (const d of last7) {
    const chip = document.createElement("div");
    chip.className = "day-chip" + (d === state.currentDay ? " active" : "");
    chip.textContent = formatDayDM(d);
    chip.dataset.day = d; // usado nos handlers
    dayListEl.appendChild(chip);
  }
}

async function renderTasks(state) {
  const readOnlyDay = isCurrentDayReadOnly(state);
  const [tasks, events] = await Promise.all([
    getTasksForCurrentDay(state),
    listEventsForDay(state, state.currentDay),
  ]);
  const taskHistoryById = buildTaskHistoryById(events);

  const pendingEl = $(UI.PENDING_TASKS);
  const completedEl = $(UI.COMPLETED_TASKS);
  clear(pendingEl);
  clear(completedEl);

  tasks.forEach((t, index) => {
    const taskCategory = normalizeCategory(t.category);
    const isPendingLocked = readOnlyDay || (!t.completed && isPendingTaskLockedByDayTurn(t));
    const div = document.createElement("div");
    div.className = "card" + (t.completed ? " completed" : "") + (isPendingLocked ? " locked" : "");
    div.draggable = !t.completed && !isPendingLocked;
    div.dataset.taskId = t.id;
    div.dataset.index = String(index);

    const actionsHtml = t.completed
      ? renderCompletedTaskInfo(t, taskHistoryById.get(t.id))
      : `
    <div class="task-actions">
      <button class="task-start" type="button" data-task-id="${escapeHtml(t.id)}" ${t.startedAt || isPendingLocked ? "disabled" : ""} title="${isPendingLocked ? "Dia encerrado" : (t.startedAt ? "Ja iniciada" : "Iniciar task")}">&#9654;</button>
      <button class="task-delete" type="button" data-task-id="${escapeHtml(t.id)}" ${isPendingLocked ? "disabled" : ""} title="${isPendingLocked ? "Dia encerrado" : "Excluir task"}">&#10005;</button>
    </div>
      `;

    const categoryBadgeHtml = t.completed
      ? `<span class="task-category-badge">${escapeHtml(getCategoryLabel(taskCategory))}</span>`
      : `<button class="task-category-badge task-category-toggle" type="button" data-task-id="${escapeHtml(t.id)}" data-category="${escapeHtml(taskCategory)}" title="Trocar categoria">${escapeHtml(getCategoryLabel(taskCategory))}</button>`;

    div.innerHTML = `
  <div class="task-row">
    <div class="task-left">
      ${t.completed ? "" : `<span class="drag-handle">::</span>`}
      <span class="priority-flag ${escapeHtml(t.priority)}"></span>
      <input class="task-toggle" type="checkbox" ${t.completed ? "checked" : ""} ${isPendingLocked ? "disabled" : ""} data-task-id="${escapeHtml(t.id)}">

      ${!t.completed && t.startedAt 
        ? `<span class="started-badge" title="Task iniciada">Hora: ${escapeHtml(formatTimeHHMM(t.startedAt))}</span>` 
        : ""}

      <span class="task-title">${escapeHtml(t.name)} (+${Number(t.points) || 0})${isPendingLocked ? ' <span class="lock-badge">Dia encerrado</span>' : ""}</span>
      ${categoryBadgeHtml}
    </div>

    ${actionsHtml}
  </div>
`;

    (t.completed ? completedEl : pendingEl).appendChild(div);
  });
}

async function renderHabitsSection(state) {
  const wrap = $(UI.HABITS_SECTION);
  clear(wrap);

  const dayKey = state.currentDay;
  if (!dayKey) return;

  const [habits, totals] = await Promise.all([
    listActiveHabits(state),
    getHabitTotalsForDay(state, dayKey),
  ]);

  if (!habits.length) {
    wrap.innerHTML = `<div class="card">Nenhum habito cadastrado. Clique em "Gerenciar habitos" para criar o primeiro.</div>`;
    return;
  }

  const totalsByHabitId = new Map((totals || []).map((x) => [x.habit.id, x]));

  habits.forEach((habit) => {
    const acc = totalsByHabitId.get(habit.id);
    const count = Number(acc?.count) || 0;
    const totalValue = Number(acc?.totalValue) || 0;
    const totalPoints = Number(acc?.totalPoints) || 0;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "habit-quick-card";
    btn.dataset.habitId = habit.id;
    btn.disabled = isCurrentDayReadOnly(state);

    const icon = escapeHtml(habit.icon || "+");
    const name = escapeHtml(habit.name || "Habito");
    const unit = escapeHtml(habit.unit || "un");
    const increment = Number(habit.increment) || 0;
    const points = Number(habit.points) || 0;
    const category = normalizeCategory(habit.category);
    const dailyTarget = Number(habit.dailyTarget) || 0;
    const progressLabel = dailyTarget > 0
      ? `${count}x • ${totalValue}/${dailyTarget} ${unit}`
      : `${count}x • +${totalPoints}`;

    btn.innerHTML = `
      <div class="habit-quick-main">
        <span class="habit-quick-icon" aria-hidden="true">${icon}</span>
        <span class="habit-quick-inline">${name} • ${progressLabel}</span>
        <span class="task-category-badge task-category-badge-inline">${escapeHtml(getCategoryLabel(category))}</span>
      </div>
      <span class="habit-quick-action" aria-hidden="true">+</span>
    `;
    btn.title = dailyTarget > 0
      ? `Meta diaria: ${dailyTarget} ${unit} • Hoje: ${totalValue} ${unit} • +${points} pts por clique`
      : `+${increment} ${unit} por clique • +${points} pts • Hoje: ${totalValue} ${unit}`;

    wrap.appendChild(btn);
  });
}

function isPendingTaskLockedByDayTurn(task) {
  if (!task || task.completed) return false;
  const today = dayKeyFromDate(new Date());
  return String(task.day || "") < today;
}

function isCurrentDayReadOnly(state) {
  const day = String(state?.currentDay || "");
  if (!day) return false;
  const today = dayKeyFromDate(new Date());
  return day < today;
}

function applyReadOnlyMode(state) {
  const readOnly = isCurrentDayReadOnly(state);
  const idsToDisable = [
    "taskName",
    "taskCategory",
    "taskComplexity",
    "taskAversion",
    "taskImpact",
    "btnAddTask",
    "btnSyncPendingDefaults",
    "btnOpenCreateHabit",
    "btnConfirmHabit",
    "btnOpenCreateReward",
    "btnConfirmCreateReward",
    UI.REWARD_CONSUME_SOURCE_INPUT,
    UI.BTN_SAVE_WEEKLY_GOAL,
    UI.BTN_MAX_PENALTY,
  ];

  idsToDisable.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = readOnly;
  });
}

function renderCompletedTaskInfo(task, history) {
  const createdAt = formatTaskDateTime(task.createdAt);
  const startedAt = formatTaskDateTime(task.startedAt || history?.starts?.[0]);
  const finalCompletedAt = formatTaskDateTime(task.completedAt || history?.completes?.at(-1));
  const reopenCycles = buildReopenCycles(history);

  const reopenHtml = reopenCycles.length
    ? reopenCycles.map((cycle, idx) => `
        <div class="task-info-row">
          <span>Ciclo ${idx + 1}</span>
          <b>Desmarcou: ${escapeHtml(formatTaskDateTime(cycle.uncheckedAt))} | Remarcou: ${escapeHtml(formatTaskDateTime(cycle.recheckedAt))}</b>
        </div>
      `).join("")
    : `<div class="task-info-empty">Nao houve desmarcacao/remarcacao.</div>`;

  return `
    <div class="task-actions task-actions-completed">
      <div class="task-info-wrap">
        <button
          class="task-info-btn"
          type="button"
          aria-label="Ver detalhes de horario da task"
          title="Ver detalhes de horario da task"
        >i</button>
        <div class="task-info-tooltip" role="dialog" aria-label="Detalhes da task concluida">
          <div class="task-info-title">Detalhes da task</div>
          <div class="task-info-row"><span>Criacao</span><b>${escapeHtml(createdAt)}</b></div>
          <div class="task-info-row"><span>Inicio</span><b>${escapeHtml(startedAt)}</b></div>
          <div class="task-info-row"><span>Conclusao final</span><b>${escapeHtml(finalCompletedAt)}</b></div>
          ${reopenHtml}
        </div>
      </div>
    </div>
  `;
}

function buildTaskHistoryById(events) {
  const map = new Map();
  (events || []).forEach((event) => {
    const taskId = event?.meta?.taskId;
    if (!taskId) return;
    if (!map.has(taskId)) {
      map.set(taskId, {
        starts: [],
        completes: [],
        uncompletes: [],
      });
    }

    const history = map.get(taskId);
    if (event.type === "task.start") {
      history.starts.push(event.meta?.startedAt || event.ts);
      return;
    }
    if (event.type === "task.complete") {
      history.completes.push(event.meta?.completedAt || event.ts);
      return;
    }
    if (event.type === "task.uncomplete") {
      history.uncompletes.push(event.ts);
    }
  });
  return map;
}

function buildReopenCycles(history) {
  if (!history?.uncompletes?.length) return [];
  const completes = [...(history.completes || [])];
  const cycles = [];

  let completeIdx = 0;
  for (const uncheckedAt of history.uncompletes) {
    while (completeIdx < completes.length && completes[completeIdx] <= uncheckedAt) {
      completeIdx += 1;
    }
    const recheckedAt = completeIdx < completes.length ? completes[completeIdx] : null;
    if (recheckedAt) {
      completeIdx += 1;
    }
    cycles.push({ uncheckedAt, recheckedAt });
  }

  return cycles;
}

function formatTaskDateTime(isoTs) {
  return formatDateTimeDMYHM(isoTs);
}

async function renderProgress(state) {
  const tasks = await getTasksForCurrentDay(state);
  const { percent } = computeProgress(tasks);

  const bar = $(UI.PROGRESS_BAR);
  const text = $(UI.PROGRESS_TEXT);

  bar.style.width = percent + "%";
  text.textContent = progressHintText(percent);

  // cores iguais ao seu projeto antigo (mas sem "setar cores no JS" fixo demais)
  // aqui mantemos o gradiente variando por faixa pra manter UX, mas sem travar tema
  if (percent < 50) {
    bar.style.background = "linear-gradient(90deg,#ef4444,#f97316)";
  } else if (percent < 80) {
    bar.style.background = "linear-gradient(90deg,#facc15,#22c55e)";
  } else if (percent < 100) {
    bar.style.background = "linear-gradient(90deg,#22c55e,#16a34a)";
  } else {
    bar.style.background = "linear-gradient(90deg,#22c55e,#6366f1)";
  }

  if (percent >= 80) bar.classList.add("glow");
  else bar.classList.remove("glow");

  if (shouldTriggerFullCompletion(percent, state.ui.lastProgressPercent)) {
    launchMegaCelebration();
  }

  state.ui.lastProgressPercent = percent;
}

/* ===========================
   Render modal Recompensas
=========================== */

export async function renderRewardsModal(state) {
  const dayKey = state.currentDay;
  if (!dayKey) return;

  const day = await getDay(state.db, dayKey);
  const dayPoints = Number(day?.totalPoints) || 0;
  const walletPoints = await getLifetimeWeeklyBonusBalance(state);
  const consumeSource = state.ui.rewardConsumeSource === "weekly" ? "weekly" : "day";
  const readOnlyDay = isCurrentDayReadOnly(state);
  const points = consumeSource === "weekly" ? walletPoints : dayPoints;

  $(UI.MODAL_DAY_POINTS).textContent = String(points);
  $(UI.MODAL_DAY_POINTS_ONLY).textContent = String(dayPoints);
  $(UI.MODAL_WEEKLY_POINTS).textContent = String(walletPoints);

  const catalogEl = $(UI.REWARDS_CATALOG_LIST);
  const redeemedEl = $(UI.REWARDS_REDEEMED_LIST);
  clear(catalogEl);
  clear(redeemedEl);

  // Resgatadas (hoje)
  const redeemed = await listRedeemedRewardsToday(state);
  if (!redeemed.length) {
    redeemedEl.innerHTML = `<div class="card">Nenhuma recompensa resgatada hoje.</div>`;
  } else {
    redeemed.forEach((r) => {
      const card = document.createElement("div");
      card.className = "card redeemed-item";
      card.innerHTML = `
        <div>
          <div><b>${escapeHtml(r.rewardName || "Recompensa")}</b></div>
          <div class="reward-meta">-${Number(r.cost) || 0} pontos | ${escapeHtml(formatTimeHHMM(r.ts))}</div>
        </div>
      `;
      redeemedEl.appendChild(card);
    });
  }

  // Catalogo
  const rewards = await getRewardsCatalogWithDynamicCost(state);

  if (!rewards.length) {
    catalogEl.innerHTML = `<div class="card">Nenhuma recompensa cadastrada ainda.</div>`;
    return;
  }

  rewards.forEach((rw) => {
    const cost = Number(rw.dynamicCost) || Number(rw.cost) || 0;
    const baseCost = Number(rw.baseCost || rw.cost) || cost;
    const canRedeem = !readOnlyDay && points >= cost;
    const missing = cost - points;

    const card = document.createElement("div");
    card.className = "card " + (canRedeem ? "" : "reward-locked");

    card.innerHTML = `
      <div class="reward-item">
        <div>
          <div><b>${escapeHtml(rw.name)}</b></div>
          <div class="reward-meta">Custo hoje: <b>${cost}</b> pontos</div>
          <div class="reward-meta">Base: ${baseCost} | Fase: x${Number(rw.onboardingFactor || 1).toFixed(2)} | Resgates hoje: ${Number(rw.redemptionsTodayCount) || 0}</div>
          ${
            canRedeem
              ? `<div class="reward-meta"><span class="lock-badge">Disponivel</span></div>`
              : `<div class="reward-meta"><span class="lock-badge">Faltam ${missing} pontos</span></div>`
          }
        </div>

        <div class="flex" style="justify-content:flex-end;">
          <button class="reward-redeem" type="button" data-reward-id="${escapeHtml(rw.id)}" ${canRedeem ? "" : "disabled"}>
            ${readOnlyDay ? "Somente leitura" : (canRedeem ? "Resgatar" : "Bloqueada")}
          </button>

          <button class="reward-delete btn-danger" type="button" data-reward-id="${escapeHtml(rw.id)}" title="Excluir recompensa" ${readOnlyDay ? "disabled" : ""}>
            Excluir
          </button>
        </div>
      </div>
    `;

    catalogEl.appendChild(card);
  });
}

export async function renderHabitsModal(state) {
  const readOnlyDay = isCurrentDayReadOnly(state);
  const [templates, executions] = await Promise.all([
    listAllHabitTemplates(state),
    listHabitExecutionsToday(state),
  ]);

  const templatesEl = $(UI.HABITS_LIST);
  const execsEl = $(UI.HABIT_EXECUTIONS_LIST);
  clear(templatesEl);
  clear(execsEl);

  if (!templates.length) {
    templatesEl.innerHTML = `<div class="card">Nenhum habito cadastrado.</div>`;
  } else {
    templates.forEach((h) => {
      const active = !!h.isActive;
      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="habit-row">
          <div>
            <div><b>${escapeHtml(h.icon || "+")} ${escapeHtml(h.name)}</b></div>
            <div class="reward-meta">${Number(h.increment) || 0} ${escapeHtml(h.unit || "un")} por clique | +${Number(h.points) || 0} pts</div>
            <div class="reward-meta">Categoria: ${escapeHtml(getCategoryLabel(h.category))}</div>
            ${Number(h.dailyTarget) > 0 ? `<div class="reward-meta">Meta diaria: ${Number(h.dailyTarget)} ${escapeHtml(h.unit || "un")}</div>` : ""}
          </div>
          <div class="habit-actions">
            <button class="habit-execute" type="button" data-habit-id="${escapeHtml(h.id)}" ${(active && !readOnlyDay) ? "" : "disabled"}>Registrar</button>
            <button class="habit-edit" type="button" data-habit-id="${escapeHtml(h.id)}" ${readOnlyDay ? "disabled" : ""}>Editar</button>
            <button class="btn-danger habit-delete" type="button" data-habit-id="${escapeHtml(h.id)}" ${readOnlyDay ? "disabled" : ""}>Excluir</button>
          </div>
        </div>
      `;
      templatesEl.appendChild(row);
    });
  }

  if (!executions.length) {
    execsEl.innerHTML = `<div class="card">Nenhum registro de habito hoje.</div>`;
    return;
  }

  const byId = new Map((templates || []).map((t) => [t.id, t]));
  executions.forEach((e) => {
    const template = byId.get(e.habitId);
    const habitName = template?.name || "Habito";
    const unit = template?.unit || "un";
    const icon = template?.icon || "+";

    const row = document.createElement("div");
    row.className = "card";
    row.innerHTML = `
      <div class="habit-row">
        <div>
          <div><b>${escapeHtml(icon)} ${escapeHtml(habitName)}</b></div>
          <div class="reward-meta">${Number(e.value) || 0} ${escapeHtml(unit)} | +${Number(e.points) || 0} pts | ${escapeHtml(formatTimeHHMM(e.ts))}</div>
        </div>
        <div class="habit-actions">
          <button class="habit-exec-undo btn-danger" type="button" data-exec-id="${escapeHtml(e.id)}" ${readOnlyDay ? "disabled" : ""}>Desfazer</button>
        </div>
      </div>
    `;
    execsEl.appendChild(row);
  });
}

export async function renderLogsModal(state) {
  const dayKey = state.currentDay;
  if (!dayKey) return;

  const logs = await listEventsForDay(state, dayKey);
  const listEl = $(UI.LOG_LIST);
  clear(listEl);

  if (!logs.length) {
    listEl.innerHTML = `<div class="card">Nenhum log registrado hoje.</div>`;
    return;
  }

  logs.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "log-entry";
    row.innerHTML = `
      <div class="log-entry-header">
        <span>${escapeHtml(formatTimeHHMM(entry.ts || new Date().toISOString()))}</span>
        <span>${escapeHtml(entry.type || "evento")}</span>
      </div>
      <div class="log-entry-meta">${escapeHtml(renderMeta(entry.meta))}</div>
    `;
    listEl.appendChild(row);
  });
}

function renderMeta(meta) {
  if (!meta || typeof meta !== "object") return JSON.stringify(meta ?? {});
  const parts = [];
  for (const [key, value] of Object.entries(meta)) {
    let formatted = value;
    if (typeof value === "object") {
      formatted = JSON.stringify(value);
    }
    parts.push(`${key}: ${formatted}`);
  }
  return parts.join(" | ") || "sem meta";
}



