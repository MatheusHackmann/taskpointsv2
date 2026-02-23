// src/ui/modals.js
// Abrir/fechar modais + helpers

import { $ } from "./dom.js";

function syncBodyScrollLock() {
  const hasOpenModal = Array.from(document.querySelectorAll(".modal"))
    .some((modal) => modal.style.display === "flex");
  document.body.classList.toggle("modal-open", hasOpenModal);
  document.documentElement.classList.toggle("modal-open", hasOpenModal);
}

export function openModal(modalId) {
  const m = $(modalId);
  m.style.display = "flex";
  syncBodyScrollLock();
}

export function closeModal(modalId) {
  const m = $(modalId);
  m.style.display = "none";
  syncBodyScrollLock();
}

export function closeAllModals() {
  document.querySelectorAll(".modal").forEach((m) => (m.style.display = "none"));
  syncBodyScrollLock();
}
