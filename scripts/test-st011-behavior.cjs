const path = require("path");
const { pathToFileURL } = require("url");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeRequest(executor, tx) {
  const req = { onsuccess: null, onerror: null, result: undefined, error: null };
  if (tx) tx._pending += 1;
  queueMicrotask(() => {
    try {
      req.result = executor();
      if (typeof req.onsuccess === "function") req.onsuccess({ target: req });
    } catch (err) {
      req.error = err;
      if (typeof req.onerror === "function") req.onerror({ target: req });
    } finally {
      if (tx) {
        tx._pending -= 1;
        tx._maybeComplete();
      }
    }
  });
  return req;
}

class FakeNameList {
  constructor() {
    this._items = [];
  }
  add(name) {
    if (!this._items.includes(name)) this._items.push(name);
  }
  contains(name) {
    return this._items.includes(name);
  }
}

function readByKeyPath(value, keyPath) {
  if (Array.isArray(keyPath)) return keyPath.map((k) => readByKeyPath(value, k));
  if (typeof keyPath !== "string") return undefined;
  return value?.[keyPath];
}

function rangeMatches(range, key) {
  if (!range) return true;
  if (range.__type === "only") {
    if (Array.isArray(range.value)) return JSON.stringify(key) === JSON.stringify(range.value);
    return key === range.value;
  }
  if (range.__type === "bound") {
    if (Array.isArray(key)) {
      const keyS = JSON.stringify(key);
      return keyS >= JSON.stringify(range.lower) && keyS <= JSON.stringify(range.upper);
    }
    return key >= range.lower && key <= range.upper;
  }
  return true;
}

class FakeIndex {
  constructor(store, keyPath, tx) {
    this._store = store;
    this._keyPath = keyPath;
    this._tx = tx;
  }
  getAll(range) {
    return makeRequest(() => {
      const all = Array.from(this._store._rows.values());
      return all.filter((row) => rangeMatches(range, readByKeyPath(row, this._keyPath)));
    }, this._tx);
  }
}

class FakeObjectStore {
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
    this.indexNames = new FakeNameList();
    this._indexes = new Map();
    this._rows = new Map();
  }
  createIndex(name, keyPath, _opts = {}) {
    this.indexNames.add(name);
    this._indexes.set(name, keyPath);
  }
  _forTx(tx) {
    const self = this;
    return {
      get(key) {
        return makeRequest(() => self._rows.get(key) || null, tx);
      },
      put(value) {
        return makeRequest(() => {
          const key = readByKeyPath(value, self.keyPath);
          self._rows.set(key, value);
          return key;
        }, tx);
      },
      add(value) {
        return makeRequest(() => {
          const key = readByKeyPath(value, self.keyPath);
          if (self._rows.has(key)) throw new Error("ConstraintError");
          self._rows.set(key, value);
          return key;
        }, tx);
      },
      delete(key) {
        return makeRequest(() => self._rows.delete(key), tx);
      },
      clear() {
        return makeRequest(() => self._rows.clear(), tx);
      },
      getAll() {
        return makeRequest(() => Array.from(self._rows.values()), tx);
      },
      getAllKeys() {
        return makeRequest(() => Array.from(self._rows.keys()), tx);
      },
      index(name) {
        if (!self._indexes.has(name)) throw new Error(`Index ${name} not found`);
        return new FakeIndex(self, self._indexes.get(name), tx);
      },
      get indexNames() {
        return self.indexNames;
      },
    };
  }
}

class FakeTransaction {
  constructor(db, storeNames) {
    this._db = db;
    this._storeNames = storeNames;
    this._pending = 0;
    this._settleQueued = false;
    this._aborted = false;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
  }
  objectStore(name) {
    const store = this._db._stores.get(name);
    if (!store) throw new Error(`Store ${name} not found`);
    return store._forTx(this);
  }
  abort() {
    this._aborted = true;
    if (typeof this.onabort === "function") this.onabort({ target: this });
  }
  _maybeComplete() {
    if (this._aborted || this._pending > 0 || this._settleQueued) return;
    this._settleQueued = true;
    queueMicrotask(() => {
      this._settleQueued = false;
      if (this._aborted || this._pending > 0) return;
      if (typeof this.oncomplete === "function") this.oncomplete({ target: this });
    });
  }
}

class FakeDB {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = new FakeNameList();
    this._stores = new Map();
  }
  createObjectStore(name, { keyPath }) {
    const store = new FakeObjectStore(name, keyPath);
    this.objectStoreNames.add(name);
    this._stores.set(name, store);
    return store;
  }
  transaction(storeNames, _mode) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = new FakeTransaction(this, names);
    tx._maybeComplete();
    return tx;
  }
}

function setupFakeIndexedDB() {
  global.IDBKeyRange = {
    only(value) {
      return { __type: "only", value };
    },
    bound(lower, upper) {
      return { __type: "bound", lower, upper };
    },
  };
}

