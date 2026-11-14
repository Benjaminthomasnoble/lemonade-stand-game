// Rival schemes drawn on the stands they touch (design spec "Rival schemes"; the gameplay build's world brief).
// bay.ts works these out for each plot on every sync and hands them to the stand models: your stand gets
// setSchemes() (Cold Brew's smear posters, the Cease-and-Desist fruit basket), a rival stand is built with them
// (price-war markdown signs). The props themselves live with the stands (clay/stands.ts, clay/rivalStands.ts).
import type { GameState } from '../sim/economy.ts';
import { postersAt, runningSchemes, warAt } from '../sim/schemes.ts';

export interface PlotSchemes {
  /** Cold Brew's smear posters are slapped on this stand of yours (postersAt). */
  posters: boolean;
  /** This rival stand is in a price war: markdown signs (warAt). */
  markdown: boolean;
  /** FizzCo's Cease-and-Desist landed here: Lottie keeps the fruit basket at this stand of yours. */
  basket: boolean;
}

export const NO_SCHEMES: PlotSchemes = { posters: false, markdown: false, basket: false };

export function plotSchemes(s: GameState, plotId: string): PlotSchemes {
  if (!s.schemes?.length) return NO_SCHEMES;
  const ps = s.plots[plotId];
  if (!ps?.stand || ps.stand.wrecked) return NO_SCHEMES;
  const mine = ps.owner === 'player';
  return {
    posters: mine && postersAt(s, plotId),
    markdown: !mine && !!warAt(s, plotId),
    basket: mine && runningSchemes(s).some((x) => x.kind === 'cease' && x.plots[0] === plotId),
  };
}

/** A short key for bay.ts's plot key: a change rebuilds a rival stand, or re-dresses yours. */
export const schemesKey = (x: PlotSchemes) => (x.posters ? 'p' : '') + (x.markdown ? 'm' : '') + (x.basket ? 'b' : '');
