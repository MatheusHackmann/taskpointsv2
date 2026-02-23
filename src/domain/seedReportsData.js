import { EVENT } from "../app/constants.js";
import { dayKeyFromDate, getTzOffsetMin } from "./dates.js";
import { newId } from "./id.js";
import { getPriority } from "./defaults.js";

import { upsertDay } from "../storage/repositories/daysRepo.js";
import { bulkUpsertTasks, deleteTasksByDay } from "../storage/repositories/tasksRepo.js";
import { upsertHabitTemplate } from "../storage/repositories/habitsRepo.js";
import { addHabitExecution, deleteHabitExecutionsByDay } from "../storage/repositories/habitExecutionsRepo.js";
import { bulkUpsertRewards } from "../storage/repositories/rewardsRepo.js";
import { addEvent, deleteEventsByDay, nextEventSeq } from "../storage/repositories/eventsRepo.js";

const REPORT_TASKS = [
  ["Planejamento do dia", 20],
  ["Bloco deep work", 80],
  ["Mensagens e e-mails", 25],
  ["Treino", 40],
  ["Estudo focado", 50],
  ["Revisao final", 30],
];

const REPORT_HABITS = [
  { id: "h_seed_water", name: "Hidratacao", unit: "ml", increment: 500, points: 5, icon: "💧" },
  { id: "h_seed_focus", name: "Foco", unit: "min", increment: 25, points: 12, icon: "🧠" },
  { id: "h_seed_walk", name: "Caminhada", unit: "min", increment: 20, points: 15, icon: "🚶" },
];

const REPORT_REWARDS = [
  { id: "r_seed_coffee", name: "Cafeteria premium", cost: 40 },
  { id: "r_seed_movie", name: "Episodio de serie", cost: 90 },
];

export async function maybeSeedReportsData(state) {
  const params = new URLSearchParams(window.location.search);
  if (params.get("seedReports") !== "1") return false;
  await seedLast7DaysForReports(state);
  return true;
}

