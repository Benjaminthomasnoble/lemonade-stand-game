// The Evening beat (spec: The daily loop): the stands close and the day's
// profit posts on the Ledger; then, on the live map, station guards, approve
// repairs and send tonight's raids for a moment before the night runs on the
// clock. Plain controls on the HUD's existing classes; clicks go through the
// HUD's one listener (data-action).
import { fenceRepairCost, guardReady, isWrecked, PLOT_BY_ID, PLOTS, rebuildCost, type GameState, type Guard } from '../sim/economy.ts';
import * as A from './clay.ts';

/** Props are drawn once and reused, so renders compare equal and nothing flickers. */
const memo = new Map<string, string>();
const art = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const btn = (action: string, label: string, extra = '', cls = 'tiny') => `<button class="cl-b ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');

/** The Evening on the map: start the night now (it starts by itself after a moment), skip it, or reopen the Ledger. */
export function eveningBar(): string {
  return `<div class="cl-daybar" data-testid="evening">
    <button class="cl-b go" data-action="night" data-testid="night" title="The night starts by itself in a moment">${art('moon', A.moonSVG)}Night</button>
    <button class="cl-link" data-action="sleep" data-testid="next" title="Skip ahead; stops at any big alert">Sleep till dawn</button>
    <button class="cl-link" data-action="ledger" title="Today's profit and books">Ledger</button></div>`;
}

/** Approve repairs: each of your plots with a smashed stand or a dented fence, with its fix (after closing and at night). */
export function repairCards(s: GameState): string[] {
  const out: string[] = [];
  for (const p of PLOTS) {
    const ps = s.plots[p.id];
    if (ps.owner !== 'player') continue;
    const go = btn('goto', 'Go there', `data-plot="${p.id}"`);
    if (isWrecked(ps)) {
      const cost = rebuildCost(ps);
      const fix = btn('rebuild', `${ps.busted ? 'Fix' : 'Rebuild'} ${whole(cost)}`, `data-plot="${p.id}" data-testid="repair" ${s.cash >= cost ? '' : 'disabled title="Not enough cash"'}`, 'tiny go');
      out.push(`<div class="cl-ticket red" title="${esc(`${p.name}: ${ps.busted ? 'Busted, closed until you fix it' : 'Smashed. Rebuild by tomorrow or the plot goes For Sale'}`)}">${art('boom', A.boomSVG)}<b>${esc(place(p.id))}</b><span class="cl-acts">${go}${fix}</span></div>`);
    } else if (fenceRepairCost(ps)) {
      const cost = fenceRepairCost(ps);
      const fix = btn('repairFence', `Patch ${whole(cost)}`, `data-plot="${p.id}" data-testid="repair" ${s.cash >= cost ? '' : 'disabled title="Not enough cash"'}`);
      out.push(`<div class="cl-ticket" title="${esc(`${p.name}: the fence is dented`)}">${art(`fence${ps.defense.tier}`, () => A.fenceSVG(ps.defense.tier))}<b>${esc(place(p.id))}</b><span class="cl-acts">${go}${fix}</span></div>`);
    }
  }
  return out;
}

/** Station guards from the map: who is posted on this plot, then one tap posts the next free guard (or everyone). */
export function guardsHere(s: GameState, plotId: string, face: (g: Guard) => string): string {
  const away = new Set(s.raids.flatMap((r) => r.guards ?? []));
  const here = s.guards.filter((g) => g.post === plotId);
  const free = s.guards.filter((g) => g.post !== plotId && guardReady(s, g) && !away.has(g.id));
  if (!here.length && !free.length) return '';
  const next = free[0];
  const add = next ? btn('post', `+${art('shield', A.shieldSVG)}`, `data-id="${next.id}" data-plot="${plotId}" data-testid="post-here" title="Post ${esc(next.name)} here"`, 'tiny go') : '';
  const all = free.length > 1 ? btn('defend', 'All here', `data-plot="${plotId}" title="Every ready guard to ${esc(PLOT_BY_ID[plotId].name)}"`) : '';
  return `<span class="cl-faces" title="${here.length} guard${here.length === 1 ? '' : 's'} posted here">${here.map(face).join('')}${add}${all}</span>`;
}
