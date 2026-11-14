// The fight bar (spec: The fight clock and your buttons). While a fight plays
// live: the fight clock (a second is a game minute) and your buttons. Rally
// lifts your side's Nerve for 10 seconds, every 30; Fall Back takes everyone
// standing home, once, and loses the fight; on defense, Ring the Bell calls
// the Clubhouse reserve in range, once a raid. The pause knob holds it all.
// A raid on you that gets to its plot meanwhile waits its turn: the bar names
// that plot (Next). Each side's standing count shows against the mark where
// its one Nerve roll comes. Mounted from hud.ts in the phase slot; clicks go through
// the HUD's one listener (data-action="fight", or "bell").
import { fightStatus } from '../sim/fight.ts';
import { PLOT_BY_ID } from '../sim/map.ts';
import { canRingBell } from '../sim/reinforce.ts';
import type { Side } from '../sim/combat.ts';
import type { GameState } from '../sim/economy.ts';

/** The parts of the HUD's clay kit the bar draws with. */
export interface FightKit {
  tape: (inner: string, cls?: string) => string;
  ART: { raid(): string; shield(): string };
}

const STAGE = { gate: 'Gate', yard: 'Yard', boss: 'Boss Room' };
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const btn = (cmd: string, label: string, ok: boolean, tip: string, cls = '') =>
  `<button class="cl-b${cls ? ` ${cls}` : ''}" data-action="fight" data-cmd="${cmd}" data-testid="fight-${cmd}" ${ok ? '' : 'disabled'} title="${tip}">${label}</button>`;

export function fightBar(k: FightKit, s: GameState): string {
  const st = fightStatus(s);
  if (!st) return '';
  const raid = s.fight!.raid.id;
  const acts = st.side
    ? btn('rally', 'Rally', st.rally, st.rallying ? 'Rallied: +20 Nerve' : '+20 Nerve for 10 s, every 30 s', st.rallying ? 'go' : '')
      + (st.side === 'def' && canRingBell(s, raid)
        ? `<button class="cl-b go" data-action="bell" data-raid="${raid}" data-testid="fight-bell" title="The Clubhouse reserve in range runs over">Ring the Bell</button>` : '')
      + (st.fallBack ? btn('fallBack', 'Fall back', true, 'Everyone retreats with the KO\'d. The fight is lost.', 'ghost') : '')
    : '';
  const move = st.bossMove ? ` <b data-testid="fight-boss-move">${st.bossMove}!</b>` : ''; // the Boss Room's move, as it goes off
  const next = st.next ? `<span class="cl-note" data-testid="fight-next">Next: ${PLOT_BY_ID[st.next].name}</span>` : ''; // the raid waiting its turn
  // Each side's standing count, and where its one Nerve roll comes (a Rally only helps if that lands inside its 10 s).
  const who = (side: Side) => (st.side ? (side === st.side ? 'Yours' : 'Theirs') : side === 'att' ? 'Raiders' : 'Guards');
  const nerve = (side: Side) => `<span class="cl-note" data-testid="fight-nerve-${side}">${who(side)} ${st.up[side]}/${st.of[side]} standing${st.nerveAt[side] === null ? '' : `, breaks at ${st.nerveAt[side]}`}</span>`;
  const order: Side[] = st.side === 'def' ? ['def', 'att'] : ['att', 'def']; // yours first
  const sides = order.map(nerve).join('');
  return `<div class="cl-daybar" data-testid="fight" title="${st.up.att} vs ${st.up.def} standing">${st.side === 'def' ? k.ART.shield() : k.ART.raid()}${k.tape(`<b>${clock(st.clock)}</b>${st.hq ? ` ${STAGE[st.hq]}` : ''}${move}`)}${sides}${next}<span class="cl-acts">${acts}</span></div>`;
}
