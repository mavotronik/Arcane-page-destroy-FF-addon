(function () {
  if (window.top !== window) return;

  const T_HOLE = 1.079;
  const T_FALL = 3.25;
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
      z-index: 1;
      background: transparent;
      transform: translateZ(0);
    }
    canvas {
      z-index: 2;
      opacity: 0;
      pointer-events: none;
      transform: translateZ(0);
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
  let captureFinished = false;
  let showWhenCaptured = null;
  let audio = null;
  let effectOrigin = 0;

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

  function dataUrlToBlob(dataUrl) {
    const comma = dataUrl.indexOf(",");
    const header = dataUrl.slice(0, comma);
    const mime = (/data:([^;,]+)/.exec(header) || [])[1] || "image/jpeg";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function fitTexture(source, maxSize) {
    const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
    const copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(source.width * scale));
    copy.height = Math.max(1, Math.round(source.height * scale));
    const ctx = copy.getContext("2d");
    ctx.drawImage(source, 0, 0, copy.width, copy.height);
    if (source.close) source.close();
    return copy;
  }

  function loadImage(src) {
    return createImageBitmap(dataUrlToBlob(src)).then((bitmap) => fitTexture(bitmap, 1600));
  }

  function videoDuration() {
    const duration = (audio && audio.duration) || (video && video.duration);
    return Number.isFinite(duration) && duration > T_FALL ? duration : 4.458;
  }

  function effectTime() {
    if (!effectOrigin) return 0;
    return Math.max(0, (performance.now() - effectOrigin) / 1000);
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
    const dyingAudio = audio;
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
    captureFinished = false;
    showWhenCaptured = null;
    audio = null;
    effectOrigin = 0;
    state = "idle";
    if (dyingAudio) {
      dyingAudio.pause();
      dyingAudio.removeAttribute("src");
      dyingAudio.load();
    }
    if (dyingVideo) {
      dyingVideo.pause();
      dyingVideo.removeAttribute("src");
      dyingVideo.load();
      dyingVideo.remove();
    }
    if (dyingShatter) dyingShatter.destroy();
    if (dyingHost) dyingHost.remove();
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
    style.setProperty("display", "block", "important");
  }

  function createVideo() {
    const element = document.createElement("video");
    element.src = VIDEO_URL;
    element.muted = true;
    element.playsInline = true;
    element.preload = "auto";
    element.addEventListener("error", onVideoError);
    return element;
  }

  function presentVideo() {
    if (!video) return;
    const style = video.style;
    style.setProperty("display", "block", "important");
    style.setProperty("position", "absolute", "important");
    style.setProperty("inset", "0", "important");
    style.setProperty("width", "100%", "important");
    style.setProperty("height", "100%", "important");
    style.setProperty("opacity", "1", "important");
    style.setProperty("object-fit", "cover", "important");
    style.setProperty("transform", "translateZ(0)", "important");
    style.setProperty("background", "transparent", "important");
    style.setProperty("z-index", "1", "important");
    style.setProperty("pointer-events", "none", "important");
  }

  function concealVideo() {
    if (!video) return;
    video.pause();
    video.style.setProperty("opacity", "0", "important");
    video.style.setProperty("display", "none", "important");
  }

  function showCanvas() {
    if (!canvas) return;
    const style = canvas.style;
    style.setProperty("display", "block", "important");
    style.setProperty("position", "absolute", "important");
    style.setProperty("inset", "0", "important");
    style.setProperty("width", "100%", "important");
    style.setProperty("height", "100%", "important");
    style.setProperty("opacity", "1", "important");
    style.setProperty("z-index", "2", "important");
    style.setProperty("transform", "translateZ(0)", "important");
  }

  function buildStage() {
    if (host) return;
    host = document.createElement("arcane-shatter");
    paintHost();
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STAGE_CSS;
    stage = document.createElement("div");
    stage.className = "stage";
    stage.dataset.mode = "cover";
    stage.style.setProperty("--theme", themeColor);
    video = createVideo();
    canvas = document.createElement("canvas");
    stage.append(video, canvas);
    shadow.append(style, stage);
    document.documentElement.append(host);
    setHostVisible(false);
  }

  function flushShow() {
    captureFinished = true;
    if (!showWhenCaptured) return;
    const show = showWhenCaptured;
    showWhenCaptured = null;
    show();
  }

  function beginArm() {
    const gen = ++generation;
    state = "arming";
    themeColor = fallbackTheme();
    shot = undefined;
    captureFinished = false;
    showWhenCaptured = null;
    shatter = null;

    browser.runtime.sendMessage({ type: "capture" })
      .then((res) => {
        if (gen !== generation) return null;
        if (!res || !res.ok || typeof res.dataUrl !== "string") throw new Error("capture failed");
        return loadImage(res.dataUrl);
      })
      .then((image) => {
        if (gen !== generation || image == null) return;
        shot = image;
      })
      .catch(() => {
        if (gen !== generation) return;
        shot = null;
      })
      .then(() => {
        if (gen !== generation) return;
        flushShow();
      });

    browser.runtime.sendMessage({ type: "themeColor" })
      .then((res) => {
        if (gen !== generation || !res || !res.color) return;
        themeColor = res.color;
        if (stage) stage.style.setProperty("--theme", themeColor);
        if (shatter) shatter.setTheme(themeColor);
      })
      .catch(() => {});

    audio = new Audio(VIDEO_URL);
    audio.preload = "auto";
    audio.volume = 0;
    audio.addEventListener("ended", onAudioEnded);
    const started = audio.play();
    if (started) started.catch(() => {});
    holdTimer = window.setTimeout(() => {
      if (gen === generation && state === "arming") commit(gen);
    }, holdMs);
  }

  function commit(gen) {
    if (gen !== generation || state !== "arming") return;
    state = "covering";
    const mount = () => revealCover(gen);
    if (captureFinished) mount();
    else showWhenCaptured = mount;
  }

  function revealCover(gen) {
    if (gen !== generation || state !== "covering") return;
    buildStage();
    presentVideo();
    let revealed = false;
    let aligned = false;
    const reveal = () => {
      if (revealed || gen !== generation || !host) return;
      if (state !== "covering" && state !== "shattering" && state !== "falling") return;
      revealed = true;
      effectOrigin = performance.now();
      if (audio) {
        try { audio.currentTime = 0; } catch (error) { /* metadata may still be loading */ }
        audio.volume = 1;
        const sound = audio.play();
        if (sound) sound.catch(() => {});
      }
      if (video) {
        try { video.currentTime = 0; } catch (error) { /* picture is optional */ }
        const picture = video.play();
        if (picture) picture.catch(() => {});
      }
      setHostVisible(true);
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const alignAndReveal = () => {
      if (aligned || gen !== generation) return;
      aligned = true;
      reveal();
    };
    if (audio && audio.readyState >= 1) alignAndReveal();
    else if (audio) audio.addEventListener("loadedmetadata", alignAndReveal, { once: true });
    else alignAndReveal();
    window.setTimeout(alignAndReveal, 400);
  }

  function maybeStartGlass(time) {
    if (shatter || shot === undefined || shot === null || !canvas) return;
    const image = shot;
    stage.dataset.mode = "glass";
    showCanvas();
    try {
      shatter = new PageShatter(canvas, image, themeColor);
      shatter.setEndTime(videoDuration());
      state = time >= T_FALL ? "falling" : "shattering";
      shatter.renderAt(Math.max(time, T_HOLE));
      concealVideo();
    } catch (error) {
      shatter = null;
      shot = null;
      if (stage) stage.dataset.mode = "theme";
    }
  }

  function onVideoError(event) {
    if (!video || event.target !== video) return;
  }

  function finishFallen() {
    if (state === "idle" || state === "arming" || state === "restoring" || state === "fallen") return;
    concealVideo();
    if (shatter) {
      shatter.setEndTime(videoDuration());
      shatter.renderAt(videoDuration());
    } else if (stage) {
      stage.dataset.mode = "theme";
    }
    state = "fallen";
    stopRaf();
  }

  function onAudioEnded() {
    if (effectTime() + 0.2 >= videoDuration()) finishFallen();
  }

  function tick() {
    raf = 0;
    if (state !== "covering" && state !== "shattering" && state !== "falling") return;
    const time = effectTime();
    if (time >= videoDuration()) {
      finishFallen();
      return;
    }
    if (state === "covering" && time >= T_HOLE) {
      if (shot) maybeStartGlass(time);
      else if (shot === null && stage) {
        concealVideo();
        stage.dataset.mode = "theme";
        state = "falling";
      }
    }
    if (shatter && (state === "shattering" || state === "falling")) {
      shatter.renderAt(time);
      if (state === "shattering" && time >= T_FALL) state = "falling";
    }
    if (state === "covering" || state === "shattering" || state === "falling") {
      raf = requestAnimationFrame(tick);
    }
  }

  function startRestore() {
    if (state !== "fallen") return;
    state = "restoring";
    if (audio) audio.pause();
    if (video) video.pause();
    if (!shatter) {
      teardown();
      return;
    }
    stage.dataset.mode = "restoring";
    showCanvas();
    concealVideo();
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
