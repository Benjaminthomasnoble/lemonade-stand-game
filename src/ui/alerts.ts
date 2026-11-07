// The alert feed's cards (spec: "Alerts land as cards in the left feed, each
// with Go There and one action"). Raid warnings are red-edged tickets naming the
// raider, the target and the ETA, with the party only when a Watchtower on the
// plot sees it. Plain functional controls on the HUD's ticket styles; clicks go
// through the HUD's one listener (data-action).
import {
  canBuyPerimeter, clockText, fenceRepairCost, guardReady, minutesLeft, PERIMETERS, PLOT_BY_ID,
  type Alert, type GameState, type Raid, type RivalId,
} from '../sim/economy.ts';
import * as A from './clay.ts';
import { bellEta, canRingBell } from '../sim/reinforce.ts';

/** Props are drawn once and reused, so renders compare equal and nothing flickers. */
const memo = new Map<string, string>();
const art = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
const ICON = {
  foot: () => art('foot', A.footSVG), empty: () => art('empty', A.emptySVG), crate: () => art('crate', A.crateSVG),
  shield: () => art('shield', A.shieldSVG), lemon: () => art('lemon', A.lemonSVG),
  boom: () => art('boom', A.boomSVG), bag: () => art('bag', A.moneyBagSVG),
  fence: (t: number) => art(`fence${t}`, () => A.fenceSVG(t)),
  weapon: (w: string) => art(`w-${w}`, w === 'hatchets' ? A.hatchetSVG : w === 'clubs' ? A.clubSVG : A.fistSVG),
};
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const btn = (action: string, label: string, extra = '', cls = 'tiny') => `<button class="cl-b ${cls}" data-action="${action}" ${extra}>${label}</button>`;
/** Short names for a card's one line. */
const SHORT: Record<RivalId, string> = { sourwood: 'Sourwoods', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'Blenders' };
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');

/** A Watchtower on the target sees the party coming (crew's towerCovers widens this to 2 plots once it merges). */
export const towerSees = (s: GameState, plotId: string) => s.plots[plotId].defense.gadgets.includes('watchtower');

function warning(s: GameState, a: Alert, r: Raid): string {
  const ps = s.plots[r.target];
  const left = minutesLeft(s, r);
  const seen = towerSees(s, r.target) && r.party?.length;
  // The makeup a Watchtower sees: what they're after, then each raider's weapon (six shown, the rest counted).
  const them = seen ? `${r.objective === 'smash' ? ICON.boom() : ICON.bag()}${r.party!.slice(0, 6).map((f) => ICON.weapon(f.weapon)).join('')}${r.party!.length > 6 ? `<i>+${r.party!.length - 6}</i>` : ''}` : '';
  const guards = s.guards.filter((g) => g.post === r.target && guardReady(s, g)).length;
  const us = `${Array.from({ length: Math.min(4, guards) }, () => ICON.shield()).join('')}${ps.defense.tier ? ICON.fence(ps.defense.tier) : ''}`;
  const after = r.delivery ? 'the cargo' : r.objective === 'smash' ? 'a smash' : 'the till';
  const tip = `${a.text}${seen ? ` ${r.party!.length} coming for ${after}: ${r.party!.map((f) => f.weapon).join(', ')}.` : ''}${r.detected ? '' : ' Undetected: they strike first.'}`;
  // The one action: Ring the Bell while a reserve is in range (then when help gets there), else a fence.
  const next = PERIMETERS[ps.defense.tier];
  const pb = canBuyPerimeter(s, r.target);
  const help = bellEta(s, r.id);
  const fix = canRingBell(s, r.id) ? btn('bell', 'Ring the Bell', `data-raid="${r.id}" data-testid="ring-bell"`, 'tiny go')
    : help !== null ? `<span class="cl-note">${help ? `Help in ${help} min` : 'Help is here'}</span>`
    : next && pb.ok ? btn('perimeter', `${next.name.split(' ')[0]} ${whole(next.cost)}`, `data-plot="${r.target}"`, 'tiny go')
    : fenceRepairCost(ps) && s.cash >= fenceRepairCost(ps) ? btn('repairFence', `Patch ${whole(fenceRepairCost(ps))}`, `data-plot="${r.target}"`) : '';
  return `<div class="cl-ticket red" data-testid="raid-warning" data-raid="${r.id}" title="${esc(tip)}">${ICON.foot()}
    <b>${SHORT[r.attacker as RivalId] ?? 'Raiders'} → ${esc(place(r.target))}</b>
    <span class="cl-acts"><span class="cl-note">${clockText(r.at ?? s.minute)} · ${left} min</span>${them ? `<span class="cl-vs">${them}<i>vs</i>${us}</span>` : ''}</span>
    <span class="cl-acts">${btn('goto', 'Go there', `data-plot="${r.target}"`)}${fix}</span></div>`;
}

function card(a: Alert): string {
  const vip = a.kind === 'vip' || a.kind === 'pickup';
  const icon = a.kind === 'soldout' ? ICON.empty() : vip ? ICON.crate() : ICON.lemon();
  // The one action: Restock now on a sold-out stand; Watch on a VIP card (a first arrival's show waits for it).
  const act = a.kind === 'soldout' && a.plot ? btn('restockNow', 'Restock now', `data-plot="${a.plot}"`, 'tiny go')
    : vip && a.scene ? btn('watch', '▶ Watch', `data-id="${a.id}" data-testid="vip-watch"`, a.kind === 'vip' ? 'tiny go' : 'tiny') : '';
  return `<div class="cl-ticket" title="${esc(a.text)}">${icon}<b>${esc(a.text.replace(/!$/, ''))}</b>
    <span class="cl-acts">${a.plot ? btn('goto', 'Go there', `data-plot="${a.plot}"`) : ''}${act}${btn('dismiss', '✕', `data-id="${a.id}" title="Dismiss"`, 'tiny ghost')}</span></div>`;
}

/** The alert cards, newest first. Raid warnings stay until the raid hits; the rest until dismissed (or dawn). */
export function alertCards(s: GameState): string[] {
  const out: string[] = [];
  for (const a of [...(s.alerts ?? [])].reverse()) {
    if (a.raid) {
      const r = s.raids.find((x) => x.id === a.raid);
      if (r) out.push(warning(s, a, r));
    } else out.push(card(a));
  }
  return out;
}
