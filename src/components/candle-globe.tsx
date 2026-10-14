"use client";

import { useEffect, useRef } from "react";

/**
 * CandleGlobe v2 — premium decorative "trading earth": a rotating globe of
 * candlesticks with meridian wireframes, a twinkling starfield, depth
 * shading and a soft amber glow. Pure canvas, zero deps, deterministic
 * seeded layout (no market data), pauses on hidden tab, respects
 * prefers-reduced-motion, DPR capped at 2.
 */

type GlobeCandle = {
  x: number;
  y: number;
  z: number;
  up: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Star = { x: number; y: number; r: number; phase: number; speed: number };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCandles(count: number): GlobeCandle[] {
  const out: GlobeCandle[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5)); // fibonacci sphere
  for (let i = 0; i < count; i++) {
    const rnd = mulberry32(i * 7919 + 13);
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const up = rnd() > 0.5;
    const open = rnd();
    const close = Math.min(0.98, Math.max(0.02, open + (up ? 1 : -1) * (0.07 + rnd() * 0.22)));
    const high = Math.min(1, Math.max(open, close) + rnd() * 0.1);
    const low = Math.max(0, Math.min(open, close) - rnd() * 0.1);
    out.push({ x, y, z, up, open, high, low, close });
  }
  return out;
}

function buildStars(seed: number, count: number): Star[] {
  const rnd = mulberry32(seed);
  const out: Star[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rnd(),
      y: rnd(),
      r: 0.5 + rnd() * 0.9,
      phase: rnd() * Math.PI * 2,
      speed: 0.5 + rnd() * 1.4,
    });
  }
  return out;
}

export default function CandleGlobe({
  className = "",
  opacity = 0.5,
  candleCount = 240,
  speed = 0.11, // yaw rad/sec
}: {
  className?: string;
  opacity?: number;
  candleCount?: number;
  speed?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const candles = buildCandles(candleCount);
    const stars = buildStars(4242, 56);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tilt = 0.4; // axial tilt
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    let raf = 0;
    let last = performance.now();
    let yaw = 0.6;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Rotate a unit-sphere point: yaw around Y, then static tilt around X.
    const XFZ = (px: number, py: number, pz: number) => {
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const rx = px * cosY + pz * sinY;
      const rz = -px * sinY + pz * cosY;
      const ry = py * cosT - rz * sinT;
      const rd = py * sinT + rz * cosT;
      return { rx, ry, rd };
    };

    const drawRings = (cx: number, cy: number, R: number, frontPass: boolean) => {
      const SEG = 26;
      // three meridians + equator
      for (let ring = 0; ring < 4; ring++) {
        const isEquator = ring === 3;
        const phase = (ring * Math.PI) / 3;
        for (let s = 0; s < SEG; s++) {
          const f0 = (s / SEG) * Math.PI * 2;
          const f1 = ((s + 1) / SEG) * Math.PI * 2;
          const mk = (f: number) => {
            // base circle: meridians live in planes through the Y axis;
            // equator is the y=0 circle (yaw-symmetric, phase adds variety)
            const bx = Math.cos(f);
            const by = isEquator ? 0 : Math.sin(f);
            const bz = isEquator ? Math.sin(f) : 0;
            const A = yaw + phase;
            const rx = bx * Math.cos(A) + bz * Math.sin(A);
            const rz = -bx * Math.sin(A) + bz * Math.cos(A);
            const ry = by * cosT - rz * sinT;
            const rd = by * sinT + rz * cosT;
            return { sx: cx + rx * R, sy: cy - ry * R, rd };
          };
          const p0 = mk(f0);
          const p1 = mk(f1);
          const depth = (p0.rd + p1.rd) / 2;
          if (frontPass && depth < 0.18) continue;
          if (!frontPass && depth >= 0.18) continue;
          const a = frontPass ? 0.05 + 0.14 * depth : 0.03 + 0.04 * (depth + 1);
          ctx.strokeStyle = `rgba(148,163,184,${Math.min(0.2, a)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(p0.sx, p0.sy);
          ctx.lineTo(p1.sx, p1.sy);
          ctx.stroke();
        }
      }
    };

    const draw = (tMs: number) => {
      const t = tMs / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42;

      // -- starfield (twinkle) --
      for (const s of stars) {
        const a = 0.14 + 0.3 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.fillStyle = `rgba(226,232,240,${a})`;
        ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
      }

      // -- ambient amber glow behind the globe --
      const grad = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.28);
      grad.addColorStop(0, "rgba(245,158,11,0.10)");
      grad.addColorStop(0.55, "rgba(245,158,11,0.035)");
      grad.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);

      // -- back wireframe pass (behind candles) --
      drawRings(cx, cy, R, false);

      // -- candles (painter's algorithm back → front) --
      const proj: { sx: number; sy: number; depth: number; c: GlobeCandle }[] = [];
      const scale = R * 0.095;
      for (const c of candles) {
        const { rx, ry, rd } = XFZ(c.x, c.y, c.z);
        proj.push({ sx: cx + rx * R, sy: cy - ry * R, depth: rd, c });
      }
      proj.sort((a, b) => a.depth - b.depth);

      for (const { sx, sy, depth, c } of proj) {
        const front = Math.max(0, depth); // 0..1 facing camera
        const alpha = 0.1 + 0.9 * front * front;
        const rgb = c.up ? "34,197,94" : "239,68,68";
        const kw = 1.9 + front * 2.8;

        // wick
        ctx.strokeStyle = `rgba(${rgb},${alpha * 0.9})`;
        ctx.lineWidth = Math.max(1, kw * 0.45);
        ctx.beginPath();
        ctx.moveTo(sx, sy - (c.high - 0.5) * scale);
        ctx.lineTo(sx, sy - (c.low - 0.5) * scale);
        ctx.stroke();

        // body (glow when front-facing)
        const topV = Math.max(c.open, c.close);
        const bodyH = Math.max(1.6, Math.abs(c.open - c.close) * scale);
        if (front > 0.5) {
          ctx.shadowColor = `rgba(${rgb},0.85)`;
          ctx.shadowBlur = 7 * front;
        }
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.fillRect(sx - kw / 2, sy - (topV - 0.5) * scale, kw, bodyH);
        ctx.shadowBlur = 0;
      }

      // -- front wireframe pass (over candles) --
      drawRings(cx, cy, R, true);

      // -- double rim --
      ctx.strokeStyle = "rgba(148,163,184,0.26)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(245,158,11,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.016, 0, Math.PI * 2);
      ctx.stroke();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      yaw += speed * dt;
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => cancelAnimationFrame(raf);

    if (reduced.matches) {
      draw(performance.now());
    } else {
      start();
    }
    const onVis = () => {
      if (document.hidden) {
        stop();
      } else if (reduced.matches) {
        draw(performance.now());
      } else {
        start();
      }
    };
    const onMotion = () => {
      if (reduced.matches) {
        stop();
        draw(performance.now());
      } else {
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    reduced.addEventListener("change", onMotion);
    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      reduced.removeEventListener("change", onMotion);
    };
  }, [candleCount, speed]);

  return (
    <div
      ref={hostRef}
      className={`pointer-events-none select-none ${className}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
