// The Defend sheet (spec: Defenses and Crew): the plot's fence and gadget slots,
// then the crew as faces with their posts and kit, and the Hiring Hall.
// Mounted from hud.ts, drawn with its clay kit.
import {
  canBuyGadget, canBuyPerimeter, canEquip, canHire, fenceRepairCost, GADGET_SLOTS,
  GADGETS, GEAR, GUARD_LEVEL_TITLES, guardReady, guardTitle, guardWage, HIRE_RANK, PERIMETERS, PLOT_BY_ID, PLOTS, rosterCap, WEAPONS, xpToNext,
  canPromote, detectionChance, freeAlarm, holdsStronghold, neighborhoodWatch, PROMOTE_LEVEL, SPECIALTIES, towerFor,
  type GadgetId, type GameState, type GearId, type Guard, type Specialty, type WeaponId,
} from '../sim/economy.ts';
import { taught } from '../sim/story.ts';
import { damageCard } from './damage.ts';
import type { Kit } from './hud.ts';
import { nextClubhouse, type ClubKit } from './clubhouse.ts';

/** Each specialty's badge: a watchtower for the Lookout, a boom for the Wrecker, a star for the Captain. */
const SPECIALTY_ART: Record<Specialty, (k: Kit) => string> = { lookout: (k) => k.ART.tower(), wrecker: (k) => k.ART.boom(), captain: (k) => k.ART.star(true) };

/** A guard's face: their weapon in hand, their specialty's badge, a bandage while they're Out. */
export function guardFace(k: Kit, s: GameState, g: Guard): string {
  const out = !guardReady(s, g);
  const badge = out ? k.ART.bandage() : g.specialty ? SPECIALTY_ART[g.specialty](k) : '';
  return `<span class="cl-face${out ? ' out' : ''}">${k.ART.face(g.face === undefined ? g.id : `f${g.face}`)}${badge ? `<span class="cl-band">${badge}</span>` : ''}<span class="cl-wpn">${k.WEAPON_ART[g.weapon]()}</span></span>`;
}

/** Promotion buttons for a Level 3+ guard without a specialty (Rank-locked ones stay hidden). */
function promoteButtons(k: Kit, s: GameState, g: Guard): string {
  if (g.specialty || g.level < PROMOTE_LEVEL) return '';
  return (Object.keys(SPECIALTIES) as Specialty[]).map((sp) => ({ sp, b: canPromote(s, g.id, sp) })).filter(({ b }) => !k.locked(b))
    .map(({ sp, b }) => `<button class="cl-b tiny" data-action="promote" data-id="${g.id}" data-value="${sp}" ${b.ok ? '' : 'disabled'} title="Make ${k.esc(g.name.split(' ')[0])} the ${SPECIALTIES[sp].name}: ${k.esc(SPECIALTIES[sp].text)}${b.ok ? '' : ` (${k.esc(b.why)})`}">${SPECIALTY_ART[sp](k)}</button>`).join('');
}

/** The clay kit as the Clubhouse panels (src/ui/clubhouse.ts) take it: with the guards' faces. */
export const clubKit = (k: Kit): ClubKit => ({ ...k, face: (s, g) => guardFace(k, s, g) });

