(function () {
  const T_HOLE = 1.079;
  const T_FALL = 3.073;
  const HOLE_DIST = 0.28;
  const COLS = 20;
  const ROWS = 12;
  const DEFAULT_END = 4.458;

  const VERT = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    uniform vec2 u_resolution;
    varying vec2 v_uv;
    void main() {
      vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
      v_uv = a_uv;
    }
  `;

  const FRAG = `
    precision mediump float;
    uniform sampler2D u_tex;
    varying vec2 v_uv;
    void main() {
      gl_FragColor = texture2D(u_tex, v_uv);
    }
  `;

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

  class PageShatter {
    constructor(canvas, image, themeCss) {
      this.canvas = canvas;
      this.shards = buildShards();
      this.buffer = new Float32Array(this.shards.length * 3 * 4);
      this.endTime = DEFAULT_END;
      this.color = parseColor(themeCss);
      this.gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: true,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false
      });
      if (!this.gl) throw new Error("webgl unavailable");
      this.width = 1;
      this.height = 1;
      this.program = this.createProgram();
      this.uploadTexture(image);
      this.attribPos = this.gl.getAttribLocation(this.program, "a_pos");
      this.attribUv = this.gl.getAttribLocation(this.program, "a_uv");
      this.uniformResolution = this.gl.getUniformLocation(this.program, "u_resolution");
      this.gl.useProgram(this.program);
      this.vertexBuffer = this.gl.createBuffer();
      this.resize();
    }

    createProgram() {
      const gl = this.gl;
      const program = gl.createProgram();
      gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link failed");
      }
      return program;
    }

    compile(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) || "shader failed";
        gl.deleteShader(shader);
        throw new Error(log);
      }
      return shader;
    }

    uploadTexture(image) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.texture = texture;
    }

    setTheme(themeCss) {
      this.color = parseColor(themeCss);
    }

    setEndTime(time) {
      if (Number.isFinite(time) && time > T_FALL) this.endTime = time;
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.width = width;
      this.height = height;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    renderAt(time) {
      this.resize();
      this.fill(time, null);
      this.draw();
    }

    renderRestore(progress) {
      this.resize();
      this.fill(this.endTime, clamp01(progress));
      this.draw();
    }

    fill(time, restore) {
      const data = this.buffer;
      const w = this.width;
      const h = this.height;
      const blend = restore === null ? 0 : smooth(restore);
      let offset = 0;

      for (let i = 0; i < this.shards.length; i += 1) {
        const shard = this.shards[i];
        const end = poseAt(shard, time, h);
        const dx = end.dx * (1 - blend);
        const dy = end.dy * (1 - blend);
        const rot = end.rot * (1 - blend);
        const gap = end.gap + (1 - end.gap) * blend;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);

        for (let v = 0; v < 3; v += 1) {
          const vert = shard.verts[v];
          const lx = (vert.x - shard.cx) * gap;
          const ly = (vert.y - shard.cy) * gap;
          data[offset] = (shard.cx + lx * cos - ly * sin) * w + dx;
          data[offset + 1] = (shard.cy + lx * sin + ly * cos) * h + dy;
          data[offset + 2] = vert.x;
          data[offset + 3] = 1 - vert.y;
          offset += 4;
        }
      }
    }

    draw() {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(this.color.r, this.color.g, this.color.b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.buffer, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.attribPos);
      gl.enableVertexAttribArray(this.attribUv);
      gl.vertexAttribPointer(this.attribPos, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(this.attribUv, 2, gl.FLOAT, false, 16, 8);
      gl.uniform2f(this.uniformResolution, this.width, this.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.drawArrays(gl.TRIANGLES, 0, this.shards.length * 3);
    }

    destroy() {
      const gl = this.gl;
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
  }

  globalThis.PageShatter = PageShatter;
})();
