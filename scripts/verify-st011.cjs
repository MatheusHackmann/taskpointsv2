const fs = require("fs");
const path = require("path");

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const featureFlags = read("src/app/featureFlags.js");
  const schema = read("src/storage/schema.js");
  const taskTimers = read("src/domain/taskTimers.js");
  const logs = read("src/domain/logs.js");

  assert(
    featureFlags.includes("return isLocalDevHost();"),
    "featureFlags: fallback deve ser local/dev (isLocalDevHost)."
  );

  assert(
    schema.includes("if (oldVersion < 8)") && schema.includes("ensureTaskTimerSessionStore"),
    "schema: recovery consolidado v8 ausente para taskTimerSessions."
  );

  const eventsToCheck = [
    "task_timer_started",
    "task_timer_paused",
    "task_timer_resumed",
    "task_timer_stopped",
  ];
  for (const eventName of eventsToCheck) {
    const blockMatch = taskTimers.match(new RegExp(`what:\\s*\"${eventName}\"[\\s\\S]{0,500}?outcome:\\s*\\{[\\s\\S]{0,250}?\\}`, "m"));
    assert(!!blockMatch, `taskTimers: payload do evento ${eventName} nao encontrado.`);
    assert(
      blockMatch[0].includes("totalDurationMs"),
      `taskTimers: ${eventName} precisa incluir outcome.totalDurationMs.`
    );
  }

  assert(
    logs.includes("duracoes numericas (active/paused/total)"),
    "logs: validacao de duracoes numericas (active/paused/total) ausente."
  );

  console.log("ST-011 app checks: PASS");
}

try {
  run();
} catch (err) {
  console.error("ST-011 app checks: FAIL");
  console.error(err.message || err);
  process.exit(1);
}
