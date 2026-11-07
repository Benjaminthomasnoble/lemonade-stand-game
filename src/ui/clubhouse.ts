// Clubhouses on the HUD (combat: src/sim/clubhouse.ts). The Crew tab offers
// the next beds when the roster runs short; a Clubhouse's plot card shows its
// beds and who waits there, and a tap brings a guard off post over from
// another Clubhouse; its tape names the Training Yard and the Infirmary once
// it has them. Mounted from hud.ts, drawn with its clay kit.
import { bedsAt, clubExtras, clubhouseSite, clubOf } from '../sim/clubhouse.ts';
import { canBuildClubhouse, CLUBHOUSE, FACILITIES, PLOT_BY_ID, rosterCap, type Blocker, type GameState, type Guard } from '../sim/economy.ts';

/** The parts of the HUD's clay kit these panels draw with. */
export interface ClubKit {
  ART: { house(): string };
  btn: (action: string, label: string, b?: Blocker, extra?: string, cls?: string) => string;
  card: (art: string, title: string, sub: string, action: string, tip?: string, extra?: string) => string;
  tape: (inner: string, cls?: string) => string;
  locked: (b: Blocker) => boolean;
  esc: (t: string) => string;
  whole: (n: number) => string;
  face: (s: GameState, g: Guard) => string;
}

/** A level's extras, or just what it adds over the level below. */
function extras(level: number, added = false): string {
  const x = clubExtras(level), was = added ? clubExtras(level - 1) : { yard: false, infirmary: false };
  return [x.yard && !was.yard ? 'Training Yard' : '', x.infirmary && !was.infirmary ? 'Infirmary' : ''].filter(Boolean).map((t) => ` · ${t}`).join('');
}

/** The Crew tab's card for the next beds: a new Clubhouse on an empty Street plot, or the next level of your smallest. */
export function nextClubhouse(k: ClubKit, s: GameState): string {
  if (s.guards.length < rosterCap(s) - 1) return '';
  const site = clubhouseSite(s);
  const lvl = site ? s.plots[site].facility?.level ?? 0 : 0;
  const next = CLUBHOUSE[lvl];
  const b = canBuildClubhouse(s, site);
  if (!next || k.locked(b)) return '';
  const name = FACILITIES.clubhouse.names[lvl];
  return `<div class="cl-cards">${k.card(k.ART.house(), name, `${next.beds} beds${extras(next.level, true)}`, k.btn('clubhouse', k.whole(next.cost), b, site ? `data-plot="${site}"` : ''), site ? `${name} on ${PLOT_BY_ID[site].name}` : '')}</div>`;
}

/** A Clubhouse's beds and the guards off post who wait there; tap one waiting elsewhere to bring them here. */
export function clubhouseRoom(k: ClubKit, s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps.owner !== 'player' || ps.facility?.kind !== 'clubhouse' || ps.facility.wrecked) return '';
  const faces = s.guards.filter((g) => !g.post).map((g) => {
    const here = clubOf(s, g) === plotId;
    return `<button class="cl-pick${here ? ' on' : ''}" data-action="club" data-id="${g.id}" data-plot="${plotId}" aria-pressed="${here}" ${here ? 'disabled' : ''} title="${k.esc(g.name)}${here ? ' waits here' : ': wait here'}">${k.face(s, g)}</button>`;
  }).join('');
  return `<div class="cl-squad" data-testid="clubhouse">${k.tape(`${bedsAt(s, plotId)} beds${extras(ps.facility.level)}`)}${faces}</div>`;
}
