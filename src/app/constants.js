// src/app/constants.js

export const APP_NAME = "TaskPoints PRO";

// IndexedDB
export const DB_NAME = "taskpoints_db";
export const DB_VERSION = 3;

// Object stores
export const STORE_META = "meta";
export const STORE_DAYS = "days";
export const STORE_TASKS = "tasks";
export const STORE_REWARDS = "rewards";
export const STORE_EVENTS = "events";

// ✅ NOVO: Hábitos
export const STORE_HABIT_TEMPLATES = "habitTemplates";
export const STORE_HABIT_EXECUTIONS = "habitExecutions";

// Meta keys
export const META_KEY_SCHEMA = "schema";
export const META_KEY_LAST_EVENT_SEQ = "lastEventSeq";
export const META_KEY_DEFAULT_TASKS_TEMPLATE = "default_tasks_template_v1";
export const META_KEY_CATEGORIES_V1 = "categories_v1";
export const META_KEY_WEEKLY_GOAL_POINTS = "weekly_goal_points_v1";
export const META_KEY_WEEKLY_GOAL_PRESET = "weekly_goal_preset_v1";
export const META_KEY_WEEKLY_LEVEL_REWARDS_PREFIX = "weekly_level_rewards_v1_";
export const META_KEY_WEEKLY_BONUS_WALLET = "weekly_bonus_wallet_v1";
export const META_KEY_WEEKLY_GOALS_V2 = "weekly_goals_v2";
export const META_KEY_WEEKLY_PROGRESS_ADJUSTMENTS_V1 = "weekly_progress_adjustments_v1";
export const META_KEY_WEEKLY_WALLET_ADJUSTMENTS_V1 = "weekly_wallet_adjustments_v1";

// Schema version (app-level)
export const SCHEMA_VERSION = 1;

export const CATEGORY = Object.freeze({
  SAUDE: "saude",
  TRABALHO: "trabalho",
  ESTUDO: "estudo",
});

export const CATEGORIES = Object.freeze([
  CATEGORY.SAUDE,
  CATEGORY.TRABALHO,
  CATEGORY.ESTUDO,
]);

export const DEFAULT_CATEGORY = CATEGORY.TRABALHO;

// Event types (logs)
export const EVENT = Object.freeze({
  DAY_CREATE: "day.create",

  TASK_CREATE: "task.create",
  TASK_START: "task.start",
  TASK_COMPLETE: "task.complete",
  TASK_UNCOMPLETE: "task.uncomplete",
  TASK_DELETE: "task.delete",
  TASK_CATEGORY_UPDATE: "task.category.update",
  TASK_REORDER: "task.reorder",

  REWARD_CREATE: "reward.create",
  REWARD_DELETE: "reward.delete",
  REWARD_REDEEM: "reward.redeem",

  MIGRATION_RUN: "migration.run",
  POINTS_RECOMPUTE: "points.recompute",
  BACKUP_EXPORT: "backup.export",
  BACKUP_IMPORT: "backup.import",
  WEEKLY_GOAL_SET: "weekly.goal.set",
  WEEKLY_GOAL_PRESET_SELECT: "weekly.goal.preset.select",
  WEEKLY_LEVEL_REWARD: "weekly.level.reward",
  WEEKLY_GOAL_SETTLEMENT: "weekly.goal.settlement",
  PENALTY_MAX_TRIGGER: "penalty.max.trigger",

  // ✅ NOVO: Hábitos (templates)
  HABIT_TEMPLATE_CREATE: "habit.template.create",
  HABIT_TEMPLATE_UPDATE: "habit.template.update",

  // ✅ NOVO: Hábitos (execuções)
  HABIT_EXECUTE: "habit.execute", // clicou e registrou
  HABIT_UNDO: "habit.undo",       // removeu registro (soft delete + delta pontos)
  HABIT_EDIT: "habit.edit",       // editou registro (delta pontos)
});

