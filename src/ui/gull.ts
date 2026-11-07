// Gull Flight's scouting (spec: Views, "Circling a rival plot reveals its defenses for 3 days and pins a snapshot
// to the Rivals Corkboard. The clock keeps running, and any alert offers a one-tap return"). The flight is the
// world's (src/world/gullflight.ts): main.ts hands this tracker Captain Squawk's position each frame while he
// flies, and a full circle round a rival plot scouts it (the sim's gullScout). The feed shows what he's circling
// and how far round he is, with Land; the Raid Planner's Fly over takes off beside a plot; the Rivals Corkboard
// pins the fresh snapshots. Plain functional pieces on the HUD's ticket and button styles.
import { GADGETS, PERIMETERS, PLOT_BY_ID, PLOTS, type GameState, type RivalId } from '../sim/economy.ts';
import { canGullScout, scoutedSnapshot, type Scouted } from '../sim/scouting.ts';
import { glyph } from './clay.ts';
import type { Kit } from './hud.ts';

const TURN = Math.PI * 2;
/** Seconds of flight the tracker remembers: a loop has to close inside them. */
const WINDOW = 30;
/** Position samples a second. */
const RATE = 10;
/** A loop scouts the rival plot nearest its middle, within this many world units (plots are 12 apart)... */
const NEAR = 14;
/** ...if it's a tight one: at most this radius (Squawk turns in about 9 gliding, 16 flapping hard). */
const WIDE = 28;

interface Sample { x: number; z: number; t: number; turn: number } // turn: his heading's change since the first sample
const fresh = () => ({ on: false, t: 0, acc: 0, heading: NaN, samples: [] as Sample[], plot: null as string | null, progress: 0, aim: null as string | null });
const track = fresh();

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');

/** The circle through a stretch of flight (an algebraic least-squares fit), or null when it's all but straight. */
export function fitCircle(pts: { x: number; z: number }[]): { x: number; z: number; r: number } | null {
  const n = pts.length;
  if (n < 5) return null;
  let mx = 0, mz = 0;
  for (const p of pts) { mx += p.x; mz += p.z; }
  mx /= n; mz /= n;
  let uu = 0, vv = 0, uv = 0, uuu = 0, vvv = 0, uvv = 0, vuu = 0;
  for (const p of pts) {
    const u = p.x - mx, v = p.z - mz;
    uu += u * u; vv += v * v; uv += u * v;
    uuu += u * u * u; vvv += v * v * v; uvv += u * v * v; vuu += v * u * u;
  }
  const det = uu * vv - uv * uv;
  if (Math.abs(det) < 1e-6 * (uu + vv) * (uu + vv) || det === 0) return null;
  const a = (uuu + uvv) / 2, b = (vvv + vuu) / 2;
  const uc = (a * vv - b * uv) / det, vc = (b * uu - a * uv) / det;
  return { x: uc + mx, z: vc + mz, r: Math.sqrt(uc * uc + vc * vc + (uu + vv) / n) };
}

/** The rival plot a stretch of flight is circling: the one nearest the circle's middle, if the circle is tight. */
function circling(s: GameState, loop: Sample[]): string | null {
  const c = fitCircle(loop);
  if (!c || c.r > WIDE) return null;
  let best: string | null = null, d = NEAR;
  for (const p of PLOTS) {
    const e = Math.hypot(p.x - c.x, p.z - c.z);
    if (e < d && canGullScout(s, p.id).ok) { d = e; best = p.id; }
  }
  return best;
}

