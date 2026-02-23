// src/ui/events.js

import { UI } from "../app/constants.js";
import { $ } from "./dom.js";
import { openModal, closeModal } from "./modals.js";
import { showSystemAlert, showSystemConfirm, showActionToast } from "./feedback.js";
import { FEEDBACK_TOASTS } from "./toastMessages.js";

import {
  renderApp,
  renderRewardsModal,
  renderHabitsModal,
  renderLogsModal,
  playRewardSound,
  launchConfetti,
} from "./render.js";

import { setCurrentDay } from "../app/state.js";
import { dayKeyFromDate, formatDayDM, formatDayDMY } from "../domain/dates.js";

import {
  createTask,
  toggleTaskCompletion,
  deleteTask as deleteTaskDomain,
  updateTaskCategory,
  reorderTaskByIndex,
  getTasksForCurrentDay,
  startTask,
} from "../domain/tasks.js";

import { createReward, deleteReward, redeemReward } from "../domain/rewards.js";
import {
  calculateTaskPoints,
  calculateHabitPoints,
  calculateRewardBaseCost,
  estimateAverageDailyPoints,
  getRewardRedemptionsCountForDay,
  getOnboardingFactor,
  calculateAdaptiveRewardCost,
} from "../domain/pointsEngine.js";
import {
  createHabitTemplate,
  updateHabitTemplate,
  deleteHabitTemplate,
  executeHabit,
  undoHabitExecution,
  listAllHabitTemplates,
} from "../domain/habits.js";
import {
  normalizeCategory,
  getCategoryLabel,
  getCategories,
  addCategory,
  renameCategory,
  deleteCategory,
} from "../domain/categories.js";

import { getDay, upsertDay, listDays, deleteDay } from "../storage/repositories/daysRepo.js";
import {
  getDefaultTasksTemplate,
  saveDefaultTasksTemplate,
  buildDefaultTasksForDay,
  syncMissingDefaultTasksForCurrentDay,
} from "../domain/defaults.js";
import {
  exportAllData,
  importAllData,
  serializeBackup,
} from "../domain/backup.js";
import {
  listWeeklyGoals,
  createWeeklyGoal,
  getWeeklyPenaltyDefaultPercent,
  getLifetimeWeeklyBonusBalance,
  spendLifetimeWeeklyBonusBalance,
} from "../domain/weeklyGoals.js";
import { bulkUpsertTasks, deleteTasksByDay } from "../storage/repositories/tasksRepo.js";
import { deleteEventsByDay } from "../storage/repositories/eventsRepo.js";

import {
  logDayCreate,
  logBackupExport,
  logBackupImport,
  logWeeklyGoalSet,
  logPenaltyMaxTrigger,
} from "../domain/logs.js";

