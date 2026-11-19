import { useEffect, useRef, useState } from "react";
import responders from "../../assets/responders.png";
import styles from "./SignInStory.module.css";

/* ---------- moving fluted glass ---------- */
const RIB = 26;
const SHEAR = 3.6;
const MAG = 0.62;
/* the orange is one huge ellipse parked off the bottom-left: flat across the top-left, falling away to the right */
const WARM = { cx: -0.2, cy: 1.2, rx: 1.2, ry: 0.62 };
/* drawn at half resolution (the glass is soft, so it looks the same) and capped at 30fps, so it stays smooth */
const S = 0.5;
/* the light gets a wide margin so sliding it never drags its clipped edge into view */
const LP = 80;
/* glass plays this long, then dissolves into the pixel scene and the story card */
const STORY_AFTER_MS = 5000;

function paintField(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(w * 0.15, h * 0.75, w * 0.95, 0);
  sky.addColorStop(0, "#2459b8");
  sky.addColorStop(0.45, "#3469c2");
  sky.addColorStop(1, "#4c82cf");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const blob = (cx: number, cy: number, rx: number, ry: number, stops: [number, string][]) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };

  blob(w * WARM.cx, h * WARM.cy, w * WARM.rx, h * WARM.ry, [
    [0, "#b4441a"],
    [0.6, "#c95222"],
    [0.82, "#db6c2e"],
    [0.96, "#e8883f"],
    [1, "rgba(232,136,63,0)"],
  ]);
  // deep navy pooled across the top-right and down the right edge
  blob(w * 1.05, -h * 0.05, w * 1.3, h * 0.62, [
    [0, "#0f2760"],
    [0.5, "rgba(18,44,106,.9)"],
    [1, "rgba(26,62,140,0)"],
  ]);
  blob(w * 1.12, h * 0.62, w * 0.6, h * 0.34, [
    [0, "rgba(16,40,98,.85)"],
    [1, "rgba(26,62,140,0)"],
  ]);
  // crimson pooled in the bottom-left corner
  blob(-w * 0.04, h * 1.02, w * 0.3, h * 0.24, [
    [0, "#d8314b"],
    [0.55, "rgba(216,49,75,.7)"],
    [1, "rgba(216,49,75,0)"],
  ]);
}

