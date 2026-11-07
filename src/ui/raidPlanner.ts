// The Raid Planner (spec: Raids): pick an objective and a squad, read the
// odds dial, then go tonight or now. Lives on a rival plot's card; the HQ
// panel borrows its squad picker. Mounted from hud.ts, drawn with its clay kit.
import {
  availableRaiders, canRaid, inTruce, raidOdds, RAID_RANK, rebuildChance, WEAPONS,
  type GameState, type Objective, type RivalId,
} from '../sim/economy.ts';
import type { Action, Kit } from './hud.ts';
import { guardFace } from './crew.ts';
import { tripNote } from './trips.ts';
import { shakedownLoot } from '../sim/loot.ts';

export interface Planner {
  /** Guards picked for the next raid or HQ assault. */
  squad: Set<string>;
  /** The planner on a rival plot's card. */
  panel(s: GameState, plotId: string): string;
  /** Faces to tap in and out of the squad. */
  picker(s: GameState): string;
  /** Handles the planner's own buttons; false if the click isn't one of them. */
  click(d: DOMStringMap): boolean;
}

export function createRaidPlanner(k: Kit, redraw: () => void, onAction: (a: Action) => void): Planner {
  const squad = new Set<string>();
  let objective: Objective = 'smash';
  const oddsMemo = new Map<string, number>();

  const oddsWord = (p: number) => (p < 0.25 ? 'Long shot' : p < 0.45 ? 'Risky' : p < 0.6 ? 'Coin flip' : p < 0.85 ? 'Good odds' : 'Sure thing');
  const dial = (p: number) => `<span class="cl-dial" style="--v:${p.toFixed(3)}" title="${Math.round(p * 100)}% to win"><i></i></span><b class="cl-odds">${oddsWord(p)}</b>`;

  function picker(s: GameState) {
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    const ids = crew.map((g) => g.id).join(',');
    return `<div class="cl-squad">${crew.map((g) => `<button class="cl-pick${squad.has(g.id) ? ' on' : ''}" data-action="squad" data-id="${g.id}" title="${k.esc(g.name)}: L${g.level}, ${WEAPONS[g.weapon].name}" aria-pressed="${squad.has(g.id)}">${guardFace(k, s, g)}</button>`).join('')}
      ${crew.length > 1 ? `<button class="cl-b ghost tiny" data-action="squadAll" data-ids="${ids}">${crew.every((g) => squad.has(g.id)) ? 'None' : 'Take all'}</button>` : ''}</div>`;
  }

  function panel(s: GameState, id: string) {
    if (s.rank < RAID_RANK) return '';
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    if (!crew.length) return '<span class="cl-note">No guards free</span>';
    const ids = [...squad];
    const odds = (night: boolean) => {
      const ps = s.plots[id];
      const key = JSON.stringify([s.day, s.phase === 'open', id, ids, objective, night, ps.defense, ps.garrison, s.guards.map((g) => [g.id, g.weapon, g.gear, g.level])]);
      let v = oddsMemo.get(key);
      if (v === undefined) { v = raidOdds(s, id, ids, objective, night); if (oddsMemo.size > 200) oddsMemo.clear(); oddsMemo.set(key, v); }
      return v;
    };
    const night = odds(true), day = odds(false);
    const can = canRaid(s, id, ids);
    const obj = (v: Objective, art: string, label: string, tip: string) => `<button class="cl-b ${objective === v ? 'go' : 'ghost'}" data-action="objective" data-value="${v}" title="${tip}">${art}${label}</button>`;
    return `<div class="cl-planner" data-testid="raid-planner">
      <div class="cl-acts">${obj('smash', k.ART.boom(), 'Smash', `Wreck it. They rebuild ${Math.round(rebuildChance(s, id) * 100)}% of the time; if not, you get First Dibs.`)}${obj('shakedown', k.ART.moneyBag(), `Shakedown ${k.whole(shakedownLoot(s, id))}`, 'Grab the till: about a day of its profit')}</div>
      ${picker(s)}
      ${ids.length ? `<div class="cl-oddsrow">${dial(night)}</div>` : ''}
      ${tripNote(s, id, ids)}
      ${inTruce(s, s.plots[id].owner as RivalId) ? '<span class="cl-note bad" title="Raiding breaks it: −1 star, and every rival holds a grudge">Breaks your truce!</span>' : ''}
      <div class="cl-acts">${k.btn('raid', `${k.ART.moon()} Tonight`, can, `data-plot="${id}" data-when="tonight" data-testid="raid-tonight" title="${Math.round(night * 100)}% to win"`, 'go')}
      ${s.phase === 'report' || s.phase === 'night' ? '' : k.btn('raid', `Now −${objective === 'smash' ? '0.2' : '0.1'}★`, can, `data-plot="${id}" data-when="now" data-testid="raid-now" title="${Math.round(day * 100)}% to win in daylight; costs a little Reputation"`)}</div></div>`;
  }

  function click(d: DOMStringMap) {
    switch (d.action) {
      case 'squad': if (squad.has(d.id!)) squad.delete(d.id!); else squad.add(d.id!); redraw(); return true;
      case 'squadAll': { const ids = (d.ids ?? '').split(',').filter(Boolean); const all = ids.every((i) => squad.has(i)); for (const i of ids) { if (all) squad.delete(i); else squad.add(i); } redraw(); return true; }
      case 'objective': objective = d.value as Objective; redraw(); return true;
      case 'raid': onAction({ type: 'raid', plot: d.plot!, guards: [...squad], objective, when: d.when as 'now' | 'tonight' }); squad.clear(); return true;
    }
    return false;
  }

  return { squad, panel, picker, click };
}
