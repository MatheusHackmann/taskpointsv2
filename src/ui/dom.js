// src/ui/dom.js
// Helpers de DOM + escape

export function $(idOrSelector) {
  const raw = String(idOrSelector || "").trim();
  const id = raw.startsWith("#") ? raw.slice(1) : raw;

  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento não encontrado: #${id}`);
  return el;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function clear(el) {
  el.innerHTML = "";
}
