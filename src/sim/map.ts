// Citrine Bay (spec section 6): 8 districts, 116 plots, laid out for this
// game. Pure data: positions are world units (1 = 1 m) used by both the
// sim (neighbors, travel) and the renderer.
import type { SegmentId } from './balance.ts';

export type FactionId = 'player' | 'sourwood' | 'hollis' | 'fizzco' | 'coldbrew' | 'blenders';
export type DistrictId = 'maple' | 'oldtown' | 'campus' | 'downtown' | 'boardwalk' | 'harbor' | 'groves' | 'hilltop';
export type PlotType = 'street' | 'prime' | 'landmark' | 'field' | 'dock' | 'industrial' | 'hq' | 'civic';

export interface District {
  id: DistrictId;
  name: string;
  owner: FactionId | 'neutral' | 'contested';
  traffic: [number, number]; // street-plot passersby per day
  land: [number, number]; // street-plot land price range
  specialLand?: Partial<Record<PlotType, [number, number]>>;
  priceMult?: number; // Hilltop customers pay ×2
  mix: Partial<Record<SegmentId, number>>;
  feel: string;
  // layout: a street running east-west with plots on both sides
  origin: [number, number]; // west end of the street (x, z)
  cols: number;
  special: { col: number; side: 0 | 1; type: PlotType; name: string }[];
  ground: number; // color
}

