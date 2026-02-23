import { openDB } from "./storage/db.js";
import { runMigrations } from "./storage/migrations.js";
import { ensureBootstrapData } from "./domain/defaults.js";
import { initAppState } from "./app/state.js";
import { DB_NAME, DB_VERSION } from "./app/constants.js";
import { gatherReport } from "./domain/reports.js";
import { dayKeyFromDate, formatDayTitle } from "./domain/dates.js";
import { maybeSeedReportsData } from "./domain/seedReportsData.js";
import { getWeeklyProgress } from "./domain/weeklyGoals.js";
import { getCategories, getCategoryLabel } from "./domain/categories.js";

const periodSelect = document.getElementById("periodSelect");
const categorySelect = document.getElementById("reportCategory");
const customRange = document.getElementById("customRange");
const startInput = document.getElementById("periodStart");
const endInput = document.getElementById("periodEnd");
const periodLabel = document.getElementById("reportPeriod");
const overviewList = document.getElementById("overviewMetrics");
const consistencyList = document.getElementById("consistencyList");
const weeklyGoalStats = document.getElementById("weeklyGoalStats");
const durationTable = document.querySelector("#durationTable tbody");
const timeInsights = document.getElementById("timeInsights");
const completionHours = document.getElementById("completionHours");
const rankingPoints = document.getElementById("rankingPoints");
const rankingFrequency = document.getElementById("rankingFrequency");
const rankingDuration = document.getElementById("rankingDuration");
const rankingAbandon = document.getElementById("rankingAbandon");
const autoInsights = document.getElementById("autoInsights");
const habitStats = document.getElementById("habitStats");
const rewardStats = document.getElementById("rewardStats");
const categoryStats = document.getElementById("categoryStats");

let appState;

document.addEventListener("DOMContentLoaded", async () => {
  periodSelect.value = periodSelect.value || "last7";
  categorySelect.value = categorySelect.value || "all";
  periodSelect.addEventListener("change", onPeriodChange);
  categorySelect.addEventListener("change", refreshReport);
  startInput.addEventListener("change", refreshReport);
  endInput.addEventListener("change", refreshReport);

  const db = await openDB(DB_NAME, DB_VERSION);
  await runMigrations(db);
  appState = initAppState({ db });
  await ensureBootstrapData(appState);
  await maybeSeedReportsData(appState);
  await renderCategoryFilter();
  toggleCustomRange();
  await refreshReport();
});

async function refreshReport() {
  const range = buildRange();
  const report = await gatherReport(appState, range);

  periodLabel.textContent = `${formatDayTitle(dayKeyFromDate(range.start))} -> ${formatDayTitle(dayKeyFromDate(range.end))}`;
  renderOverview(report.overview);
  renderConsistency(report.consistency);
  await renderWeeklyGoalSummary(range.end);
  renderTime(report.time);
  renderDurationDistribution(report.time.durationDistribution);
  renderCompletionHours(report.time);
  renderRanking(report.rankings);
  renderInsights(report.insights);
  renderHabitStats(report.habits.entries);
  renderRewardStats(report.rewards.entries, report.overview);
  renderCategoryStats(report.categories, report.selectedCategory);
}

function buildRange() {
  const today = new Date();
  let start = new Date(today);
  let end = new Date(today);
  end.setHours(23, 59, 59, 999);
  switch (periodSelect.value) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "last7":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "last30":
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "custom":
      start = parseCustomDate(startInput.value) || start;
      end = parseCustomDate(endInput.value, true) || end;
      break;
    default:
      start.setHours(0, 0, 0, 0);
  }
  const category = categorySelect?.value || "all";
  return { start, end, category };
}

