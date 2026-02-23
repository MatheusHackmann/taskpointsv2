const TASK_TIMER_STORAGE_KEY = "tp_flag_task_timer_enabled";

function parseFlagValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function isLocalDevHost() {
  const protocol = String(globalThis?.location?.protocol || "").toLowerCase();
  if (protocol === "file:") return true;

  const host = String(globalThis?.location?.hostname || "").toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    return true;
  }
  if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
    return true;
  }
  return false;
}

function resolveTaskTimerFlag() {
  const stored = parseFlagValue(globalThis?.localStorage?.getItem(TASK_TIMER_STORAGE_KEY));
  if (stored !== null) return stored;

  const injected = globalThis?.__TASKPOINTS_FLAGS__?.task_timer_enabled;
  const parsedInjected = parseFlagValue(injected);
  if (parsedInjected !== null) return parsedInjected;

  // Rollout seguro: habilitado por padrao em dev/local e desabilitado em producao.
  return isLocalDevHost();
}

export function getFeatureFlags() {
  return {
    taskTimerEnabled: resolveTaskTimerFlag(),
  };
}

export function isTaskTimerEnabled(state) {
  return !!state?.features?.taskTimerEnabled;
}
