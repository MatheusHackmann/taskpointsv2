import { EVENT } from "../app/constants.js";
import { listEventsByTsRange } from "../storage/repositories/eventsRepo.js";
import { listTasksByDay } from "../storage/repositories/tasksRepo.js";
import { listHabitTemplates } from "../storage/repositories/habitsRepo.js";
import { listDays, getDay } from "../storage/repositories/daysRepo.js";
import { dayKeyFromDate } from "./dates.js";
import { normalizeCategory, getCategoryLabel } from "./categories.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STREAK_THRESHOLD = 20;
const DURATION_BUCKETS = [
  { label: "<15 min", max: 15 },
  { label: "15-30 min", max: 30 },
  { label: "30-60 min", max: 60 },
  { label: "60+ min", max: Infinity },
];

function ensureRange(start, end) {
  const normalizedStart = new Date(start);
  normalizedStart.setHours(0, 0, 0, 0);
  const normalizedEnd = new Date(end);
  normalizedEnd.setHours(23, 59, 59, 999);
  if (normalizedEnd < normalizedStart) {
    throw new Error("Intervalo inválido");
  }
  return { start: normalizedStart, end: normalizedEnd };
}

function toIsoRange(start, end) {
  const { start: s, end: e } = ensureRange(start, end);
  return {
    start: s,
    end: e,
    startIso: s.toISOString(),
    endIso: e.toISOString(),
    dayKeys: createDayKeys(s, e),
  };
}

