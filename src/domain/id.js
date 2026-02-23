// src/domain/id.js
// IDs únicos estáveis

export function newId(prefix = "id") {
  const core = uuidLike();
  return `${prefix}_${core}`;
}

function uuidLike() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const t = Date.now().toString(16);
  const r1 = Math.random().toString(16).slice(2);
  const r2 = Math.random().toString(16).slice(2);
  return `${t}_${r1}_${r2}`;
}