/** The fence, the gadget slots and the gadget shop for one plot. */
export function defenseSheet(k: Kit, s: GameState, id: string): string {
  const ps = s.plots[id];
  const cur = ps.defense.tier ? PERIMETERS[ps.defense.tier - 1] : null;
  const next = PERIMETERS[ps.defense.tier];
  const slots = GADGET_SLOTS(ps.stand?.level ?? 1);
  const pb = canBuyPerimeter(s, id);
  const out: string[] = [];
  out.push(damageCard(s, id)); // the stand itself: its HP, and the repair once it's Damaged (src/ui/damage.ts)
  if (cur) out.push(k.card(k.ART.fence(ps.defense.tier), cur.name, cur ? k.meter(ps.defense.fenceHp / cur.hp, 'hp') : '',
    (fenceRepairCost(ps) ? k.btn('repairFence', `Patch ${k.whole(fenceRepairCost(ps))}`, { ok: true }, `data-plot="${id}"`) : ''),
    `${cur.name}: ${ps.defense.fenceHp}/${cur.hp} HP. Defenders hit ${cur.tier === 5 ? 50 : 25}% harder while it stands. Each raid costs ${k.whole(cur.repair)} to repair overnight.`));
  if (next && !k.locked(pb)) out.push(k.card(k.ART.fence(next.tier), next.name, `${next.hp} HP`, k.btn('perimeter', k.whole(next.cost), pb, `data-plot="${id}" data-testid="perimeter"`, 'go'), `${next.hp} HP${next.breachDps ? ', hurts attackers breaking through' : ''}${next.slow ? ', slows them down' : ''}`));
  const installed = ps.defense.gadgets.map((g) => (g === 'slick' && ps.defense.slickSprung
    ? `<span class="cl-slot" title="${GADGETS[g].name}: sprung. Re-laid overnight for ${k.whole(GADGETS[g].reset ?? 0)}">${k.GADGET_ART[g]()}</span>`
    : `<span class="cl-slot full" title="${GADGETS[g].name}: ${k.esc(GADGETS[g].text)}">${k.GADGET_ART[g]()}</span>`)).join('');
  const free = Array.from({ length: Math.max(0, slots - ps.defense.gadgets.length) }, () => '<span class="cl-slot">+</span>').join('');
  const shop = (Object.keys(GADGETS) as GadgetId[]).filter((g) => !ps.defense.gadgets.includes(g)).map((g) => ({ g, b: canBuyGadget(s, id, g) })).filter(({ b }) => !k.locked(b))
    .map(({ g, b }) => `<button class="cl-gadget" data-action="gadget" data-plot="${id}" data-id="${g}" ${b.ok ? '' : `disabled`} title="${GADGETS[g].name}: ${k.esc(GADGETS[g].text)}${b.ok ? '' : ` (${k.esc(b.why)})`}">${k.GADGET_ART[g]()}${k.tape(k.whole(GADGETS[g].cost))}</button>`).join('');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const night = detectionChance(s, id, true), day = detectionChance(s, id, false);
  const perks = [neighborhoodWatch(s) ? 'Neighborhood Watch' : '', holdsStronghold(s, PLOT_BY_ID[id].district) ? 'Stronghold' : ''].filter(Boolean);
  const seen = `<span title="Spots ${pct(night)} of night raids here, ${pct(day)} by day${perks.length ? ` (${perks.join(', ')})` : ''}">${k.meter(night)}</span>`;
  const watch = freeAlarm(s, id) ? `<span class="cl-slot full" title="Neighborhood Watch: a free ${GADGETS.alarm.name} (+15% detection, no slot used)">${k.GADGET_ART.alarm()}</span>` : '';
  const tower = towerFor(s, id);
  const seenFrom = tower && tower !== id ? `<span class="cl-slot full" title="The ${GADGETS.watchtower.name} at ${k.esc(PLOT_BY_ID[tower].name)} watches this plot too (+30%, no slot used)">${k.GADGET_ART.watchtower()}</span>` : '';
  return `<div class="cl-cards">${out.join('')}</div><div class="cl-slots"><span class="cl-label">Gadgets</span>${seen}${watch}${seenFrom}${installed}${free}${ps.defense.gadgets.length < slots ? `<span class="cl-shop">${shop}</span>` : ''}</div>`;
}

