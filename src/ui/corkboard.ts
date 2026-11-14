// The Rivals Corkboard (spec: Rivals, "The Rivals Corkboard pins each boss's
// likeliest target, so fortifying is a choice, not a guess"; one of the ten
// paper menus). A photo of each surviving boss, ranked by Success Score, with
// the stand of yours they'd raid next (the AI's own rule), a Weakened stamp,
// their Grudge strings, whether they're broke, what they want and any Truce.
// The paper menus (menus.ts) put the board on their sheet, with its key, its
// Threat meter and Done. Tapping a plot flies there and puts the board away,
// like any menu's list (data-action="inspect"): yours to fortify, theirs for
// the Raid Planner, their HQ for a Sit-down (an Out-of-Towner, with no HQ in
// the Bay, sits down at its busiest stand). What your scouts saw on a boss's
// plots, a Lookout's day out or a Gull Flight overhead, is pinned to their photo
// while it's fresh (crew's scouting.ts keeps the snapshot). A Peaceful Sandbox
// has no raids or HQ assaults, so its board pins no targets or snapshots: it
// notes each boss's running scheme instead (their marketing stands in for
// their raids).
import { BOSS_PORTRAIT, faceImg } from './portraits.ts';
import {
  budgetOf, FACTIONS, GADGETS, GRUDGE, grudgeToward, HQS, inTruce, isWeakened, likeliestTarget, peaceful, PERIMETERS, PLOTS, RAID_PARTY, RAID_RANK, raidCost,
  rivalStars, runningSchemes, softSpot, successScore, threatLevel, type FactionId, type GameState, type Plot, type RivalId, type SchemeKind,
} from '../sim/economy.ts';
import { scoutedSnapshot } from '../sim/scouting.ts';
import * as A from './clay.ts';
import { pactPhoto, pactStrings, yarn } from './pactboard.ts';
import { scoutedPins } from './gull.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const btn = (label: string, extra: string, tip: string) =>
  `<button class="cl-b tiny" data-action="inspect" ${extra} title="${esc(tip)}">${esc(label)}</button>`;
const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const short$ = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

/** Names for a pin's one line. */
const BOSS: Record<RivalId, string> = { sourwood: 'Vera', hollis: 'Big Tilly', fizzco: 'Preston', coldbrew: 'Juni', blenders: 'Brock', snootwater: 'Sterling' };
const GANG: Record<FactionId, string> = { player: "Lottie's", sourwood: 'Sourwoods', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'Blenders', snootwater: 'Snootwater' };
/** What each boss wants (spec: The five bosses, Motive). */
const WANTS: Record<RivalId, string> = {
  blenders: 'Wants his record back',
  coldbrew: 'Keeping the Grindhouse open',
  hollis: 'Keeping the family land whole',
  fizzco: 'The Bay, for his five-year plan',
  sourwood: 'Control of the Pact',
  snootwater: 'Your thinnest district, bottled',
};
/** In Peaceful, each boss's running scheme on their photo, where the raid pins would be. */
const SCHEMING: Record<SchemeKind, string> = {
  priceWar: 'Price war', posters: 'Posters', snipe: 'Outbidding you', blitz: 'Ad blitz', cease: 'Cease-and-Desist',
  buyout: 'Buyout offer', fine: "Mayor's fine", freeze: 'Sale frozen', spoil: 'Night Shift',
};
/** Grudge per pip of red string: five pips is a feud. */
const PIP = GRUDGE.feud / 5;

/** Broke: Strike can't pay for even a small raid on you tonight. */
export const broke = (s: GameState, id: RivalId) => budgetOf(s, id).strike < raidCost(s, id, RAID_PARTY[threatLevel(s) - 1].size[0]);

