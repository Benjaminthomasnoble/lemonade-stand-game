// The Raid Planner (spec: Raids): pick an objective and a squad, read the
// odds dial, then go tonight or now. Lives on a rival plot's card; the HQ
// panel borrows its squad picker. Mounted from hud.ts, drawn with its clay kit.
import {
  availableRaiders, canRaid, canSabotage, GADGETS, inTruce, PERIMETERS, raidIsNightAt, raidOdds, RAID_RANK, raidRepCost, rebuildChance, SABOTAGE_RANK, squadTrip,
  WEAPONS, type GameState, type RaidObjective, type RivalId,
} from '../sim/economy.ts';
import { canScout, freeLookout, scoutedSnapshot } from '../sim/scouting.ts';
import type { Action, Kit } from './hud.ts';
import { guardFace } from './crew.ts';
import { tripNote } from './trips.ts';
import { shakedownLoot } from '../sim/loot.ts';
import { citationRisk, raidBan } from '../sim/citations.ts';
import { glyph } from './clay.ts';

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
  let objective: RaidObjective = 'smash';
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

  /** What a Lookout saw (fence, gadgets, henchmen), or the button to send one. */
  function intel(s: GameState, id: string) {
    const sc = scoutedSnapshot(s, id);
    if (sc) {
      const left = sc.until - s.day + 1;
      const tip = `Scouted: ${sc.tier ? PERIMETERS[sc.tier - 1].name : 'no fence'}, ${sc.gadgets.map((g) => GADGETS[g].name).join(', ') || 'no gadgets'}, ${sc.garrison} henchmen. Good for ${left} more day${left === 1 ? '' : 's'}.`;
      return `<div class="cl-slots" title="${k.esc(tip)}">${sc.tier ? `<span class="cl-slot full">${k.ART.fence(sc.tier)}</span>` : ''}${sc.gadgets.map((g) => `<span class="cl-slot full">${k.GADGET_ART[g]()}</span>`).join('')}<span class="cl-slot full">${k.ART.head(2)}</span>${k.tape(`×${sc.garrison}`)}</div>`;
    }
    const lookouts = s.guards.filter((g) => g.specialty === 'lookout');
    if (!lookouts.length) return '';
    const free = freeLookout(s, id);
    const b = free ? canScout(s, free.id, id) : canScout(s, lookouts[0].id, id);
    const who = (free ?? lookouts[0]).name.split(' ')[0];
    // A disabled button carries its reason as the title, so the tip only goes on a live one.
    return k.btn('scout', `${k.ART.tower()} Scout`, b, `data-plot="${id}" data-id="${(free ?? lookouts[0]).id}"${b.ok ? ` title="${k.esc(`${who} watches it today: its defenses show for 3 days`)}"` : ''}`, 'ghost');
  }

  function panel(s: GameState, id: string) {
    if (s.rank < RAID_RANK) return '';
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    if (!crew.length) return '<span class="cl-note">No guards free</span>';
    const ids = [...squad];
    const st = s.plots[id].stand;
    const sabotage = s.rank >= SABOTAGE_RANK && !!st && !st.wrecked; // only a standing stand has stock to spoil
    if (objective === 'sabotage' && !sabotage) objective = 'smash';
    const odds = (night: boolean) => {
      const ps = s.plots[id];
      const key = JSON.stringify([s.day, s.phase === 'open', id, ids, objective, night, ps.defense, ps.garrison, ps.garrisonOut, s.guards.map((g) => [g.id, g.weapon, g.gear, g.level])]);
      let v = oddsMemo.get(key);
      if (v === undefined) { v = raidOdds(s, id, ids, objective, night); if (oddsMemo.size > 200) oddsMemo.clear(); oddsMemo.set(key, v); }
      return v;
    };
    const nightNow = raidIsNightAt(squadTrip(s, id, 'now', ids).at); // the fight's minute decides, after this squad's walk there
    const night = odds(true), now = odds(nightNow);
    const stars = raidRepCost(s, ids, objective, nightNow);
    const nowOffered = s.phase !== 'report' && s.phase !== 'night';
    const risk = nowOffered ? citationRisk(s, !nightNow) : null; // Sheriff Budd, below the line by day
    const ban = raidBan(s);
    const can = canRaid(s, id, ids, objective);
    const sb = canSabotage(s, id, ids);
    const obj = (v: RaidObjective, art: string, label: string, tip: string) => `<button class="cl-b ${objective === v ? 'go' : 'ghost'}" data-action="objective" data-value="${v}" title="${tip}">${art}${label}</button>`;
    // A disabled button carries its reason as the title, so the odds tip only goes on a live one.
    const tip = (t: string) => (can.ok ? ` title="${t}"` : '');
    return `<div class="cl-planner" data-testid="raid-planner">
      <div class="cl-acts">${obj('smash', k.ART.boom(), 'Smash', `Wreck it. They rebuild ${Math.round(rebuildChance(s, id) * 100)}% of the time; if not, you get First Dibs.`)}${obj('shakedown', k.ART.moneyBag(), `Shakedown ${k.whole(shakedownLoot(s, id))}`, 'Grab the till: about a day of its profit')}${sabotage ? obj('sabotage', k.ART.sour(), 'Sabotage', `Spoil their stock: they sell nothing their next day. The stand stays up.${sb.ok ? '' : ` (${k.esc(sb.why)})`}`) : ''}</div>
      ${objective === 'sabotage' && !sb.ok ? `<span class="cl-note bad">${k.esc(sb.why)}</span>` : ''}
      ${intel(s, id)}
      ${picker(s)}
      ${ids.length ? `<div class="cl-oddsrow">${dial(night)}</div>` : ''}
      ${tripNote(s, id, ids)}
      ${inTruce(s, s.plots[id].owner as RivalId) ? '<span class="cl-note bad" title="Raiding breaks it: −1 star, and every rival holds a grudge">Breaks your truce!</span>' : ''}
      ${ban ? `<span class="cl-note bad" data-testid="raid-ban" title="Sheriff Budd's Citation: no raids or HQ assaults till then">${k.esc(ban.why)}</span>` : ''}
      ${risk && !ban ? `<span class="cl-note bad" data-testid="raid-citation" title="${k.esc(`Under ${risk.stars} stars, Sheriff Budd cites every daytime raid: about a day's sales, and no raids or HQ assaults for ${risk.banDays} days. Tonight's raids are never cited.`)}">Now earns a Citation: ${k.whole(risk.fine)}, ${risk.banDays}-day ban</span>` : ''}
      <div class="cl-acts">${k.btn('raid', `${k.ART.moon()} Tonight`, can, `data-plot="${id}" data-when="tonight" data-testid="raid-tonight"${tip(`${Math.round(night * 100)}% to win`)}`, 'go')}
      ${!nowOffered ? '' : k.btn('raid', `Now${stars ? ` <span class="bad">−${stars}${glyph('star')}</span>` : ''}`, can, `data-plot="${id}" data-when="now" data-testid="raid-now"${tip(`${Math.round(now * 100)}% to win now${stars ? `; customers see it: −${stars} star` : nightNow ? ': it lands after dark, so no Reputation cost' : ': Gentle Giants alone, so no Reputation cost'}${risk ? `; Sheriff Budd's Citation: ${k.whole(risk.fine)} and no raids for ${risk.banDays} days` : ''}`)}`)}</div></div>`;
  }

  function click(d: DOMStringMap) {
    switch (d.action) {
      case 'squad': if (squad.has(d.id!)) squad.delete(d.id!); else squad.add(d.id!); redraw(); return true;
      case 'squadAll': { const ids = (d.ids ?? '').split(',').filter(Boolean); const all = ids.every((i) => squad.has(i)); for (const i of ids) { if (all) squad.delete(i); else squad.add(i); } redraw(); return true; }
      case 'objective': objective = d.value as RaidObjective; redraw(); return true;
      case 'raid': onAction({ type: 'raid', plot: d.plot!, guards: [...squad], objective, when: d.when as 'now' | 'tonight' }); squad.clear(); return true;
      case 'scout': squad.delete(d.id!); onAction({ type: 'scout', id: d.id!, plot: d.plot! }); return true;
    }
    return false;
  }

  return { squad, panel, picker, click };
}
