// Boss phone taunts (spec "Phone taunts"): the rotary phone at Lottie's
// Corner rings and a clay polaroid of the boss slides in with one line.
// At most one call shows at a time; the rest wait their turn.
import type { RivalId } from '../sim/balance.ts';
import { FACTIONS } from '../sim/balance.ts';
import { CLAY } from './emotes.ts';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const SHORT: Record<RivalId, string> = { sourwood: 'Vera', hollis: 'Big Tilly', fizzco: 'Preston', coldbrew: 'Juni', blenders: 'Brock', snootwater: 'Sterling' };
const SKIN: Record<RivalId, string> = { sourwood: '#F6C9A0', hollis: '#B9784F', fizzco: '#E3A27A', coldbrew: '#8A5638', blenders: '#E3A27A', snootwater: '#F6C9A0' };

/** A little clay portrait of each boss, by hat and signature look (spec "Characters"). */
function portrait(id: RivalId): string {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 160;
  const c = cv.getContext('2d');
  if (!c) return '';
  const f = FACTIONS[id];
  const main = hex(f.color), accent = hex(f.accent);
  // Backdrop in the faction colour, like a photo booth curtain.
  c.fillStyle = main; c.fillRect(0, 0, 160, 160);
  c.globalAlpha = 0.18; c.fillStyle = '#fff';
  for (let i = 0; i < 160; i += 20) c.fillRect(i, 0, 8, 160);
  c.globalAlpha = 1;
  const ink = CLAY.ink;
  const line = (w: number) => { c.lineWidth = w; c.strokeStyle = ink; c.stroke(); };
  // Shoulders and head.
  c.beginPath(); c.ellipse(80, 168, id === 'blenders' ? 70 : id === 'hollis' ? 66 : 52, 44, 0, 0, Math.PI * 2);
  c.fillStyle = id === 'sourwood' ? '#3d1c4a' : id === 'fizzco' ? '#24262b' : accent; c.fill(); line(5);
  const headR = id === 'blenders' ? 26 : 34;
  c.beginPath(); c.arc(80, 86, headR, 0, Math.PI * 2);
  const g = c.createRadialGradient(68, 72, 4, 80, 86, headR * 1.2); g.addColorStop(0, '#fff'); g.addColorStop(0.2, SKIN[id]); g.addColorStop(1, SKIN[id]);
  c.fillStyle = g; c.fill(); line(5);
  // Eyes and a mouth with attitude.
  c.fillStyle = ink;
  for (const x of [70, 90]) { c.beginPath(); c.arc(x, 86, 3.5, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(70, 101); c.quadraticCurveTo(80, id === 'coldbrew' ? 101 : 106, 92, 98); line(3.5);
  switch (id) {
    case 'sourwood': // silver bun and pearls
      c.beginPath(); c.arc(80, 50, 16, 0, Math.PI * 2); c.fillStyle = '#e8e2da'; c.fill(); line(4);
      for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(56 + i * 8, 126 + Math.sin(i / 6 * Math.PI) * 6, 4, 0, Math.PI * 2); c.fillStyle = '#fffdf6'; c.fill(); line(1.5); }
      break;
    case 'hollis': // a picnic-table straw hat
      c.beginPath(); c.ellipse(80, 60, 62, 14, 0, 0, Math.PI * 2); c.fillStyle = '#E8C36A'; c.fill(); line(4);
      c.beginPath(); c.ellipse(80, 50, 30, 18, 0, Math.PI, 0); c.fill(); line(4);
      c.fillStyle = accent; c.fillRect(52, 54, 56, 6);
      break;
    case 'fizzco': // slick hair, wraparound shades, brick car phone
      c.beginPath(); c.ellipse(80, 60, 34, 14, 0, Math.PI, 0); c.fillStyle = '#2a1a12'; c.fill(); line(4);
      c.fillStyle = ink; c.fillRect(56, 80, 48, 10);
      c.save(); c.translate(116, 92); c.rotate(-0.3); c.fillStyle = '#3a3d44'; c.fillRect(-7, -22, 14, 40); c.restore();
      break;
    case 'coldbrew': // slouchy beanie, low
      c.beginPath(); c.ellipse(80, 64, 38, 26, 0, Math.PI, 0); c.fillStyle = '#FF4FA3'; c.fill(); line(4);
      c.fillStyle = '#E8DCC4'; c.fillRect(44, 62, 72, 9);
      break;
    case 'blenders': // visor and zinc nose
      c.beginPath(); c.ellipse(80, 66, 34, 8, 0, 0, Math.PI * 2); c.fillStyle = accent; c.fill(); line(4);
      c.beginPath(); c.ellipse(80, 93, 5, 4, 0, 0, Math.PI * 2); c.fillStyle = '#fffdf6'; c.fill();
      break;
    case 'snootwater': // a silver swoop of hair and a monocle
      c.beginPath(); c.ellipse(80, 58, 34, 16, 0, Math.PI, 0); c.fillStyle = '#D9DEE3'; c.fill(); line(4);
      c.beginPath(); c.arc(90, 86, 9, 0, Math.PI * 2); line(3);
      break;
  }
  return cv.toDataURL('image/png');
}

const portraits = new Map<RivalId, string>();

export interface Phone {
  /** Ring the Corner's phone: the boss's polaroid slides in with their line. */
  ring(boss: RivalId, line: string): void;
  /** True while a call is on screen (the rotary phone shakes). */
  ringing(): boolean;
}

export function createPhone(root: HTMLElement, onRing?: (boss: RivalId, line: string) => void): Phone {
  const queue: { boss: RivalId; line: string }[] = [];
  let busyUntil = 0;
  const show = () => {
    const next = queue.shift();
    if (!next) return;
    const { boss, line } = next;
    let src = portraits.get(boss);
    if (!src) { src = portrait(boss); portraits.set(boss, src); }
    const el = document.createElement('div');
    el.className = 'phonecall';
    el.style.setProperty('--side', hex(FACTIONS[boss].color));
    el.innerHTML = `<div class="ring">RING RING</div><div class="polaroid"><img alt=""><div class="cap"></div></div><div class="said"></div>`;
    (el.querySelector('img') as HTMLImageElement).src = src;
    (el.querySelector('.cap') as HTMLElement).textContent = SHORT[boss];
    (el.querySelector('.said') as HTMLElement).textContent = `“${line}”`;
    root.appendChild(el);
    onRing?.(boss, line);
    const ms = Math.min(6000, 3200 + line.length * 45);
    busyUntil = performance.now() + ms;
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => { el.remove(); show(); }, 300); }, ms);
  };
  return {
    ring(boss, line) {
      if (queue.length >= 2) return; // a flood of calls is noise; drop the extra
      queue.push({ boss, line });
      if (performance.now() > busyUntil) show();
    },
    ringing: () => performance.now() < busyUntil,
  };
}