export function bindUIEvents(state) {
  let defaultTaskDraft = [];
  const dataMenu = setupDataMenu();

  bindReadOnlyDayGuards(state);

  refreshCategorySelectOptions(state).catch(() => null);

  bindTaskPointsEngine();
  bindDefaultTaskPointsEngine();
  bindHabitPointsEngine();
  bindRewardCostPreview(state);

  // Topo
  $("#btnCreateDay").addEventListener("click", () => openModal(UI.MODAL_CREATE_DAY));
  $("#btnAllDays").addEventListener("click", () => openAllDaysModal(state));
  $("#btnOpenRewards").addEventListener("click", async () => {
    const sourceInput = $(UI.REWARD_CONSUME_SOURCE_INPUT);
    sourceInput.value = state.ui.rewardConsumeSource === "weekly" ? "weekly" : "day";
    await renderRewardsModal(state);
    openModal(UI.MODAL_REWARDS);
  });
  $(UI.REWARD_CONSUME_SOURCE_INPUT).addEventListener("change", async (e) => {
    state.ui.rewardConsumeSource = e.target?.value === "weekly" ? "weekly" : "day";
    await renderRewardsModal(state);
  });
  $("#btnOpenLogs").addEventListener("click", async () => {
    await renderLogsModal(state);
    openModal(UI.MODAL_LOGS);
  });
  $(UI.BTN_MAX_PENALTY).addEventListener("click", async () => {
    if (isCurrentDayReadOnly(state)) {
      uiAlertInfo("Dia anterior em modo somente leitura.");
      return;
    }

    const ok = await uiConfirmAction(
      "Aplicar Penalidade Maxima agora? Isso vai zerar os pontos do dia e a carteira semanal."
    );
    if (!ok) return;

    try {
      const day = await getDay(state.db, state.currentDay);
      const walletBefore = await getLifetimeWeeklyBonusBalance(state);
      const dayPointsBefore = Number(day?.totalPoints) || 0;

      await upsertDay(state.db, {
        ...(day || {}),
        day: state.currentDay,
        totalPoints: 0,
      });

      if (walletBefore > 0) {
        await spendLifetimeWeeklyBonusBalance(state, walletBefore);
      }

      const penalizedDayPoints = Math.max(0, dayPointsBefore);
      const penalizedWalletPoints = Math.max(0, walletBefore);
      const totalPenalizedPoints = penalizedDayPoints + penalizedWalletPoints;

      await logPenaltyMaxTrigger(state, {
        day: state.currentDay,
        penalizedDayPoints,
        penalizedWalletPoints,
        totalPenalizedPoints,
        dayPointsBefore,
        walletBefore,
        dayPointsAfter: 0,
        walletAfter: 0,
      });

      await renderApp(state);
      await renderRewardsModal(state);
      uiToast(FEEDBACK_TOASTS.penaltyApplied(totalPenalizedPoints));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });
  $("#btnOpenHabits").addEventListener("click", async () => {
    await refreshCategorySelectOptions(state);
    await renderHabitsModal(state);
    openModal(UI.MODAL_HABITS);
  });
  $("#btnOpenCreateHabit").addEventListener("click", async () => {
    await refreshCategorySelectOptions(state);
    resetHabitForm();
    openModal(UI.MODAL_CREATE_HABIT);
  });
  $("#btnOpenDefaultTasks").addEventListener("click", async () => {
    defaultTaskDraft = await getDefaultTasksTemplate(state.db);
    await refreshCategorySelectOptions(state);
    renderDefaultTasksDraft(defaultTaskDraft);
    openModal(UI.MODAL_DEFAULT_TASKS);
  });
  $(UI.BTN_OPEN_CATEGORIES).addEventListener("click", async () => {
    await refreshCategorySelectOptions(state);
    await renderCategoriesCrudList(state);
    openModal(UI.MODAL_CATEGORIES);
  });
  $(UI.BTN_ADD_CATEGORY).addEventListener("click", async () => {
    try {
      const name = $(UI.CATEGORY_NAME_INPUT).value.trim();
      await addCategory(state, name);
      $(UI.CATEGORY_NAME_INPUT).value = "";
      await refreshCategorySelectOptions(state);
      await renderCategoriesCrudList(state);
      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.categoryCreated(name));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });
  $("#btnSyncPendingDefaults").addEventListener("click", async () => {
    try {
      const result = await syncMissingDefaultTasksForCurrentDay(state);
      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.templatesSynced(result?.createdCount || 0));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });
  $(UI.BTN_OPEN_WEEKLY_GOAL).addEventListener("click", async () => {
    resetWeeklyGoalForm();
    const goals = await listWeeklyGoals(state);
    const hasActiveGoal = goals.some((goal) => !goal?.settlement);
    setWeeklyGoalFormLocked(hasActiveGoal);
    await renderWeeklyGoalCrudList(state, goals);
    openModal(UI.MODAL_WEEKLY_GOAL);
  });
  $(UI.BTN_SAVE_WEEKLY_GOAL).addEventListener("click", async () => {
    if (isCurrentDayReadOnly(state)) {
      uiAlertInfo("Dia anterior em modo somente leitura.");
      return;
    }
    try {
      const payload = {
        name: $(UI.WEEKLY_GOAL_NAME_INPUT).value.trim(),
        targetPoints: Number($(UI.WEEKLY_GOAL_INPUT).value),
        rewardPoints: Number($(UI.WEEKLY_GOAL_REWARD_INPUT).value),
        penaltyPercent: Number($(UI.WEEKLY_GOAL_PENALTY_INPUT).value || 50),
      };
      await createWeeklyGoal(state, payload);

      await logWeeklyGoalSet(state, {
        points: payload.targetPoints,
        rewardPoints: payload.rewardPoints,
        penaltyPercent: payload.penaltyPercent,
      });
      resetWeeklyGoalForm();
      setWeeklyGoalFormLocked(true);
      closeModal(UI.MODAL_WEEKLY_GOAL);
      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.weeklyGoalCreated(payload));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  $(UI.BTN_EXPORT_DATA).addEventListener("click", async () => {
    try {
      const payload = await exportAllData(state);
      const json = serializeBackup(payload);
      const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
      downloadTextFile(`taskpoints-backup-${stamp}.json`, json);
      await logBackupExport(state, {
        stores: Object.keys(payload.data || {}),
        exportedAt: payload.exportedAt,
      });
      dataMenu.close();
      uiToast(FEEDBACK_TOASTS.backupExported(`taskpoints-backup-${stamp}.json`));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  $(UI.BTN_IMPORT_DATA).addEventListener("click", () => {
    dataMenu.close();
    const input = $(UI.IMPORT_DATA_INPUT);
    input.value = "";
    input.click();
  });

  $(UI.IMPORT_DATA_INPUT).addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    const ok = await uiConfirmAction(
      "Importar backup vai substituir todos os dados atuais. Deseja continuar?"
    );
    if (!ok) return;

    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      const result = await importAllData(state, payload);

      const days = await listDays(state.db);
      if (days.length) {
        setCurrentDay(state, days[days.length - 1]);
      }

      await logBackupImport(state, {
        stores: Object.keys(payload?.data || {}),
        importedAt: result.importedAt,
      });

      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.backupImported(Object.keys(payload?.data || {}).length));
    } catch (err) {
      uiAlertError(err?.message || "Falha ao importar backup.");
    }
  });

  $("#btnAddDefaultTask").addEventListener("click", () => {
    const name = $("#defaultTaskNameInput").value.trim();
    const category = $("#defaultTaskCategoryInput")?.value || "trabalho";
    const complexity = $("#defaultTaskComplexityInput")?.value || "";
    const aversion = $("#defaultTaskAversionInput")?.value || "";
    const impact = $("#defaultTaskImpactInput")?.value || "";
    const points = refreshDefaultTaskPoints();
    if (!name) return uiAlertInfo("Informe o nome da task padrao.");
    if (!Number.isFinite(points) || points <= 0) return uiAlertInfo("Selecione complexidade, friccao e impacto.");

    defaultTaskDraft.push({ name, category, complexity, aversion, impact, points });
    $("#defaultTaskNameInput").value = "";
    $("#defaultTaskCategoryInput").value = "trabalho";
    $("#defaultTaskComplexityInput").value = "";
    $("#defaultTaskAversionInput").value = "";
    $("#defaultTaskImpactInput").value = "";
    refreshDefaultTaskPoints();
    renderDefaultTasksDraft(defaultTaskDraft);
    uiToast(FEEDBACK_TOASTS.defaultTemplateAdded(name));
  });

  $("#btnSaveDefaultTasks").addEventListener("click", async () => {
    try {
      const nextTemplate = (Array.isArray(defaultTaskDraft) ? defaultTaskDraft : [])
        .map((item) => ({
          name: String(item?.name || "").trim(),
          category: normalizeCategory(item?.category),
          complexity: String(item?.complexity || "").trim().toLowerCase(),
          aversion: String(item?.aversion || "").trim().toLowerCase(),
          impact: String(item?.impact || "").trim().toLowerCase(),
        }))
        .map((item) => ({
          ...item,
          points: calculateTaskPoints({
            complexity: item.complexity,
            aversion: item.aversion,
            impact: item.impact,
          }),
        }))
        .filter((item) => item.name && item.complexity && item.aversion && item.impact && Number.isFinite(item.points) && item.points > 0);

      if (!nextTemplate.length) {
        uiAlertInfo("Mantenha pelo menos 1 task padrao.");
        return;
      }

      defaultTaskDraft = await saveDefaultTasksTemplate(state.db, nextTemplate);
      renderDefaultTasksDraft(defaultTaskDraft);
      closeModal(UI.MODAL_DEFAULT_TASKS);
      uiToast(FEEDBACK_TOASTS.defaultTemplatesSaved(nextTemplate.length));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  // Fechar modais
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btnCloseModal");
    if (!btn) return;
    const modalId = btn.dataset.modal;
    if (modalId) closeModal(modalId);
  });

  // Criar dia
  $("#btnConfirmCreateDay").addEventListener("click", async () => {
    const date = $("#newDayInput").value;
    if (!date) return uiAlertInfo("Selecione uma data.");

    const today = dayKeyFromDate(new Date());
    const isFuture = date > today; // YYYY-MM-DD compara lexicograficamente OK

    const days = await listDays(state.db);
    if (days.includes(date)) {
      setCurrentDay(state, date);
      closeModal(UI.MODAL_CREATE_DAY);
      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.daySelected(formatDayDM(date)));
      return;
    }

    await upsertDay(state.db, {
      day: date,
      totalPoints: 0,
      createdAt: new Date().toISOString(),
      notes: "",
    });

    const tasks = await buildDefaultTasksForDay(state.db, date);
    await bulkUpsertTasks(state.db, tasks);

    // Regra: criacao de dia futuro nao registra log
    if (!isFuture) {
      await logDayCreate(state, date);
    }

    setCurrentDay(state, date);
    closeModal(UI.MODAL_CREATE_DAY);
    await renderApp(state);
    uiToast(FEEDBACK_TOASTS.dayCreated(formatDayDM(date), tasks.length));
  });

  // Adicionar task
  $("#btnAddTask").addEventListener("click", async () => {
    if (isCurrentDayReadOnly(state)) {
      uiAlertInfo("Dia anterior em modo somente leitura.");
      return;
    }
    try {
      const name = $("#taskName").value.trim();
      const category = $(UI.TASK_CATEGORY_INPUT).value;
      const points = refreshTaskPoints();
      if (!Number.isFinite(points) || points <= 0) {
        uiAlertInfo("Selecione complexidade, friccao e impacto para calcular os pontos.");
        return;
      }

      const createdTask = await createTask(state, { name, points, category });

      $("#taskName").value = "";
      $(UI.TASK_CATEGORY_INPUT).value = "trabalho";
      $("#taskComplexity").value = "";
      $("#taskAversion").value = "";
      $("#taskImpact").value = "";
      refreshTaskPoints();

      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.taskCreated(createdTask.name, createdTask.points));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  // Clique nos chips do dia (Ãºltimos 7)
  $(UI.DAY_LIST).addEventListener("click", async (e) => {
    const chip = e.target.closest(".day-chip");
    if (!chip) return;

    const day = chip.dataset.day;
    if (!day) return;

    setCurrentDay(state, day);
    await renderApp(state);
  });

  // Toggle task
  document.addEventListener("change", async (e) => {
    const cb = e.target.closest(".task-toggle");
    if (!cb) return;
    if (isCurrentDayReadOnly(state)) {
      uiAlertInfo("Dia anterior em modo somente leitura.");
      cb.checked = !cb.checked;
      return;
    }

    const taskId = cb.dataset.taskId;
    if (!taskId) return;

    try {
      const result = await toggleTaskCompletion(state, taskId);
      if (result?.completed) playRewardSound();
      await renderApp(state);
      if (result?.completed) {
        uiToast(FEEDBACK_TOASTS.taskCompleted(result.taskName, result.taskPoints));
      } else {
        uiToast(FEEDBACK_TOASTS.taskReopened(result.taskName));
      }
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  // Delete task
  document.addEventListener("click", async (e) => {
  const categoryToggle = e.target.closest(".task-category-toggle");
  if (categoryToggle) {
    const taskId = categoryToggle.dataset.taskId;
    const currentCategory = categoryToggle.dataset.category;
    if (!taskId) return;
    try {
      const categories = await getCategories(state.db);
      if (!categories.length) return;
      const currentIndex = Math.max(0, categories.indexOf(normalizeCategory(currentCategory)));
      const nextCategory = categories[(currentIndex + 1) % categories.length];
      await updateTaskCategory(state, taskId, nextCategory);
      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.taskCategoryChanged(getCategoryLabel(nextCategory)));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
    return;
  }

  const startBtn = e.target.closest(".task-start");
  const del = e.target.closest(".task-delete");

  if (startBtn) {
    const taskId = startBtn.dataset.taskId;
    if (!taskId) return;

    try {
      const result = await startTask(state, taskId);
      await renderApp(state);
      if (!result?.alreadyStarted) {
        uiToast(FEEDBACK_TOASTS.taskStarted(result?.taskName));
      }
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
    return;
  }

  if (!del) return;

  const taskId = del.dataset.taskId;
  if (!taskId) return;

  try {
    const result = await deleteTaskDomain(state, taskId);
    await renderApp(state);
    uiToast(FEEDBACK_TOASTS.taskDeleted(result?.taskName));
  } catch (err) {
    uiAlertError(err?.message || String(err));
  }
});

  // Drag & drop tasks
  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".card[data-task-id]");
    if (!card) return;
    state.ui.dragTaskId = card.dataset.taskId;
    state.ui.dragSourceListId = card.parentElement?.id || null;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
    requestAnimationFrame(() => {
      card.classList.add("dragging");
    });
  });

  document.addEventListener("dragend", (e) => {
    const card = e.target.closest(".card[data-task-id]");
    if (!card) return;
    card.classList.remove("dragging");
    state.ui.dragTaskId = null;
    state.ui.dragSourceListId = null;
  });

  document.addEventListener("dragover", (e) => {
    const list = e.target.closest("#pendingTasks, #completedTasks");
    if (!list) return;
    if (!state.ui.dragTaskId) return;
    if (state.ui.dragSourceListId && state.ui.dragSourceListId !== list.id) return;
    e.preventDefault();

    const draggingEl = document.querySelector(".card[data-task-id].dragging");
    if (!draggingEl) return;

    const nextCard = getDropTargetCard(list, e.clientY);
    if (!nextCard) {
      list.appendChild(draggingEl);
      return;
    }

    list.insertBefore(draggingEl, nextCard);
  });

  document.addEventListener("drop", async (e) => {
    const list = e.target.closest("#pendingTasks, #completedTasks");
    if (!list) return;
    const fromTaskId = state.ui.dragTaskId;
    if (!fromTaskId) return;
    if (state.ui.dragSourceListId && state.ui.dragSourceListId !== list.id) return;
    e.preventDefault();

    const tasks = await getTasksForCurrentDay(state);
    const domOrder = [
      ...document.querySelectorAll("#pendingTasks .card[data-task-id]"),
      ...document.querySelectorAll("#completedTasks .card[data-task-id]"),
    ].map((el) => el.dataset.taskId);

    const fromIndex = tasks.findIndex((t) => t.id === fromTaskId);
    const toIndex = domOrder.findIndex((id) => id === fromTaskId);
    if (fromIndex < 0 || toIndex < 0) {
      state.ui.dragTaskId = null;
      state.ui.dragSourceListId = null;
      await renderApp(state);
      return;
    }

    try {
      if (fromIndex !== toIndex) {
        await reorderTaskByIndex(state, { fromIndex, toIndex });
      }
      await renderApp(state);
    } catch (err) {
      uiAlertError(err?.message || String(err));
    } finally {
      state.ui.dragTaskId = null;
      state.ui.dragSourceListId = null;
    }
  });

  // Abrir modal criar recompensa
  $("#btnOpenCreateReward").addEventListener("click", async () => {
    await refreshRewardCostPreview(state);
    openModal(UI.MODAL_CREATE_REWARD);
  });

  // Criar recompensa
  $("#btnConfirmCreateReward").addEventListener("click", async () => {
    try {
      const name = $("#rewardNameInput").value.trim();
      const rewardTier = $("#rewardTierInput").value;
      const valueTier = $("#rewardValueInput").value;

      const reward = await createReward(state, { name, rewardTier, valueTier });

      $("#rewardNameInput").value = "";
      $("#rewardTierInput").value = "intermediaria";
      $("#rewardValueInput").value = "medio";
      await refreshRewardCostPreview(state);

      closeModal(UI.MODAL_CREATE_REWARD);
      await renderApp(state);
      await renderRewardsModal(state);
      uiToast(FEEDBACK_TOASTS.rewardCreated(reward.name, reward.cost));
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  // Criar / editar habito
  $(UI.BTN_CONFIRM_HABIT).addEventListener("click", async () => {
    try {
      const habitId = $(UI.HABIT_EDIT_ID).value.trim();
      const computedHabitPoints = refreshHabitPoints();
      const payload = {
        name: $(UI.HABIT_NAME_INPUT).value.trim(),
        unit: $(UI.HABIT_UNIT_INPUT).value.trim(),
        increment: Number($(UI.HABIT_INCREMENT_INPUT).value),
        points: computedHabitPoints,
        icon: $(UI.HABIT_ICON_INPUT).value.trim(),
        dailyTarget: $(UI.HABIT_DAILY_TARGET_INPUT).value.trim(),
        category: $(UI.HABIT_CATEGORY_INPUT).value,
        tier: $("#habitTierInput")?.value || "moderado",
        effort: $("#habitEffortInput")?.value || "media",
      };

      if (habitId) {
        const updated = await updateHabitTemplate(state, habitId, payload);
        uiToast(FEEDBACK_TOASTS.habitUpdated(updated.name));
      } else {
        const created = await createHabitTemplate(state, payload);
        uiToast(FEEDBACK_TOASTS.habitCreated(created.name));
      }

      resetHabitForm();
      closeModal(UI.MODAL_CREATE_HABIT);
      await renderApp(state);
      await renderHabitsModal(state);
    } catch (err) {
      uiAlertError(err?.message || String(err));
    }
  });

  // Resgatar / excluir recompensa
  document.addEventListener("click", async (e) => {
    const redeemBtn = e.target.closest(".reward-redeem");
    const deleteBtn = e.target.closest(".reward-delete");

    if (redeemBtn) {
      const rewardId = redeemBtn.dataset.rewardId;
      if (!rewardId) return;

      try {
        if (isCurrentDayReadOnly(state)) {
          uiAlertInfo("Dia anterior em modo somente leitura.");
          return;
        }
        const source = state.ui.rewardConsumeSource === "weekly" ? "weekly" : "day";
        const result = await redeemReward(state, rewardId, { source });
        launchConfetti();
        await renderApp(state);
        await renderRewardsModal(state);
        const sourceLabel = result?.source === "weekly" ? "carteira semanal" : "pontos do dia";
        uiToast(FEEDBACK_TOASTS.rewardRedeemed(result?.rewardName, result?.cost, sourceLabel));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    if (deleteBtn) {
      const rewardId = deleteBtn.dataset.rewardId;
      if (!rewardId) return;

      const ok = await uiConfirmAction("Excluir esta recompensa?");
      if (!ok) return;

      try {
        if (isCurrentDayReadOnly(state)) {
          uiAlertInfo("Dia anterior em modo somente leitura.");
          return;
        }
        const removed = await deleteReward(state, rewardId);
        await renderApp(state);
        await renderRewardsModal(state);
        uiToast(FEEDBACK_TOASTS.rewardDeleted(removed?.rewardName));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
    }
  });

  // Habitos: registrar, editar, excluir e desfazer execucao
  document.addEventListener("click", async (e) => {
    const categoryRenameBtn = e.target.closest(".category-rename");
    if (categoryRenameBtn) {
      const key = categoryRenameBtn.dataset.category;
      if (!key) return;
      const next = prompt("Novo nome da categoria:", getCategoryLabel(key));
      if (!next) return;
      try {
        await renameCategory(state, key, next);
        await refreshCategorySelectOptions(state);
        await renderCategoriesCrudList(state);
        await renderApp(state);
        uiToast(FEEDBACK_TOASTS.categoryRenamed(getCategoryLabel(key), next));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    const categoryDeleteBtn = e.target.closest(".category-delete");
    if (categoryDeleteBtn) {
      const key = categoryDeleteBtn.dataset.category;
      if (!key) return;
      const ok = await uiConfirmAction(`Remover categoria "${getCategoryLabel(key)}"? Itens existentes serao movidos para Trabalho.`);
      if (!ok) return;
      try {
        await deleteCategory(state, key, { replacement: "trabalho" });
        await refreshCategorySelectOptions(state);
        await renderCategoriesCrudList(state);
        await renderApp(state);
        uiToast(FEEDBACK_TOASTS.categoryDeleted(getCategoryLabel(key)));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    const defaultTaskRemove = e.target.closest(".default-task-remove");
    const defaultTaskCategoryToggle = e.target.closest(".default-task-category-toggle");
    if (defaultTaskCategoryToggle) {
      const row = defaultTaskCategoryToggle.closest(".default-task-row");
      const index = Number(row?.dataset.index);
      if (!Number.isInteger(index)) return;
      try {
        const categories = await getCategories(state.db);
        if (!categories.length) return;
        const current = normalizeCategory(defaultTaskDraft[index]?.category);
        const currentIndex = Math.max(0, categories.indexOf(current));
        const next = categories[(currentIndex + 1) % categories.length];
        defaultTaskDraft[index] = {
          ...defaultTaskDraft[index],
          category: next,
        };
        renderDefaultTasksDraft(defaultTaskDraft);
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    if (defaultTaskRemove) {
      const row = defaultTaskRemove.closest(".default-task-row");
      const index = Number(row?.dataset.index);
      if (!Number.isInteger(index)) return;
      defaultTaskDraft.splice(index, 1);
      renderDefaultTasksDraft(defaultTaskDraft);
      return;
    }

    const quickCard = e.target.closest(".habit-quick-card");
    if (quickCard) {
      const habitId = quickCard.dataset.habitId;
      if (!habitId) return;
      try {
        const result = await executeHabit(state, habitId);
        playRewardSound();
        await renderApp(state);
        const habitsModal = document.getElementById(UI.MODAL_HABITS);
        if (habitsModal?.style.display === "flex") {
          await renderHabitsModal(state);
        }
        uiToast(FEEDBACK_TOASTS.habitExecuted(result?.habitName, result?.pointsDelta));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    const registerBtn = e.target.closest(".habit-execute");
    if (registerBtn) {
      const habitId = registerBtn.dataset.habitId;
      if (!habitId) return;
      try {
        const result = await executeHabit(state, habitId);
        playRewardSound();
        await renderApp(state);
        await renderHabitsModal(state);
        uiToast(FEEDBACK_TOASTS.habitExecuted(result?.habitName, result?.pointsDelta));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    const editBtn = e.target.closest(".habit-edit");
    if (editBtn) {
      const habitId = editBtn.dataset.habitId;
      if (!habitId) return;
      try {
        const all = await listAllHabitTemplates(state);
        const current = all.find((h) => h.id === habitId);
        if (!current) return;

        $(UI.HABIT_FORM_TITLE).textContent = "Editar habito";
        $(UI.HABIT_EDIT_ID).value = current.id;
        $(UI.HABIT_NAME_INPUT).value = current.name || "";
        $(UI.HABIT_UNIT_INPUT).value = current.unit || "";
        $(UI.HABIT_INCREMENT_INPUT).value = String(Number(current.increment) || "");
        const habitTierInput = $("#habitTierInput");
        const habitEffortInput = $("#habitEffortInput");
        if (habitTierInput) habitTierInput.value = current.tier || "moderado";
        if (habitEffortInput) habitEffortInput.value = current.effort || "media";
        refreshHabitPoints();
        $(UI.HABIT_ICON_INPUT).value = current.icon || "";
        $(UI.HABIT_DAILY_TARGET_INPUT).value = String(Number(current.dailyTarget) || "");
        $(UI.HABIT_CATEGORY_INPUT).value = normalizeCategory(current.category);
        refreshHabitPoints();
        openModal(UI.MODAL_CREATE_HABIT);
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    const deleteBtn = e.target.closest(".habit-delete");
    if (deleteBtn) {
      const habitId = deleteBtn.dataset.habitId;
      if (!habitId) return;
      const ok = await uiConfirmAction("Excluir habito permanentemente? Isso nao apaga registros ja feitos no dia.");
      if (!ok) return;
      try {
        const removed = await deleteHabitTemplate(state, habitId);
        await renderApp(state);
        await renderHabitsModal(state);
        uiToast(FEEDBACK_TOASTS.habitDeleted(removed?.habitName));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
      return;
    }

    const undoExecBtn = e.target.closest(".habit-exec-undo");
    if (undoExecBtn) {
      const executionId = undoExecBtn.dataset.execId;
      if (!executionId) return;
      try {
        const result = await undoHabitExecution(state, executionId);
        await renderApp(state);
        await renderHabitsModal(state);
        uiToast(FEEDBACK_TOASTS.habitUndo(result?.pointsDelta));
      } catch (err) {
        uiAlertError(err?.message || String(err));
      }
    }
  });

  // âœ… DelegaÃ§Ã£o: clique em dia no modal "Ver Todos"
  document.getElementById("allDaysList").addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest("[data-action='day:delete']");
    const dayBtn = e.target.closest("[data-action='day:select']");

    const today = dayKeyFromDate(new Date());

    if (deleteBtn) {
      const dayKey = deleteBtn.dataset.day;
      if (!dayKey) return;

      // SÃ³ futuro pode excluir
      if (!(dayKey > today)) {
        uiAlertInfo("Só é permitido excluir dias futuros (planejamento).");
        return;
      }

      const ok = await uiConfirmAction(`Excluir o dia ${formatDayDM(dayKey)}? Isso removera tasks desse dia.`);
      if (!ok) return;

      // Cascade delete
      await deleteTasksByDay(state.db, dayKey);
      await deleteEventsByDay(state.db, dayKey); // deve estar vazio (nÃ£o loga futuro), mas fica robusto
      await deleteDay(state.db, dayKey);

      // Se estava no dia excluÃ­do, volta pro Ãºltimo dia existente (ou mantÃ©m o atual)
      if (state.currentDay === dayKey) {
        const days = await listDays(state.db);
        const fallback = days[days.length - 1] || today;
        setCurrentDay(state, fallback);
      }

      await openAllDaysModal(state); // re-render do modal
      await renderApp(state);
      uiToast(FEEDBACK_TOASTS.dayDeleted(formatDayDM(dayKey)));
      return;
    }

    if (dayBtn) {
      const dayKey = dayBtn.dataset.day;
      if (!dayKey) return;
      setCurrentDay(state, dayKey);
      closeModal(UI.MODAL_ALL_DAYS);
      await renderApp(state);
    }
  });

}

function uiAlertInfo(message, title = "Informacao") {
  return showSystemAlert({ tone: "info", title, message });
}

function uiAlertError(message, title = "Erro") {
  return showSystemAlert({ tone: "danger", title, message });
}

function uiToast(toastConfig, options = {}) {
  if (!toastConfig) return;
  return showActionToast({
    tone: toastConfig.tone || "info",
    title: toastConfig.title || "Informacao",
    message: toastConfig.message || "",
    ...options,
  });
}

function uiConfirmAction(message, options = {}) {
  return showSystemConfirm({
    tone: options.tone || "warning",
    title: options.title || "Confirmar acao",
    message,
    confirmLabel: options.confirmLabel || "Confirmar",
    cancelLabel: options.cancelLabel || "Cancelar",
  });
}

function bindTaskPointsEngine() {
  const fields = ["#taskComplexity", "#taskAversion", "#taskImpact"];
  fields.forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.addEventListener("change", () => refreshTaskPoints());
  });
  refreshTaskPoints();
}

function refreshTaskPoints() {
  const complexity = $("#taskComplexity")?.value || "";
  const aversion = $("#taskAversion")?.value || "";
  const impact = $("#taskImpact")?.value || "";
  const badge = $("#taskPointsBadge");

  if (!complexity || !aversion || !impact) {
    if (badge) badge.textContent = "+0";
    return 0;
  }

  const points = calculateTaskPoints({
    complexity,
    aversion,
    impact,
  });
  if (badge) badge.textContent = `+${points}`;
  return points;
}

function bindDefaultTaskPointsEngine() {
  const fields = ["#defaultTaskComplexityInput", "#defaultTaskAversionInput", "#defaultTaskImpactInput"];
  fields.forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.addEventListener("change", () => refreshDefaultTaskPoints());
  });
  refreshDefaultTaskPoints();
}

function refreshDefaultTaskPoints() {
  const complexity = $("#defaultTaskComplexityInput")?.value || "";
  const aversion = $("#defaultTaskAversionInput")?.value || "";
  const impact = $("#defaultTaskImpactInput")?.value || "";
  const badge = $("#defaultTaskPointsBadge");

  if (!complexity || !aversion || !impact) {
    if (badge) badge.textContent = "+0";
    return 0;
  }

  const points = calculateTaskPoints({ complexity, aversion, impact });
  if (badge) badge.textContent = `+${points}`;
  return points;
}

function bindHabitPointsEngine() {
  const fields = ["#habitTierInput", "#habitEffortInput", "#habitDailyTargetInput"];
  fields.forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.addEventListener("change", () => refreshHabitPoints());
  });
  refreshHabitPoints();
}

function refreshHabitPoints() {
  const points = calculateHabitPoints({
    habitTier: $("#habitTierInput")?.value || "moderado",
    effort: $("#habitEffortInput")?.value || "media",
    dailyTarget: Number($(UI.HABIT_DAILY_TARGET_INPUT)?.value || 1),
  });
  const pointsInput = $(UI.HABIT_POINTS_INPUT);
  if (pointsInput) pointsInput.value = String(points);
  return points;
}

function bindRewardCostPreview(state) {
  const tierInput = $("#rewardTierInput");
  const valueInput = $("#rewardValueInput");
  if (tierInput) tierInput.addEventListener("change", () => refreshRewardCostPreview(state));
  if (valueInput) valueInput.addEventListener("change", () => refreshRewardCostPreview(state));
  refreshRewardCostPreview(state);
}

async function refreshRewardCostPreview(state) {
  const preview = $("#rewardCostPreview");
  if (!preview) return;

  const rewardTier = $("#rewardTierInput")?.value || "intermediaria";
  const valueTier = $("#rewardValueInput")?.value || "medio";
  const dayKey = state.currentDay;

  const avgDailyPoints = await estimateAverageDailyPoints(state.db);
  const baseCost = calculateRewardBaseCost({
    avgDailyPoints,
    rewardTier,
    valueTier,
  });

  if (!dayKey) {
    preview.textContent = `Custo base sugerido: ${baseCost} pts`;
    return;
  }

  const [onboardingFactor, redemptionsTodayCount] = await Promise.all([
    getOnboardingFactor(state.db, dayKey),
    getRewardRedemptionsCountForDay(state.db, dayKey),
  ]);
  const dynamicCost = calculateAdaptiveRewardCost({
    baseCost,
    onboardingFactor,
    redemptionsTodayCount,
  });

  preview.textContent = `Custo hoje: ${dynamicCost} pts (base ${baseCost} | fase x${onboardingFactor.toFixed(2)} | resgates hoje ${redemptionsTodayCount})`;
}

function getDropTargetCard(container, mouseY) {
  const cards = Array.from(container.querySelectorAll(".card[data-task-id]:not(.dragging)"));
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (mouseY < midpoint) {
      return card;
    }
  }
  return null;
}

function renderDefaultTasksDraft(items) {
  const list = document.getElementById(UI.DEFAULT_TASKS_LIST);
  if (!list) return;
  list.innerHTML = "";

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    list.innerHTML = `<div class="card">Nenhum template cadastrado. Adicione ao menos 1 task.</div>`;
    return;
  }

  rows.forEach((item, index) => {
    const complexity = String(item?.complexity || "media");
    const aversion = String(item?.aversion || "media");
    const impact = String(item?.impact || "medio");
    const points = calculateTaskPoints({ complexity, aversion, impact });

    const row = document.createElement("div");
    row.className = "default-task-row";
    row.dataset.index = String(index);
    row.innerHTML = `
      <div class="default-task-cell default-task-cell-name">${escapeHtml(String(item?.name || ""))} <button type="button" class="task-category-badge task-category-badge-inline default-task-category-toggle" title="Trocar categoria">${escapeHtml(getCategoryLabel(item?.category))}</button></div>
      <div class="default-task-cell default-task-points-label">Pontos: +${points}</div>
      <button type="button" class="btn-danger default-task-remove" title="Remover template">Excluir</button>
    `;
    list.appendChild(row);
  });
}

function resetHabitForm() {
  $(UI.HABIT_FORM_TITLE).textContent = "Criar habito";
  $(UI.HABIT_EDIT_ID).value = "";
  $(UI.HABIT_NAME_INPUT).value = "";
  $(UI.HABIT_UNIT_INPUT).value = "";
  $(UI.HABIT_INCREMENT_INPUT).value = "";
  const habitTierInput = $("#habitTierInput");
  const habitEffortInput = $("#habitEffortInput");
  if (habitTierInput) habitTierInput.value = "moderado";
  if (habitEffortInput) habitEffortInput.value = "media";
  refreshHabitPoints();
  $(UI.HABIT_ICON_INPUT).value = "*";
  $(UI.HABIT_DAILY_TARGET_INPUT).value = "";
  $(UI.HABIT_CATEGORY_INPUT).value = "trabalho";
  refreshHabitPoints();
}

async function refreshCategorySelectOptions(state) {
  const categories = await getCategories(state.db);
  const selects = [
    UI.TASK_CATEGORY_INPUT,
    UI.DEFAULT_TASK_CATEGORY_INPUT,
    UI.HABIT_CATEGORY_INPUT,
  ];

  for (const selectId of selects) {
    const select = document.getElementById(selectId);
    if (!select) continue;
    const current = normalizeCategory(select.value);
    select.innerHTML = categories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(getCategoryLabel(category))}</option>`)
      .join("");

    const nextValue = categories.includes(current) ? current : (categories[0] || "trabalho");
    select.value = nextValue;
  }
}

async function renderCategoriesCrudList(state) {
  const wrap = $(UI.CATEGORIES_LIST);
  const categories = await getCategories(state.db);
  wrap.innerHTML = "";

  if (!categories.length) {
    wrap.innerHTML = `<div class="card">Nenhuma categoria cadastrada.</div>`;
    return;
  }

  categories.forEach((category) => {
    const isDefault = category === "trabalho";
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <div class="category-row-main">
        <b>${escapeHtml(getCategoryLabel(category))}</b>
        <span>Chave: ${escapeHtml(category)}</span>
      </div>
      <div class="category-row-actions">
        <button type="button" class="category-rename" data-category="${escapeHtml(category)}">Renomear</button>
        <button type="button" class="btn-danger category-delete" data-category="${escapeHtml(category)}" ${isDefault ? "disabled" : ""}>Excluir</button>
      </div>
    `;
    wrap.appendChild(row);
  });
}

function downloadTextFile(fileName, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setupDataMenu() {
  const trigger = $("#btnDataMenu");
  const panel = $("#dataMenuPanel");

  const close = () => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("click", () => close());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  close();

  return { close, open };
}

function isCurrentDayReadOnly(state) {
  const day = String(state?.currentDay || "");
  if (!day) return false;
  const today = dayKeyFromDate(new Date());
  return day < today;
}

function bindReadOnlyDayGuards(state) {
  const blockedClickSelectors = [
    "#btnAddTask",
    "#btnSyncPendingDefaults",
    ".task-category-toggle",
    ".task-start",
    ".task-delete",
    ".reward-redeem",
    ".reward-delete",
    "#btnOpenCreateReward",
    "#btnConfirmCreateReward",
    ".habit-quick-card",
    ".habit-execute",
    ".habit-edit",
    ".habit-delete",
    ".habit-exec-undo",
    "#btnOpenCreateHabit",
    "#btnConfirmHabit",
    "#btnAddCategory",
    ".category-rename",
    ".category-delete",
    "#btnAddDefaultTask",
    "#btnSaveDefaultTasks",
    ".default-task-remove",
    ".default-task-category-toggle",
    "#btnSaveWeeklyGoal",
    "#btnMaxPenalty",
  ].join(", ");

  document.addEventListener("click", (e) => {
    if (!isCurrentDayReadOnly(state)) return;
    const blocked = e.target.closest(blockedClickSelectors);
    if (!blocked) return;
    e.preventDefault();
    e.stopPropagation();
    uiAlertInfo("Dia anterior em modo somente leitura.");
  }, true);
}

function resetWeeklyGoalForm() {
  $(UI.WEEKLY_GOAL_NAME_INPUT).value = "";
  $(UI.WEEKLY_GOAL_INPUT).value = "";
  $(UI.WEEKLY_GOAL_REWARD_INPUT).value = "";
  $(UI.WEEKLY_GOAL_PENALTY_INPUT).value = String(getWeeklyPenaltyDefaultPercent());
}

function setWeeklyGoalFormLocked(locked) {
  $(UI.WEEKLY_GOAL_NAME_INPUT).disabled = locked;
  $(UI.WEEKLY_GOAL_INPUT).disabled = locked;
  $(UI.WEEKLY_GOAL_REWARD_INPUT).disabled = locked;
  $(UI.WEEKLY_GOAL_PENALTY_INPUT).disabled = locked;

  const saveBtn = $(UI.BTN_SAVE_WEEKLY_GOAL);
  saveBtn.disabled = locked;
  saveBtn.textContent = locked ? "Meta ativa em andamento" : "Salvar meta";
}

async function renderWeeklyGoalCrudList(state, providedGoals = null) {
  const wrap = $(UI.WEEKLY_GOAL_LIST);
  if (!wrap) return;

  const goals = Array.isArray(providedGoals) ? providedGoals : await listWeeklyGoals(state);
  wrap.innerHTML = "";

  if (!goals.length) {
    wrap.innerHTML = `<div class="card">Nenhuma meta semanal cadastrada ainda.</div>`;
    return;
  }

  goals.forEach((goal) => {
    const row = document.createElement("div");
    row.className = "weekly-goal-row";
    const settledLabel = goal?.settlement
      ? goal.settlement.reached
        ? "Concluida"
        : "Nao concluida"
      : "Em aberto";
    row.innerHTML = `
      <div class="weekly-goal-row-main">
        <b>${goal.name || "Meta semanal"}</b>
        <span>Semana ${formatDayDMY(goal.weekStartKey)} a ${formatDayDMY(goal.weekEndKey)}</span>
        <span>Semana iniciada em: ${formatDayDMY(String(goal.createdAt || "").slice(0, 10))}</span>
        <span>Meta: ${Number(goal.targetPoints) || 0} pts - Recompensa: +${Number(goal.rewardPoints) || 0} - Prejuizo: ${Number(goal.penaltyPercent) || 50}%</span>
        <span>Status: ${settledLabel}</span>
      </div>
    `;
    wrap.appendChild(row);
  });
}

async function openAllDaysModal(state) {
  const list = document.getElementById("allDaysList");
  list.innerHTML = "";

  const days = await listDays(state.db);
  const today = dayKeyFromDate(new Date());

  days.forEach((d) => {
    const row = document.createElement("div");
    row.className = "card";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "12px";

    const isFuture = d > today;

    row.innerHTML = `
      <button type="button" data-action="day:select" data-day="${d}" style="all:unset; cursor:pointer; flex:1;">
        <div style="font-weight:700;">${formatDayDM(d)}</div>
        <div style="opacity:.75; font-size:12px;">${isFuture ? "Planejamento (futuro)" : "Dia existente"}</div>
      </button>

      ${
        isFuture
          ? `<button type="button" class="btn-danger" data-action="day:delete" data-day="${d}" title="Excluir dia futuro">ðŸ—‘ï¸</button>`
          : `<div style="width:42px;"></div>`
      }
    `;

    list.appendChild(row);
  });

  openModal(UI.MODAL_ALL_DAYS);
}

