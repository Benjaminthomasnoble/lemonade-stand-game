// The Raid Planner (spec: Raids): pick an objective and a squad, read the
// odds dial, then go tonight or now. Lives on a rival plot's card, and on a
// rival HQ's card for its one objective, HQ Assault (the Gate, the Yard, the
// Boss Room). Mounted from hud.ts, drawn with its clay kit.
import {
  armedGadgets, availableRaiders, canAssault, canRaid, canSabotage, dexSquad, foughtByDay, GADGETS, hqOdds, hqPlot, HQS, inTruce, postsFor, raidOdds, raidOddsRange, RAID_RANK,
  raidRepCost, rebuildChance, SABOTAGE_NEEDS, squadTrip, WEAPONS, type Blocker, type GameState, type RaidObjective, type RivalId,
} from '../sim/economy.ts';
import { fitGarrison } from '../sim/garrison.ts';
import { canScout, freeLookout, isScouted, scoutedSnapshot } from '../sim/scouting.ts';
import type { Action, Kit } from './hud.ts';
import { guardFace } from './crew.ts';
import { tripNote } from './trips.ts';
import { shakedownLoot } from '../sim/loot.ts';
import { citationRisk, raidBan } from '../sim/citations.ts';
import { flyOver, snapshotTip } from './gull.ts';
import { glyph } from './clay.ts';
import { canSaveTemplate, templateAt, templateFor, templates, templatesOn, templatesUnlocked, type RaidTemplate } from '../sim/templates.ts';
import { PLOT_BY_ID } from '../sim/map.ts';
import { helpPlots } from '../sim/reinforce.ts';

/** The Crew tab's switch for raid templates, from Rank 6 (spec: every helper is a switch, a target and a Ledger line). */
export function templatesSwitch(s: GameState): string {
  if (!templatesUnlocked(s)) return '';
  const on = templatesOn(s);
  return `<button class="cl-toggle${on ? ' on' : ''}" data-action="tplSwitch" data-testid="raid-templates-switch" aria-pressed="${on}" title="On: the Raid Planner keeps your saved raids, and opens on a plot with the one that last went there"><i></i>Raid templates</button>`;
}

export interface Planner {
  /** Guards picked for the next raid or HQ assault. */
  squad: Set<string>;
  /** The planner on a rival plot's or HQ's card (`inMenu`: drawn in the Raid Planner menu, whose links close it). */
  panel(s: GameState, plotId: string, inMenu?: boolean): string;
  /** Faces to tap in and out of the squad. */
  picker(s: GameState): string;
  /** Handles the planner's own buttons; false if the click isn't one of them. */
  click(d: DOMStringMap): boolean;
}

