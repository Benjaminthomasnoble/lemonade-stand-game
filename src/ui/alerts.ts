// The alert feed's cards (spec: "Alerts land as cards in the left feed, each
// with Go There and one action"). Raid warnings are red-edged tickets naming the
// raider, the target and the ETA, with the party only when a Watchtower on the
// plot sees it. Plain functional controls on the HUD's ticket styles; clicks go
// through the HUD's one listener (data-action).
import {
  canBuyPerimeter, clockText, DEX, fenceRepairCost, guardReady, HQS, minutesLeft, PERIMETERS, PLOT_BY_ID, towerCovers,
  type Alert, type GameState, type Raid, type RivalId,
} from '../sim/economy.ts';
import { taught } from '../sim/story.ts';
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

/** A Watchtower sees the party coming: one on the target, or on the owner's plots within 2 (crew's towerCovers). */
export const towerSees = (s: GameState, plotId: string) => towerCovers(s, plotId);

function warning(s: GameState, a: Alert, r: Raid): string {
  const ps = s.plots[r.target];
  const left = minutesLeft(s, r);
  const seen = towerSees(s, r.target) && r.party?.length;
  // The makeup a Watchtower sees: what they're after, then each raider's weapon (six shown, the rest counted).
  const them = seen ? `${r.objective === 'smash' ? ICON.boom() : ICON.bag()}${r.party!.slice(0, 6).map((f) => ICON.weapon(f.weapon)).join('')}${r.party!.length > 6 ? `<i>+${r.party!.length - 6}</i>` : ''}` : '';
  const guards = s.guards.filter((g) => g.post === r.target && guardReady(s, g)).length
    + (r.tutorial && !s.guards.some((g) => g.name === DEX && g.post === r.target && guardReady(s, g)) ? 1 : 0); // Dex always meets the first raid
  const us = `${Array.from({ length: Math.min(4, guards) }, () => ICON.shield()).join('')}${ps.defense.tier ? ICON.fence(ps.defense.tier) : ''}`;
  const after = r.delivery ? 'the cargo' : r.sabotage ? 'the stock' : r.objective === 'smash' ? 'a smash' : 'the till'; // crew: Sabotage spoils the stock
  // What a tower sees besides the weapons: the boss at the head (Threat 5, the Syndicate) and any lookouts.
  const boss = seen && r.attacker !== 'player' ? r.party!.find((f) => f.name === HQS[r.attacker as RivalId].boss) : undefined;
  const more = `${boss ? ` ${boss.name} leads them.` : ''}${seen && r.lookouts ? ` ${r.lookouts} lookout${r.lookouts > 1 ? 's' : ''}.` : ''}`;
  const others = r.group ? s.raids.filter((x) => x.group === r.group && x !== r).length : 0; // the same raid's other parts
  const pact = r.syndicate ? ` A Syndicate strike, sent by ${SHORT[r.attacker as RivalId]}.` : '';
  const tip = `${a.text}${pact}${seen ? ` ${r.party!.length} coming for ${after}: ${r.party!.map((f) => f.weapon).join(', ')}.` : ''}${more}${others ? ` One of ${others + 1} plots they hit tonight.` : ''}${r.detected ? '' : ' Undetected: they strike first.'}`;
  // The one action: Ring the Bell while a reserve is in range (then when help gets there), else a fence.
  const next = PERIMETERS[ps.defense.tier];
  const pb = canBuyPerimeter(s, r.target);
  const help = bellEta(s, r.id);
  const fix = canRingBell(s, r.id) ? btn('bell', 'Ring the Bell', `data-raid="${r.id}" data-testid="ring-bell"`, 'tiny go')
    : help !== null ? `<span class="cl-note">${help ? `Help in ${help} min` : 'Help is here'}</span>`
    : next && pb.ok ? btn('perimeter', `${next.name.split(' ')[0]} ${whole(next.cost)}`, `data-plot="${r.target}"`, 'tiny go')
    : fenceRepairCost(ps) && s.cash >= fenceRepairCost(ps) ? btn('repairFence', `Patch ${whole(fenceRepairCost(ps))}`, `data-plot="${r.target}"`) : '';
  return `<div class="cl-ticket red" data-testid="raid-warning" data-raid="${r.id}" title="${esc(tip)}">${ICON.foot()}
    <b>${r.syndicate ? 'Syndicate' : SHORT[r.attacker as RivalId] ?? 'Raiders'} → ${esc(place(r.target))}</b>
    <span class="cl-acts"><span class="cl-note">${clockText(r.at ?? s.minute)} · ${left} min</span>${them ? `<span class="cl-vs">${them}<i>vs</i>${us}</span>` : ''}</span>
    <span class="cl-acts">${btn('goto', 'Go there', `data-plot="${r.target}"`)}${fix}</span></div>`;
}

function card(s: GameState, a: Alert): string {
  const vip = a.kind === 'vip' || a.kind === 'pickup';
  const icon = a.kind === 'soldout' ? ICON.empty() : vip ? ICON.crate() : ICON.lemon();
  // The one action: Restock now on a sold-out stand while the stands are open (no supplies after closing) and once the
  // Market opens (Day 3's lesson); Watch on a VIP card (a first arrival's show waits for it).
  const act = a.kind === 'soldout' && a.plot && s.phase === 'open' && taught(s, 'market') ? btn('restockNow', 'Restock now', `data-plot="${a.plot}"`, 'tiny go')
    : vip && a.scene ? btn('watch', `${A.glyph('play')} Watch`, `data-id="${a.id}" data-testid="vip-watch"`, a.kind === 'vip' ? 'tiny go' : 'tiny') : '';
  return `<div class="cl-ticket" title="${esc(a.text)}">${icon}<b>${esc(a.text.replace(/!$/, ''))}</b>
    <span class="cl-acts">${a.plot ? btn('goto', 'Go there', `data-plot="${a.plot}"`) : ''}${act}${btn('dismiss', A.glyph('close'), `data-id="${a.id}" title="Dismiss" aria-label="Dismiss"`, 'tiny ghost')}</span></div>`;
}

/** Small news (sold out, notes, pickups) melts off the feed after this many game minutes; it stays in the log. */
export const ALERT_LIFE = 90;
/** Cards past this many shrink to a small stack of icon blobs (the words stay on hover). */
export const ALERT_FULL = 2;

/** The alert cards, newest first. Raid warnings stay until the raid hits; big news until dismissed (or dawn); small news melts. */
export function alertCards(s: GameState): string[] {
  const out: string[] = [];
  for (const a of [...(s.alerts ?? [])].reverse()) {
    if (a.raid) {
      const r = s.raids.find((x) => x.id === a.raid);
      if (r) out.push(warning(s, a, r));
      continue;
    }
    const small = a.kind === 'soldout' || a.kind === 'note' || (a.kind === 'pickup' && !a.scene);
    if (small && (a.day !== s.day || s.minute - a.minute > ALERT_LIFE)) continue;
    out.push(card(s, a));
  }
  // A raid warning or a VIP's Watch keeps its strip: the one tap it offers can't hide.
  let shown = 0;
  return out.map((h) => (/data-testid="(raid-warning|vip-watch)"/.test(h) || shown++ < ALERT_FULL ? h : h.replace('class="cl-ticket', 'tabindex="0" class="cl-ticket mini')));
}
