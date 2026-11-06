// Kitchen-Table Clay reaction icons: lumpy plasticine blobs with a sheen and a
// plum-ink edge, drawn once to canvas and reused as images in the thought
// bubbles. Ported from the clay mockup Ben picked (art-direction/clay-mockup,
// dirs/clay/life.js EMOTES) so the game matches it.

export const CLAY = {
  cream: '#FFF1D6', lemon: '#F7C948', green: '#7CC47F', teal: '#3BB4C1', terra: '#E8704F',
  walnut: '#8B5E3C', ink: '#2E2A4F', amber: '#FFB55E', blush: '#F4A3B5', gold: '#C9A227',
} as const;

export type Emote = 'bought' | 'pricey' | 'zzz' | 'soldout' | 'line' | 'rival' | 'sweat';

const ink = CLAY.ink;
const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Darken (k < 0) or lighten a hex colour by shifting its lightness. */
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + k * 255)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

function blobPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, wob: number, seed: number) {
  c.beginPath();
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = r * (1 + (hash(i, seed) - 0.5) * wob); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    if (i === 0) { const pl = pts[n - 1]; c.moveTo((pl[0] + p0[0]) / 2, (pl[1] + p0[1]) / 2); }
    c.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
  }
  c.closePath();
}
function clayBlob(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, seed: number) {
  blobPath(c, cx, cy, r, 9, 0.12, seed);
  const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, fill); g.addColorStop(1, shade(fill, -0.18));
  c.fillStyle = g; c.fill(); c.lineWidth = r * 0.09; c.strokeStyle = ink; c.stroke();
}
function sheen(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  c.save(); c.globalAlpha = 0.7; c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, y, rx, ry, -0.6, 0, Math.PI * 2); c.fill(); c.restore();
}
function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath(); c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.5, y - s * 1.05, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35); c.closePath();
}

const DRAW: Record<Emote, (c: CanvasRenderingContext2D) => void> = {
  bought(c) {
    heartPath(c, 128, 132, 62);
    const g = c.createRadialGradient(100, 90, 4, 128, 120, 80); g.addColorStop(0, '#ffd0dc'); g.addColorStop(0.3, '#ff6f8f'); g.addColorStop(1, '#c8325a');
    c.fillStyle = g; c.fill(); c.lineWidth = 7; c.strokeStyle = ink; c.stroke(); sheen(c, 100, 95, 13, 8);
  },
  pricey(c) {
    clayBlob(c, 118, 128, 62, CLAY.lemon, 3);
    c.beginPath(); c.ellipse(118, 128, 36, 36, 0, 0, 6.3); c.lineWidth = 6; c.strokeStyle = 'rgba(140,90,20,0.55)'; c.stroke(); sheen(c, 96, 96, 12, 7);
    c.lineCap = 'round'; c.lineWidth = 15; c.strokeStyle = ink;
    c.beginPath(); c.moveTo(94, 104); c.lineTo(142, 152); c.moveTo(142, 104); c.lineTo(94, 152); c.stroke(); c.lineWidth = 9; c.strokeStyle = CLAY.terra; c.stroke();
    c.beginPath(); c.moveTo(196, 70); c.quadraticCurveTo(218, 104, 196, 112); c.quadraticCurveTo(174, 104, 196, 70);
    c.fillStyle = '#7fd3e6'; c.fill(); c.lineWidth = 5; c.strokeStyle = ink; c.stroke();
  },
  zzz(c) {
    clayBlob(c, 128, 130, 70, '#d9d4f2', 7); c.lineCap = 'round'; c.lineJoin = 'round';
    const z = (x: number, y: number, s: number) => {
      c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y - s); c.lineTo(x - s, y + s); c.lineTo(x + s, y + s);
      c.lineWidth = s * 0.55; c.strokeStyle = ink; c.stroke(); c.lineWidth = s * 0.3; c.strokeStyle = '#8a7fd0'; c.stroke();
    };
    z(100, 148, 22); z(146, 112, 16); z(176, 84, 11); sheen(c, 96, 92, 12, 7);
  },
  soldout(c) {
    clayBlob(c, 128, 130, 70, '#f3ede0', 11); c.lineWidth = 7; c.strokeStyle = ink; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(98, 92); c.lineTo(160, 92); c.lineTo(152, 172); c.lineTo(106, 172); c.closePath();
    c.fillStyle = 'rgba(190,230,240,0.6)'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(160, 104); c.quadraticCurveTo(186, 112, 158, 150); c.stroke();
    c.fillStyle = 'rgba(247,201,72,0.6)'; c.fillRect(110, 162, 38, 6);
  },
  line(c) {
    // An egg timer: the queue took too long.
    clayBlob(c, 128, 130, 70, '#e6f4ec', 13); c.lineWidth = 7; c.strokeStyle = ink; c.lineJoin = 'round';
    c.fillStyle = CLAY.walnut; c.fillRect(92, 78, 72, 12); c.strokeRect(92, 78, 72, 12); c.fillRect(92, 170, 72, 12); c.strokeRect(92, 170, 72, 12);
    c.beginPath(); c.moveTo(100, 90); c.lineTo(156, 90); c.lineTo(132, 130); c.lineTo(156, 170); c.lineTo(100, 170); c.lineTo(124, 130); c.closePath();
    c.fillStyle = 'rgba(190,230,240,0.7)'; c.fill(); c.stroke();
    c.fillStyle = CLAY.lemon; c.beginPath(); c.moveTo(108, 168); c.lineTo(148, 168); c.lineTo(128, 146); c.closePath(); c.fill();
    sheen(c, 96, 96, 12, 7);
  },
  rival(c) {
    clayBlob(c, 128, 130, 70, '#E8DCC4', 5); c.fillStyle = '#3B2A20'; c.strokeStyle = ink; c.lineWidth = 6;
    c.beginPath(); c.moveTo(96, 100); c.lineTo(150, 100); c.lineTo(144, 170); c.lineTo(102, 170); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#FF4FA3'; c.fillRect(98, 118, 50, 12);
    c.beginPath(); c.moveTo(166, 128); c.lineTo(196, 128); c.lineTo(196, 116); c.lineTo(214, 136); c.lineTo(196, 156); c.lineTo(196, 144); c.lineTo(166, 144); c.closePath(); c.fill(); c.stroke();
  },
  sweat(c) {
    c.beginPath(); c.moveTo(128, 40); c.quadraticCurveTo(190, 150, 128, 200); c.quadraticCurveTo(66, 150, 128, 40);
    const g = c.createRadialGradient(110, 120, 5, 128, 140, 80); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#8fe0ee'); g.addColorStop(1, CLAY.teal);
    c.fillStyle = g; c.fill(); c.lineWidth = 8; c.strokeStyle = ink; c.stroke();
  },
};

const cache = new Map<Emote, string>();
/** A data URL for the emote, drawn on first use. */
export function emoteUrl(kind: Emote): string {
  let url = cache.get(kind);
  if (url) return url;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  if (!c) return '';
  DRAW[kind](c);
  url = cv.toDataURL('image/png');
  cache.set(kind, url);
  return url;
}
