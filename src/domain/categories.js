import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  META_KEY_CATEGORIES_V1,
  STORE_EVENTS,
  STORE_HABIT_TEMPLATES,
  STORE_META,
  STORE_TASKS,
} from "../app/constants.js";
import { withTx, reqToPromise } from "../storage/db.js";

const RESERVED_CATEGORIES = Object.freeze([...CATEGORIES]);

export function canonicalizeCategory(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function normalizeCategory(value, fallback = DEFAULT_CATEGORY) {
  const normalized = canonicalizeCategory(value);
  return normalized || fallback;
}

export function getCategoryLabel(category) {
  const key = normalizeCategory(category);
  return key
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function listDefaultCategories() {
  return [...RESERVED_CATEGORIES];
}

export async function getCategories(db) {
  const row = await withTx(db, [STORE_META], "readonly", async (_tx, stores) =>
    reqToPromise(stores[STORE_META].get(META_KEY_CATEGORIES_V1))
  );
  const saved = Array.isArray(row?.value) ? row.value : [];
  const normalized = normalizeCategoryList(saved);

  if (!normalized.length) {
    await setCategories(db, RESERVED_CATEGORIES);
    return [...RESERVED_CATEGORIES];
  }

  return normalized;
}

export async function setCategories(db, categories) {
  const next = normalizeCategoryList(categories);
  if (!next.length) {
    throw new Error("Mantenha pelo menos 1 categoria.");
  }
  if (!next.includes(DEFAULT_CATEGORY)) {
    next.unshift(DEFAULT_CATEGORY);
  }

  await withTx(db, [STORE_META], "readwrite", async (_tx, stores) => {
    await reqToPromise(
      stores[STORE_META].put({
        key: META_KEY_CATEGORIES_V1,
        value: next,
      })
    );
  });

  return next;
}

export async function ensureCategoryExists(db, value, field = "Categoria") {
  const normalized = canonicalizeCategory(value);
  if (!normalized) {
    throw new Error(`${field} invalida.`);
  }
  const categories = await getCategories(db);
  if (!categories.includes(normalized)) {
    throw new Error(`${field} invalida. Escolha uma categoria cadastrada.`);
  }
  return normalized;
}

export async function addCategory(state, value) {
  const nextCategory = canonicalizeCategory(value);
  if (!nextCategory) {
    throw new Error("Informe um nome valido para a categoria.");
  }

  const categories = await getCategories(state.db);
  if (categories.includes(nextCategory)) {
    throw new Error("Categoria ja existe.");
  }

  return setCategories(state.db, [...categories, nextCategory]);
}

export async function renameCategory(state, currentKey, nextValue) {
  const from = canonicalizeCategory(currentKey);
  const to = canonicalizeCategory(nextValue);

  if (!from || !to) throw new Error("Categoria invalida.");
  if (from === to) return getCategories(state.db);

  const categories = await getCategories(state.db);
  if (!categories.includes(from)) throw new Error("Categoria nao encontrada.");
  if (categories.includes(to)) throw new Error("Ja existe uma categoria com esse nome.");

  await withTx(
    state.db,
    [STORE_META, STORE_TASKS, STORE_HABIT_TEMPLATES, STORE_EVENTS],
    "readwrite",
    async (_tx, stores) => {
      const tasks = await reqToPromise(stores[STORE_TASKS].getAll());
      for (const task of tasks || []) {
        if (normalizeCategory(task?.category) !== from) continue;
        await reqToPromise(stores[STORE_TASKS].put({ ...task, category: to }));
      }

      const templates = await reqToPromise(stores[STORE_HABIT_TEMPLATES].getAll());
      for (const template of templates || []) {
        if (normalizeCategory(template?.category) !== from) continue;
        await reqToPromise(stores[STORE_HABIT_TEMPLATES].put({ ...template, category: to }));
      }

      const events = await reqToPromise(stores[STORE_EVENTS].getAll());
      for (const event of events || []) {
        const meta = event?.meta || {};
        const directCategory = canonicalizeCategory(meta?.category);
        const snapCategory = canonicalizeCategory(meta?.templateSnapshot?.category);
        if (directCategory !== from && snapCategory !== from) continue;

        const nextMeta = { ...meta };
        if (directCategory === from) nextMeta.category = to;
        if (snapCategory === from) {
          nextMeta.templateSnapshot = { ...(meta.templateSnapshot || {}), category: to };
        }
        await reqToPromise(stores[STORE_EVENTS].put({ ...event, meta: nextMeta }));
      }

      const defaultTemplateRow = await reqToPromise(stores[STORE_META].get("default_tasks_template_v1"));
      if (defaultTemplateRow && Array.isArray(defaultTemplateRow.value)) {
        const updatedTemplate = defaultTemplateRow.value.map((item) => {
          if (normalizeCategory(item?.category) !== from) return item;
          return { ...item, category: to };
        });
        await reqToPromise(stores[STORE_META].put({ ...defaultTemplateRow, value: updatedTemplate }));
      }

      const updatedCategories = categories.map((category) => (category === from ? to : category));
      await reqToPromise(
        stores[STORE_META].put({
          key: META_KEY_CATEGORIES_V1,
          value: normalizeCategoryList(updatedCategories),
        })
      );
    }
  );

  return getCategories(state.db);
}

export async function deleteCategory(state, key, { replacement = DEFAULT_CATEGORY } = {}) {
  const target = canonicalizeCategory(key);
  const fallback = canonicalizeCategory(replacement) || DEFAULT_CATEGORY;

  if (!target) throw new Error("Categoria invalida.");
  if (target === DEFAULT_CATEGORY) {
    throw new Error("A categoria padrao nao pode ser removida.");
  }

  const categories = await getCategories(state.db);
  if (!categories.includes(target)) throw new Error("Categoria nao encontrada.");
  if (!categories.includes(fallback)) throw new Error("Categoria de substituicao invalida.");

  await withTx(
    state.db,
    [STORE_META, STORE_TASKS, STORE_HABIT_TEMPLATES, STORE_EVENTS],
    "readwrite",
    async (_tx, stores) => {
      const tasks = await reqToPromise(stores[STORE_TASKS].getAll());
      for (const task of tasks || []) {
        if (normalizeCategory(task?.category) !== target) continue;
        await reqToPromise(stores[STORE_TASKS].put({ ...task, category: fallback }));
      }

      const templates = await reqToPromise(stores[STORE_HABIT_TEMPLATES].getAll());
      for (const template of templates || []) {
        if (normalizeCategory(template?.category) !== target) continue;
        await reqToPromise(stores[STORE_HABIT_TEMPLATES].put({ ...template, category: fallback }));
      }

      const events = await reqToPromise(stores[STORE_EVENTS].getAll());
      for (const event of events || []) {
        const meta = event?.meta || {};
        const directCategory = canonicalizeCategory(meta?.category);
        const snapCategory = canonicalizeCategory(meta?.templateSnapshot?.category);
        if (directCategory !== target && snapCategory !== target) continue;

        const nextMeta = { ...meta };
        if (directCategory === target) nextMeta.category = fallback;
        if (snapCategory === target) {
          nextMeta.templateSnapshot = { ...(meta.templateSnapshot || {}), category: fallback };
        }
        await reqToPromise(stores[STORE_EVENTS].put({ ...event, meta: nextMeta }));
      }

      const defaultTemplateRow = await reqToPromise(stores[STORE_META].get("default_tasks_template_v1"));
      if (defaultTemplateRow && Array.isArray(defaultTemplateRow.value)) {
        const updatedTemplate = defaultTemplateRow.value.map((item) => {
          if (normalizeCategory(item?.category) !== target) return item;
          return { ...item, category: fallback };
        });
        await reqToPromise(stores[STORE_META].put({ ...defaultTemplateRow, value: updatedTemplate }));
      }

      const updatedCategories = categories.filter((category) => category !== target);
      await reqToPromise(
        stores[STORE_META].put({
          key: META_KEY_CATEGORIES_V1,
          value: normalizeCategoryList(updatedCategories),
        })
      );
    }
  );

  return getCategories(state.db);
}

function normalizeCategoryList(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const normalized = canonicalizeCategory(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