async function run() {
  setupFakeIndexedDB();

  const root = process.cwd();
  const importEsm = (p) => import(pathToFileURL(path.join(root, p)).href);

  const constants = await importEsm("src/app/constants.js");
  const { applySchema } = await importEsm("src/storage/schema.js");
  const { initAppState, setCurrentDay } = await importEsm("src/app/state.js");
  const { upsertDay } = await importEsm("src/storage/repositories/daysRepo.js");
  const { upsertTask, getTask } = await importEsm("src/storage/repositories/tasksRepo.js");
  const { listEventsByDay } = await importEsm("src/storage/repositories/eventsRepo.js");
  const { listTaskTimerSessionsByDay, getOpenTaskTimerSessionByTask } = await importEsm("src/storage/repositories/taskTimerSessionsRepo.js");
  const { startTask, toggleTaskCompletion, deleteTask } = await importEsm("src/domain/tasks.js");
  const { pauseTaskTimer, resumeTaskTimer, getTaskTimerState } = await importEsm("src/domain/taskTimers.js");

  const db = new FakeDB(constants.DB_NAME, constants.DB_VERSION);
  const upgradeTx = { objectStore: (name) => db._stores.get(name) };
  applySchema(db, 0, constants.DB_VERSION, upgradeTx);

  const day = "2026-02-23";
  const mkTask = (id, name, sort = 0) => ({
    id,
    day,
    name,
    points: 10,
    priority: "medium",
    completed: false,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    sort,
    category: "estudo",
  });

  const state = initAppState({ db, features: { taskTimerEnabled: true } });
  setCurrentDay(state, day);
  await upsertDay(db, { day, totalPoints: 0, createdAt: new Date().toISOString() });

  await upsertTask(db, mkTask("t1", "Task 1", 0));
  await upsertTask(db, mkTask("t2", "Task 2", 1));
  await upsertTask(db, mkTask("t3", "Task 3", 2));

  await startTask(state, "t1");
  let timer = await getTaskTimerState(state, "t1", day);
  assert(timer.status === "active", "t1 deve iniciar com timer ativo");

  await pauseTaskTimer(state, "t1", day, { origin: "qa_test" });
  timer = await getTaskTimerState(state, "t1", day);
  assert(timer.status === "paused", "t1 deve ficar pausado");

  await resumeTaskTimer(state, "t1", day, { origin: "qa_test" });
  timer = await getTaskTimerState(state, "t1", day);
  assert(timer.status === "active", "t1 deve retomar para ativo");

  await startTask(state, "t2");
  const t1open = await getOpenTaskTimerSessionByTask(db, day, "t1");
  const t2open = await getOpenTaskTimerSessionByTask(db, day, "t2");
  assert(!!t1open && !!t2open, "deve permitir timers paralelos em t1/t2");

  await toggleTaskCompletion(state, "t1");
  const t1afterComplete = await getOpenTaskTimerSessionByTask(db, day, "t1");
  assert(!t1afterComplete, "timer da t1 deve fechar ao concluir task");

  await deleteTask(state, "t2");
  const t2afterDelete = await getOpenTaskTimerSessionByTask(db, day, "t2");
  assert(!t2afterDelete, "timer da t2 deve fechar ao excluir task");

  await startTask(state, "t3");
  const reloaded = initAppState({ db, features: { taskTimerEnabled: true } });
  setCurrentDay(reloaded, day);
  const t3AfterReload = await getTaskTimerState(reloaded, "t3", day);
  assert(t3AfterReload.status === "active", "estado ativo deve sobreviver a reload");

  await pauseTaskTimer(state, "t3", day, { origin: "qa_test" });
  const reloadedPaused = initAppState({ db, features: { taskTimerEnabled: true } });
  setCurrentDay(reloadedPaused, day);
  const t3PausedAfterReload = await getTaskTimerState(reloadedPaused, "t3", day);
  assert(t3PausedAfterReload.status === "paused", "estado pausado deve sobreviver a reload");

  const events = await listEventsByDay(db, day);
  const eventTypes = new Set(events.map((ev) => ev.type));
  assert(eventTypes.has("task.timer.started"), "deve registrar evento task.timer.started");
  assert(eventTypes.has("task.timer.paused"), "deve registrar evento task.timer.paused");
  assert(eventTypes.has("task.timer.resumed"), "deve registrar evento task.timer.resumed");
  assert(eventTypes.has("task.timer.stopped"), "deve registrar evento task.timer.stopped");

  const stoppedWithReason = events.filter((ev) => ev.type === "task.timer.stopped");
  assert(
    stoppedWithReason.every((ev) => ["completed", "deleted", "manual"].includes(String(ev?.meta?.outcome?.reason || ""))),
    "task.timer.stopped deve ter reason valido"
  );

  const sessions = await listTaskTimerSessionsByDay(db, day);
  assert(sessions.length >= 3, "deve persistir sessoes de timer no store");
  const allHaveDurations = sessions.every((s) =>
    Number.isFinite(Number(s.activeDurationMs)) &&
    Number.isFinite(Number(s.pausedDurationMs)) &&
    Number.isFinite(Number(s.totalDurationMs))
  );
  assert(allHaveDurations, "sessoes devem conter duracoes numericas");

  const t1Task = await getTask(db, "t1");
  assert(!!t1Task?.completedAt, "t1 deve estar concluida");

  console.log("ST-011 behavior tests: PASS");
}

run().catch((err) => {
  console.error("ST-011 behavior tests: FAIL");
  console.error(err?.message || err);
  process.exit(1);
});