/** main.ts, every frame: is Squawk flying, and where is he. Returns the rival plot he has just circled, once. */
export function trackGull(s: GameState, flying: boolean, x: number, z: number, dt: number): string | null {
  if (!flying) { if (track.on) Object.assign(track, fresh()); return null; }
  track.on = true;
  track.t += dt;
  track.acc += dt;
  if (track.acc < 1 / RATE) return null;
  track.acc = 0;
  const last = track.samples[track.samples.length - 1];
  let turn = 0;
  if (last) {
    const dx = x - last.x, dz = z - last.z;
    if (dx * dx + dz * dz < 1e-4) return null; // not moving (a stalled frame)
    const h = Math.atan2(dx, dz);
    turn = last.turn + (Number.isNaN(track.heading) ? 0 : wrap(h - track.heading));
    track.heading = h;
  }
  track.samples.push({ x, z, t: track.t, turn });
  while (track.t - track.samples[0].t > WINDOW) track.samples.shift();
  // The most he has turned, ending now: a full turn closes a loop.
  const n = track.samples.length - 1, now = track.samples[n];
  let most = 0, from = n;
  for (let i = n - 1; i >= 0; i--) {
    const turned = Math.abs(now.turn - track.samples[i].turn);
    if (turned > most) { most = turned; from = i; }
    if (turned >= TURN) break;
  }
  track.plot = most >= Math.PI / 2 ? circling(s, track.samples.slice(from)) : null;
  track.progress = track.plot ? Math.min(1, most / TURN) : 0;
  if (most < TURN) return null;
  track.samples = track.samples.slice(n); // a loop closed: the next one starts here
  const done = track.plot;
  track.plot = null;
  track.progress = 0;
  if (done && track.aim === done) track.aim = null;
  return done;
}

/** The Raid Planner's Fly over: the ticket names the plot Squawk set out for until he's circling one. */
export function aimGull(plotId: string): void { track.aim = plotId; }

/** The feed's ticket while Squawk flies: the rival plot he's circling and how far round, and Land (the one-tap return). */
export function gullTicket(k: Kit, s: GameState): string {
  if (!track.on) return '';
  const id = track.plot ?? (track.aim && canGullScout(s, track.aim).ok ? track.aim : null);
  const what = track.plot ? esc(place(track.plot)) : id ? `Circle ${esc(place(id))}` : 'Circle a rival stand';
  return `<div class="cl-ticket" data-testid="gull-flight" title="Fly a full circle round a rival plot: its defenses show for 3 days">
    <span class="gull-ico" aria-hidden="true"></span><b>${what}</b>${track.plot ? k.meter(Math.floor(track.progress * 8) / 8) : ''}
    <span class="cl-acts"><button class="cl-b tiny" data-action="gullLand" data-testid="gull-land">Land</button></span></div>`;
}

/** The Raid Planner's Fly over: Captain Squawk takes off beside the plot to circle it. */
export function flyOver(k: Kit, s: GameState, plotId: string): string {
  const b = canGullScout(s, plotId);
  return k.btn('gullTo', '<span class="gull-ico" aria-hidden="true"></span> Fly over', b, `data-plot="${plotId}" data-testid="gull-to"${b.ok ? ' title="Captain Squawk circles it: its defenses show for 3 days"' : ''}`, 'ghost');
}

/** What a snapshot shows, for a tooltip. */
export function snapshotTip(s: GameState, sc: Scouted): string {
  const who = sc.by === 'gull' ? 'Captain Squawk' : 'your Lookout';
  const left = sc.until - s.day + 1;
  const kit = [sc.tier ? PERIMETERS[sc.tier - 1].name : 'no fence', ...sc.gadgets.map((g) => GADGETS[g].name), `${sc.garrison} henchm${sc.garrison === 1 ? 'an' : 'en'}`];
  return `Scouted by ${who}, Day ${sc.day}: ${kit.join(', ')}. Good for ${left} more day${left === 1 ? '' : 's'}.`;
}

/** The Rivals Corkboard's snapshots of one rival's plots, each pinned until it goes stale. Tapping one flies there. */
export function scoutedPins(s: GameState, rival: RivalId): string {
  const shots = PLOTS.flatMap((p) => { const sc = s.plots[p.id].owner === rival ? scoutedSnapshot(s, p.id) : null; return sc ? [{ id: p.id, sc }] : []; });
  if (!shots.length) return '';
  return `<span class="cl-row wrap" data-testid="cork-scouted">${shots.map(({ id, sc }) =>
    `<button class="cl-b tiny ghost" data-action="inspect" data-plot="${id}" title="${esc(snapshotTip(s, sc))}">${glyph('pin')}${esc(place(id))}</button>`).join('')}</span>`;
}
