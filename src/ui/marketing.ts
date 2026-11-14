// Local campaigns on the HUD (spec: Marketing, Local campaigns; src/sim/marketing.ts). Morning Prep's Grow tab
// shows a card for each campaign at the stand you manage: its own (the Sign kid, Free samples) and its district's
// (Sunny the Lemon, a Coupon Blitz). While open, the stand panel's nudges book any of them for tomorrow.
// Mounted from hud.ts (the Grow tab) and src/ui/stand.ts (the nudges); plain controls, the UI thread styles them.
import {
  campaignCost, canRunCampaign, CAMPAIGNS, DISTRICT_BY_ID, DISTRICT_CAMPAIGNS, PLOT_BY_ID,
  type Blocker, type GameState, type LocalCampaignId,
} from '../sim/economy.ts';
import { bennyPitch, taught } from '../sim/story.ts';
import { campaignDays } from '../sim/perks.ts';
import * as A from './clay.ts';

/** The parts of the HUD's clay kit the Grow tab's campaign cards draw with. */
export interface CampaignKit {
  ART: { board(): string; sample(): string; lemon(): string; coin(): string };
  btn: (action: string, label: string, b?: Blocker, extra?: string, cls?: string) => string;
  card: (art: string, title: string, sub: string, action: string, tip?: string, extra?: string) => string;
  locked: (b: Blocker) => boolean;
  whole: (n: number) => string;
}

const IDS: LocalCampaignId[] = ['sandwichBoard', 'freeSamples', 'sunny', 'couponBlitz'];
const TITLE: Record<LocalCampaignId, string> = { sandwichBoard: 'Sign kid', freeSamples: 'Free samples', sunny: 'Sunny', couponBlitz: 'Coupons' };
/** Benny's pitch for the district campaigns (story.ts has the stand campaigns' and the brand tiers'). */
const PITCH: Record<'sunny' | 'couponBlitz', string> = {
  sunny: 'Nobody walks past a six-foot lemon!',
  couponBlitz: 'Clip it, sip it, tell a friend!',
};
const pitch = (id: LocalCampaignId) => (id === 'sunny' || id === 'couponBlitz' ? PITCH[id] : bennyPitch(id));
const blurb = (id: LocalCampaignId) => (id === 'sunny' || id === 'couponBlitz' ? DISTRICT_CAMPAIGNS[id].blurb : CAMPAIGNS[id].blurb);
/** A stand campaign's days when Lottie's Long Run stretches them (perks.ts campaignDays), else null. */
function longRun(s: GameState, id: LocalCampaignId): number | null {
  if (id === 'sunny' || id === 'couponBlitz') return null; // one district, one day
  const n = campaignDays(s, CAMPAIGNS[id].days);
  return n === CAMPAIGNS[id].days ? null : n;
}
/** The blurb with the days it really runs: with Long Run, "today" and "for 3 days" become 2 days and 5. */
function blurbNow(s: GameState, id: LocalCampaignId): string {
  const n = longRun(s, id);
  if (n === null || id === 'sunny' || id === 'couponBlitz') return blurb(id);
  return blurb(id).replace(CAMPAIGNS[id].days === 1 ? /\btoday\b/ : /for \d+ days/, `for ${n} days`);
}
/** A campaign the player can't reach from this stand stays hidden: locked by Rank, or a Sign kid at an L4+. */
const hidden = (b: Blocker, locked: (b: Blocker) => boolean) => locked(b) || (!b.ok && /Only for|Pick a stand/.test(b.why));
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** What it costs, in a few characters: $40, 100 cups, −25%. */
function costLabel(s: GameState, id: LocalCampaignId, whole: (n: number) => string): string {
  const c = campaignCost(s, id); // Word of Mouth halves it
  return c.cash ? whole(c.cash) : c.samples ? `${c.samples} cups` : `−${Math.round(c.cut * 1000) / 10}%`;
}

/** The Grow tab's campaign cards for the stand you manage (Morning Prep). */
export function campaignCards(k: CampaignKit, s: GameState): string[] {
  if (!taught(s, 'marketing')) return [];
  const art: Record<LocalCampaignId, () => string> = { sandwichBoard: k.ART.board, freeSamples: k.ART.sample, sunny: k.ART.lemon, couponBlitz: k.ART.coin };
  const out: string[] = [];
  for (const id of IDS) {
    const b = canRunCampaign(s, id);
    if (hidden(b, k.locked)) continue;
    const cost = campaignCost(s, id);
    const district = id === 'sunny' || id === 'couponBlitz' ? DISTRICT_BY_ID[PLOT_BY_ID[s.selected].district].name : '';
    const days = longRun(s, id);
    const sub = `${costLabel(s, id, k.whole)}${days ? ` · ${days} days` : id === 'sandwichBoard' || id === 'sunny' ? ' a day' : ''}${district ? ` · ${district}` : ''}${cost.half ? ' · half off' : ''}`;
    const tip = `Benny: "${pitch(id)}"\n${blurbNow(s, id)}${district ? ` (${district})` : ''}${cost.half ? '. Word of Mouth: half price' : ''}${days ? '. Long Run: 50% longer' : ''}`;
    out.push(k.card(art[id](), TITLE[id], sub, k.btn('campaign', 'Run', b, `data-id="${id}" data-testid="campaign-${id}"`), tip));
  }
  return out;
}

let icons: Record<LocalCampaignId, string> | null = null;
const icon = (id: LocalCampaignId) => (icons ??= { sandwichBoard: A.boardSVG(), freeSamples: A.heartCupSVG(), sunny: A.sunnySVG(), couponBlitz: A.coinSVG() })[id];

/** While open, the stand panel books tomorrow's campaigns at the stand you manage: they start at the next open. */
export function bookingRow(s: GameState, plotId: string): string {
  if (s.phase !== 'open' || !taught(s, 'marketing')) return '';
  const locked = (b: Blocker) => !b.ok && /Rank \d/.test(b.why);
  const cells = IDS.map((id) => {
    const b = canRunCampaign(s, id, plotId);
    if (hidden(b, locked)) return '';
    const booked = !b.ok && /^Booked for tomorrow$/.test(b.why);
    const label = `${icon(id)}${TITLE[id]}${booked ? A.glyph('check') : ''}`;
    const tip = b.ok ? `Book for tomorrow: ${costLabel(s, id, (n) => `$${n.toLocaleString('en-US')}`)}. ${blurbNow(s, id)}` : b.why;
    return `<button class="cl-b tiny" data-action="campaign" data-id="${id}" data-plot="${plotId}" aria-pressed="${booked}" title="${esc(tip)}"${b.ok ? '' : ' disabled'}>${label}</button>`;
  }).filter(Boolean);
  return cells.length ? `<div class="cl-sec cl-book" data-testid="book-tomorrow"><span class="cl-note">Tomorrow</span><span class="cl-acts">${cells.join('')}</span></div>` : '';
}
