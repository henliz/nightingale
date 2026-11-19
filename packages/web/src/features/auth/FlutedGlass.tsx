import { useEffect, useRef } from "react";

const RIB = 26;
const SHEAR = 3.6;
const MAG = 0.62;

/* the orange is one huge ellipse parked off the bottom-left: flat across the top-left, falling away to the right */
const WARM = { cx: -0.2, cy: 1.2, rx: 1.2, ry: 0.62 };
/* wide, short band: orange pooled in the bottom-left corner, gentler shear, so text sits on calm blue */
const BAND = { shear: 1.5, warm: { cx: -0.08, cy: 1.95, rx: 0.85, ry: 1.3 } };

function paintField(ctx: CanvasRenderingContext2D, w: number, h: number, warmShape = WARM) {
  const sky = ctx.createLinearGradient(w * 0.15, h * 0.75, w * 0.95, 0);
  sky.addColorStop(0, "#2459b8");
  sky.addColorStop(0.45, "#3469c2");
  sky.addColorStop(1, "#4c82cf");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const blob = (cx: number, cy: number, rx: number, ry: number, rot: number, stops: [number, string][]) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };

  // orange, deeper toward the corner, a hair of softness at the seam so the ribs cut clean teeth
  const cx = w * warmShape.cx;
  const cy = h * warmShape.cy;
  const rx = w * warmShape.rx;
  const ry = h * warmShape.ry;
  blob(cx, cy, rx, ry, 0, [
    [0, "#b4441a"],
    [0.6, "#c95222"],
    [0.82, "#db6c2e"],
    [0.96, "#e8883f"],
    [1, "rgb(232 136 63 / 0)"],
  ]);

  // deep navy pooled across the top-right and down the right edge
  blob(w * 1.05, -h * 0.05, w * 1.3, h * 0.62, 0, [
    [0, "#0f2760"],
    [0.5, "rgb(18 44 106 / 0.9)"],
    [1, "rgb(26 62 140 / 0)"],
  ]);
  blob(w * 1.12, h * 0.62, w * 0.6, h * 0.34, 0, [
    [0, "rgb(16 40 98 / 0.85)"],
    [1, "rgb(26 62 140 / 0)"],
  ]);

  // crimson pooled in the bottom-left corner
  blob(-w * 0.04, h * 1.02, w * 0.3, h * 0.24, 0, [
    [0, "#d8314b"],
    [0.55, "rgb(216 49 75 / 0.7)"],
    [1, "rgb(216 49 75 / 0)"],
  ]);
}

/* a lens edge catching light, brightest lower-left, gone at both ends */
function paintLight(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  const cx = w * 0.93;
  const cy = -h * 0.38 + w * 0.75;
  const arcs = [{ r: w * 0.75, strength: 1 }];
  const strokes: [number, number, number][] = [
    // width (fraction of w), alpha, blur (css px)
    [0.1, 0.07, 30],
    [0.04, 0.12, 14],
    [0.012, 0.32, 4],
  ];

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const { r, strength } of arcs) {
    let paint: string | CanvasGradient = "rgb(235 241 255)";
    if (typeof ctx.createConicGradient === "function") {
      const g = ctx.createConicGradient(Math.PI / 3, cx, cy);
      g.addColorStop(0, "rgb(235 241 255 / 0)");
      g.addColorStop(0.06, "rgb(235 241 255 / 0)");
      g.addColorStop(0.2, "rgb(235 241 255 / 1)");
      g.addColorStop(0.36, "rgb(235 241 255 / 1)");
      g.addColorStop(0.56, "rgb(235 241 255 / 0)");
      g.addColorStop(1, "rgb(235 241 255 / 0)");
      paint = g;
    }
    for (const [width, alpha, blur] of strokes) {
      ctx.filter = `blur(${blur * dpr}px)`;
      ctx.globalAlpha = alpha * strength;
      ctx.lineWidth = w * width;
      ctx.strokeStyle = paint;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** reeded glass: each rib magnifies and shears the colour field behind it */
export function FlutedGlass({ className, light = true, band = false }: { className?: string; light?: boolean; band?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;

      const rib = RIB * dpr;
      const shear = band ? BAND.shear : SHEAR;
      const margin = Math.ceil(rib * shear);
      const field = document.createElement("canvas");
      field.width = w;
      field.height = h + margin * 2;
      const fctx = field.getContext("2d");
      const ctx = canvas.getContext("2d");
      if (!fctx || !ctx) return;
      fctx.translate(0, margin);
      paintField(fctx, w, h, band ? BAND.warm : WARM);
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.drawImage(field, 0, margin, w, 1, 0, 0, w, margin);
      fctx.drawImage(field, 0, margin + h - 1, w, 1, 0, margin + h, w, margin);

      for (let x = 0; x < w; x++) {
        const start = x - (x % rib);
        const t = (x % rib) / rib;
        const sx = Math.min(w - 1, Math.floor(start + rib * ((1 - MAG) / 2 + MAG * t)));
        const dy = (0.5 - Math.pow(t, 0.7)) * rib * shear;
        ctx.drawImage(field, sx, margin + dy, 1, h, x, 0, 1, h);
      }

      if (light) paintLight(ctx, w, h, dpr);

      for (let start = 0; start < w; start += rib) {
        const g = ctx.createLinearGradient(start, 0, start + rib, 0);
        g.addColorStop(0, "rgb(255 255 255 / 0.07)");
        g.addColorStop(0.35, "rgb(255 255 255 / 0)");
        g.addColorStop(0.8, "rgb(10 20 60 / 0.02)");
        g.addColorStop(1, "rgb(10 20 60 / 0.08)");
        ctx.fillStyle = g;
        ctx.fillRect(start, 0, rib, h);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [light, band]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