function parseCustomDate(value, isEnd = false) {
  if (!value) return null;
  const date = new Date(value);
  if (isEnd) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function onPeriodChange() {
  toggleCustomRange();
  refreshReport();
}

async function renderCategoryFilter() {
  const categories = await getCategories(appState.db);
  const selected = categorySelect.value || "all";
  const options = ['<option value="all">Todas</option>'];
  categories.forEach((category) => {
    options.push(`<option value="${category}">${getCategoryLabel(category)}</option>`);
  });
  categorySelect.innerHTML = options.join("");
  categorySelect.value = selected === "all" || categories.includes(selected) ? selected : "all";
}

function toggleCustomRange() {
  if (periodSelect.value === "custom") {
    customRange.style.display = "flex";
  } else {
    customRange.style.display = "none";
  }
}

function renderOverview(data) {
  overviewList.innerHTML = "";
  appendMetric(overviewList, "Pontos totais", `${data.totalPoints} pts`);
  appendMetric(overviewList, "Pontos ganhos", `${data.pointsGained} pts`);
  appendMetric(overviewList, "Pontos gastos", `${data.pointsSpent} pts`);
  appendMetric(overviewList, "Média diária", `${data.avgDailyPoints.toFixed(1)} pts`);
  appendMetric(overviewList, "Tarefas iniciadas", data.tasksStarted);
  appendMetric(overviewList, "Tarefas concluídas", data.tasksCompleted);
  appendMetric(overviewList, "Taxa de conclusão", `${data.completionRate.toFixed(1)}%`);
  appendMetric(overviewList, "Tarefas abandonadas", data.totalAbandoned);
  appendMetric(overviewList, "Tempo médio de execução", `${data.avgExecutionMinutes.toFixed(1)} min`);
  appendMetric(
    overviewList,
    "Melhor dia",
    data.bestDay.day ? `${formatDayTitle(data.bestDay.day)} (${data.bestDay.net} pts)` : "—"
  );
  appendMetric(
    overviewList,
    "Pior dia",
    data.worstDay.day ? `${formatDayTitle(data.worstDay.day)} (${data.worstDay.net} pts)` : "—"
  );
}

function renderConsistency(data) {
  consistencyList.innerHTML = "";
  appendMetric(consistencyList, "Streak atual", `${data.streakCurrent} dias`);
  appendMetric(consistencyList, "Maior streak", `${data.streakLongest} dias`);
  appendMetric(consistencyList, "Dias zerados", data.zeroDays);
  appendMetric(consistencyList, "Dias abaixo da média", data.belowAvgDays);
  appendMetric(
    consistencyList,
    "Variação vs período anterior",
    `${data.variationPercent.toFixed(1)}%`
  );
}

async function renderWeeklyGoalSummary(referenceDate) {
  weeklyGoalStats.innerHTML = "";
  const data = await getWeeklyProgress(appState, referenceDate);

  if (data.goal <= 0) {
    appendMetric(weeklyGoalStats, "Meta semanal", "Nao definida");
    appendMetric(weeklyGoalStats, "Status", "Configure uma meta no painel principal");
    return;
  }

  appendMetric(weeklyGoalStats, "Janela da semana", `${formatDayTitle(data.weekStartKey)} -> ${formatDayTitle(data.weekEndKey)}`);
  appendMetric(weeklyGoalStats, "Semana iniciada em", data.createdAt ? formatDayTitle(String(data.createdAt).slice(0, 10)) : "-");
  appendMetric(weeklyGoalStats, "Meta", `${data.goal} pts`);
  appendMetric(weeklyGoalStats, "Acumulado", `${data.points} pts`);
  appendMetric(weeklyGoalStats, "Progresso", `${data.percent.toFixed(1)}%`);
  appendMetric(weeklyGoalStats, "Recompensa cadastrada", `+${data.rewardPoints} pts`);
  appendMetric(weeklyGoalStats, "Prejuizo configurado", `${data.penaltyPercent}% (-${data.penaltyPoints} pts)`);
  appendMetric(weeklyGoalStats, "Bonus por superacao antecipada", `+${data.overtakeBonusAwardedPoints || 0} pts`);
  appendMetric(weeklyGoalStats, "Saldo acumulado disponivel", `${data.walletBalance} pts`);
  if (data.settlement) {
    appendMetric(
      weeklyGoalStats,
      "Encerramento da semana",
      data.settlement.reached
        ? `Concluida • bonus aplicado +${data.settlement.rewardApplied} pts`
        : `Nao concluida • penalidade aplicada -${data.settlement.penaltyApplied} pts`
    );
  }
  appendMetric(
    weeklyGoalStats,
    "Status",
    data.status === "reached" ? "Meta atingida" : "Em andamento"
  );
}

function renderTime(data) {
  timeInsights.innerHTML = "";
  appendMetric(timeInsights, "Tempo médio por tarefa", `${data.avgDurationMinutes.toFixed(1)} min`);
  appendMetric(timeInsights, "Horário com mais conclusões", data.completionHour);
  appendMetric(timeInsights, "Horário com mais abandono", data.abandonmentHour);
}

function renderDurationDistribution(distribution) {
  durationTable.innerHTML = "";
  distribution.forEach((bucket) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${bucket.label}</td><td>${bucket.count}</td><td>${bucket.percentage.toFixed(1)}%</td>`;
    durationTable.appendChild(row);
  });
}

function renderCompletionHours(data) {
  completionHours.innerHTML = "";
  completionHours.innerHTML = `<div>Mais conclusões: ${data.completionHour}</div>
    <div>Mais abandonos: ${data.abandonmentHour}</div>`;
}

function renderRanking(ranking) {
  renderList(rankingPoints, ranking.byPoints, (entry) => `${entry.name} (${entry.points} pts)`);
  renderList(rankingFrequency, ranking.byFrequency, (entry) => `${entry.name} (${entry.count}x)`);
  renderList(rankingDuration, ranking.byDuration, (entry) =>
    `${entry.name} (${entry.avg.toFixed(1)} min)`
  );
  renderList(rankingAbandon, ranking.byAbandon, (entry) => `${entry.name} (${entry.abandon}x)`);
}

function renderInsights(insights) {
  autoInsights.innerHTML = "";
  insights.forEach((insight) => {
    const card = document.createElement("div");
    card.className = "insight-card";
    card.innerHTML = `<div>${insight.label}</div><span>${insight.message}</span>`;
    autoInsights.appendChild(card);
  });
}

function renderHabitStats(entries) {
  habitStats.innerHTML = "";
  if (!entries.length) {
    habitStats.innerHTML = "<li><span>Registro de hábitos</span><strong>nenhum ainda</strong></li>";
    return;
  }
  entries.forEach((entry) => {
    const valueLabel = entry.unit ? ` • ${entry.value} ${entry.unit}` : "";
    appendMetric(
      habitStats,
      entry.name,
      `${entry.count} execuções${valueLabel} • ${entry.points} pts`
    );
  });
}

function renderRewardStats(entries, overview) {
  rewardStats.innerHTML = "";
  appendMetric(rewardStats, "Total gasto", `${overview.pointsSpent} pts`);
  appendMetric(rewardStats, "Total ganho com hábitos e tarefas", `${overview.pointsGained} pts`);
  if (!entries.length) {
    appendMetric(rewardStats, "Recompensas", "Nenhuma movimentação");
    return;
  }
  entries.forEach((entry) => {
    appendMetric(
      rewardStats,
      `${entry.name} (${entry.count}x)`,
      `${entry.cost} pts`
    );
  });
}

function renderCategoryStats(data, selectedCategory) {
  categoryStats.innerHTML = "";
  const isFiltered = selectedCategory && selectedCategory !== "all";
  if (!data?.entries?.length) {
    const emptyMessage = isFiltered
      ? "Sem dados para a categoria selecionada neste periodo."
      : "Sem dados categorizados no periodo.";
    appendMetric(categoryStats, "Estado", emptyMessage);
    return;
  }

  data.entries.forEach((entry) => {
    appendMetric(categoryStats, `${entry.label} • Pontos`, `${entry.points} pts`);
    appendMetric(categoryStats, `${entry.label} • Tarefas concluidas`, entry.completed);
    appendMetric(categoryStats, `${entry.label} • Tarefas pendentes`, entry.pending);
    appendMetric(categoryStats, `${entry.label} • Habitos executados`, entry.habits);
  });
}

function appendMetric(list, label, value) {
  const item = document.createElement("li");
  item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  list.appendChild(item);
}

function renderList(container, items, formatter) {
  container.innerHTML = "";
  items.forEach((entry) => {
    const item = document.createElement("li");
    item.innerHTML = `${formatter(entry)}`;
    container.appendChild(item);
  });
}
