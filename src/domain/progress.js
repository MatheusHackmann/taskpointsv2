// src/domain/progress.js
// Cálculo de progresso do dia e gatilhos (ex: 100% concluído).

export function computeProgress(tasks) {
  const total = Array.isArray(tasks) ? tasks.length : 0;
  const completed = Array.isArray(tasks) ? tasks.filter(t => !!t.completed).length : 0;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    percent,
  };
}

/**
 * Determina se houve "primeira vez" que bateu 100% (para disparar celebração).
 * Você passa o percent atual e o lastPercent guardado no state.ui.
 */
export function shouldTriggerFullCompletion(percent, lastPercent) {
  return percent === 100 && (lastPercent ?? 0) < 100;
}

/**
 * Texto extra para UX (mesma lógica do seu projeto antigo).
 */
export function progressHintText(percent) {
  if (percent >= 90 && percent < 100) return `${percent}% 🔥 Falta muito pouco...`;
  return `${percent}% concluído`;
}
