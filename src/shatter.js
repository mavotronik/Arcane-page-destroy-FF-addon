(function () {
  const T_HOLE = 1.079;
  const T_CRACK = 2.42;
  const T_PHASE3 = 3.073;
  const T_FALL = T_PHASE3 + 0.12;
  const DEFAULT_END = 4.458;
  const LINE_START = 0.34;
  const RAYS = 28;
  const RINGS = 4;

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
      const hex = normalized.slice(1);
      const n = parseInt(hex.length === 3 ? hex.replace(/./g, (ch) => ch + ch) : hex, 16);
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

  function wrapGap(from, to) {
    let delta = to - from;
    while (delta <= 0) delta += Math.PI * 2;
    while (delta > Math.PI * 2) delta -= Math.PI * 2;
    return delta;
  }

  function buildMesh(width, height) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const short = Math.min(width, height);
    const halfDiag = Math.hypot(width, height) * 0.5;
    const maxR = halfDiag * 1.16;
    const angles = [];
    const weights = [];
    let angle = hash(2, 5) * Math.PI * 2;
    for (let i = 0; i < RAYS; i += 1) weights.push(0.42 + Math.pow(hash(i, 3), 1.35) * 1.7);
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < RAYS; i += 1) {
      angles.push(angle);
      angle += (weights[i] / weightSum) * Math.PI * 2;
    }

    const ringDist = [0, 0.22, 0.42, 0.64, 1.16];
    const vertices = [];
    for (let i = 0; i < RAYS; i += 1) {
      const prev = angles[(i + RAYS - 1) % RAYS];
      const next = angles[(i + 1) % RAYS];
      const gap = Math.min(wrapGap(prev, angles[i]), wrapGap(angles[i], next));
      const bend = (hash(i, 6) - 0.5) * gap * 0.22;
      const notch = hash(i, 11) > 0.74;
      const holeR = short * (notch ? 0.04 + hash(i, 12) * 0.028 : 0.102 + hash(i, 13) * 0.042);
      const rings = [];
      let prevR = 0;
      for (let r = 0; r <= RINGS; r += 1) {
        const along = r / RINGS;
        let radius = r === 0 ? holeR : ringDist[r] * halfDiag * (0.9 + hash(i + 1, r + 20) * 0.2);
        if (r === RINGS) radius = maxR;
        if (r > 0) radius = Math.max(prevR + short * (r === 1 ? 0.055 : 0.028), Math.min(maxR, radius));
        const rayAngle = angles[i] + bend * along * along;
        const px = cx + Math.cos(rayAngle) * radius;
        const py = cy + Math.sin(rayAngle) * radius;
        rings.push({
          x: px / width,
          y: py / height,
          dist: radius / halfDiag,
          px,
          py,
          angle: rayAngle
        });
        prevR = radius;
      }
      vertices.push(rings);
    }

    const shards = [];
    for (let i = 0; i < RAYS; i += 1) {
      const next = (i + 1) % RAYS;
      for (let r = 0; r < RINGS; r += 1) {
        pushShard(shards, [
          vertices[i][r],
          vertices[next][r],
          vertices[next][r + 1],
          vertices[i][r + 1]
        ], width, height, r);
      }
    }

    const cracks = [];
    for (let i = 0; i < RAYS; i += 1) {
      const ray = vertices[i];
      const rayPoints = [];
      for (let r = 0; r < ray.length; r += 1) {
        if (r > 0) {
          const prev = ray[r - 1];
          const next = ray[r];
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          const offset = (hash(i, r + 70) - 0.5) * 0.012;
          rayPoints.push({
            x: (prev.x + next.x) / 2 - (dy / len) * offset,
            y: (prev.y + next.y) / 2 + (dx / len) * offset,
            dist: (prev.dist + next.dist) / 2
          });
        }
        rayPoints.push({ x: ray[r].x, y: ray[r].y, dist: ray[r].dist });
      }
      cracks.push({ width: hash(i, 19) > 0.75 ? 0.7 : 1, points: rayPoints });
      if (hash(i, 50) > 0.62) {
        const origin = vertices[i][hash(i, 51) > 0.5 ? 1 : 2];
        const sign = hash(i, 52) > 0.5 ? 1 : -1;
        const length = short * (0.06 + hash(i, 53) * 0.09);
        const branch = origin.angle + sign * (0.28 + hash(i, 54) * 0.5);
        const endX = origin.px + Math.cos(branch) * length;
        const endY = origin.py + Math.sin(branch) * length;
        cracks.push({
          width: 0.62,
          points: [
            { x: origin.x, y: origin.y, dist: origin.dist },
            { x: endX / width, y: endY / height, dist: origin.dist + length / halfDiag }
          ]
        });
      }
    }
    for (let r = 1; r < RINGS; r += 1) {
      for (let i = 0; i < RAYS; i += 1) {
        if (hash(i, r + 40) > 0.22) continue;
        const a = vertices[i][r];
        const b = vertices[(i + 1) % RAYS][r];
        const dist = Math.min(a.dist, b.dist);
        cracks.push({
          width: 0.55,
          points: [
            { x: a.x, y: a.y, dist },
            { x: b.x, y: b.y, dist }
          ]
        });
      }
    }

    return {
      shards,
      cracks,
      hole: vertices.map((rings) => ({ x: rings[0].x, y: rings[0].y }))
    };
  }

  function pushShard(shards, verts, width, height, ring) {
    const cx = (verts[0].x + verts[1].x + verts[2].x + verts[3].x) / 4;
    const cy = (verts[0].y + verts[1].y + verts[2].y + verts[3].y) / 4;
    const index = shards.length;
    shards.push({
      cx,
      cy,
      ring,
      angle: Math.atan2(cy * height - height * 0.5, cx * width - width * 0.5),
      dist: Math.min(verts[0].dist, verts[1].dist),
      spin: hash(index + 1, 9) < 0.5 ? -1 : 1,
      drift: hash(index + 4, 2),
      lag: hash(index + 7, 1),
      verts: verts.map((vert) => ({ x: vert.x, y: vert.y }))
    });
  }

  function lineFront(time) {
    if (time < T_HOLE) return 0;
    const progress = clamp01((time - T_HOLE) / (T_CRACK - T_HOLE));
    const eased = 1 - Math.pow(1 - progress, 1.75);
    return LINE_START + (1 - LINE_START) * eased;
  }

  function poseAt(shard, time, height) {
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let crackGap = time >= T_HOLE && time <= T_FALL && shard.ring === 0 ? 1.7 : 0;
    if (time > T_FALL) {
      const dt = time - T_FALL - shard.lag * 0.025;
      if (dt > 0) {
        const kick = 0.42 + shard.drift * 0.12;
        const gravity = 9.2 + shard.drift * 0.8;
        const drop = height * (kick * dt + 0.5 * gravity * dt * dt);
        dy = Math.min(drop, height * (1.55 - shard.cy));
        const slip = 1 - Math.exp(-dt * 9);
        dx = Math.cos(shard.angle) * height * (0.008 + shard.drift * 0.01) * slip;
        rot = shard.spin * (1.15 + shard.drift * 0.7) * dt;
        crackGap = 2.2;
      }
    }
    return { dx, dy, rot, crackGap };
  }

  function clipPolyline(points, maxDist) {
    const clipped = [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (point.dist <= maxDist + 0.0001) {
        clipped.push(point);
        continue;
      }
      if (i > 0 && points[i - 1].dist < maxDist) {
        const previous = points[i - 1];
        const span = point.dist - previous.dist || 1;
        const t = (maxDist - previous.dist) / span;
        clipped.push({
          x: previous.x + (point.x - previous.x) * t,
          y: previous.y + (point.y - previous.y) * t,
          dist: maxDist
        });
      }
      break;
    }
    return clipped;
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

  function strokeCrack(ctx, points, width, height, scale, widthScale) {
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      const taper = clamp01((from.dist + to.dist) * 0.5);
      const x0 = from.x * width * scale;
      const y0 = from.y * height * scale;
      const x1 = to.x * width * scale;
      const y1 = to.y * height * scale;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0 + 0.35 * scale, y0 + 0.55 * scale);
      ctx.lineTo(x1 + 0.35 * scale, y1 + 0.55 * scale);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = (1.7 - taper * 1.15) * widthScale * scale;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 - 0.3 * scale, y0 - 0.35 * scale);
      ctx.lineTo(x1 - 0.3 * scale, y1 - 0.35 * scale);
      ctx.strokeStyle = "rgba(255,255,255," + (0.9 - taper * 0.55) + ")";
      ctx.lineWidth = Math.max(0.6 * scale, (1.25 - taper * 0.85) * widthScale * scale);
      ctx.stroke();
    }
  }

  class PageShatter {
    constructor(canvas, image, themeCss) {
      this.canvas = canvas;
      this.image = image;
      this.ctx = canvas.getContext("2d", { alpha: false });
      if (!this.ctx) throw new Error("2d unavailable");
      this.shards = [];
      this.cracks = [];
      this.hole = [];
      this.endTime = DEFAULT_END;
      this.color = parseColor(themeCss);
      this.width = 1;
      this.height = 1;
      this.meshW = 0;
      this.meshH = 0;
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
      if (this.meshW !== width || this.meshH !== height) {
        const mesh = buildMesh(width, height);
        this.shards = mesh.shards;
        this.cracks = mesh.cracks;
        this.hole = mesh.hole;
        this.meshW = width;
        this.meshH = height;
      }
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
      const front = lineFront(time);
      const showCracks = restore === null && time <= T_FALL;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = this.color.css;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.imageSmoothingEnabled = true;

      if (showCracks && this.hole.length > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(this.hole[0].x * w * scale, this.hole[0].y * h * scale);
        for (let i = 1; i < this.hole.length; i += 1) ctx.lineTo(this.hole[i].x * w * scale, this.hole[i].y * h * scale);
        ctx.closePath();
        ctx.clip();
        const shade = ctx.createRadialGradient(
          w * 0.5 * scale,
          h * 0.5 * scale,
          Math.min(w, h) * 0.02 * scale,
          w * 0.5 * scale,
          h * 0.5 * scale,
          Math.min(w, h) * 0.17 * scale
        );
        shade.addColorStop(0, "rgba(0,0,0,0.18)");
        shade.addColorStop(1, "rgba(0,0,0,0.5)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.restore();
      }

      const order = this.shards.slice();
      if (time > T_FALL) order.sort((a, b) => poseAt(a, time, h).dy - poseAt(b, time, h).dy);

      for (let i = 0; i < order.length; i += 1) {
        const shard = order[i];
        const posed = poseAt(shard, time, h);
        const dx = posed.dx * (1 - blend);
        const dy = posed.dy * (1 - blend);
        const rot = posed.rot * (1 - blend);
        const crackGap = posed.crackGap * (1 - blend);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const points = shard.verts.map((vert) => {
          const lx = vert.x - shard.cx;
          const ly = vert.y - shard.cy;
          return {
            x: ((shard.cx + lx * cos - ly * sin) * w + dx) * scale,
            y: ((shard.cy + lx * sin + ly * cos) * h + dy) * scale,
            sx: vert.x * image.width,
            sy: vert.y * image.height
          };
        });
        const midX = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
        const midY = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
        const inset = crackGap > 0.2 ? -crackGap * scale : 1.35 * scale;
        for (let p = 0; p < points.length; p += 1) {
          const vx = points[p].x - midX;
          const vy = points[p].y - midY;
          const len = Math.hypot(vx, vy) || 1;
          points[p].x += (vx / len) * inset;
          points[p].y += (vy / len) * inset;
        }
        drawTriangle(ctx, image, points[0], points[1], points[2]);
        drawTriangle(ctx, image, points[0], points[2], points[3]);
        const screenY = shard.cy * h + dy;
        if (dy > 3 && screenY > -80 && screenY < h + 30) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          ctx.lineTo(points[1].x, points[1].y);
          ctx.lineTo(points[2].x, points[2].y);
          ctx.lineTo(points[3].x, points[3].y);
          ctx.closePath();
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = Math.max(1, scale);
          ctx.stroke();
        }
      }

      if (showCracks) {
        for (let i = 0; i < this.cracks.length; i += 1) {
          const crack = this.cracks[i];
          const points = clipPolyline(crack.points, front);
          if (points.length > 1) strokeCrack(ctx, points, w, h, scale, crack.width);
        }
        if (this.hole.length > 2) {
          ctx.beginPath();
          ctx.moveTo(this.hole[0].x * w * scale, this.hole[0].y * h * scale);
          for (let i = 1; i < this.hole.length; i += 1) ctx.lineTo(this.hole[i].x * w * scale, this.hole[i].y * h * scale);
          ctx.closePath();
          ctx.strokeStyle = "rgba(255,255,255,0.32)";
          ctx.lineWidth = 3.6 * scale;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = 1.45 * scale;
          ctx.stroke();
        }
      }
    }

    destroy() {
      this.image = null;
    }
  }

  globalThis.PageShatter = PageShatter;
})();
