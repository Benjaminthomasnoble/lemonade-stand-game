// The Warehouse in the clay HUD (src/sim/warehouse.ts). The plot card's Build button comes with the other facilities
// (FACILITIES in vip.ts); once it stands, its card says what it does for your stands in its district. Mounted from
// hud.ts's plot card; plain markup, the UI thread styles it.
import { DISTRICT_BY_ID, PLOT_BY_ID, playerStands, restockOn, type GameState } from '../sim/economy.ts';
import { esc } from './recipes.ts';

/** A standing Warehouse of yours: the stands it keeps stocked and the sugar it stores. Cheap: the HUD draws it each frame. */
export function warehouseNote(s: GameState, plotId: string): string {
  const ps = s.plots[plotId];
  if (ps?.owner !== 'player' || ps.facility?.kind !== 'warehouse' || ps.facility.wrecked) return '';
  const d = PLOT_BY_ID[plotId].district;
  const n = playerStands(s).filter((p) => p.district === d && !s.plots[p.id].stand!.wrecked && restockOn(s, s.plots[p.id].stand!)).length;
  const sugar = Math.floor(s.warehouses?.[plotId]?.sugar ?? 0);
  const tip = `Keeps your ${DISTRICT_BY_ID[d].name} stands stocked all day, and stores sugar for dear days. A stand with Auto-Restock off is left out`;
  return `<span class="cl-note" data-testid="warehouse" title="${esc(tip)}">${n ? `${n} stand${n === 1 ? '' : 's'} supplied` : 'No stands here yet'} · ${sugar.toLocaleString('en-US')} sugar</span>`;
}