/* a lens edge catching light, brightest lower-left, gone at both ends */
function paintLight(ctx: CanvasRenderingContext2D, w: number, h: number, scale: number) {
  const cx = w * 0.93;
  const cy = -h * 0.38 + w * 0.75;
  const r = w * 0.75;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  let paint: string | CanvasGradient = "rgb(235,241,255)";
  if (typeof ctx.createConicGradient === "function") {
    const g = ctx.createConicGradient(Math.PI / 3, cx, cy);
    const stops: [number, number][] = [
      [0, 0],
      [0.06, 0],
      [0.2, 1],
      [0.36, 1],
      [0.56, 0],
      [1, 0],
    ];
    for (const [o, a] of stops) g.addColorStop(o, `rgba(235,241,255,${a})`);
    paint = g;
  }
  const strokes: [number, number, number][] = [
    [0.1, 0.07, 30],
    [0.04, 0.12, 14],
    [0.012, 0.32, 4],
  ];
  for (const [width, alpha, blur] of strokes) {
    ctx.filter = `blur(${blur * scale}px)`;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w * width;
    ctx.strokeStyle = paint;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

interface Glass {
  W: number;
  H: number;
  rib: number;
  margin: number;
  pad: number;
  field: HTMLCanvasElement;
  light: HTMLCanvasElement;
  ribs: HTMLCanvasElement;
}

function prepareGlass(canvas: HTMLCanvasElement): Glass | null {
  const W = Math.round(canvas.clientWidth * S);
  const H = Math.round(canvas.clientHeight * S);
  if (!W || !H) return null;
  canvas.width = W;
  canvas.height = H;
  const rib = RIB * S;
  const margin = Math.ceil(rib * SHEAR);
  const pad = Math.ceil(rib * 3);

  // painted once, wider than the panel, then slid behind the ribs every frame
  const field = document.createElement("canvas");
  field.width = W + pad * 2;
  field.height = H + margin * 2;
  const f = field.getContext("2d");
  if (!f) return null;
  f.translate(pad, margin);
  paintField(f, W, H);
  f.setTransform(1, 0, 0, 1, 0, 0);
  // stretch the edge pixels out into the margins so drift and shear never show blank
  f.drawImage(field, pad, margin, 1, H, 0, margin, pad, H);
  f.drawImage(field, pad + W - 1, margin, 1, H, pad + W, margin, pad, H);
  f.drawImage(field, 0, margin, field.width, 1, 0, 0, field.width, margin);
  f.drawImage(field, 0, margin + H - 1, field.width, 1, 0, margin + H, field.width, margin);

  const light = document.createElement("canvas");
  light.width = W + LP * 2;
  light.height = H + LP * 2;
  const l = light.getContext("2d");
  if (!l) return null;
  l.translate(LP, LP);
  paintLight(l, W, H, S);

  const ribs = document.createElement("canvas");
  ribs.width = W;
  ribs.height = H;
  const r = ribs.getContext("2d");
  if (!r) return null;
  for (let x0 = 0; x0 < W; x0 += rib) {
    const g = r.createLinearGradient(x0, 0, x0 + rib, 0);
    g.addColorStop(0, "rgba(255,255,255,.07)");
    g.addColorStop(0.35, "rgba(255,255,255,0)");
    g.addColorStop(0.8, "rgba(10,20,60,.02)");
    g.addColorStop(1, "rgba(10,20,60,.08)");
    r.fillStyle = g;
    r.fillRect(x0, 0, rib, H);
  }
  return { W, H, rib, margin, pad, field, light, ribs };
}

function drawGlass(canvas: HTMLCanvasElement, g: Glass, time: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sec = time / 1000;
  const drift = Math.sin(sec * 0.55) * g.rib * 1.6; // colours slide sideways behind the ribs
  const shear = SHEAR * (0.85 + 0.15 * Math.sin(sec * 0.8)); // the teeth breathe
  for (let x = 0; x < g.W; x++) {
    const start = x - (x % g.rib);
    const t = (x % g.rib) / g.rib;
    const sx = Math.max(0, Math.min(g.field.width - 1, Math.floor(g.pad + drift + start + g.rib * ((1 - MAG) / 2 + MAG * t))));
    ctx.drawImage(g.field, sx, g.margin + (0.5 - Math.pow(t, 0.7)) * g.rib * shear, 1, g.H, x, 0, 1, g.H);
  }
  ctx.drawImage(g.light, Math.sin(sec * 0.4) * 20 - LP, Math.cos(sec * 0.33) * 12 - LP); // the light arc sweeps a little
  ctx.drawImage(g.ribs, 0, 0);
}

/* ---------- dithered pixel scene: brand blue sky -> pale horizon -> tangerine ground ---------- */
const PALETTE = ["#2f4f8c", "#3f68b8", "#5d8ad6", "#93b6ec", "#cfe0f7", "#f6e6d4", "#f6c08e", "#f0905a", "#e5603a", "#cf4a2c"];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PALETTE_RGB = PALETTE.map(hex);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function drawPixel(canvas: HTMLCanvasElement) {
  const cell = 7;
  const w = Math.ceil(canvas.clientWidth / cell);
  const h = Math.ceil(canvas.clientHeight / cell);
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  const top = PALETTE.length - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let t = y / h + 0.06 * Math.sin((x / w) * Math.PI * 1.2) - 0.05 * (x / w) + 0.015 * Math.sin(x * 0.7 + y * 0.3);
      t = Math.min(0.9999, Math.max(0, t)) * top;
      const i = Math.floor(t);
      const pick = t - i > (BAYER[(y % 4) * 4 + (x % 4)] ?? 0) ? Math.min(i + 1, top) : i;
      img.data.set([...(PALETTE_RGB[pick] ?? [0, 0, 0]), 255], (y * w + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------- pixel-art icons, 12x12, brand palette with a little per-pixel texture ---------- */
const ICON_COLOURS: Record<string, string> = { B: "#2f4f8c", L: "#5d8ad6", O: "#e5603a", P: "#f6c08e", D: "#cf4a2c" };
const ICONS = {
  mic: ["....LLLL....", "...LBBBBL...", "...LBBBBL...", "...LBBBBL...", "...LBBBBL...", ".O.LBBBBL.O.", ".O..LLLL..O.", "..O......O..", "...OOOOOO...", ".....OO.....", ".....OO.....", "...OOOOOO..."],
  review: ["....BBBB....", ".LLLBPPBLLL.", ".L........L.", ".L......O.L.", ".L.....OO.L.", ".L.O..OO..L.", ".L.OOOO...L.", ".L..OO....L.", ".L........L.", ".L........L.", ".LLLLLLLLLL.", "............"],
  ambulance: ["............", ".BBBBBBBB...", ".BPPPPPPBB..", ".BPPOPPPBLB.", ".BPOOOPPBLLB", ".BPPOPPPBBBB", ".BBBBBBBBBBB", ".BBBBBBBBBBB", "..DD....DD..", "..DD....DD..", "............", "............"],
  hospital: ["..BBBBBBBB..", "..BPPOOPPB..", "..BPOOOOPB..", "..BPPOOPPB..", "BBBBBBBBBBBB", "BLLLLLLLLLLB", "BLPLPLLPLPLB", "BLLLLLLLLLLB", "BLPLPLLPLPLB", "BLLLLDDLLLLB", "BLLLLDDLLLLB", "BBBBBBBBBBBB"],
} as const;
type IconName = keyof typeof ICONS;

function PixelIcon({ name, seed }: { name: IconName; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let s = seed;
    const rand = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const im = ctx.createImageData(12, 12);
    ICONS[name].forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const colour = ICON_COLOURS[ch];
        if (!colour) return;
        const k = 0.9 + rand() * 0.18;
        im.data.set([...hex(colour).map((v) => Math.min(255, v * k)), 255], (y * 12 + x) * 4);
      }),
    );
    ctx.putImageData(im, 0, 0);
  }, [name, seed]);
  return <canvas ref={ref} className={styles.px} width={12} height={12} aria-hidden="true" />;
}

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "mic", title: "Hands-free capture", body: "Crews can keep their hands on the patient, while a clip-on device takes the notes." },
  { icon: "review", title: "Crew review", body: "The captain or crew lead approves all patient details before they're shared, so what reaches the ER is accurate." },
  { icon: "ambulance", title: "Secure share", body: "Paramedics read the record en route and share it with ER staff in one tap, so everyone's briefed on arrival." },
  { icon: "hospital", title: "Hospital handoff", body: "Triage nurses scan one QR code and get the whole story." },
];