export const DISTRICTS: District[] = [
  {
    id: 'maple', name: 'Maple Row', owner: 'neutral', traffic: [250, 400], land: [600, 1200], mix: { kids: 0.3, families: 0.3, seniors: 0.25, students: 0.08, workers: 0.07 },
    feel: 'Leafy suburb, picket fences, sprinklers', origin: [-160, -25], cols: 6, ground: 0x7cbf5a,
    special: [{ col: 2, side: 1, type: 'street', name: "Lottie's Corner" }, { col: 4, side: 0, type: 'landmark', name: 'Maple Park' }],
  },
  {
    id: 'oldtown', name: 'Old Town', owner: 'contested', traffic: [500, 900], land: [8000, 16000], mix: { kids: 0.15, families: 0.2, seniors: 0.15, students: 0.1, office: 0.15, tourists: 0.15, workers: 0.1 },
    feel: 'Main Street, bandstand, clock tower', origin: [-68, -25], cols: 8, ground: 0x86c062,
    special: [
      { col: 1, side: 0, type: 'civic', name: 'Town Hall and Registry' }, { col: 3, side: 0, type: 'civic', name: 'Citrine Bay Market' },
      { col: 5, side: 0, type: 'civic', name: 'The Hiring Hall' }, { col: 6, side: 1, type: 'civic', name: "Dot's Diner" },
      { col: 4, side: 1, type: 'landmark', name: 'The Bandstand' },
    ],
  },
  {
    id: 'campus', name: 'Campus & Arts', owner: 'coldbrew', traffic: [450, 800], land: [12000, 24000], mix: { students: 0.55, office: 0.1, families: 0.1, tourists: 0.1, seniors: 0.05, kids: 0.1 },
    feel: 'Murals, the Quad, record shops', origin: [-30, -100], cols: 7, ground: 0x7fbf6a,
    special: [{ col: 5, side: 0, type: 'hq', name: 'The Grindhouse' }, { col: 2, side: 1, type: 'landmark', name: 'The Quad' }],
  },
  {
    id: 'downtown', name: 'Downtown', owner: 'fizzco', traffic: [800, 1500], land: [60000, 120000], specialLand: { industrial: [20000, 40000] }, mix: { office: 0.6, tourists: 0.15, students: 0.1, workers: 0.15 },
    feel: 'Glass towers, lunch rush', origin: [48, -25], cols: 9, ground: 0x9aa39a,
    special: [
      { col: 4, side: 0, type: 'hq', name: 'FizzCo Tower' }, { col: 2, side: 0, type: 'prime', name: 'Tower Plaza West' },
      { col: 6, side: 1, type: 'prime', name: 'Tower Plaza East' }, { col: 3, side: 1, type: 'prime', name: 'Commerce Square' },
      { col: 7, side: 0, type: 'landmark', name: 'Founders Fountain' }, { col: 0, side: 1, type: 'industrial', name: 'Downtown Depot' },
    ],
  },
  {
    id: 'boardwalk', name: 'The Boardwalk', owner: 'blenders', traffic: [700, 1400], land: [12000, 24000], mix: { tourists: 0.5, families: 0.2, kids: 0.15, students: 0.1, seniors: 0.05 },
    feel: 'Beach, pier, arcade, lifeguard towers', origin: [-90, 50], cols: 8, ground: 0xe9d8a6,
    special: [{ col: 6, side: 1, type: 'hq', name: 'The Blend Shack' }, { col: 4, side: 1, type: 'landmark', name: 'The Pier' }],
  },
  {
    id: 'harbor', name: 'The Harbor', owner: 'neutral', traffic: [300, 600], land: [6000, 12000], specialLand: { industrial: [20000, 40000], dock: [100000, 200000] }, mix: { workers: 0.7, tourists: 0.1, office: 0.1, families: 0.1 },
    feel: 'Cranes, warehouses, fish market', origin: [72, 50], cols: 7, ground: 0xa7a59c,
    special: [
      { col: 1, side: 1, type: 'dock', name: 'Pier 1' }, { col: 2, side: 1, type: 'dock', name: 'Pier 2' },
      { col: 4, side: 1, type: 'dock', name: 'Pier 3' }, { col: 5, side: 1, type: 'dock', name: 'Pier 4' },
      { col: 3, side: 0, type: 'industrial', name: 'FizzCo Bottling Plant' }, { col: 0, side: 0, type: 'industrial', name: 'Old Cannery' },
      { col: 6, side: 0, type: 'landmark', name: 'Fish Market' },
    ],
  },
  {
    id: 'groves', name: 'The Groves', owner: 'hollis', traffic: [150, 350], land: [3000, 6000], specialLand: { field: [40000, 80000] }, mix: { workers: 0.6, families: 0.2, kids: 0.1, seniors: 0.1 },
    feel: 'Lemon and tea fields, barns, windmills', origin: [-160, -100], cols: 8, ground: 0x9cc65a,
    special: [
      { col: 1, side: 0, type: 'field', name: 'North Field' }, { col: 2, side: 0, type: 'field', name: 'Tea Rows' },
      { col: 3, side: 0, type: 'field', name: 'Lemon Orchard' }, { col: 5, side: 0, type: 'field', name: 'Windmill Field' },
      { col: 6, side: 0, type: 'field', name: 'Hay Meadow' }, { col: 7, side: 0, type: 'field', name: 'Creek Field' },
      { col: 4, side: 1, type: 'hq', name: 'Hollis Homestead' }, { col: 2, side: 1, type: 'landmark', name: 'The Fairgrounds' },
    ],
  },
  {
    id: 'hilltop', name: 'Hilltop Estates', owner: 'sourwood', traffic: [300, 600], land: [240000, 480000], specialLand: { field: [120000, 240000], dock: [300000, 600000] }, priceMult: 2, mix: { highRollers: 0.7, seniors: 0.15, families: 0.15 },
    feel: 'Mansions, country club, hedges', origin: [92, -100], cols: 5, ground: 0x6fb257,
    special: [
      { col: 2, side: 0, type: 'hq', name: 'Sourwood Manor' }, { col: 0, side: 0, type: 'field', name: 'Polo Lawn' },
      { col: 4, side: 1, type: 'dock', name: 'Yacht Marina' }, { col: 3, side: 1, type: 'landmark', name: 'The Country Club' },
    ],
  },
];

/** Which districts border which (for buying land next to a Foothold). */
// Spec section 6 geography: the bay lies to the south and east.
// North row: Groves, Campus & Arts, Hilltop (headland, marina on its east shore).
// Middle row: Maple Row, Old Town, Downtown (east shore). South row on the beach: Boardwalk, Harbor (SE corner).
const BORDER_EDGES: [DistrictId, DistrictId][] = [
  ['maple', 'groves'], ['maple', 'oldtown'], ['maple', 'boardwalk'],
  ['oldtown', 'campus'], ['oldtown', 'downtown'], ['oldtown', 'boardwalk'],
  ['campus', 'groves'], ['campus', 'hilltop'],
  ['downtown', 'hilltop'], ['downtown', 'harbor'],
  ['boardwalk', 'harbor'],
];
export const BORDERS = Object.fromEntries(
  (['maple', 'oldtown', 'campus', 'downtown', 'boardwalk', 'harbor', 'groves', 'hilltop'] as DistrictId[])
    .map((d) => [d, BORDER_EDGES.flatMap(([a, b]) => (a === d ? [b] : b === d ? [a] : []))]),
) as Record<DistrictId, DistrictId[]>;

