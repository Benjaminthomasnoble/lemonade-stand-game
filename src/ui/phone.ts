// Boss phone taunts (spec "Phone taunts"): the rotary phone at Lottie's
// Corner rings and a clay polaroid (the boss's baked face on a curtain in their gang colour) of the boss slides in with one line.
// At most one call shows at a time; the rest wait their turn.
import type { RivalId } from '../sim/balance.ts';
import { FACTIONS } from '../sim/balance.ts';
import { BOSS_PORTRAIT, portraitUrl } from './portraits.ts';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const SHORT: Record<RivalId, string> = { sourwood: 'Vera', hollis: 'Big Tilly', fizzco: 'Preston', coldbrew: 'Juni', blenders: 'Brock', snootwater: 'Sterling' };

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
    const el = document.createElement('div');
    el.className = 'phonecall';
    el.style.setProperty('--side', hex(FACTIONS[boss].color));
    el.innerHTML = `<div class="ring">RING RING</div><div class="polaroid"><img alt=""><div class="cap"></div></div><div class="said"></div>`;
    (el.querySelector('img') as HTMLImageElement).src = portraitUrl(BOSS_PORTRAIT[boss]); // the baked clay face (src/ui/portraits.ts)
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
