const TONE_META = {
  info: { icon: "i", label: "Informacao" },
  success: { icon: "ok", label: "Sucesso" },
  warning: { icon: "!", label: "Atencao" },
  danger: { icon: "x", label: "Erro" },
};

let activeDialog = null;
let toastAudioCtx = null;

export function showSystemAlert(options = {}) {
  return showSystemDialog({
    mode: "alert",
    tone: options.tone || "info",
    title: options.title || "Aviso",
    message: options.message || "",
    confirmLabel: options.confirmLabel || "Entendi",
  }).then(() => undefined);
}

export function showSystemConfirm(options = {}) {
  return showSystemDialog({
    mode: "confirm",
    tone: options.tone || "warning",
    title: options.title || "Confirmar acao",
    message: options.message || "",
    confirmLabel: options.confirmLabel || "Confirmar",
    cancelLabel: options.cancelLabel || "Cancelar",
  });
}

export function showActionToast(options = {}) {
  const root = ensureToastRoot();
  const tone = normalizeTone(options.tone);
  const meta = TONE_META[tone];
  const toast = document.createElement("article");
  toast.className = `system-toast tone-${tone}`;
  toast.innerHTML = `
    <div class="system-toast-icon" aria-hidden="true">${meta.icon}</div>
    <div class="system-toast-body">
      <strong>${escapeHtml(options.title || meta.label)}</strong>
      <p>${escapeHtml(options.message || "")}</p>
    </div>
    <button type="button" class="system-toast-close" aria-label="Fechar notificacao">x</button>
  `;
  root.appendChild(toast);

  const durationMs = Number(options.durationMs) > 0 ? Number(options.durationMs) : 4200;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 180);
  };

  const closeBtn = toast.querySelector(".system-toast-close");
  closeBtn?.addEventListener("click", close);
  setTimeout(close, durationMs);

  if (options.sound !== false) {
    playToastSound(tone);
  }
}

function showSystemDialog(options) {
  if (activeDialog) {
    activeDialog.teardown();
    activeDialog.resolve(options.mode === "confirm" ? false : true);
    activeDialog = null;
  }

  return new Promise((resolve) => {
    const tone = normalizeTone(options.tone);
    const meta = TONE_META[tone];
    const overlay = ensureDialogOverlay();

    overlay.innerHTML = `
      <div class="system-dialog tone-${tone}" role="dialog" aria-modal="true" aria-labelledby="systemDialogTitle">
        <div class="system-dialog-head">
          <div class="system-dialog-icon" aria-hidden="true">${meta.icon}</div>
          <div class="system-dialog-title-wrap">
            <h3 id="systemDialogTitle">${escapeHtml(options.title || meta.label)}</h3>
            <span>${escapeHtml(meta.label)}</span>
          </div>
        </div>
        <p class="system-dialog-message">${escapeHtml(options.message || "")}</p>
        <div class="system-dialog-actions">
          ${
            options.mode === "confirm"
              ? `<button type="button" class="system-btn system-btn-subtle" data-system-dialog-action="cancel">${escapeHtml(options.cancelLabel || "Cancelar")}</button>`
              : ""
          }
          <button type="button" class="system-btn system-btn-main" data-system-dialog-action="confirm">${escapeHtml(options.confirmLabel || "OK")}</button>
        </div>
      </div>
    `;

    overlay.style.display = "grid";
    document.body.classList.add("modal-open");

    const onClose = (accepted) => {
      overlay.style.display = "none";
      overlay.innerHTML = "";
      document.body.classList.remove("modal-open");
      resolve(accepted);
      if (activeDialog?.overlay === overlay) activeDialog = null;
    };

    const onClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.getAttribute("data-system-dialog-action");
      if (action === "confirm") onClose(true);
      if (action === "cancel") onClose(false);
      if (target === overlay && options.mode === "confirm") onClose(false);
      if (target === overlay && options.mode === "alert") onClose(true);
    };

    const onKeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose(options.mode === "confirm" ? false : true);
    };

    overlay.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);

    const teardown = () => {
      overlay.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      overlay.style.display = "none";
      overlay.innerHTML = "";
      document.body.classList.remove("modal-open");
    };

    activeDialog = { overlay, resolve, teardown };
  });
}

function ensureDialogOverlay() {
  let overlay = document.getElementById("systemDialogOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "systemDialogOverlay";
    overlay.className = "system-dialog-overlay";
    overlay.style.display = "none";
    document.body.appendChild(overlay);
  }
  return overlay;
}

function ensureToastRoot() {
  let root = document.getElementById("systemToastRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "systemToastRoot";
    root.className = "system-toast-root";
    document.body.appendChild(root);
  }
  return root;
}

function normalizeTone(tone) {
  return TONE_META[tone] ? tone : "info";
}

function playToastSound(tone) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!toastAudioCtx) {
      toastAudioCtx = new AudioCtx();
    }

    if (toastAudioCtx.state === "suspended") {
      toastAudioCtx.resume().catch(() => null);
    }

    const configByTone = {
      info: [680, 860],
      success: [720, 980],
      warning: [560, 500],
      danger: [420, 310],
    };
    const freqs = configByTone[tone] || configByTone.info;
    const now = toastAudioCtx.currentTime;

    freqs.forEach((freq, index) => {
      const osc = toastAudioCtx.createOscillator();
      const gain = toastAudioCtx.createGain();

      osc.type = tone === "danger" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);

      const start = now + index * 0.085;
      const end = start + 0.1;
      gain.gain.exponentialRampToValueAtTime(0.04, start + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(toastAudioCtx.destination);
      osc.start(start);
      osc.stop(end);
    });
  } catch {
    // Fallback silencioso se audio for bloqueado.
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
