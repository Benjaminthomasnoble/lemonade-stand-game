// The alert feed (spec: Player experience, "Top bar and alerts"): alerts land
// as cards on the left, each with Go There and one action. Major alerts
// auto-pause the game (each kind has its own switch, see src/settings.ts) and
// stop the skip buttons. Every alert also lands in s.news, the headline list.
// Pure data, like the rest of the sim.
import type { GameState } from './economy.ts';

export type AlertKind =
  | 'raid' // a raid on you is coming (Ring the Bell)
  | 'delivery' // a Delivery Raid on a VIP pickup (Ring the Bell)
  | 'vip' // a VIP client's first arrival (Watch)
  | 'red' // you went In the Red
  | 'perk' // a rank-up perk pick
  | 'soldout' // a stand sold out (Restock now)
  | 'note'; // anything else worth a card

export interface Alert {
  id: string;
  kind: AlertKind;
  text: string; // the headline, as it reads in the news
  plot?: string; // where Go There goes
  raid?: string; // the raid a warning is about
  order?: string; // the VIP order a card is about
  day: number;
  minute: number;
}

/** Major alerts auto-pause by default and stop Finish the day and Sleep till dawn. */
export const MAJOR: Record<AlertKind, boolean> = { raid: true, delivery: true, vip: true, red: true, perk: true, soldout: false, note: false };
/** The feed keeps this many cards; the oldest small ones go first. */
export const MAX_ALERTS = 8;

export const isMajor = (a: Alert) => MAJOR[a.kind];

/** Post an alert card. It also lands in s.news (pass news: false when the line is already there). */
export function alert(s: GameState, a: Omit<Alert, 'id' | 'day' | 'minute'>, news = true): Alert {
  const list = (s.alerts ??= []);
  s.alertSeq = (s.alertSeq ?? 0) + 1;
  const card: Alert = { ...a, id: `a${s.alertSeq}`, day: s.day, minute: s.minute };
  list.push(card);
  while (list.length > MAX_ALERTS) {
    const i = list.findIndex((x) => !isMajor(x));
    list.splice(i >= 0 ? i : 0, 1);
  }
  if (news) s.news.push(a.text);
  return card;
}

export function dismissAlert(s: GameState, id: string): void {
  s.alerts = (s.alerts ?? []).filter((a) => a.id !== id);
}

/** Warnings go once their raid has hit (its result card takes over) or was called off. */
export function pruneAlerts(s: GameState): void {
  if (!s.alerts?.length) return;
  const live = new Set(s.raids.map((r) => r.id));
  s.alerts = s.alerts.filter((a) => !a.raid || live.has(a.raid));
}

/** The alert texts still on cards: they show as cards, not as toasts. */
export const alertTexts = (s: GameState) => new Set((s.alerts ?? []).map((a) => a.text));
