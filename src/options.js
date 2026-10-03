const MODIFIERS = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
  "NumLock",
  "ScrollLock"
]);

const hotkeyButton = document.getElementById("hotkey");
const holdInput = document.getElementById("hold");
const resetButton = document.getElementById("reset");
const status = document.getElementById("status");

let hotkey = ARCANE_DEFAULTS.hotkey;
let listening = false;
let statusTimer = 0;

function showHotkey() {
  hotkeyButton.textContent = listening ? "Нажмите клавишу…" : hotkey;
}

function showStatus(text) {
  status.textContent = text;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

function persist(partial) {
  return browser.storage.local.set(partial).then(() => {
    showStatus("Сохранено");
  }).catch(() => {
    showStatus("Не удалось сохранить");
  });
}

function apply(raw) {
  const next = arcaneNormalizeSettings(raw);
  hotkey = next.hotkey;
  holdInput.value = String(next.holdMs);
  showHotkey();
}

hotkeyButton.addEventListener("focus", () => {
  listening = true;
  showHotkey();
});

hotkeyButton.addEventListener("blur", () => {
  listening = false;
  showHotkey();
});

window.addEventListener("keydown", (event) => {
  if (!listening || event.code === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  if (event.code === "Escape") {
    hotkeyButton.blur();
    return;
  }
  if (MODIFIERS.has(event.code)) return;
  hotkey = event.code;
  listening = false;
  showHotkey();
  hotkeyButton.blur();
  persist({ hotkey });
}, true);

function saveHold(commit) {
  const n = Number(holdInput.value);
  if (!commit && (!Number.isInteger(n) || n < ARCANE_DEFAULTS.holdMin || n > ARCANE_DEFAULTS.holdMax)) {
    return;
  }
  const holdMs = arcaneClampHold(holdInput.value);
  if (commit) holdInput.value = String(holdMs);
  persist({ holdMs });
}

holdInput.addEventListener("input", () => saveHold(false));
holdInput.addEventListener("change", () => saveHold(true));

resetButton.addEventListener("click", () => {
  const next = {
    hotkey: ARCANE_DEFAULTS.hotkey,
    holdMs: ARCANE_DEFAULTS.holdMs
  };
  apply(next);
  persist(next);
});

browser.storage.local.get(ARCANE_DEFAULTS).then(apply);
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.hotkey) hotkey = arcaneNormalizeSettings({ hotkey: changes.hotkey.newValue, holdMs: holdInput.value }).hotkey;
  if (changes.holdMs) holdInput.value = String(arcaneClampHold(changes.holdMs.newValue));
  if (!listening) showHotkey();
});
