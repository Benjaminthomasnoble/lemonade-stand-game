// The fight bar (spec: The fight clock and your buttons). While a fight plays
// live: the fight clock (a second is a game minute) and your buttons. Rally
// lifts your side's Nerve for 10 seconds, every 30; Fall Back takes everyone
// standing home, once, and loses the fight; on defense, Ring the Bell calls
// the Clubhouse reserve in range, once a raid. The pause knob holds it all.
// Mounted from hud.ts in the phase slot; clicks go through the HUD's one
// listener (data-action="fight", or "bell").
import { fightStatus } from '../sim/fight.ts';
import { canRingBell } from '../sim/reinforce.ts';
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
  return `<div class="cl-daybar" data-testid="fight" title="${st.up.att} vs ${st.up.def} standing">${st.side === 'def' ? k.ART.shield() : k.ART.raid()}${k.tape(`<b>${clock(st.clock)}</b>${st.hq ? ` ${STAGE[st.hq]}` : ''}${move}`)}<span class="cl-acts">${acts}</span></div>`;
}
