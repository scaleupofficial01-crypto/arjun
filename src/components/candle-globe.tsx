"use client";

import { useEffect, useRef } from "react";

/**
 * CandleGlobe — decorative 3D "earth" made of candlesticks on a sphere,
 * rendered on a plain 2D canvas (zero deps). Deterministic seeded pattern
 * (no live/fake market data — pure decoration), pauses when the tab is
 * hidden and respects prefers-reduced-motion; DPR is capped at 2.
 */

type GlobeCandle = {
  // position on the unit sphere (pre-rotation)
  x: number;
  y: number;
  z: number;
  // normalised 0..1 OHLC shape, fixed per candle
  up: boolean;
  open: number;
  high: number;
  low: number;
  close: number;
};

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
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.399963 fibonacci angle
  for (let i = 0; i < count; i++) {
    const rnd = mulberry32(i * 7919 + 13);
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const up = rnd() > 0.5;
    const open = rnd();
    const close = Math.min(0.98, Math.max(0.02, open + (up ? 1 : -1) * (0.06 + rnd() * 0.2)));
    const high = Math.min(1, Math.max(open, close) + rnd() * 0.12);
    const low = Math.max(0, Math.min(open, close) - rnd() * 0.12);
    out.push({ x, y, z, up, open, high, low, close });
  }
  return out;
}

export default function CandleGlobe({
  className = "",
  opacity = 0.55,
  candleCount = 150,
  speed = 0.12, // yaw in rad/sec
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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tilt = 0.42; // earth-like axial tilt
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    let raf = 0;
    let last = performance.now();
    let yaw = 0.55;
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

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42;

      // faint amber ambient glow + sphere rim
      const grad = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.15);
      grad.addColorStop(0, "rgba(245,158,11,0.06)");
      grad.addColorStop(0.8, "rgba(245,158,11,0.015)");
      grad.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const scale = R * 0.09; // on-screen candle height
      const proj: { sx: number; sy: number; depth: number; c: GlobeCandle }[] = [];
      for (const c of candles) {
        // yaw around Y axis, then a fixed tilt around X (view depth = rz2)
        const rx = c.x * cosY - c.z * sinY;
        const rz = c.x * sinY + c.z * cosY;
        const ry = c.y * cosT - rz * sinT;
        const depth = c.y * sinT + rz * cosT;
        proj.push({ sx: cx + rx * R, sy: cy - ry * R, depth, c });
      }
      proj.sort((a, b) => a.depth - b.depth); // painter: back → front

      for (const { sx, sy, depth, c } of proj) {
        const front = Math.max(0, depth); // -1..1 → 0..1 facing camera
        const alpha = 0.08 + 0.85 * front * front;
        const rgb = c.up ? "34,197,94" : "239,68,68";
        const kw = 1.6 + front * 2.2;

        // wick (high–low)
        ctx.strokeStyle = `rgba(${rgb},${alpha * 0.85})`;
        ctx.lineWidth = Math.max(1, kw * 0.5);
        ctx.beginPath();
        ctx.moveTo(sx, sy - (c.high - 0.5) * scale);
        ctx.lineTo(sx, sy - (c.low - 0.5) * scale);
        ctx.stroke();

        // body (open–close)
        const topV = Math.max(c.open, c.close);
        const bodyH = Math.max(1.5, Math.abs(c.open - c.close) * scale);
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.fillRect(sx - kw / 2, sy - (topV - 0.5) * scale, kw, bodyH);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      yaw += speed * dt;
      draw();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => cancelAnimationFrame(raf);

    if (reduced.matches) {
      draw();
    } else {
      start();
    }
    const onVis = () => {
      if (document.hidden) {
        stop();
      } else if (reduced.matches) {
        draw();
      } else {
        start();
      }
    };
    const onMotion = () => {
      if (reduced.matches) {
        stop();
        draw();
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