export function createRaidPlanner(k: Kit, redraw: () => void, onAction: (a: Action) => void): Planner {
  const squad = new Set<string>();
  let objective: RaidObjective = 'smash';
  /** A win chance: one number on a scouted plot, the least and most it could be on one nobody has scouted. */
  type Odds = [number, number];
  const oddsMemo = new Map<string, Odds>();

  const oddsWord = (p: number) => (p < 0.25 ? 'Long shot' : p < 0.45 ? 'Risky' : p < 0.6 ? 'Coin flip' : p < 0.85 ? 'Good odds' : 'Sure thing');
  const pct = (p: number) => Math.round(p * 100);
  const chance = ([lo, hi]: Odds) => (pct(lo) === pct(hi) ? `${pct(lo)}%` : `${pct(lo)}–${pct(hi)}%`);
  // Unscouted, the needle sits at the worst case and the dial reads the range (spec: "40–85%").
  const dial = (r: Odds) => (pct(r[0]) === pct(r[1])
    ? `<span class="cl-dial" style="--v:${r[0].toFixed(3)}" title="${pct(r[0])}% to win"><i></i></span><b class="cl-odds">${oddsWord(r[0])}</b>`
    : `<span class="cl-dial" style="--v:${r[0].toFixed(3)}" title="Not scouted: ${pct(r[0])}% if kitted a size up, ${pct(r[1])}% a size down"><i></i></span><b class="cl-odds" data-testid="raid-odds-range">${chance(r)}</b>`);

  /** The squad is exactly these guards. */
  const holds = (ids: string[]) => ids.length === squad.size && ids.every((i) => squad.has(i));

  function picker(s: GameState) {
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    const fill = dexSquad(s); // "Take all": Dex fills it to the cap, leaving at home anyone a warned raid needs there
    return `<div class="cl-squad">${crew.map((g) => `<button class="cl-pick${squad.has(g.id) ? ' on' : ''}" data-action="squad" data-id="${g.id}" title="${k.esc(g.name)}: L${g.level}, ${WEAPONS[g.weapon].name}" aria-pressed="${squad.has(g.id)}">${guardFace(k, s, g)}</button>`).join('')}
      ${crew.length > 1 && fill.length ? `<button class="cl-b ghost tiny" data-action="squadAll" data-ids="${fill.join(',')}">${holds(fill) ? 'None' : 'Take all'}</button>` : ''}</div>`;
  }

  /** What a Lookout saw (fence, gadgets, henchmen), or the button to send one. While it's fresh the row shows the plot as
   * it stands now, as its odds and the plot card read it (the Corkboard keeps the snapshot): a sprung Slick, which the
   * odds leave out until its reset, shows as an empty slot marked sprung, as on the Defend sheet. */
  function intel(s: GameState, id: string) {
    const sc = scoutedSnapshot(s, id);
    if (sc) {
      const ps = s.plots[id];
      const armed = armedGadgets(ps);
      const now = { ...sc, tier: ps.defense.tier, gadgets: armed, garrison: Math.min(fitGarrison(s, id), postsFor(s, id)) };
      const sprung = ps.defense.gadgets.filter((g) => !armed.includes(g)).map((g) => `<span class="cl-slot" title="${GADGETS[g].name}: sprung">${k.GADGET_ART[g]()}</span>`).join('');
      return `<div class="cl-slots" title="${k.esc(snapshotTip(s, now))}">${now.tier ? `<span class="cl-slot full">${k.ART.fence(now.tier)}</span>` : ''}${now.gadgets.map((g) => `<span class="cl-slot full">${k.GADGET_ART[g]()}</span>`).join('')}${sprung}<span class="cl-slot full">${k.ART.head(2)}</span>${k.tape(`×${now.garrison}`)}</div>`;
    }
    const fly = flyOver(k, s, id); // Gull Flight: Captain Squawk circles it, any hour
    const unknown = `<div class="cl-slots" data-testid="raid-unscouted" title="Not scouted: its fence, gadgets and henchmen are a guess"><span class="cl-slot">?</span><span class="cl-slot">?</span><span class="cl-slot full">${k.ART.head(2)}</span>${k.tape('×?')}</div>`;
    const lookouts = s.guards.filter((g) => g.specialty === 'lookout');
    if (!lookouts.length) return `${unknown}<div class="cl-acts">${fly}</div>`;
    const free = freeLookout(s, id);
    const b = free ? canScout(s, free.id, id) : canScout(s, lookouts[0].id, id);
    const who = (free ?? lookouts[0]).name.split(' ')[0];
    // A disabled button carries its reason as the title, so the tip only goes on a live one.
    return `${unknown}<div class="cl-acts">${k.btn('scout', `${k.ART.tower()} Scout`, b, `data-plot="${id}" data-id="${(free ?? lookouts[0]).id}"${b.ok ? ` title="${k.esc(`${who} watches it today: its defenses show for 3 days`)}"` : ''}`, 'ghost')}${fly}</div>`;
  }

  /** The plot the Planner last opened on: opening it on another (or again once a raid is sent), Dex fills the squad to
   * the cap (swap anyone after), or the raid template that last went there fills the squad and the objective, so
   * repeating it is one tap. */
  let openFor: string | null = null;
  function open(s: GameState, id: string) {
    if (openFor === id) return;
    openFor = id;
    squad.clear();
    const t = templateAt(s, id);
    if (t) { for (const g of t.guards) squad.add(g); objective = t.objective; return; } // the panel drops anyone not free
    for (const g of dexSquad(s)) squad.add(g);
  }

  /** Raid templates (Rank 6, switch on): each a tap that fills the squad and objective, with a drop; then Save. */
  function templateRow(s: GameState, id: string, ids: string[], free: Set<string>) {
    if (!templatesOn(s)) return '';
    const now = templateFor(s, ids, objective);
    const name = (g: string) => s.guards.find((x) => x.id === g)?.name.split(' ')[0] ?? '';
    const chip = (t: RaidTemplate) => {
      const ready = t.guards.filter((g) => free.has(g)).length;
      const tip = `${t.guards.map(name).filter(Boolean).join(', ')}: ${t.objective}${t.target ? `, last at ${PLOT_BY_ID[t.target]?.name ?? t.target}` : ''}${ready < t.guards.length ? ` (${ready} of ${t.guards.length} free)` : ''}`;
      return k.btn('tplUse', k.esc(t.name), ready ? { ok: true } : { ok: false, why: 'Nobody in it is free' }, `data-ids="${t.guards.join(',')}" data-value="${t.objective}" data-testid="raid-template"${ready ? ` title="${k.esc(tip)}"` : ''}`, `tiny ${now === t ? 'go' : 'ghost'}`)
        + `<button class="cl-b tiny ghost" data-action="tplDrop" data-id="${t.id}" aria-label="Drop ${k.esc(t.name)}" title="Drop ${k.esc(t.name)}">${glyph('close')}</button>`;
    };
    const sv = canSaveTemplate(s, ids, objective);
    const save = k.locked(sv) ? '' : k.btn('tplSave', `${glyph('plus')}Save`, sv, `data-plot="${id}" data-testid="raid-template-save"${sv.ok ? ' title="Keep this squad and objective as a raid template"' : ''}`, 'tiny ghost');
    return `<div class="cl-acts" data-testid="raid-templates">${templates(s).map(chip).join('')}${save}</div>`;
  }

  /**
   * The objective step (spec: "Smash, Shakedown, Sabotage or HQ Assault. A locked one says why"): Smash and Shakedown
   * from Rank 3, Sabotage from 4 and HQ Assault from the owner's HQ rank (a rank lock stays hidden, rule 6). Any
   * other lock disables the button with its reason as the tip, except Sabotage's squad lock, which the squad fixes:
   * it stays pickable and the Planner says it in red. HQ Assault leads to the owner's HQ, where the assault is planned.
   */
  function objectives(s: GameState, id: string, ids: string[], stand: string, inMenu: boolean) {
    const sb = canSabotage(s, id, ids);
    const sabotage: Blocker = sb.ok || sb.why === SABOTAGE_NEEDS ? { ok: true } : sb;
    if (objective === 'sabotage' && !sabotage.ok) objective = 'smash';
    const pick = (v: RaidObjective, art: string, label: string, tip: string, b: Blocker = { ok: true }) =>
      k.btn('objective', `${art}${label}`, b, `data-value="${v}"${b.ok ? ` title="${k.esc(tip)}"` : ''}`, objective === v ? 'go' : 'ghost');
    const owner = s.plots[id].owner as RivalId, hq = hqPlot(owner);
    const hb = canAssault(s, owner, [availableRaiders(s)[0]?.id ?? '']); // the HQ's own locks: one free guard stands in for the squad
    // A link in the menu closes it on the HQ's card (inspect); on a card, the camera flies there too (goto).
    const storm = s.rank < HQS[owner].rank || k.locked(hb) ? '' : k.btn(inMenu ? 'inspect' : 'goto', `${k.ART.house()}HQ Assault`, hb, `data-plot="${hq.id}" data-testid="objective-hq"${hb.ok ? ` title="${k.esc(`Storm ${hq.name}: the Gate, the Yard, the Boss Room`)}"` : ''}`, 'ghost');
    return `<div class="cl-acts">${pick('smash', k.ART.boom(), 'Smash', `Wreck it. They rebuild ${Math.round(rebuildChance(s, id) * 100)}% of the time; if not, you get First Dibs.`)}${pick('shakedown', k.ART.moneyBag(), `Shakedown ${stand}`, 'Grab the till: about a day of its profit')}${k.locked(sb) ? '' : pick('sabotage', k.ART.sour(), 'Sabotage', `Spoil their stock: they sell nothing their next day. The stand stays up.${sb.ok ? '' : ` (${sb.why})`}`, sabotage)}${storm}</div>
      ${objective === 'sabotage' && !sb.ok ? `<span class="cl-note bad" data-testid="raid-objective-lock">${k.esc(sb.why)}</span>` : ''}`;
  }

  /** On a rival's HQ, its one objective: HQ Assault, three fights in a row, the squad carrying its HP door to door. */
  function stages(s: GameState, id: string) {
    const hq = HQS[s.plots[id].owner as RivalId];
    return `<div class="cl-acts"><b title="${k.esc(`Gate ${hq.gate.toLocaleString('en-US')} HP, the Yard, then ${hq.boss} and their "${hq.move}"`)}">${k.ART.house()}HQ Assault</b>
      <span class="cl-stages"><i>Gate</i>${glyph('arrow')}<i>Yard</i>${glyph('arrow')}<i>Boss</i></span></div>`;
  }

  function panel(s: GameState, id: string, inMenu = false) {
    if (s.rank < RAID_RANK) return '';
    open(s, id);
    const hq = PLOT_BY_ID[id].type === 'hq'; // a rival's HQ: HQ Assault is its one objective
    if (hq) objective = 'hq'; else if (objective === 'hq') objective = 'smash';
    const crew = availableRaiders(s);
    for (const g of [...squad]) if (!crew.some((c) => c.id === g)) squad.delete(g);
    if (!crew.length) return '<span class="cl-note">No guards free</span>';
    const ids = [...squad];
    const goals = hq ? stages(s, id) : objectives(s, id, ids, k.whole(shakedownLoot(s, id)), inMenu);
    const saved = hq ? '' : templateRow(s, id, ids, new Set(crew.map((g) => g.id)));
    const scouted = isScouted(s, id);
    const odds = (night: boolean): Odds => {
      const ps = s.plots[id];
      // Everything the odds read: the squad as it fights and where it sets out from, and the help the rival can send.
      const help = helpPlots(s, id).map((h) => [h.id, s.plots[h.id].garrison, s.plots[h.id].garrisonOut]);
      const key = JSON.stringify([s.day, s.phase === 'open', id, ids, objective, night, scouted, ps.stand?.level, ps.defense, ps.garrison, ps.garrisonOut, help,
        s.guards.map((g) => [g.id, g.weapon, g.gear, g.level, g.specialty, g.trait, g.club, g.post])]);
      let v = oddsMemo.get(key);
      if (v === undefined) {
        if (hq) { const one = hqOdds(s, ps.owner as RivalId, ids, night); v = [one, one]; } // its stages are known: one number
        else if (scouted) { const one = raidOdds(s, id, ids, objective, night); v = [one, one]; } else v = raidOddsRange(s, id, ids, objective, night);
        if (oddsMemo.size > 200) oddsMemo.clear();
        oddsMemo.set(key, v);
      }
      return v;
    };
    // The fight's minute decides, after this squad's walk there. Tonight's is night too, unless it's sent so late in the
    // night that it gets there after 07:00: then it waits for the stands to open, and it's a daytime raid.
    const nightNow = !foughtByDay(squadTrip(s, id, 'now', ids).at), nightLate = !foughtByDay(squadTrip(s, id, 'tonight', ids).at);
    const night = odds(nightLate), now = odds(nightNow);
    const stars = raidRepCost(s, ids, objective, nightNow), starsLate = raidRepCost(s, ids, objective, nightLate);
    const nowOffered = s.phase !== 'report' && s.phase !== 'night';
    const risk = nowOffered ? citationRisk(s, !nightNow) : null; // Sheriff Budd, below the line by day
    const riskLate = citationRisk(s, !nightLate); // only in the night phase: by day, Tonight leaves at 01:00
    const cite = risk ?? riskLate;
    const ban = raidBan(s);
    const can = canRaid(s, id, ids, objective);
    // A disabled button carries its reason as the title, so the odds tip only goes on a live one.
    const tip = (t: string) => (can.ok ? ` title="${t}"` : '');
    return `<div class="cl-planner" data-testid="raid-planner">
      ${saved}
      ${goals}
      ${hq ? '' : intel(s, id)}
      ${picker(s)}
      ${ids.length ? `<div class="cl-oddsrow">${dial(night)}</div>` : ''}
      ${tripNote(s, id, ids)}
      ${inTruce(s, s.plots[id].owner as RivalId) ? '<span class="cl-note bad" title="Raiding breaks it: −1 star, and every rival holds a grudge">Breaks your truce!</span>' : ''}
      ${!can.ok && /^Get a Foothold/.test(can.why) ? `<span class="cl-note bad" data-testid="raid-foothold" title="Raids go only where you hold a plot: buy one in its district">${k.esc(can.why)}</span>` : ''}
      ${hq && !can.ok && !ban && !/^(Pick|Squad cap|Already)/.test(can.why) ? `<span class="cl-note bad" data-testid="raid-hq-lock">${k.esc(can.why)}</span>` : ''}
      ${ban ? `<span class="cl-note bad" data-testid="raid-ban" title="Sheriff Budd's Citation: no raids or HQ assaults till then">${k.esc(ban.why)}</span>` : ''}
      ${cite && !ban ? `<span class="cl-note bad" data-testid="raid-citation" title="${k.esc(`Under ${cite.stars} stars, Sheriff Budd cites every daytime raid: about a day's sales, and no raids or HQ assaults for ${cite.banDays} days. Night raids never are.`)}">${risk ? 'Now earns a Citation:' : 'Lands by day: Citation'} ${k.whole(cite.fine)}, ${cite.banDays}-day ban</span>` : ''}
      <div class="cl-acts">${k.btn('raid', `${k.ART.moon()} Tonight${starsLate ? ` <span class="bad">−${starsLate}${glyph('star')}</span>` : ''}`, can, `data-plot="${id}" data-when="tonight" data-testid="raid-tonight"${tip(`${chance(night)} to win${nightLate ? '' : `; it lands after 7am, by day${starsLate ? `: −${starsLate} star` : ''}`}${riskLate ? `; Sheriff Budd's Citation: ${k.whole(riskLate.fine)} and no raids for ${riskLate.banDays} days` : ''}`)}`, 'go')}
      ${!nowOffered ? '' : k.btn('raid', `Now${stars ? ` <span class="bad">−${stars}${glyph('star')}</span>` : ''}`, can, `data-plot="${id}" data-when="now" data-testid="${hq ? 'assault' : 'raid-now'}"${tip(`${chance(now)} to win now${stars ? `; customers see it: −${stars} star` : nightNow ? ': it lands after dark, so no Reputation cost' : ': Gentle Giants alone, so no Reputation cost'}${risk ? `; Sheriff Budd's Citation: ${k.whole(risk.fine)} and no raids for ${risk.banDays} days` : ''}`)}`)}</div></div>`;
  }

  function click(d: DOMStringMap) {
    switch (d.action) {
      case 'squad': if (squad.has(d.id!)) squad.delete(d.id!); else squad.add(d.id!); redraw(); return true;
      case 'squadAll': { const ids = (d.ids ?? '').split(',').filter(Boolean); const same = holds(ids); squad.clear(); if (!same) for (const i of ids) squad.add(i); redraw(); return true; } // Dex's squad, or nobody
      case 'objective': objective = d.value as RaidObjective; redraw(); return true;
      case 'raid': onAction({ type: 'raid', plot: d.plot!, guards: [...squad], objective, when: d.when as 'now' | 'tonight' }); squad.clear(); openFor = null; return true; // opened next, Dex (or a template) fills it again
      case 'scout': squad.delete(d.id!); onAction({ type: 'scout', id: d.id!, plot: d.plot! }); return true;
      case 'gullTo': onAction({ type: 'gullTo', plot: d.plot! }); return true;
      case 'tplUse': squad.clear(); for (const g of (d.ids ?? '').split(',').filter(Boolean)) squad.add(g); objective = d.value as RaidObjective; redraw(); return true; // the panel drops anyone not free
      case 'tplSave': onAction({ type: 'template', op: 'save', plot: d.plot, guards: [...squad], objective }); return true;
      case 'tplDrop': onAction({ type: 'template', op: 'drop', id: d.id }); return true;
      case 'tplSwitch': onAction({ type: 'template', op: 'switch' }); return true;
    }
    return false;
  }

  return { squad, panel, picker, click };
}
