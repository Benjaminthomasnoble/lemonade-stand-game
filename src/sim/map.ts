// Citrine Bay (spec section 6): 8 districts, 116 plots, laid out for this
// game. Pure data: positions are world units (1 = 1 m) used by both the
// sim (neighbors, travel) and the renderer.
import { FACTIONS, MAP_SIZES, SIDE_LOT, type MapSize, type RivalId, type SegmentId } from './balance.ts';

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
    special: [{ col: 2, side: 1, type: 'street', name: "Lottie's Corner" }, { col: 1, side: 1, type: 'street', name: "Lottie's Side Lot" }, { col: 4, side: 0, type: 'landmark', name: 'Maple Park' }],
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
    id: 'campus', name: 'Campus & Arts', owner: 'coldbrew', traffic: [450, 800], land: [12000, 24000], mix: { students: 0.75, office: 0.05, tourists: 0.05, families: 0.05, seniors: 0.05, kids: 0.05 },
    feel: 'Murals, the Quad, record shops', origin: [-30, -100], cols: 7, ground: 0x7fbf6a,
    special: [{ col: 5, side: 0, type: 'hq', name: 'The Grindhouse' }, { col: 2, side: 1, type: 'landmark', name: 'The Quad' }],
  },
  {
    id: 'downtown', name: 'Downtown', owner: 'fizzco', traffic: [800, 1500], land: [60000, 120000], specialLand: { industrial: [20000, 40000] }, mix: { office: 0.65, tourists: 0.15, students: 0.05, workers: 0.15 },
    feel: 'Glass towers, lunch rush', origin: [48, -25], cols: 9, ground: 0x9aa39a,
    special: [
      { col: 4, side: 0, type: 'hq', name: 'FizzCo Tower' }, { col: 2, side: 0, type: 'prime', name: 'Tower Plaza West' },
      { col: 6, side: 1, type: 'prime', name: 'Tower Plaza East' }, { col: 3, side: 1, type: 'prime', name: 'Commerce Square' },
      { col: 7, side: 0, type: 'landmark', name: 'Founders Fountain' }, { col: 0, side: 1, type: 'industrial', name: 'Downtown Depot' },
    ],
  },
  {
    id: 'boardwalk', name: 'The Boardwalk', owner: 'blenders', traffic: [700, 1400], land: [12000, 24000], mix: { tourists: 0.75, students: 0.1, families: 0.1, kids: 0.05 },
    feel: 'Beach, pier, arcade, lifeguard towers', origin: [-90, 50], cols: 8, ground: 0xe9d8a6,
    special: [{ col: 6, side: 1, type: 'hq', name: 'The Blend Shack' }, { col: 4, side: 1, type: 'landmark', name: 'The Pier' }],
  },
  {
    id: 'harbor', name: 'The Harbor', owner: 'neutral', traffic: [300, 600], land: [6000, 12000], specialLand: { industrial: [20000, 40000], dock: [100000, 200000] }, mix: { workers: 0.85, families: 0.05, kids: 0.05, seniors: 0.05 },
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
    id: 'hilltop', name: 'Hilltop Estates', owner: 'sourwood', traffic: [300, 600], land: [240000, 480000], specialLand: { field: [120000, 240000], dock: [300000, 600000] }, mix: { highRollers: 1 },
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
  // Lottie's side lot next to it (sold to you on Day 3) is fixed too: 300 passersby, $300 land.
  const side = plots.find((p) => p.name === "Lottie's Side Lot")!;
  side.baseTraffic = SIDE_LOT.traffic;
  side.baseLand = SIDE_LOT.land;
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
export const LOTTIES_SIDE_LOT = PLOTS.find((p) => p.name === "Lottie's Side Lot")!.id;
export const DISTRICT_BY_ID: Record<DistrictId, District> = Object.fromEntries(DISTRICTS.map((d) => [d.id, d])) as Record<DistrictId, District>;

/**
 * Each district is one east-west street. Districts in the same row share a street line, and where two of them
 * border each other the street runs on from one into the next, so the end plots are neighbors across the line.
 * A plot's place on its line is its column plus the columns of the districts before it.
 */
const LINE_POS: Record<string, { line: number; pos: number }> = (() => {
  const rows = [...new Set(DISTRICTS.map((d) => d.origin[1]))];
  const out: Record<string, { line: number; pos: number }> = {};
  rows.forEach((z, line) => {
    let at = 0;
    let prev: District | null = null;
    for (const d of DISTRICTS.filter((x) => x.origin[1] === z).sort((a, b) => a.origin[0] - b.origin[0])) {
      if (prev && !BORDERS[prev.id].includes(d.id)) at += 3; // no shared border: the streets don't meet
      for (const p of PLOTS) if (p.district === d.id) out[p.id] = { line, pos: at + p.col };
      at += d.cols;
      prev = d;
    }
  });
  return out;
})();

/**
 * Within 2 plots (spec: The world): neighbors sit beside a plot (same side, one column over) or straight across
 * the street, across district lines too, and "within 2 plots" is neighbors of neighbors: the same side to two
 * columns over, the other side to one. The plot itself is included. One helper for demand splitting, Billboards,
 * the Billboard Roof, the Watchtower and Kids' Lemonade Day.
 */
export function withinTwo(a: Plot, b: Plot): boolean {
  const pa = LINE_POS[a.id], pb = LINE_POS[b.id];
  if (pa.line !== pb.line) return false;
  const d = Math.abs(pa.pos - pb.pos);
  return a.side === b.side ? d <= 2 : d <= 1;
}

/** Plots whose stands compete for the same passersby (within 2 plots, the plot itself included). */
const NEARBY: Record<string, Plot[]> = Object.fromEntries(PLOTS.map((p) => [p.id, PLOTS.filter((q) => withinTwo(p, q))]));
export function nearbyPlots(p: Plot): Plot[] {
  return NEARBY[p.id];
}

// ---------- Sandbox maps (spec: Sandbox: Turf War) ----------

/**
 * What a game knows about its map, on its Settings: the districts cut from the bay for a Sandbox Small or Medium map
 * (unset: all eight) and the plots retagged so the cut keeps its VIP land. Plots off the map stay in the state as
 * scenery: nobody owns, buys, builds on or counts them.
 */
export interface MapPicks { districts?: DistrictId[]; retag?: Record<string, PlotType> }
type Mapped = { settings: MapPicks };
const ALL: DistrictId[] = DISTRICTS.map((d) => d.id);

/** Is this district on the game's map? */
export const onMap = (s: Mapped, d: DistrictId): boolean => !s.settings.districts || s.settings.districts.includes(d);
/** Is this plot on the game's map? */
export const plotOnMap = (s: Mapped, p: Plot | string): boolean => onMap(s, (typeof p === 'string' ? PLOT_BY_ID[p] : p).district);
/** The game's districts, in bay order. */
export const mapDistricts = (s: Mapped): District[] => (s.settings.districts ? DISTRICTS.filter((d) => onMap(s, d.id)) : DISTRICTS);
/** A plot's type on this map: its own, or what a cut retagged it as (a Field, Dock or Industrial lot). */
export const plotType = (s: Mapped, p: Plot): PlotType => s.settings.retag?.[p.id] ?? p.type;

/** Do these districts make one map, every one reachable from the others over the canon borders? */
export function connected(ds: readonly DistrictId[]): boolean {
  if (!ds.length) return false;
  const seen = new Set<DistrictId>([ds[0]]);
  const todo = [ds[0]];
  while (todo.length) for (const b of BORDERS[todo.pop()!]) if (ds.includes(b) && !seen.has(b)) { seen.add(b); todo.push(b); }
  return seen.size === ds.length;
}

/**
 * The VIP land every map keeps (spec: "Every map keeps at least 1 Field and 1 Dock plot, so VIP clients stay
 * reachable"): a Dock for ships, a Field for helicopters, and Industrial land for the Bottling Works their bottles
 * come from (placeholder: spec gap, the spec names Fields and Docks only). The Dock comes first: it has to be on the water.
 */
export const VIP_LAND = ['dock', 'field', 'industrial'] as const;
/** Fillers after Maple Row and the rivals' homes, best first when the VIP land is equal: Old Town, the Harbor's docks
 * and plant, then the cheaper land. */
const FILL_ORDER: DistrictId[] = ['oldtown', 'harbor', 'groves', 'campus', 'boardwalk', 'downtown', 'hilltop']; // placeholder: spec gap

/** Lexicographic: does key a rank ahead of key b? */
const before = (a: number[], b: number[]) => { const i = a.findIndex((k, j) => k !== b[j]); return i >= 0 && a[i] < b[i]; };
const holds = (ds: readonly DistrictId[], t: PlotType) => PLOTS.some((p) => ds.includes(p.district) && p.type === t);
/** How far a plot's back is from the water: the south shore behind the beach row, or the east shore. */
const shoreGap = (p: Plot) => Math.min(p.side === 1 ? SEA_Z - p.z : Infinity, SEA_X - p.x);
const SHORE = 30;
/** Plain street plots a cut may retag (never Lottie's Corner or its side lot). */
const plainIn = (ds: readonly DistrictId[]) => PLOTS.filter((p) => ds.includes(p.district) && p.type === 'street' && p.id !== LOTTIES_CORNER && p.id !== LOTTIES_SIDE_LOT);
/** Can a ship reach this map: a Dock, or a plain plot on the water to make one? */
const wet = (ds: readonly DistrictId[]) => holds(ds, 'dock') || plainIn(ds).some((p) => shoreGap(p) < SHORE);

export interface MapCut { districts: DistrictId[]; retag: Record<string, PlotType> }

/**
 * Cut a Sandbox map from Citrine Bay (spec: "Small to Large are cut from Citrine Bay ... You start in Maple Row, and
 * each chosen rival brings its home district"). The rest are fillers that keep the map in one piece over the 11
 * borders. Of every way to do that, the cut takes one on the water (ships need a Dock), then one with Old Town (the
 * hub: its civic plots and every rival's Old Town stands), then the one that keeps the most real VIP land (so the
 * fewest plots need retagging), then the fillers in FILL_ORDER. Null when the picks can't make a map of that size:
 * Sourwood and the Blenders on Small (Hilltop is 3 borders from the Boardwalk).
 */
export function cutMap(size: MapSize, rivals: readonly RivalId[]): MapCut | null {
  const n = MAP_SIZES[size].districts;
  const must = [...new Set<DistrictId>(['maple', ...rivals.map((r) => FACTIONS[r].home as DistrictId)])];
  if (must.length > n) return null;
  if (n >= ALL.length) return { districts: [...ALL], retag: {} };
  const rest = FILL_ORDER.filter((d) => !must.includes(d));
  let best: { ds: DistrictId[]; key: number[] } | null = null;
  for (let mask = 0; mask < 1 << rest.length; mask++) {
    const fill = rest.filter((_, i) => mask & (1 << i));
    if (must.length + fill.length !== n) continue;
    const ds = [...must, ...fill];
    if (!connected(ds)) continue;
    const key = [wet(ds) ? 0 : 1, ds.includes('oldtown') ? 0 : 1, VIP_LAND.filter((t) => !holds(ds, t)).length, ...rest.map((d) => (fill.includes(d) ? 0 : 1))];
    if (!best || before(key, best.key)) best = { ds, key };
  }
  if (!best) return null;
  const districts = ALL.filter((d) => best!.ds.includes(d));
  return { districts, retag: retagFor(districts) };
}

/**
 * A map short of a Dock, Field or Industrial lot retags one plain street plot as it (spec gap: the spec doesn't say
 * which). A Dock goes on the plain plot nearest the water, so its pier reaches the bay; a Field or Industrial lot on
 * the cheapest plain plot outside Maple Row (Lottie's own street stays as it is), at its own land price. Retagged plots
 * start neutral and empty.
 */
function retagFor(ds: readonly DistrictId[]): Record<string, PlotType> {
  const retag: Record<string, PlotType> = {};
  const plain = plainIn(ds);
  for (const t of VIP_LAND) {
    if (holds(ds, t)) continue;
    const free = plain.filter((p) => !retag[p.id]);
    const order = t === 'dock'
      ? free.filter((p) => shoreGap(p) < SHORE).sort((a, b) => shoreGap(a) - shoreGap(b) || a.id.localeCompare(b.id))
      : free.filter((p) => p.district !== 'maple').sort((a, b) => a.baseLand - b.baseLand || a.id.localeCompare(b.id));
    const p = order[0] ?? free[0];
    if (p) retag[p.id] = t;
  }
  return retag;
}

/** Can these rivals play a map of this size: the right number, no repeats, and a map that holds together? */
export function picksFit(size: MapSize, rivals: readonly RivalId[]): boolean {
  return rivals.length === MAP_SIZES[size].rivals && new Set(rivals).size === rivals.length && rivals.every((r) => r in FACTIONS) && !!cutMap(size, rivals);
}