function createDayKeys(start, end) {
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(dayKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function computeStreak(flow, threshold, lastDayKey) {
  const dayMap = new Map(flow.map((entry) => [entry.day, entry.net]));
  let dayCursor = lastDayKey
    ? new Date(`${lastDayKey}T00:00:00`)
    : flow.length
    ? new Date(`${flow[flow.length - 1].day}T00:00:00`)
    : null;
  let streak = 0;
  while (dayCursor) {
    const dayKey = dayKeyFromDate(dayCursor);
    const points = dayMap.get(dayKey) || 0;
    if (points >= threshold) {
      streak += 1;
      dayCursor.setDate(dayCursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, "0")}h`;
}

async function loadTaskDetails(state, dayKeys) {
  const map = new Map();
  for (const day of dayKeys) {
    const tasks = await listTasksByDay(state.db, day);
    tasks.forEach((task) => {
      if (task?.id && task?.name) {
        map.set(task.id, {
          name: task.name,
          category: normalizeCategory(task.category),
          completed: !!task.completed,
        });
      }
    });
  }
  return map;
}

async function loadHabitDetails(state) {
  const templates = await listHabitTemplates(state.db);
  return new Map(
    (templates || []).map((t) => [
      t.id,
      {
        name: t.name || "Hábito",
        category: normalizeCategory(t.category),
      },
    ])
  );
}

function resolveTaskCategory(event, taskDetails) {
  const detail = taskDetails.get(event.meta?.taskId);
  return normalizeCategory(event.meta?.category || detail?.category);
}

function resolveHabitCategory(event, habitDetails) {
  const snapshotCategory = event.meta?.templateSnapshot?.category;
  const mapped = habitDetails.get(event.meta?.habitId)?.category;
  return normalizeCategory(event.meta?.category || snapshotCategory || mapped);
}

function netPoints(event) {
  if (event.type === EVENT.TASK_COMPLETE) {
    return Number(event.meta?.pointsDelta) || 0;
  }
  if (event.type === EVENT.HABIT_EXECUTE) {
    return Number(event.meta?.points) || 0;
  }
  if (event.type === EVENT.REWARD_REDEEM) {
    return -(Number(event.meta?.cost) || 0);
  }
  return 0;
}

function durationMs(startIso, endIso) {
  const start = Date.parse(startIso || "");
  const end = Date.parse(endIso || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const diff = end - start;
  return diff >= 0 ? diff : null;
}

function buildRange(start, end) {
  const { start: s, end: e } = ensureRange(start, end);
  const length = Math.round((e - s) / MS_PER_DAY) + 1;
  const prevEnd = new Date(s.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - (length - 1) * MS_PER_DAY);
  return { start: s, end: e, prevStart, prevEnd };
}

async function summarizePoints(state, startIso, endIso) {
  const events = await listEventsByTsRange(state.db, startIso, endIso);
  return events.reduce((sum, event) => sum + netPoints(event), 0);
}

async function longestStreak(state) {
  const dayTotals = [];
  const days = await listDays(state.db);
  for (const day of days) {
    const entry = await getDay(state.db, day);
    dayTotals.push({ day, points: Number(entry?.totalPoints) || 0 });
  }
  let longest = 0;
  let current = 0;
  dayTotals.forEach((entry) => {
    if (entry.points >= STREAK_THRESHOLD) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });
  return longest;
}

export async function gatherReport(state, { start, end, category = "all" }) {
  const selectedCategory = category === "all" ? "all" : normalizeCategory(category);
  const range = toIsoRange(start, end);
  const events = await listEventsByTsRange(state.db, range.startIso, range.endIso);
  const taskDetails = await loadTaskDetails(state, range.dayKeys);
  const habitDetails = await loadHabitDetails(state);

  const dayBuckets = new Map();
  const hourStarts = new Map();
  const hourCompletes = new Map();
  const taskStats = new Map();
  const durations = [];
  const habitStats = new Map();
  const rewardStats = new Map();
  let tasksStarted = 0;
  let tasksCompleted = 0;
  let pointsGained = 0;
  let pointsSpent = 0;

  events.forEach((event) => {
    const taskCategory = resolveTaskCategory(event, taskDetails);
    const habitCategory = resolveHabitCategory(event, habitDetails);
    const eventCategory =
      event.type === EVENT.HABIT_EXECUTE
        ? habitCategory
        : event.type === EVENT.TASK_COMPLETE ||
          event.type === EVENT.TASK_START ||
          event.type === EVENT.TASK_UNCOMPLETE ||
          event.type === EVENT.TASK_DELETE
        ? taskCategory
        : "all";

    if (selectedCategory !== "all" && eventCategory !== selectedCategory) {
      return;
    }

    const day = event.day || dayKeyFromDate(new Date(event.ts));
    const bucket = dayBuckets.get(day) || { gained: 0, spent: 0, events: 0 };
    bucket.events++;
    const points = netPoints(event);
    if (points >= 0) bucket.gained += points;
    else bucket.spent += Math.abs(points);
    dayBuckets.set(day, bucket);
    if (points > 0) {
      pointsGained += points;
    } else if (points < 0) {
      pointsSpent += Math.abs(points);
    }

    if (event.type === EVENT.TASK_START) {
      tasksStarted++;
      const hour = new Date(event.meta?.startedAt || event.ts).getHours();
      hourStarts.set(hour, (hourStarts.get(hour) || 0) + 1);
      const name = taskDetails.get(event.meta?.taskId)?.name || event.meta?.taskName || "Sem nome";
      const stats = taskStats.get(name) || { starts: 0, completes: 0, points: 0, durations: [], abandons: 0 };
      stats.starts += 1;
      taskStats.set(name, stats);
    }

    if (event.type === EVENT.TASK_COMPLETE) {
      tasksCompleted++;
      const hour = new Date(event.meta?.completedAt || event.ts).getHours();
      hourCompletes.set(hour, (hourCompletes.get(hour) || 0) + 1);
      const duration = durationMs(event.meta?.startedAt, event.meta?.completedAt || event.ts);
      const name = taskDetails.get(event.meta?.taskId)?.name || event.meta?.taskName || "Sem nome";
      const stats = taskStats.get(name) || { starts: 0, completes: 0, points: 0, durations: [], abandons: 0 };
      stats.completes += 1;
      const delta = Number(event.meta?.pointsDelta) || 0;
      stats.points += Math.max(0, delta);
      if (duration !== null) {
        stats.durations.push(duration);
        durations.push(duration);
      }
      taskStats.set(name, stats);
    }

    if (event.type === EVENT.HABIT_EXECUTE) {
      const template = event.meta?.templateSnapshot || {};
      const habitName = template.name || habitDetails.get(event.meta?.habitId)?.name || "Hábito";
      const unit = template.unit || habitStats.get(habitName)?.unit || "un";
      const entry = habitStats.get(habitName) || { count: 0, points: 0, value: 0, unit };
      const value = Number(event.meta?.value) || 0;
      const pts = Number(event.meta?.points) || 0;
      entry.count += 1;
      entry.points += pts;
      entry.value += value;
      entry.unit = entry.unit || unit;
      habitStats.set(habitName, entry);
    }

    if (event.type === EVENT.REWARD_REDEEM) {
      const rewardName = event.meta?.rewardName || "Recompensa";
      const entry = rewardStats.get(rewardName) || { count: 0, cost: 0 };
      entry.count += 1;
      entry.cost += Number(event.meta?.cost) || 0;
      rewardStats.set(rewardName, entry);
    }
  });

  const categoryStatsMap = new Map();
  for (const detail of taskDetails.values()) {
    if (selectedCategory !== "all" && detail.category !== selectedCategory) continue;
    const row = categoryStatsMap.get(detail.category) || {
      category: detail.category,
      label: getCategoryLabel(detail.category),
      points: 0,
      completed: 0,
      pending: 0,
      habits: 0,
    };
    if (detail.completed) row.completed += 1;
    else row.pending += 1;
    categoryStatsMap.set(detail.category, row);
  }

  events.forEach((event) => {
    if (event.type !== EVENT.TASK_COMPLETE && event.type !== EVENT.HABIT_EXECUTE) return;
    const categoryForEvent =
      event.type === EVENT.HABIT_EXECUTE
        ? resolveHabitCategory(event, habitDetails)
        : resolveTaskCategory(event, taskDetails);
    if (selectedCategory !== "all" && categoryForEvent !== selectedCategory) return;
    const row = categoryStatsMap.get(categoryForEvent) || {
      category: categoryForEvent,
      label: getCategoryLabel(categoryForEvent),
      points: 0,
      completed: 0,
      pending: 0,
      habits: 0,
    };
    if (event.type === EVENT.TASK_COMPLETE) {
      row.points += Math.max(0, Number(event.meta?.pointsDelta) || 0);
    } else {
      row.points += Math.max(0, Number(event.meta?.points) || 0);
      row.habits += 1;
    }
    categoryStatsMap.set(categoryForEvent, row);
  });

  const categoryStats = Array.from(categoryStatsMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR")
  );

  let totalAbandoned = 0;
  taskStats.forEach((stats) => {
    const diff = stats.starts - stats.completes;
    stats.abandons = diff > 0 ? diff : 0;
    totalAbandoned += stats.abandons;
  });

  const flow = Array.from(dayBuckets.entries())
    .map(([day, bucket]) => ({
      day,
      gained: bucket.gained,
      spent: bucket.spent,
      net: bucket.gained - bucket.spent,
      events: bucket.events,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const totalPoints = flow.reduce((sum, entry) => sum + entry.net, 0);
  const avgDailyPoints = flow.length ? totalPoints / flow.length : 0;

  const completionRate = tasksStarted ? (tasksCompleted / tasksStarted) * 100 : 0;
  const avgExecutionMinutes = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length / 60000
    : 0;

  const bucketCounts = DURATION_BUCKETS.map(() => 0);
  durations.forEach((value) => {
    const minutes = value / 60000;
    for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
      if (minutes <= DURATION_BUCKETS[index].max) {
        bucketCounts[index] += 1;
        break;
      }
    }
  });

  const durationDistribution = DURATION_BUCKETS.map((bucket, index) => ({
    label: bucket.label,
    count: bucketCounts[index],
    percentage: durations.length ? (bucketCounts[index] / durations.length) * 100 : 0,
  }));

  const completionHour = Array.from(hourCompletes.entries())
    .sort((a, b) => b[1] - a[1])[0]
    ?.[0];
  const abandonmentHour = Array.from(hourStarts.entries())
    .map(([hour, count]) => {
      const completes = hourCompletes.get(hour) || 0;
      const rate = count ? Math.max(0, (count - completes) / count) : 0;
      return { hour, rate };
    })
    .sort((a, b) => b.rate - a.rate)[0];

  const streakCurrent = computeStreak(flow, STREAK_THRESHOLD, range.dayKeys[range.dayKeys.length - 1]);
  const streakLongest = await longestStreak(state);
  const zeroDays = flow.filter((entry) => entry.net <= 0).length;
  const belowAvgDays = flow.filter((entry) => entry.net < avgDailyPoints).length;

  const prevRange = buildRange(range.start, range.end);
  const prevPoints = await summarizePoints(state, prevRange.prevStart.toISOString(), prevRange.prevEnd.toISOString());
  const variationPercent =
    prevPoints === 0
      ? prevPoints === 0 && totalPoints === 0
        ? 0
        : totalPoints > 0
        ? 100
        : -100
      : ((totalPoints - prevPoints) / Math.abs(prevPoints)) * 100;

  const insights = [];
  if (completionRate < 60) {
    insights.push({
      label: "Baixa taxa de conclusão",
      message: `Taxa de conclusão em ${completionRate.toFixed(1)}% no período.`,
    });
  }
  if (variationPercent > 0) {
    insights.push({
      label: "Performance em alta",
      message: `Saldo de pontos subiu ${variationPercent.toFixed(1)}% em relação ao período anterior.`,
    });
  } else if (variationPercent < 0) {
    insights.push({
      label: "Queda de performance",
      message: `Saldo de pontos caiu ${Math.abs(variationPercent).toFixed(1)}% frente ao período anterior.`,
    });
  }
  const abandonRatio = tasksStarted ? (totalAbandoned / tasksStarted) * 100 : 0;
  if (abandonRatio > 30) {
    insights.push({
      label: "Tarefas iniciadas sem conclusão",
      message: `${abandonRatio.toFixed(1)}% das tarefas iniciadas não foram concluídas.`,
    });
  }
  if (abandonmentHour && abandonmentHour.rate > 0.4) {
    insights.push({
      label: "Horário improdutivo",
      message: `${formatHourLabel(abandonmentHour.hour)} concentra alta taxa de abandono (${(abandonmentHour.rate * 100).toFixed(0)}%).`,
    });
  }
  if (variationPercent > 10 && completionRate > 70) {
    insights.push({
      label: "Consistência",
      message: "Taxa de conclusão alta e saldo positivo sugerem consistência estável.",
    });
  }

  const rankingByPoints = Array.from(taskStats.entries())
    .map(([name, data]) => ({ name, points: data.points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);
  const rankingByFrequency = Array.from(taskStats.entries())
    .map(([name, data]) => ({ name, count: data.completes }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const rankingByDuration = Array.from(taskStats.entries())
    .map(([name, data]) => ({
      name,
      avg: data.durations.length
        ? data.durations.reduce((sum, value) => sum + value, 0) / data.durations.length / 60000
        : 0,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
  const rankingByAbandon = Array.from(taskStats.entries())
    .map(([name, data]) => ({ name, abandon: data.abandons }))
    .sort((a, b) => b.abandon - a.abandon)
    .slice(0, 5);

  const habitEntries = Array.from(habitStats.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    points: data.points,
    value: data.value,
    unit: data.unit,
  }));
  const rewardEntries = Array.from(rewardStats.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    cost: data.cost,
  }));

  return {
    period: { start: range.start, end: range.end, dayKeys: range.dayKeys },
    selectedCategory,
    overview: {
      totalPoints,
      pointsGained,
      pointsSpent,
      avgDailyPoints,
      tasksStarted,
      tasksCompleted,
      completionRate,
      totalAbandoned,
      avgExecutionMinutes,
      bestDay: flow.reduce((best, day) => (day.net > best.net ? day : best), { day: null, net: -Infinity }),
      worstDay: flow.reduce((worst, day) => (day.net < worst.net ? day : worst), { day: null, net: Infinity }),
    },
    consistency: {
      streakCurrent,
      streakLongest,
      zeroDays,
      belowAvgDays,
      variationPercent,
    },
    time: {
      avgDurationMinutes: avgExecutionMinutes,
      durationDistribution,
      completionHour: completionHour !== undefined ? formatHourLabel(completionHour) : "—",
      abandonmentHour: abandonmentHour ? formatHourLabel(abandonmentHour.hour) : "—",
    },
    rankings: {
      byPoints: rankingByPoints,
      byFrequency: rankingByFrequency,
      byDuration: rankingByDuration,
      byAbandon: rankingByAbandon,
    },
    flow,
    insights,
    habits: {
      entries: habitEntries,
    },
    rewards: {
      entries: rewardEntries,
    },
    categories: {
      entries: categoryStats,
      empty: categoryStats.length === 0,
    },
  };
}