/** Red string from this boss to each faction they hold a Grudge against, thicker (more pips) with more Grudge. */
function strings(s: GameState, id: RivalId): string {
  const pact = pactStrings(s, id, BOSS[id]); if (pact !== null) return pact; // nights: once the Pact stands, every string ties to your photo (pactboard.ts)
  const at: FactionId[] = ['player', ...RIVALS.filter((r) => r !== id && s.rivals[r].alive)];
  const out = at.map((f) => ({ f, g: grudgeToward(s, id, f) })).filter((x) => x.g >= PIP / 2)
    .map(({ f, g }) => `${yarn(Math.round(g / PIP))}${f === 'player' ? '' : faceImg(BOSS_PORTRAIT[f], 'cl-yarn-face')}<span class="cl-note" title="${esc(`${BOSS[id]}'s Grudge toward ${GANG[f]}: ${Math.round(g)}`)}">${esc(GANG[f])}</span>${pips(Math.min(5, Math.round(g / PIP)), 5)}`);
  return out.length ? `<span class="cl-row wrap" data-testid="cork-strings">${out.join('')}</span>` : '';
}

/** How many snapshots one photo holds: the newest. */
const SNAPSHOTS = 3;
/** The snapshots pinned to a boss's photo: each of their plots your scouts saw while it's fresh, newest first. */
function snapshots(s: GameState, id: RivalId): string {
  const shots = PLOTS.filter((p) => s.plots[p.id].owner === id).flatMap((p) => {
    const sc = scoutedSnapshot(s, p.id);
    return sc ? [{ p, sc }] : [];
  });
  shots.sort((a, b) => b.sc.day - a.sc.day || a.p.name.localeCompare(b.p.name));
  return shots.slice(0, SNAPSHOTS).map(({ p, sc }) => {
    const left = sc.until - s.day + 1;
    const saw = `${sc.tier ? PERIMETERS[sc.tier - 1].name : 'no fence'}, ${sc.gadgets.map((g) => GADGETS[g].name).join(', ') || 'no gadgets'}, ${sc.garrison} henchmen`;
    const by = sc.by === 'gull' ? 'From Gull Flight' : 'Your Lookout saw';
    return btn(`Scouted ${p.name}`, `data-plot="${p.id}" data-testid="cork-snapshot"`, `${by}: ${saw}. Good for ${left} more day${left === 1 ? '' : 's'}.`);
  }).join('');
}

const hqOf = (s: GameState, id: RivalId): Plot | undefined => PLOTS.find((p) => p.type === 'hq' && s.plots[p.id].owner === id);
/** Where an Out-of-Towner sits down (no HQ in the Bay): its busiest stand. */
const tableOf = (s: GameState, id: RivalId): Plot | undefined =>
  FACTIONS[id].outOfTown ? PLOTS.filter((p) => s.plots[p.id].owner === id && s.plots[p.id].stand).sort((a, b) => b.baseTraffic - a.baseTraffic)[0] : undefined;

/** One boss's photo: score, motive, stamps, strings, and the plots to tap. */
function pin(s: GameState, id: RivalId): string {
  const calm = peaceful(s); // no raids for anyone: nothing to fortify or plan
  const eye = calm ? null : likeliestTarget(s, id);
  const soft = !calm && s.rank >= RAID_RANK ? softSpot(s, id) : null; // the Raid Planner opens at Rank 3
  const hq = hqOf(s, id), table = tableOf(s, id);
  const truce = inTruce(s, id) ? s.rivals[id].truceUntil : 0;
  const scheming = calm ? [...new Set(runningSchemes(s).filter((x) => x.by === id).map((x) => x.kind))] : [];
  const tags = [
    `<span class="cl-note" data-testid="cork-stars" title="${esc(`Reputation ${rivalStars(s, id).toFixed(2)} stars: their stands' appeal, ×0.7 at 1 star to ×1.3 at 5`)}">${A.starPips(rivalStars(s, id))}</span>`, // demand: rival Reputation
    isWeakened(s, id) ? '<span class="cl-note bad" data-testid="cork-weakened">WEAKENED</span>' : '',
    truce ? `<span class="cl-note">Truce to Day ${truce}</span>` : '',
    !calm && broke(s, id) ? '<span class="cl-note">Broke</span>' : '',
    ...scheming.map((k) => `<span class="cl-note bad" data-testid="cork-scheme">${esc(SCHEMING[k])}</span>`),
  ].join('');
  const acts = [
    eye ? btn(`Eyeing ${eye.name}`, `data-plot="${eye.id}" data-testid="cork-target"`, `${BOSS[id]}'s likeliest raid target: your weakest valuable stand near their turf. Go fortify it.`) : '',
    soft ? btn(`Raid ${soft.name}`, `data-plot="${soft.id}"`, `Their weakest valuable stand: plan a raid on it`) : '',
    calm ? '' : snapshots(s, id),
    hq ? btn('Their HQ', `data-plot="${hq.id}"`, calm ? `${hq.name}: Sit-downs` : `${hq.name}: Sit-downs and the HQ assault`) : '',
    table ? btn('Sit down', `data-plot="${table.id}"`, `No HQ in the Bay: the Truce and the Faction Buyout are at ${table.name}`) : '',
  ].join('');
  return `<div class="cl-card" data-big data-testid="cork-${id}" title="${esc(`${HQS[id].boss}, ${FACTIONS[id].name}`)}">
    <span class="cl-pic cl-pinphoto" style="--side:#${FACTIONS[id].color.toString(16).padStart(6, '0')}">${faceImg(BOSS_PORTRAIT[id])}</span>
    <span class="cl-txt"><b>${esc(BOSS[id])} · ${esc(GANG[id])}</b><i>Score ${short$(successScore(s, id))} · ${esc(WANTS[id])}</i>
      ${tags ? `<span class="cl-row wrap">${tags}</span>` : ''}${strings(s, id)}${scoutedPins(s, id) /* crew: scouted snapshots (src/ui/gull.ts) */}</span>
    <span class="cl-acts">${acts}</span></div>`;
}

/** The surviving bosses, highest Success Score first: who you're about to pass. */
export const boardOrder = (s: GameState) => RIVALS.filter((id) => s.rivals[id].alive).sort((a, b) => successScore(s, b) - successScore(s, a) || a.localeCompare(b));

/** The board, for the paper menus' Rivals Corkboard sheet: your score to measure them by, then the pins. */
export function corkboardBody(s: GameState): string {
  const bosses = boardOrder(s);
  const board = bosses.length ? `<div class="cl-cards">${bosses.map((id) => pin(s, id)).join('')}</div>` : '<span class="cl-note">Every rival is out of business</span>';
  return `<span class="cl-label">Your score ${short$(successScore(s))}</span>
    ${pactPhoto(s)}${board}`;
}
