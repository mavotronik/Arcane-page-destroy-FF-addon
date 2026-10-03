(function () {
  if (window.top !== window) return;

  const T_HOLE = 1.079;
  const T_FALL = 3.073;
  const RESTORE_MS = 800;
  const VIDEO_URL = browser.runtime.getURL("arcane_ultimate_2_arcane-only.mp4");
  const STAGE_CSS = `
    .stage {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: var(--theme, #1c1b22);
    }
    video, canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    video {
      object-fit: cover;
      background: #000;
    }
    canvas {
      opacity: 0;
      pointer-events: none;
    }
    .stage[data-mode="glass"] canvas,
    .stage[data-mode="restoring"] canvas { opacity: 1; }
    .stage[data-mode="glass"] video,
    .stage[data-mode="theme"] video,
    .stage[data-mode="restoring"] video {
      opacity: 0;
      pointer-events: none;
    }
  `;

  let hotkey = ARCANE_DEFAULTS.hotkey;
  let holdMs = ARCANE_DEFAULTS.holdMs;
  let pendingSettings = null;
  let state = "idle";
  let generation = 0;
  let holdTimer = 0;
  let raf = 0;
  let host = null;
  let stage = null;
  let video = null;
  let canvas = null;
  let shatter = null;
  let themeColor = fallbackTheme();
  let shot;

  function fallbackTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "#1c1b22" : "#f9f9fb";
  }

  function applySettings(raw) {
    const next = arcaneNormalizeSettings(raw);
    hotkey = next.hotkey;
    holdMs = next.holdMs;
  }

  function storePending(raw) {
    const next = arcaneNormalizeSettings(raw);
    if (state === "idle") applySettings(next);
    else pendingSettings = next;
  }

  browser.storage.local.get(ARCANE_DEFAULTS).then((stored) => {
    if (state === "idle") applySettings(stored);
    else pendingSettings = arcaneNormalizeSettings(stored);
  }).catch(() => {});

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const base = pendingSettings || { hotkey, holdMs };
    storePending({
      hotkey: Object.prototype.hasOwnProperty.call(changes, "hotkey") ? changes.hotkey.newValue : base.hotkey,
      holdMs: Object.prototype.hasOwnProperty.call(changes, "holdMs") ? changes.holdMs.newValue : base.holdMs
    });
  });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(fitTexture(image, 4096));
      image.onerror = () => reject(new Error("image failed"));
      image.src = src;
    });
  }

  function fitTexture(image, maxSize) {
    if (image.width <= maxSize && image.height <= maxSize) return image;
    const scale = maxSize / Math.max(image.width, image.height);
    const copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(image.width * scale));
    copy.height = Math.max(1, Math.round(image.height * scale));
    copy.getContext("2d").drawImage(image, 0, 0, copy.width, copy.height);
    return copy;
  }

  function videoDuration() {
    const duration = video ? video.duration : NaN;
    return Number.isFinite(duration) && duration > T_FALL ? duration : 4.458;
  }

  function setHostVisible(visible) {
    if (!host) return;
    host.style.setProperty("visibility", visible ? "visible" : "hidden", "important");
    host.style.setProperty("opacity", visible ? "1" : "0", "important");
    host.style.setProperty("pointer-events", visible ? "auto" : "none", "important");
  }

  function stopRaf() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function teardown() {
    const dyingHost = host;
    const dyingVideo = video;
    const dyingShatter = shatter;
    generation += 1;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    stopRaf();
    host = null;
    stage = null;
    video = null;
    canvas = null;
    shatter = null;
    shot = undefined;
    state = "idle";
    if (dyingVideo) {
      dyingVideo.pause();
      dyingVideo.removeAttribute("src");
      dyingVideo.load();
    }
    if (dyingShatter) dyingShatter.destroy();
    if (dyingHost) {
      try { dyingHost.hidePopover(); } catch (error) { /* popover is optional */ }
      dyingHost.remove();
    }
    if (pendingSettings) {
      applySettings(pendingSettings);
      pendingSettings = null;
    }
  }

  function paintHost() {
    const style = host.style;
    style.setProperty("position", "fixed", "important");
    style.setProperty("inset", "0", "important");
    style.setProperty("width", "100%", "important");
    style.setProperty("height", "100%", "important");
    style.setProperty("margin", "0", "important");
    style.setProperty("padding", "0", "important");
    style.setProperty("border", "0", "important");
    style.setProperty("background", "transparent", "important");
    style.setProperty("z-index", "2147483646", "important");
    style.setProperty("max-width", "none", "important");
    style.setProperty("max-height", "none", "important");
  }

  function buildOverlay() {
    host = document.createElement("arcane-shatter");
    host.setAttribute("popover", "manual");
    paintHost();
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STAGE_CSS;
    stage = document.createElement("div");
    stage.className = "stage";
    stage.dataset.mode = "cover";
    stage.style.setProperty("--theme", themeColor);
    video = document.createElement("video");
    video.src = VIDEO_URL;
    video.playsInline = true;
    video.preload = "auto";
    video.volume = 0;
    video.addEventListener("ended", onVideoEnded);
    video.addEventListener("error", onVideoError);
    canvas = document.createElement("canvas");
    stage.append(video, canvas);
    shadow.append(style, stage);
    document.documentElement.append(host);
    try { host.showPopover(); } catch (error) { /* fixed layer still covers the page */ }
    setHostVisible(false);
  }

  function beginArm() {
    const gen = ++generation;
    state = "arming";
    themeColor = fallbackTheme();
    shot = undefined;
    shatter = null;
    buildOverlay();

    browser.runtime.sendMessage({ type: "capture" })
      .then((res) => {
        if (!res || !res.ok || typeof res.dataUrl !== "string") throw new Error("capture failed");
        return loadImage(res.dataUrl);
      })
      .then((image) => {
        if (gen !== generation) return;
        shot = image;
      })
      .catch(() => {
        if (gen !== generation) return;
        shot = null;
      });

    browser.runtime.sendMessage({ type: "themeColor" })
      .then((res) => {
        if (gen !== generation || !res || !res.color) return;
        themeColor = res.color;
        if (stage) stage.style.setProperty("--theme", themeColor);
        if (shatter) shatter.setTheme(themeColor);
      })
      .catch(() => {});

    const started = video.play();
    if (started) started.catch(() => {});
    holdTimer = window.setTimeout(() => {
      if (gen === generation && state === "arming") commit(gen);
    }, holdMs);
  }

  function commit(gen) {
    if (gen !== generation || state !== "arming" || !video) return;
    state = "covering";
    let revealed = false;
    let aligned = false;
    const reveal = () => {
      if (revealed || gen !== generation || !video || !host) return;
      if (state !== "covering" && state !== "shattering" && state !== "falling") return;
      revealed = true;
      video.volume = 1;
      setHostVisible(true);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const alignAndReveal = () => {
      if (aligned || gen !== generation || !video) return;
      aligned = true;
      if (video.currentTime < 0.02) {
        reveal();
        return;
      }
      video.addEventListener("seeked", reveal, { once: true });
      try {
        video.currentTime = 0;
      } catch (error) {
        reveal();
      }
    };
    if (video.readyState >= 1) alignAndReveal();
    else video.addEventListener("loadedmetadata", alignAndReveal, { once: true });
    window.setTimeout(alignAndReveal, 400);
    window.setTimeout(reveal, 1000);
    const playing = video.play();
    if (playing) playing.catch(() => {});
  }

  function maybeStartGlass(time) {
    if (shatter || shot === undefined || shot === null) return;
    const image = shot;
    try {
      shatter = new PageShatter(canvas, image, themeColor);
      shatter.setEndTime(videoDuration());
      stage.dataset.mode = "glass";
      state = time >= T_FALL ? "falling" : "shattering";
      shatter.renderAt(Math.max(time, T_HOLE));
    } catch (error) {
      shatter = null;
      shot = null;
    }
  }

  function onVideoError(event) {
    if (event.target !== video) return;
    if (state === "idle" || state === "restoring") return;
    if (!shatter) {
      teardown();
      return;
    }
    if (stage) stage.dataset.mode = "theme";
    state = "fallen";
    stopRaf();
  }

  function tick() {
    raf = 0;
    if (!video || (state !== "covering" && state !== "shattering" && state !== "falling")) return;
    const time = video.currentTime || 0;
    if (state === "covering" && time >= T_HOLE) maybeStartGlass(time);
    if (shatter && (state === "shattering" || state === "falling")) {
      shatter.renderAt(time);
      if (state === "shattering" && time >= T_FALL) state = "falling";
    }
    if (state === "covering" || state === "shattering" || state === "falling") {
      raf = requestAnimationFrame(tick);
    }
  }

  function onVideoEnded(event) {
    if (event.target !== video) return;
    if (state === "idle" || state === "arming" || state === "restoring") return;
    if (shatter) {
      shatter.setEndTime(videoDuration());
      shatter.renderAt(videoDuration());
    } else if (stage) {
      stage.dataset.mode = "theme";
    }
    state = "fallen";
    stopRaf();
  }

  function startRestore() {
    if (state !== "fallen") return;
    state = "restoring";
    if (video) video.pause();
    if (!shatter) {
      teardown();
      return;
    }
    stage.dataset.mode = "restoring";
    const started = performance.now();
    const step = (now) => {
      if (state !== "restoring" || !shatter) return;
      const progress = Math.min(1, (now - started) / RESTORE_MS);
      shatter.renderRestore(progress);
      if (progress < 1) requestAnimationFrame(step);
      else teardown();
    };
    requestAnimationFrame(step);
  }

  function onKeyDown(event) {
    if (event.code !== hotkey || event.repeat) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (state === "fallen") {
      startRestore();
      return;
    }
    if (state !== "idle") return;
    beginArm();
  }

  function onKeyUp(event) {
    if (event.code !== hotkey || state !== "arming") return;
    event.preventDefault();
    event.stopPropagation();
    teardown();
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pagehide", () => {
    if (state !== "idle") teardown();
  }, true);
})();
