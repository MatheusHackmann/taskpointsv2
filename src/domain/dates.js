// src/domain/dates.js
// Helpers de datas (chave de dia, formatação, timezone)

export function getTzOffsetMin(date = new Date()) {
  // JS: getTimezoneOffset() retorna minutos "atrás" do UTC (Brasil -03 => 180).
  // Guardamos offset assinado (Brasil -03 => -180)
  return -date.getTimezoneOffset();
}

export function dayKeyFromDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDayTitle(dayKey) {
  return formatDayDM(dayKey);
}

export function formatDayDM(dayKey) {
  const key = String(dayKey || "");
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return key || "--/--";
  return `${match[3]}/${match[2]}`;
}

export function formatDayDMY(dayKey) {
  const key = String(dayKey || "");
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return key || "--/--/----";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatTimeHHMM(isoTs, locale = "pt-BR") {
  const d = new Date(isoTs);
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTimeDMYHM(isoTs, locale = "pt-BR") {
  if (!isoTs) return "--";
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isoNow() {
  return new Date().toISOString();
}
