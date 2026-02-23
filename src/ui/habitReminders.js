import { getHabitTotalsForDay, listActiveHabits } from "../domain/habits.js";

const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = "taskpoints-habit-reminders-v1";
const TOAST_VISIBLE_MS = 10_000;
const TOAST_OUT_MS = 280;
const SOUND_REPEAT_COUNT = 3;

export function startHabitReminderLoop(state) {
  let busy = false;

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runHabitReminderTick(state);
    } finally {
      busy = false;
    }
  };

  tick();
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  return () => clearInterval(timer);
}

export async function triggerHabitReminderTest(state, habitId) {
  const dayKey = state.currentDay;
  if (!dayKey) {
    throw new Error("Nenhum dia selecionado.");
  }

  const [habits, totals] = await Promise.all([
    listActiveHabits(state),
    getHabitTotalsForDay(state, dayKey),
  ]);

  const habit = (habits || []).find((item) => item.id === habitId);
  if (!habit) {
    throw new Error("Habito nao encontrado ou inativo.");
  }

  const totalsById = new Map((totals || []).map((entry) => [entry.habit.id, Number(entry.totalValue) || 0]));
  const currentValue = totalsById.get(habit.id) || 0;
  const dailyTarget = Number(habit.dailyTarget) || 0;
  const fallbackTarget = Math.max(currentValue + (Number(habit.increment) || 1), 1);
  const target = dailyTarget > 0 ? dailyTarget : fallbackTarget;

  notifyHabitReminder(habit, currentValue, target);
}

async function runHabitReminderTick(state) {
  const dayKey = state.currentDay;
  if (!dayKey) return;

  const [habits, totals] = await Promise.all([
    listActiveHabits(state),
    getHabitTotalsForDay(state, dayKey),
  ]);

  const totalsById = new Map((totals || []).map((entry) => [entry.habit.id, Number(entry.totalValue) || 0]));
  const remindersState = loadReminderState();
  const dayMap = remindersState[dayKey] || {};
  const now = Date.now();
  let changed = false;

  for (const habit of habits || []) {
    const dailyTarget = Number(habit.dailyTarget) || 0;
    if (dailyTarget <= 0) continue;

    const currentValue = totalsById.get(habit.id) || 0;
    if (currentValue >= dailyTarget) continue;

    const lastTs = Number(dayMap[habit.id]) || 0;
    if (lastTs > 0 && now - lastTs < REMINDER_INTERVAL_MS) continue;

    notifyHabitReminder(habit, currentValue, dailyTarget);
    dayMap[habit.id] = now;
    changed = true;
  }

  if (changed) {
    remindersState[dayKey] = dayMap;
    saveReminderState(remindersState);
  }
}

function notifyHabitReminder(habit, currentValue, dailyTarget) {
  const unit = habit.unit || "un";
  const missing = Math.max(0, dailyTarget - currentValue);
  const icon = habit.icon || "!";
  const title = `${icon} Lembrete de habito`;
  const message = `${habit.name}: faltam ${missing} ${unit} para a meta diaria (${currentValue}/${dailyTarget}).`;

  const toastControl = showReminderToast(title, message);
  scheduleReminderSounds(toastControl);
  showSystemNotification(title, message);
}

function showReminderToast(title, message) {
  const root = ensureReminderToastRoot();
  const toast = document.createElement("div");
  toast.className = "habit-reminder-toast";

  const header = document.createElement("div");
  header.className = "habit-reminder-toast-header";

  const strong = document.createElement("strong");
  strong.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "habit-reminder-close";
  closeBtn.setAttribute("aria-label", "Fechar lembrete");
  closeBtn.textContent = "X";

  const body = document.createElement("span");
  body.textContent = message;

  header.appendChild(strong);
  header.appendChild(closeBtn);
  toast.appendChild(header);
  toast.appendChild(body);
  root.appendChild(toast);

  let closed = false;
  const timers = [];

  const addTimer = (timerId) => {
    timers.push(timerId);
  };

  const closeToast = () => {
    if (closed) return;
    closed = true;

    for (const timerId of timers) {
      clearTimeout(timerId);
    }

    toast.classList.add("out");
    setTimeout(() => toast.remove(), TOAST_OUT_MS);
  };

  closeBtn.addEventListener("click", closeToast);
  addTimer(setTimeout(closeToast, TOAST_VISIBLE_MS));

  return {
    addTimer,
    isClosed: () => closed,
  };
}

function scheduleReminderSounds(toastControl) {
  if (!toastControl) return;
  const intervalMs = Math.floor(TOAST_VISIBLE_MS / SOUND_REPEAT_COUNT);

  for (let index = 0; index < SOUND_REPEAT_COUNT; index++) {
    const delay = index * intervalMs;
    const timerId = setTimeout(() => {
      if (toastControl.isClosed()) return;
      playReminderSound();
    }, delay);
    toastControl.addTimer(timerId);
  }
}

function ensureReminderToastRoot() {
  let root = document.getElementById("habitReminderRoot");
  if (root) return root;
  root = document.createElement("div");
  root.id = "habitReminderRoot";
  root.className = "habit-reminder-root";
  document.body.appendChild(root);
  return root;
}

function playReminderSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    tone(ctx, 920, now, 0.12, 0.14);
    tone(ctx, 760, now + 0.14, 0.12, 0.12);
  } catch (_err) {
    // ignora restricoes de autoplay/som
  }
}

function tone(ctx, freq, start, duration, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function showSystemNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const notif = new Notification(title, { body });
    setTimeout(() => notif.close(), 6000);
  } catch (_err) {
    // pode falhar em alguns ambientes
  }
}

function loadReminderState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function saveReminderState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_err) {
    // sem persistencia se localStorage indisponivel
  }
}
