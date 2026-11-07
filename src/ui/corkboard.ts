// The Rivals Corkboard (spec: Rivals, "The Rivals Corkboard pins each boss's
// likeliest target, so fortifying is a choice, not a guess"; one of the ten
// paper menus). A photo of each surviving boss, ranked by Success Score, with
// the stand of yours they'd raid next (the AI's own rule), a Weakened stamp,
// their Grudge strings, whether they're broke, what they want and any Truce.
// The paper menus (menus.ts) put the board on their sheet, with its key, its
// Threat meter and Done. Tapping a plot flies there and puts the board away,
// like any menu's list (data-action="inspect"): yours to fortify, theirs for
// the Raid Planner, their HQ for a Sit-down.
import {
  budgetOf, FACTIONS, GRUDGE, grudgeToward, HQS, inTruce, isWeakened, likeliestTarget, PLOTS, RAID_PARTY, RAID_RANK, raidCost, softSpot,
  successScore, threatLevel, type FactionId, type GameState, type Plot, type RivalId,
} from '../sim/economy.ts';
import * as A from './clay.ts';
import { pactPhoto, pactStrings } from './pactboard.ts';

const RIVALS = Object.keys(FACTIONS) as RivalId[];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const btn = (label: string, extra: string, tip: string) =>
  `<button class="cl-b tiny" data-action="inspect" ${extra} title="${esc(tip)}">${esc(label)}</button>`;
const pips = (n: number, of: number) => `<span class="cl-pips">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const short$ = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

/** Names for a pin's one line. */
const BOSS: Record<RivalId, string> = { sourwood: 'Vera', hollis: 'Big Tilly', fizzco: 'Preston', coldbrew: 'Juni', blenders: 'Brock' };
const GANG: Record<FactionId, string> = { player: "Lottie's", sourwood: 'Sourwoods', hollis: 'Hollis', fizzco: 'FizzCo', coldbrew: 'Cold Brew', blenders: 'Blenders' };
/** What each boss wants (spec: The five bosses, Motive). */
const WANTS: Record<RivalId, string> = {
  blenders: 'Wants his record back',
  coldbrew: 'Keeping the Grindhouse open',
  hollis: 'Keeping the family land whole',
  fizzco: 'The Bay, for his five-year plan',
  sourwood: 'Control of the Pact',
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
    .map(({ f, g }) => `<span class="cl-note" title="${esc(`${BOSS[id]}'s Grudge toward ${GANG[f]}: ${Math.round(g)}`)}">${esc(GANG[f])}</span>${pips(Math.min(5, Math.round(g / PIP)), 5)}`);
  return out.length ? `<span class="cl-row wrap" data-testid="cork-strings">${out.join('')}</span>` : '';
}

const hqOf = (s: GameState, id: RivalId): Plot | undefined => PLOTS.find((p) => p.type === 'hq' && s.plots[p.id].owner === id);

/** One boss's photo: score, motive, stamps, strings, and the plots to tap. */
function pin(s: GameState, id: RivalId): string {
  const eye = likeliestTarget(s, id);
  const soft = s.rank >= RAID_RANK ? softSpot(s, id) : null; // the Raid Planner opens at Rank 3
  const hq = hqOf(s, id);
  const truce = inTruce(s, id) ? s.rivals[id].truceUntil : 0;
  const tags = [
    isWeakened(s, id) ? '<span class="cl-note bad" data-testid="cork-weakened">WEAKENED</span>' : '',
    truce ? `<span class="cl-note">Truce to Day ${truce}</span>` : '',
    broke(s, id) ? '<span class="cl-note">Broke</span>' : '',
  ].join('');
  const acts = [
    eye ? btn(`Eyeing ${eye.name}`, `data-plot="${eye.id}" data-testid="cork-target"`, `${BOSS[id]}'s likeliest raid target: your weakest valuable stand near their turf. Go fortify it.`) : '',
    soft ? btn(`Raid ${soft.name}`, `data-plot="${soft.id}"`, `Their weakest valuable stand: plan a raid on it`) : '',
    hq ? btn('Their HQ', `data-plot="${hq.id}"`, `${hq.name}: Sit-downs and the HQ assault`) : '',
  ].join('');
  return `<div class="cl-card" data-big data-testid="cork-${id}" title="${esc(`${HQS[id].boss}, ${FACTIONS[id].name}`)}">
    <span class="cl-pic">${A.faceSVG(HQS[id].boss)}</span>
    <span class="cl-txt"><b>${esc(BOSS[id])} · ${esc(GANG[id])}</b><i>Score ${short$(successScore(s, id))} · ${esc(WANTS[id])}</i>
      ${tags ? `<span class="cl-row wrap">${tags}</span>` : ''}${strings(s, id)}</span>
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
