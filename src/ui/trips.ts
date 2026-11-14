// Your raids on the clock (spec: Raids: planning). The Raid Planner shows the
// trip each way and the posts the squad leaves empty until it's home; the
// Evening's Tonight list shows each raid out and each squad walking home.
// Plain functional lines on the HUD's note and ticket styles.
import {
  canBuyPerimeter, canPost, clockText, emptyPosts, guardReady, likeliestTarget, onYou, PERIMETERS, PLOT_BY_ID, raidsOut, squadsHomeward, squadTrip,
  type GameState, type RivalId,
} from '../sim/economy.ts';
import * as A from './clay.ts';

const memo = new Map<string, string>();
const art = (key: string, f: () => string) => { let v = memo.get(key); if (v === undefined) { v = f(); memo.set(key, v); } return v; };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const place = (id: string) => PLOT_BY_ID[id].name.replace(/ lot /, ' ');
const whole = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const btn = (action: string, label: string, extra: string) => `<button class="cl-b tiny go" data-action="${action}" ${extra}>${label}</button>`;

/** "1h 30m" */
export const span = (minutes: number) => `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;

/** The Raid Planner's trip: the walk each way, and whose posts sit empty till about when. Tonight's times show
 * after closing; in business hours the line is for a raid sent now. */
export function tripNote(s: GameState, target: string, guardIds: string[]): string {
  const when = s.phase === 'report' || s.phase === 'night' ? 'tonight' : 'now';
  const t = squadTrip(s, target, when, guardIds); // from the Clubhouse the picked squad waits at
  const tonight = when === 'now' ? squadTrip(s, target, 'tonight', guardIds) : t;
  const tip = `Sets out ${clockText(t.leave)}, there about ${clockText(t.at)}, home about ${clockText(t.back)}`
    + (when === 'now' ? `. Tonight: out ${clockText(tonight.leave)}, home about ${clockText(tonight.back)}` : '');
  const out = [`<span class="cl-note" data-testid="raid-trip" title="${esc(tip)}">${art('foot', A.footSVG)}${span(t.travel)} each way</span>`];
  const posts = emptyPosts(s, guardIds);
  if (posts.length) {
    const who = posts.map((g) => `${g.name.split(' ')[0]} (${place(g.post!)})`).join(', ');
    out.push(`<span class="cl-note bad" data-testid="raid-posts" title="${esc(`Empty from ${clockText(t.leave)} till about ${clockText(t.back)}: ${who}`)}">${art('shield', A.shieldSVG)}${posts.length} post${posts.length === 1 ? '' : 's'} empty till ~${clockText(t.back)}</span>`);
  }
  return `<div class="cl-acts">${out.join('')}</div>`;
}

/** Tonight's own raids for the Evening: each one out (sets out, hits) and each squad walking home. */
export function tripLines(s: GameState): string[] {
  const out = raidsOut(s).map((r) => {
    const tip = `Your crew raids ${PLOT_BY_ID[r.target].name} (${r.sabotage ? 'sabotage' : r.objective}): sets out ${clockText(r.leave ?? s.minute)}, there about ${clockText(r.at ?? s.minute)}`;
    return `<div class="cl-raidwarn mine" title="${esc(tip)}">${art('raid', A.raidSVG)}<b>${r.guards?.length ?? 0} ${A.glyph('arrow')} ${esc(place(r.target))}</b><span class="cl-note">${clockText(r.at ?? s.minute)}</span></div>`;
  });
  for (const r of squadsHomeward(s)) {
    out.push(`<div class="cl-raidwarn mine" title="${esc(`Your squad is walking home from ${PLOT_BY_ID[r.target].name}`)}">${art('foot', A.footSVG)}<b>Home ~${clockText(r.back!)}</b></div>`);
  }
  return out;
}

/** The Day's end card's raid line (spec: Top bar and alerts, "Day's end"): a raid on you is planned tonight, so
 * raiders are on the way, with one fix at the Corkboard's pin for the first of them to set out (rivals'
 * likeliestTarget): a guard from the reserve posted there, else its next fence. It names no gang, makeup or time:
 * the warning card in the feed shows those as they set out (src/ui/alerts.ts). */
export function raidersLine(s: GameState): string {
  const first = s.raids.filter((r) => onYou(s, r)).sort((a, b) => (a.leave ?? 0) - (b.leave ?? 0))[0];
  if (!first) return '';
  const pin = likeliestTarget(s, first.attacker as RivalId);
  return `<div class="cl-raidwarn" data-testid="raiders-tonight" title="A raid is coming tonight. Its warning card shows who, where and when.">${art('foot', A.footSVG)}<b>Raiders on the way tonight</b>${pin ? fixAt(s, pin.id) : ''}</div>`;
}

/** The one fix at a plot: post a ready guard from the reserve there, else buy its next fence (shown once its rank is
 * reached; short of cash it says so). Nothing when the plot is wrecked or has the best wall it can get. */
function fixAt(s: GameState, plotId: string): string {
  const ps = s.plots[plotId], name = PLOT_BY_ID[plotId].name;
  const out = new Set(s.raids.flatMap((r) => (r.attacker === 'player' ? r.guards ?? [] : [])));
  const g = s.guards.find((x) => !x.post && guardReady(s, x) && !out.has(x.id) && canPost(s, x.id, plotId).ok);
  if (g) return btn('post', `+${art('shield', A.shieldSVG)}${esc(place(plotId))}`, `data-id="${g.id}" data-plot="${plotId}" data-testid="raiders-fix" title="${esc(`Post ${g.name} at ${name}, the likeliest target`)}"`);
  const next = PERIMETERS[ps.defense.tier];
  if (!next || s.rank < next.rank || ps.stand?.wrecked || ps.facility?.wrecked) return '';
  const b = canBuyPerimeter(s, plotId);
  const tip = b.ok ? `${next.name} at ${name}, the likeliest target: ${next.hp} HP` : b.why;
  return btn('perimeter', `${art(`fence${ps.defense.tier + 1}`, () => A.fenceSVG(ps.defense.tier + 1))}${esc(place(plotId))} ${whole(next.cost)}`, `data-plot="${plotId}" data-testid="raiders-fix" ${b.ok ? '' : 'disabled '}title="${esc(tip)}"`);
}
