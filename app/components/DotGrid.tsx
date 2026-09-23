"use client";

import { useEffect, useRef } from "react";

const TAU = Math.PI * 2;

/**
 * Interactive point grid, as on sanovio.de: a fixed field of dots that swells
 * under the cursor and settles back once it leaves.
 *
 * Canvas rather than DOM nodes — a viewport of dots at this spacing is several
 * thousand elements, and animating them individually drops frames.
 */
export function DotGrid({
  spacing = 17,
  radius = 150,
  baseSize = 0.9,
  peakSize = 1.9,
}: { spacing?: number; radius?: number; baseSize?: number; peakSize?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

    // Pointer position, plus an eased copy so the swell trails the cursor
    // instead of snapping to it.
    let px = -9999, py = -9999;
    let ex = -9999, ey = -9999;
    let width = 0, height = 0, dpr = 1;
    let frame = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (e: PointerEvent) => { px = e.clientX; py = e.clientY; };
    const onLeave = () => { px = -9999; py = -9999; };

    const draw = () => {
      ex += (px - ex) * 0.12;
      ey += (py - ey) * 0.12;

      ctx.clearRect(0, 0, width, height);
      const dark = isDark();
      const rest = dark ? "rgba(150,152,182,0.26)" : "rgba(86,89,151,0.24)";
      const r2 = radius * radius;

      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      // Pass 1 — every dot outside the cursor's reach, at rest size and colour,
      // batched into one path. That is nearly the whole grid every frame, so a
      // single fill() rather than one per dot is what keeps this cheap.
      ctx.fillStyle = rest;
      ctx.beginPath();
      for (let i = 0; i < cols; i++) {
        const x = i * spacing;
        const dx = x - ex;
        const nearColumn = dx * dx < r2;
        for (let j = 0; j < rows; j++) {
          const y = j * spacing;
          if (nearColumn) {
            const dy = y - ey;
            if (dx * dx + dy * dy < r2) continue;   // pass 2 owns this dot
          }
          ctx.moveTo(x + baseSize, y);
          ctx.arc(x, y, baseSize, 0, TAU);
        }
      }
      ctx.fill();

      // Pass 2 — only the dots the cursor actually touches. Bounded by the
      // influence box, so its cost does not grow with viewport or density.
      const i0 = Math.max(0, Math.floor((ex - radius) / spacing));
      const i1 = Math.min(cols - 1, Math.ceil((ex + radius) / spacing));
      const j0 = Math.max(0, Math.floor((ey - radius) / spacing));
      const j1 = Math.min(rows - 1, Math.ceil((ey + radius) / spacing));

      for (let i = i0; i <= i1; i++) {
        const x = i * spacing;
        const dx = x - ex;
        for (let j = j0; j <= j1; j++) {
          const y = j * spacing;
          const dy = y - ey;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;

          const d = Math.sqrt(d2) / radius;          // 0 at cursor, 1 at edge
          const t = (1 - d) * (1 - d);               // ease-out falloff

          // Brand periwinkle warms in toward the cursor. The alpha ramp starts
          // at the rest value, so the edge of the pool has no visible seam.
          const a = 0.24 + 0.3 * t;
          ctx.fillStyle = dark ? `rgba(142,144,252,${a})` : `rgba(86,89,251,${a})`;
          ctx.beginPath();
          ctx.arc(x, y, baseSize + (peakSize - baseSize) * t, 0, TAU);
          ctx.fill();
        }
      }

      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!reduceMotion) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
      frame = requestAnimationFrame(draw);
    } else {
      // Static grid, no cursor interaction: pass 2 finds nothing in range.
      ex = -9999; ey = -9999;
      draw();
      cancelAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [spacing, radius, baseSize, peakSize]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
