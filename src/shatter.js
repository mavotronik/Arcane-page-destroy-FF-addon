(function () {
  const T_HOLE = 1.079;
  const T_FALL = 3.073;
  const HOLE_DIST = 0.28;
  const COLS = 20;
  const ROWS = 12;
  const DEFAULT_END = 4.458;

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  function smooth(value) {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  }

  function hash(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

function parseColor(input) {
  const fallback = { r: 0.11, g: 0.106, b: 0.133, css: "#1c1b22" };
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return fallback;
  probe.fillStyle = "#000000";
  probe.fillStyle = input || "#000000";
  const normalized = probe.fillStyle;
  if (typeof normalized === "string" && normalized.startsWith("#")) {
    const n = parseInt(normalized.slice(1), 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
      css: normalized
    };
  }
  const match = String(input).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!match) return fallback;
  return {
    r: Number(match[1]) / 255,
    g: Number(match[2]) / 255,
    b: Number(match[3]) / 255,
    css: String(input)
  };
}

  function buildShards() {
    const points = [];
    for (let y = 0; y <= ROWS; y += 1) {
      for (let x = 0; x <= COLS; x += 1) {
        let px = x / COLS;
        let py = y / ROWS;
        if (x > 0 && x < COLS && y > 0 && y < ROWS) {
          px += (hash(x, y) - 0.5) * (0.55 / COLS);
          py += (hash(y, x + 3) - 0.5) * (0.55 / ROWS);
        }
        points.push({ x: px, y: py });
      }
    }

    const at = (x, y) => points[y * (COLS + 1) + x];
    const shards = [];
    const maxDist = Math.hypot(0.5, 0.5);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const a = at(x, y);
        const b = at(x + 1, y);
        const c = at(x, y + 1);
        const d = at(x + 1, y + 1);
        pushShard(shards, [a, b, c], maxDist, shards.length);
        pushShard(shards, [b, d, c], maxDist, shards.length);
      }
    }
    return shards;
  }

  function pushShard(shards, verts, maxDist, index) {
    const cx = (verts[0].x + verts[1].x + verts[2].x) / 3;
    const cy = (verts[0].y + verts[1].y + verts[2].y) / 3;
    const dist = Math.hypot(cx - 0.5, cy - 0.5) / maxDist;
    const angle = Math.atan2(cy - 0.5, cx - 0.5);
    const spin = hash(index + 1, 9) < 0.5 ? -1 : 1;
    shards.push({
      cx,
      cy,
      dist,
      angle,
      spin,
      drift: hash(index + 4, 2) * 90,
      verts
    });
  }

  function spreadPixels(shard, time) {
    if (time < T_HOLE) return 0;
    if (shard.dist < HOLE_DIST) {
      const p = clamp01((time - T_HOLE) / 0.16);
      const burst = 0.7 + 0.3 * smooth(p);
      return burst * (200 + 260 * (1 - shard.dist / HOLE_DIST));
    }
    const release = T_HOLE + (T_FALL - T_HOLE) * shard.dist;
    if (time <= release) return 0;
    const remain = Math.max(0.001, T_FALL - release);
    const p = clamp01((Math.min(time, T_FALL) - release) / remain);
    return smooth(p) * (36 + 110 * shard.dist);
  }

  function poseAt(shard, time, height) {
    const capped = Math.min(time, T_FALL);
    const spread = spreadPixels(shard, capped);
    let dx = Math.cos(shard.angle) * spread;
    let dy = Math.sin(shard.angle) * spread;
    let rot = shard.spin * spread * 0.003;
    const gap = spread > 0 ? 0.88 : 1;

    if (time > T_FALL) {
      const dt = time - T_FALL;
      const endSpread = spreadPixels(shard, T_FALL);
      dx = Math.cos(shard.angle) * endSpread + Math.cos(shard.angle) * (70 + shard.drift) * dt;
      dy = Math.sin(shard.angle) * endSpread + 0.5 * (height * 2.4) * dt * dt;
      rot = shard.spin * endSpread * 0.003 + shard.spin * 2.4 * dt;
    }

    return { dx, dy, rot, gap };
  }

  function drawTriangle(ctx, image, p0, p1, p2) {
    const denom = p0.sx * (p1.sy - p2.sy) + p1.sx * (p2.sy - p0.sy) + p2.sx * (p0.sy - p1.sy);
    if (Math.abs(denom) < 0.001) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.clip();
    const a = (p0.x * (p1.sy - p2.sy) + p1.x * (p2.sy - p0.sy) + p2.x * (p0.sy - p1.sy)) / denom;
    const b = (p0.y * (p1.sy - p2.sy) + p1.y * (p2.sy - p0.sy) + p2.y * (p0.sy - p1.sy)) / denom;
    const c = (p0.x * (p2.sx - p1.sx) + p1.x * (p0.sx - p2.sx) + p2.x * (p1.sx - p0.sx)) / denom;
    const d = (p0.y * (p2.sx - p1.sx) + p1.y * (p0.sx - p2.sx) + p2.y * (p1.sx - p0.sx)) / denom;
    const e = (p0.x * (p1.sx * p2.sy - p2.sx * p1.sy) + p1.x * (p2.sx * p0.sy - p0.sx * p2.sy) + p2.x * (p0.sx * p1.sy - p1.sx * p0.sy)) / denom;
    const f = (p0.y * (p1.sx * p2.sy - p2.sx * p1.sy) + p1.y * (p2.sx * p0.sy - p0.sx * p2.sy) + p2.y * (p0.sx * p1.sy - p1.sx * p0.sy)) / denom;
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  class PageShatter {
    constructor(canvas, image, themeCss) {
      this.canvas = canvas;
      this.image = image;
      this.ctx = canvas.getContext("2d", { alpha: false });
      if (!this.ctx) throw new Error("2d unavailable");
      this.shards = buildShards();
      this.endTime = DEFAULT_END;
      this.color = parseColor(themeCss);
      this.width = 1;
      this.height = 1;
      this.resize();
    }

    setTheme(themeCss) {
      this.color = parseColor(themeCss);
    }

    setEndTime(time) {
      if (Number.isFinite(time) && time > T_FALL) this.endTime = time;
    }

    resize() {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (Math.max(width, height) * dpr > 1920) dpr = 1920 / Math.max(width, height);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.width = width;
      this.height = height;
      this.scale = pixelWidth / width;
    }

    renderAt(time) {
      this.resize();
      this.paint(time, null);
    }

    renderRestore(progress) {
      this.resize();
      this.paint(this.endTime, clamp01(progress));
    }

    paint(time, restore) {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const scale = this.scale;
      const image = this.image;
      const blend = restore === null ? 0 : smooth(restore);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.color.css;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      for (let i = 0; i < this.shards.length; i += 1) {
        const shard = this.shards[i];
        const end = poseAt(shard, time, h);
        const dx = end.dx * (1 - blend);
        const dy = end.dy * (1 - blend);
        const rot = end.rot * (1 - blend);
        const gap = end.gap + (1 - end.gap) * blend;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const points = shard.verts.map((vert) => {
          const lx = (vert.x - shard.cx) * gap;
          const ly = (vert.y - shard.cy) * gap;
          return {
            x: ((shard.cx + lx * cos - ly * sin) * w + dx) * scale,
            y: ((shard.cy + lx * sin + ly * cos) * h + dy) * scale,
            sx: vert.x * image.width,
            sy: vert.y * image.height
          };
        });
        const midX = (points[0].x + points[1].x + points[2].x) / 3;
        const midY = (points[0].y + points[1].y + points[2].y) / 3;
        for (let p = 0; p < points.length; p += 1) {
          const vx = points[p].x - midX;
          const vy = points[p].y - midY;
          const len = Math.hypot(vx, vy) || 1;
          points[p].x += (vx / len) * 1.4;
          points[p].y += (vy / len) * 1.4;
        }
        drawTriangle(ctx, image, points[0], points[1], points[2]);
      }
    }

    destroy() {
      this.image = null;
    }
  }

  globalThis.PageShatter = PageShatter;
})();