/** left half of sign-in: moving fluted glass for a few seconds, then it dissolves into a pixel scene with the clipboard story */
export function SignInStory() {
  const artRef = useRef<HTMLElement>(null);
  const glassRef = useRef<HTMLCanvasElement>(null);
  const pixelRef = useRef<HTMLCanvasElement>(null);
  const [story, setStory] = useState(false);

  useEffect(() => {
    const art = artRef.current;
    const glassCanvas = glassRef.current;
    const pixelCanvas = pixelRef.current;
    if (!art || !glassCanvas || !pixelCanvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let glass: Glass | null = null;
    let raf = 0;
    let last = 0;
    let running = !reduce;
    const timers: number[] = [];

    // the panel may have no size on the very first tick, so each frame just skips until the glass is ready
    const loop = (time: number) => {
      if (!glass) glass = prepareGlass(glassCanvas);
      if (glass && time - last >= 33) {
        drawGlass(glassCanvas, glass, time);
        last = time;
      }
      if (running) raf = requestAnimationFrame(loop);
    };

    drawPixel(pixelCanvas);
    if (reduce) {
      setStory(true);
    } else {
      raf = requestAnimationFrame(loop);
      timers.push(
        window.setTimeout(() => {
          setStory(true);
          // stop painting glass once it has faded out
          timers.push(window.setTimeout(() => (running = false), 1500));
        }, STORY_AFTER_MS),
      );
    }

    const ro = new ResizeObserver(() => {
      drawPixel(pixelCanvas);
      glass = prepareGlass(glassCanvas);
    });
    ro.observe(art);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      timers.forEach((t) => clearTimeout(t));
      ro.disconnect();
    };
  }, []);

  return (
    <section ref={artRef} className={[styles.art, story ? styles.story : ""].join(" ")} aria-label="What Nightingale does">
      <canvas ref={glassRef} className={[styles.bg, styles.glass].join(" ")} aria-hidden="true" />
      <canvas ref={pixelRef} className={[styles.bg, styles.pixel].join(" ")} aria-hidden="true" />
      <div className={styles.group} aria-hidden={!story}>
        <article className={styles.board}>
          <span className={styles.clip} aria-hidden="true" />
          <div className={styles.card}>
            <h2 className={styles.title}>Information handoff for firefighters, paramedics and ER staff</h2>
            <ol className={styles.steps}>
              {STEPS.map((step, i) => (
                <li key={step.icon} className={styles.step}>
                  <PixelIcon name={step.icon} seed={7 + i * 31} />
                  <div>
                    <b>{step.title}</b>
                    <span>{step.body}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </article>
        <img className={styles.responders} src={responders} alt="A paramedic and a firefighter reviewing a patient record together" />
      </div>
    </section>
  );
}