// UI selectors/ids
export const UI = Object.freeze({
  DAY_TITLE: "dayTitle",
  DAY_LIST: "dayList",
  DAY_POINTS: "dayPoints",
  DAY_REDEEMED_POINTS: "dayRedeemedPoints",
  DAY_PENALIZED_POINTS: "dayPenalizedPoints",
  WEEK_POINTS: "weekPoints",
  BTN_MAX_PENALTY: "btnMaxPenalty",
  WEEKLY_GOAL_CARD: "weeklyGoalCard",
  WEEKLY_GOAL_TEXT: "weeklyGoalText",
  WEEKLY_GOAL_BAR: "weeklyGoalBar",
  WEEKLY_GOAL_STATUS: "weeklyGoalStatus",
  WEEKLY_GOAL_LEVELS: "weeklyGoalLevels",
  BTN_OPEN_WEEKLY_GOAL: "btnOpenWeeklyGoal",
  MODAL_WEEKLY_GOAL: "weeklyGoalModal",
  WEEKLY_GOAL_INPUT: "weeklyGoalInput",
  WEEKLY_GOAL_NAME_INPUT: "weeklyGoalNameInput",
  WEEKLY_GOAL_REWARD_INPUT: "weeklyGoalRewardInput",
  WEEKLY_GOAL_PENALTY_INPUT: "weeklyGoalPenaltyInput",
  WEEKLY_GOAL_LIST: "weeklyGoalsCrudList",
  BTN_SAVE_WEEKLY_GOAL: "btnSaveWeeklyGoal",

  PENDING_TASKS: "pendingTasks",
  COMPLETED_TASKS: "completedTasks",

  PROGRESS_TEXT: "progressText",
  PROGRESS_BAR: "progressBar",

  // Modals
  MODAL_CREATE_DAY: "createDayModal",
  MODAL_ALL_DAYS: "allDaysModal",
  MODAL_REWARDS: "rewardsModal",
  MODAL_CREATE_REWARD: "createRewardModal",
  MODAL_DEFAULT_TASKS: "defaultTasksModal",

  // Rewards modal parts
  MODAL_DAY_POINTS: "modalDayPoints",
  MODAL_DAY_POINTS_ONLY: "modalDayPointsOnly",
  MODAL_WEEKLY_POINTS: "modalWeeklyPoints",
  REWARD_CONSUME_SOURCE_INPUT: "rewardConsumeSourceInput",
  REWARDS_CATALOG_LIST: "rewardsCatalogList",
  REWARDS_REDEEMED_LIST: "rewardsRedeemedList",

  // ✅ NOVO: Hábitos (UI)
  HABITS_SECTION: "habitsSection",           // container na tela principal
  BTN_OPEN_HABITS: "btnOpenHabits",          // botão/ícone para abrir modal
  BTN_OPEN_CREATE_HABIT: "btnOpenCreateHabit",
  BTN_CONFIRM_HABIT: "btnConfirmHabit",
  MODAL_HABITS: "habitsModal",               // modal principal de hábitos
  MODAL_CREATE_HABIT: "createHabitModal",    // modal criar/editar hábito (template)
  HABITS_LIST: "habitsList",                 // lista de hábitos dentro do modal
  HABIT_EXECUTIONS_LIST: "habitExecList",    // lista de registros do dia no modal
  HABIT_FORM_TITLE: "habitFormTitle",
  HABIT_EDIT_ID: "habitEditId",
  HABIT_NAME_INPUT: "habitNameInput",
  HABIT_UNIT_INPUT: "habitUnitInput",
  HABIT_INCREMENT_INPUT: "habitIncrementInput",
  HABIT_POINTS_INPUT: "habitPointsInput",
  HABIT_ICON_INPUT: "habitIconInput",
  HABIT_DAILY_TARGET_INPUT: "habitDailyTargetInput",
  HABIT_CATEGORY_INPUT: "habitCategoryInput",
  BTN_OPEN_LOGS: "btnOpenLogs",
  MODAL_LOGS: "logsModal",
  LOG_LIST: "logList",
  BTN_OPEN_DEFAULT_TASKS: "btnOpenDefaultTasks",
  BTN_OPEN_CATEGORIES: "btnOpenCategories",
  MODAL_CATEGORIES: "categoriesModal",
  CATEGORIES_LIST: "categoriesList",
  CATEGORY_NAME_INPUT: "categoryNameInput",
  BTN_ADD_CATEGORY: "btnAddCategory",
  DEFAULT_TASKS_LIST: "defaultTasksList",
  DEFAULT_TASK_NAME_INPUT: "defaultTaskNameInput",
  DEFAULT_TASK_CATEGORY_INPUT: "defaultTaskCategoryInput",
  DEFAULT_TASK_POINTS_INPUT: "defaultTaskPointsInput",
  BTN_ADD_DEFAULT_TASK: "btnAddDefaultTask",
  BTN_SAVE_DEFAULT_TASKS: "btnSaveDefaultTasks",
  BTN_EXPORT_DATA: "btnExportData",
  BTN_IMPORT_DATA: "btnImportData",
  IMPORT_DATA_INPUT: "importDataInput",
  TASK_CATEGORY_INPUT: "taskCategory",
});