/** Coastline: land is x < SEA_X and z < SEA_Z; the beach strip sits just inside. */
export const SEA_X = 166;
export const SEA_Z = 72;
/** Cross streets between the rows, and the west avenue. */
export const CROSS_STREETS_Z = [-62, 12];
export const WEST_AVENUE_X = -170;

export const PLOT_SPACING = 12;
export const STREET_HALF = 4; // half the road width
export const PLOT_DEPTH = 10; // plot centers sit this far from the street center

export const TYPE_TRAFFIC: Record<PlotType, number> = { street: 1, prime: 3, landmark: 5, field: 0.08, dock: 0.15, industrial: 0.3, hq: 1, civic: 0 };
export const TYPE_LAND: Record<PlotType, number> = { street: 1, prime: 3, landmark: 8, field: 2.5, dock: 3, industrial: 2, hq: 6, civic: 0 };
/** Land value per daily passerby of a plain street plot (Lottie's Corner: 320/day → $300). */
export const LAND_PER_TRAFFIC = 300 / 320;

export interface Plot {
  id: string;
  district: DistrictId;
  type: PlotType;
  name: string;
  col: number;
  side: 0 | 1; // 0 = north of the street, 1 = south
  x: number;
  z: number;
  streetZ: number;
  facing: 1 | -1; // +1 faces south (toward +z)
  baseTraffic: number;
  baseLand: number;
}

/** Deterministic layout. Traffic within a district's range varies by a fixed hash. */
export function buildPlots(): Plot[] {
  const plots: Plot[] = [];
  for (const d of DISTRICTS) {
    for (let col = 0; col < d.cols; col++) {
      for (const side of [0, 1] as const) {
        const sp = d.special.find((p) => p.col === col && p.side === side);
        const type = sp?.type ?? 'street';
        const h = hash(`${d.id}:${col}:${side}`);
        const traffic = Math.round((d.traffic[0] + (d.traffic[1] - d.traffic[0]) * h) / 10) * 10 * TYPE_TRAFFIC[type];
        const streetZ = d.origin[1];
        const id = `${d.id}-${col}${side ? 's' : 'n'}`;
        plots.push({
          id, district: d.id, type, name: sp?.name ?? `${d.name} lot ${col * 2 + side + 1}`, col, side,
          x: d.origin[0] + col * PLOT_SPACING + PLOT_SPACING / 2,
          z: streetZ + (side === 0 ? -PLOT_DEPTH : PLOT_DEPTH),
          streetZ, facing: side === 0 ? 1 : -1,
          baseTraffic: traffic,
          baseLand: type === 'civic' ? 0 : landFor(d, type, h),
        });
      }
    }
  }
  // Lottie's Corner is a fixed starting plot: 400 passersby, $300 land.
  const lottie = plots.find((p) => p.name === "Lottie's Corner")!;
  lottie.baseTraffic = 400;
  lottie.baseLand = 300;
  return plots;
}

/** Land price (balance tables): the district's street range, ×3 Prime, ×8 Landmark; specials have their own ranges. */
function landFor(d: District, type: PlotType, h: number): number {
  const range = d.specialLand?.[type] ?? (type === 'field' || type === 'dock' || type === 'industrial' ? [d.land[0] * 2, d.land[1] * 2] as [number, number] : d.land);
  const mult = d.specialLand?.[type] ? 1 : TYPE_LAND[type];
  return Math.round((range[0] + (range[1] - range[0]) * h) * mult / 10) * 10;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export const PLOTS: Plot[] = buildPlots();
export const PLOT_BY_ID: Record<string, Plot> = Object.fromEntries(PLOTS.map((p) => [p.id, p]));
export const LOTTIES_CORNER = PLOTS.find((p) => p.name === "Lottie's Corner")!.id;
export const DISTRICT_BY_ID: Record<DistrictId, District> = Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<DistrictId, District>;

/** Plots whose stands compete for the same passersby: same street, within 2 plots. */
const NEARBY: Record<string, Plot[]> = Object.fromEntries(
  PLOTS.map((p) => [p.id, PLOTS.filter((q) => q.district === p.district && Math.abs(q.col - p.col) <= 2)]),
);
export function nearbyPlots(p: Plot): Plot[] {
  return NEARBY[p.id];
}
