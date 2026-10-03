(function () {
  const defaults = {
    hotkey: "F8",
    holdMs: 600,
    holdMin: 100,
    holdMax: 3000
  };

  function clampHold(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return defaults.holdMs;
    return Math.min(defaults.holdMax, Math.max(defaults.holdMin, n));
  }

  function normalizeSettings(raw) {
    const source = raw || {};
    const hotkey = typeof source.hotkey === "string" && source.hotkey
      ? source.hotkey
      : defaults.hotkey;
    return { hotkey, holdMs: clampHold(source.holdMs) };
  }

  globalThis.ARCANE_DEFAULTS = defaults;
  globalThis.arcaneClampHold = clampHold;
  globalThis.arcaneNormalizeSettings = normalizeSettings;
})();