function guardRow(k: Kit, s: GameState, g: Guard): string {
  const stands = PLOTS.filter((p) => s.plots[p.id].owner === 'player' && (s.plots[p.id].stand || s.plots[p.id].facility));
  const i = g.post ? stands.findIndex((p) => p.id === g.post) : -1;
  const nextPost = stands[(i + 1) % stands.length];
  const nextWeapon = (['clubs', 'hatchets'] as WeaponId[]).find((w) => WEAPONS[w].hit > WEAPONS[g.weapon].hit);
  const nextGear = (['vest', 'pro'] as GearId[]).find((x) => GEAR[x].hp > GEAR[g.gear].hp);
  const wb = nextWeapon ? canEquip(s, g.id, nextWeapon) : null, gb = nextGear ? canEquip(s, g.id, nextGear) : null;
  const xp = xpToNext(g);
  const tip = `${g.name}: L${g.level} ${guardTitle(g)}${g.specialty ? ` ${SPECIALTIES[g.specialty].name}` : ''}, ${g.trait}, ${WEAPONS[g.weapon].name}${g.gear !== 'none' ? ', ' + GEAR[g.gear].name : ''}, ${k.whole(guardWage(g))}/day${guardReady(s, g) ? '' : `, knocked out till day ${g.outUntil}`}${g.level < 5 ? `. ${Math.round(xp.progress * 100)}% of the way to ${GUARD_LEVEL_TITLES[g.level]}` : ''}`;
  return `<div class="cl-guard" data-testid="guard" title="${k.esc(tip)}">${guardFace(k, s, g)}
      <span class="cl-name">${k.esc(g.name.split(' ')[0])}</span>${k.pips(g.level, 5)}
      <span class="cl-acts">
        <button class="cl-b ghost tiny" data-action="post" data-id="${g.id}" data-plot="${nextPost?.id ?? ''}" title="Posted at ${g.post ? k.esc(PLOT_BY_ID[g.post].name) : 'the Clubhouse'}: tap to move">📍</button>
        ${nextWeapon && wb && !k.locked(wb) ? `<button class="cl-b tiny" data-action="equip" data-id="${g.id}" data-item="${nextWeapon}" ${wb.ok ? '' : 'disabled'} title="${WEAPONS[nextWeapon].name} for ${k.whole(WEAPONS[nextWeapon].cost)}${wb.ok ? '' : ` (${k.esc(wb.why)})`}">${k.WEAPON_ART[nextWeapon]()}</button>` : ''}
        ${nextGear && gb && !k.locked(gb) ? `<button class="cl-b tiny" data-action="equip" data-id="${g.id}" data-item="${nextGear}" ${gb.ok ? '' : 'disabled'} title="${GEAR[nextGear].name} for ${k.whole(GEAR[nextGear].cost)}${gb.ok ? '' : ` (${k.esc(gb.why)})`}">${k.ART.shield()}</button>` : ''}
        ${promoteButtons(k, s, g)}
        ${g.name === 'Dex Moody' ? '' : `<button class="cl-b ghost tiny" data-action="fire" data-id="${g.id}" title="Let ${k.esc(g.name)} go">✕</button>`}
      </span></div>`;
}

/** The roster, the Hiring Hall and (when beds run short) the next Clubhouse. */
export function crewPanel(k: Kit, s: GameState): string {
  if (!s.guards.length && (s.rank < HIRE_RANK || !taught(s, 'crew'))) return '';
  const recruits = s.recruits.map((g) => { const b = canHire(s, g.id); return `<div class="cl-guard recruit" title="${k.esc(g.name)}: L${g.level} ${guardTitle(g)}, ${g.trait}, ${k.whole(guardWage(g))}/day">${guardFace(k, s, g)}<span class="cl-name">${k.esc(g.name.split(' ')[0])}</span>${k.pips(g.level, 5)}${k.btn('hire', k.whole(g.fee), b, `data-id="${g.id}" data-testid="hire"`, 'go')}</div>`; }).join('');
  return `<div class="cl-crew"><span class="cl-label">Crew ${s.guards.length}/${rosterCap(s)}</span><div class="cl-faces">${s.guards.map((g) => guardRow(k, s, g)).join('')}</div>
      ${recruits ? `<span class="cl-label">Hiring Hall</span><div class="cl-faces">${recruits}</div>` : ''}
      ${nextClubhouse(clubKit(k), s)}</div>`;
}

/** The whole Defend sheet for the selected plot. */
export function crewSheet(k: Kit, s: GameState, plotId: string): string {
  return defenseSheet(k, s, plotId) + crewPanel(k, s);
}
