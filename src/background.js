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

function shrinkCapture(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxEdge = 1400;
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function captureTab(windowId) {
  const options = { format: "jpeg", quality: 55 };
  try {
    return await browser.tabs.captureVisibleTab(windowId, options);
  } catch (error) {
    return browser.tabs.captureVisibleTab(options);
  }
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "capture") {
    if (!sender.tab) return Promise.resolve({ ok: false, error: "no tab" });
    return captureTab(sender.tab.windowId)
      .then(shrinkCapture)
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
