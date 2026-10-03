const FALLBACK_DARK = "#1c1b22";
const FALLBACK_LIGHT = "#f9f9fb";

function colorToCss(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b, a] = value;
    if (a === undefined || a === null) return `rgb(${r}, ${g}, ${b})`;
    const alpha = a > 1 ? a / 255 : a;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return null;
}

function fallbackTheme() {
  try {
    if (globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches) return FALLBACK_DARK;
  } catch (error) {
    /* matchMedia is absent in some background contexts */
  }
  return FALLBACK_LIGHT;
}

async function resolveThemeColor() {
  try {
    const theme = await browser.theme.getCurrent();
    const colors = theme && theme.colors;
    if (colors) {
      const css = colorToCss(colors.ntp_background)
        || colorToCss(colors.frame)
        || colorToCss(colors.toolbar);
      if (css) return css;
    }
  } catch (error) {
    /* default theme often has no color table */
  }
  return fallbackTheme();
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "capture") {
    if (!sender.tab) return Promise.resolve({ ok: false, error: "no tab" });
    return browser.tabs.captureVisibleTab(sender.tab.windowId, { format: "jpeg", quality: 80 })
      .then((dataUrl) => ({ ok: true, dataUrl }))
      .catch((error) => ({ ok: false, error: String(error) }));
  }

  if (message.type === "themeColor") {
    return resolveThemeColor()
      .then((color) => ({ ok: true, color }))
      .catch(() => ({ ok: true, color: fallbackTheme() }));
  }

  return undefined;
});
