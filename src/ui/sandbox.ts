// Sandbox setup (spec: Sandbox: Turf War, "Your map size, rivals, difficulty and win condition"): the map size and
// the rivals that play, on the New Game screen. Small and Medium are cut from Citrine Bay around Maple Row and each
// picked rival's home district (src/sim/map.ts cutMap); Large is the whole bay with all five. hud.ts draws it inside
// the setup screen, and its clicks go through hud's one listener (data-action="pick", data-key "map" or "rival").
import { BOSS_PORTRAIT, faceImg } from './portraits.ts';
import { DISTRICT_BY_ID, DISTRICTS, FACTIONS, MAP_SIZES, cutMap, picksFit, type DistrictId, type MapSize, type RivalId, type Settings } from '../sim/economy.ts';
import { BOSS_ORDER } from './story.ts';
import { glyph } from './clay.ts';
import type { ScoreEntry } from '../save.ts';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const SIZES = Object.keys(MAP_SIZES) as MapSize[];
const SHORT: Record<RivalId, string> = { blenders: 'Brock', coldbrew: 'Juni', hollis: 'Tilly', fizzco: 'Preston', sourwood: 'Vera', snootwater: 'Sterling' };
/** Each boss's clay head in the gang colour, drawn once so redraws compare equal. */

/** The size a New Game will play (unset: Large, the whole bay). */
export const setupSize = (st: Settings): MapSize => (st.map && st.map in MAP_SIZES ? st.map : 'large');
/** The rivals a New Game will play, oldest pick first: the ones chosen if they fit the size, else the size's own picks. */
export function setupRivals(st: Settings): RivalId[] {
  const size = setupSize(st);
  return st.rivals && picksFit(size, st.rivals) ? st.rivals : [...MAP_SIZES[size].picks];
}

/** A new size keeps the latest picks that still fit it, then tops up with the size's own picks (from Large, where all
 * five play, it starts from the size's picks). */
function keepPicks(size: MapSize, prev: readonly RivalId[]): RivalId[] {
  const n = MAP_SIZES[size].rivals;
  const out: RivalId[] = [];
  const latest = prev.length < MAP_SIZES.large.rivals ? [...prev].reverse() : [];
  for (const r of new Set([...latest, ...MAP_SIZES[size].picks, ...BOSS_ORDER])) if (out.length < n && cutMap(size, [...out, r])) out.push(r);
  return picksFit(size, out) ? out.reverse() : [...MAP_SIZES[size].picks];
}

/** Tapping a rival who isn't in swaps out the oldest pick it can share the map with; null when it can't join. */
function swapIn(st: Settings, r: RivalId): RivalId[] | null {
  const size = setupSize(st), picks = setupRivals(st);
  if (picks.includes(r)) return null;
  for (let i = 0; i < picks.length; i++) {
    const next = [...picks.slice(0, i), ...picks.slice(i + 1), r];
    if (picksFit(size, next)) return next;
  }
  return null;
}

/** hud.ts's 'pick' handler: a map size or a rival. Always a fresh array, since the screen's settings share the live run's. */
export function pickSandbox(st: Settings, key: string, value: string | undefined): void {
  if (key === 'map' && value && value in MAP_SIZES) {
    st.rivals = keepPicks(value as MapSize, setupRivals(st));
    st.map = value as MapSize;
  }
  if (key === 'rival' && value && value in FACTIONS) st.rivals = swapIn(st, value as RivalId) ?? setupRivals(st);
}

/** The map row (Small, Medium, Large) and, below Large, the bosses to pick from: the picked ones lit. */
export function sandboxPanel(st: Settings): string {
  const size = setupSize(st), picks = setupRivals(st);
  const where = (cutMap(size, picks)?.districts ?? DISTRICTS.map((d) => d.id)).map((d) => DISTRICT_BY_ID[d].name).join(', ');
  const sizes = SIZES.map((m) => {
    const tip = `${MAP_SIZES[m].districts} districts, ${MAP_SIZES[m].rivals} rivals${m === size ? `\n${where}` : ''}`;
    return `<button class="cl-b tiny ${m === size ? 'go' : 'ghost'}" data-action="pick" data-key="map" data-value="${m}" data-testid="map-${m}" title="${esc(tip)}">${MAP_SIZES[m].label}</button>`;
  }).join('');
  const bosses = size === 'large' ? '' : `<div class="cl-row wrap" data-testid="rival-picks">${BOSS_ORDER.map((r) => {
    const on = picks.includes(r), can = on || !!swapIn(st, r);
    const tip = `${FACTIONS[r].name}, from ${DISTRICT_BY_ID[FACTIONS[r].home as DistrictId].name}${can ? '' : `\nWon't fit a ${MAP_SIZES[size].label} map with these rivals`}`;
    return `<button class="cl-diff${on ? ' on' : ''}" data-action="pick" data-key="rival" data-value="${r}" data-testid="rival-${r}" aria-pressed="${on}" title="${esc(tip)}"${can ? '' : ' disabled'}><span>${faceImg(BOSS_PORTRAIT[r])}</span>${SHORT[r]}</button>`;
  }).join('')}</div>`;
  return `<div class="cl-row wrap" data-testid="map-size"><span class="cl-label">Map</span>${sizes}</div>${bosses}`;
}

/** A leaderboard row's land tags: a Sandbox map smaller than the bay (" · Small", its rivals in the tooltip) and the
 * Every Last Plot star. Nothing for a plain run. */
export function scoreTag(e: ScoreEntry): string {
  const who = (e.rivals ?? []).filter((r) => r in FACTIONS).map((r) => SHORT[r]).join(', ');
  const map = e.map && e.map !== 'large' && e.map in MAP_SIZES ? ` · <span${who ? ` title="${esc(`Versus ${who}`)}"` : ''}>${MAP_SIZES[e.map].label}</span>` : '';
  const all = e.everyLastPlot !== undefined ? ` <span title="Every Last Plot, Day ${e.everyLastPlot}" aria-label="Every Last Plot">${glyph('star')}</span>` : '';
  return map + all;
}