export async function seedLast7DaysForReports(state) {
  const dayKeys = last7DayKeys();

  await bulkUpsertRewards(
    state.db,
    REPORT_REWARDS.map((reward) => ({
      ...reward,
      createdAt: new Date().toISOString(),
    }))
  );

  for (const habit of REPORT_HABITS) {
    await upsertHabitTemplate(state.db, {
      ...habit,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  for (let dayIndex = 0; dayIndex < dayKeys.length; dayIndex += 1) {
    const dayKey = dayKeys[dayIndex];

    await deleteTasksByDay(state.db, dayKey);
    await deleteEventsByDay(state.db, dayKey);
    await deleteHabitExecutionsByDay(state.db, dayKey);

    await upsertDay(state.db, {
      day: dayKey,
      totalPoints: 0,
      createdAt: isoAt(dayKey, 6, 0),
      notes: "Seed de teste para relatorios",
    });

    const completionBias = [0.5, 0.68, 0.82, 0.6, 0.9, 0.72, 0.86][dayIndex];
    const tasks = [];
    let dayPoints = 0;

    for (let taskIndex = 0; taskIndex < REPORT_TASKS.length; taskIndex += 1) {
      const [name, points] = REPORT_TASKS[taskIndex];
      const started = taskIndex < 5 || (dayIndex % 3 === 0 && taskIndex === 5);
      const completed = started && (taskIndex + 1) / REPORT_TASKS.length <= completionBias;

      const startedAt = started ? isoAt(dayKey, 7 + taskIndex * 2, 10 + (dayIndex % 3) * 5) : null;
      const completedAt = completed ? addMinutesIso(startedAt, 25 + taskIndex * 9 + (dayIndex % 2) * 7) : null;

      const taskId = newId("t_seed");
      tasks.push({
        id: taskId,
        day: dayKey,
        name,
        points,
        priority: getPriority(points),
        completed,
        createdAt: isoAt(dayKey, 6, 30),
        startedAt,
        completedAt,
        sort: taskIndex,
      });

      if (started) {
        await addSeedEvent(state, {
          day: dayKey,
          ts: startedAt,
          type: EVENT.TASK_START,
          meta: { taskId, startedAt, auto: false },
        });
      }

      if (completed) {
        await addSeedEvent(state, {
          day: dayKey,
          ts: completedAt,
          type: EVENT.TASK_COMPLETE,
          meta: { taskId, pointsDelta: points, startedAt, completedAt },
        });
        dayPoints += points;
      }
    }

    await bulkUpsertTasks(state.db, tasks);

    dayPoints += await seedHabitsForDay(state, dayKey, dayIndex);
    dayPoints -= await seedRewardsForDay(state, dayKey, dayIndex);

    await upsertDay(state.db, {
      day: dayKey,
      totalPoints: dayPoints,
      createdAt: isoAt(dayKey, 6, 0),
      notes: "Seed de teste para relatorios",
    });
  }
}

async function seedHabitsForDay(state, dayKey, dayIndex) {
  let gainedPoints = 0;
  const patterns = [
    { habitId: "h_seed_water", count: 2 + (dayIndex % 3), hour: 8, minute: 20 },
    { habitId: "h_seed_focus", count: 1 + (dayIndex % 2), hour: 11, minute: 10 },
    { habitId: "h_seed_walk", count: dayIndex % 2, hour: 18, minute: 5 },
  ];

  for (const pattern of patterns) {
    const habit = REPORT_HABITS.find((entry) => entry.id === pattern.habitId);
    if (!habit || pattern.count <= 0) continue;

    for (let i = 0; i < pattern.count; i += 1) {
      const ts = isoAt(dayKey, pattern.hour + i, pattern.minute + i * 7);
      const executionId = newId("hx_seed");

      await addHabitExecution(state.db, {
        id: executionId,
        day: dayKey,
        habitId: habit.id,
        value: habit.increment,
        points: habit.points,
        ts,
        deletedAt: null,
        note: "",
      });

      await addSeedEvent(state, {
        day: dayKey,
        ts,
        type: EVENT.HABIT_EXECUTE,
        meta: {
          executionId,
          habitId: habit.id,
          templateSnapshot: {
            id: habit.id,
            name: habit.name,
            unit: habit.unit,
            increment: habit.increment,
            points: habit.points,
            icon: habit.icon,
            isActive: true,
          },
          value: habit.increment,
          points: habit.points,
        },
      });

      gainedPoints += habit.points;
    }
  }

  return gainedPoints;
}

async function seedRewardsForDay(state, dayKey, dayIndex) {
  let spentPoints = 0;
  const shouldRedeemCoffee = dayIndex % 2 === 1;
  const shouldRedeemMovie = dayIndex === 2 || dayIndex === 6;

  if (shouldRedeemCoffee) {
    await addSeedEvent(state, {
      day: dayKey,
      ts: isoAt(dayKey, 21, 10),
      type: EVENT.REWARD_REDEEM,
      meta: {
        rewardId: "r_seed_coffee",
        rewardName: "Cafeteria premium",
        nameSnapshot: "Cafeteria premium",
        cost: 40,
      },
    });
    spentPoints += 40;
  }

  if (shouldRedeemMovie) {
    await addSeedEvent(state, {
      day: dayKey,
      ts: isoAt(dayKey, 22, 5),
      type: EVENT.REWARD_REDEEM,
      meta: {
        rewardId: "r_seed_movie",
        rewardName: "Episodio de serie",
        nameSnapshot: "Episodio de serie",
        cost: 90,
      },
    });
    spentPoints += 90;
  }

  return spentPoints;
}

async function addSeedEvent(state, { day, type, meta, ts }) {
  const dateRef = new Date(ts);
  const seq = await nextEventSeq(state.db);
  await addEvent(state.db, {
    id: newId("e_seed"),
    seq,
    ts,
    tzOffsetMin: getTzOffsetMin(dateRef),
    day,
    type,
    actor: "system",
    source: "seed",
    meta: meta || {},
  });
}

function last7DayKeys() {
  const out = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(dayKeyFromDate(d));
  }
  return out;
}

function isoAt(dayKey, hour, minute) {
  const date = new Date(`${dayKey}T00:00:00`);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function addMinutesIso(isoValue, minutes) {
  const date = new Date(isoValue);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}
