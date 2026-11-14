import { afterEach, describe, expect, it } from 'vitest';
import { LOTTIES_CORNER, newGame, newStand, NO_DEFENSE, PLOTS, runBulk, standCost, type GameState } from '../sim/economy.ts';
import { btn, esc, whole } from './recipes.ts';
import { bulkAction, bulkCards, pickBulk, resetBulk, type BulkKit } from './bulk.ts';

/** A bare clay kit: each card is its test id, title, subtitle and buttons. */
const kit: BulkKit = {
  ART: { stand: (l) => `<stand ${l}>`, fence: (t) => `<fence ${t}>` },
  btn, esc, whole,
  card: (_art, title, sub, action, tip = '', extra = '') => `<div ${extra} data-tip="${tip}"><b>${title}</b><i>${sub}</i>${action}</div>`,
};

/** Morning Prep at Rank 3 with Lottie's Table and two Old Town Tables. */
function prep(): GameState {
  const s = newGame(91);
  s.rank = 3;
  s.phase = 'prep';
  s.cash = 3000;
  for (const p of PLOTS.filter((x) => x.district === 'oldtown' && x.type === 'street' && !s.plots[x.id].owner).slice(0, 2)) {
    s.plots[p.id] = { ...s.plots[p.id], owner: 'player', stand: newStand(1), invested: standCost(1), defense: NO_DEFENSE() };
  }
  return s;
}
/** Read a button's data attributes the way the HUD's listener does. */
const data = (html: string, id: string): DOMStringMap => {
  const tag = html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
  const out: DOMStringMap = {};
  for (const m of tag.matchAll(/data-([a-z]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

afterEach(resetBulk);

describe("the Grow tab's bulk order", () => {
  it('stays hidden below Rank 3', () => {
    const s = prep();
    s.rank = 2;
    expect(bulkCards(kit, s)).toEqual([]);
  });

  it('reads the order in words, what the budget buys, and sends it with Go', () => {
    const s = prep();
    const html = bulkCards(kit, s).join('');
    expect(html).toContain('<b>Upgrade every stand</b><i>3 of 3 · $1,200</i>');
    expect(html).toContain('>Folding Tables</button>');
    expect(html).toContain('>Maple Row</button>');
    expect(html).toContain('>Old Town</button>');
    expect(html).not.toContain('No fence'); // a fence group only for fences
    expect(html).toContain('data-testid="bulk-budget">All cash<');
    const go = bulkAction(data(html, 'bulk-go'));
    expect(go).toEqual({ type: 'bulk', order: { act: 'upgrade', group: 'all', budget: Infinity } });
    if (go.type !== 'bulk') throw new Error('not a bulk order');
    expect(runBulk(s, go.order)).toBe(3);
    expect(s.plots[LOTTIES_CORNER].stand!.level).toBe(2);
  });

  it('picks the job, the group and the budget', () => {
    const s = prep();
    pickBulk({ act: 'fence' });
    pickBulk({ group: 'district:oldtown' });
    let html = bulkCards(kit, s).join('');
    expect(html).toContain('<b>Fence every plot in Old Town</b><i>2 of 2 · $300</i>');
    expect(html).toContain('>No fence</button>');
    // The budget steps down from all your cash to the steps under it.
    expect(data(html, 'bulk-go').budget).toBe('Infinity');
    expect(html.match(/<button[^>]*aria-label="Less"[^>]*>/)![0]).toContain('data-budget="2500"');
    expect(html.match(/<button[^>]*aria-label="More"[^>]*>/)![0]).toContain('disabled');
    pickBulk({ budget: '2500' });
    pickBulk({ budget: '500' });
    pickBulk({ budget: '250' }); // not a step: it's still a budget
    html = bulkCards(kit, s).join('');
    expect(html).toContain('data-testid="bulk-budget">$250<');
    expect(html).toContain('<i>1 of 2 · $150</i>');
    pickBulk({ budget: '100' });
    html = bulkCards(kit, s).join('');
    expect(html).toContain('<i>Needs $150</i>');
    expect(html.match(/<button[^>]*data-testid="bulk-go"[^>]*>/)![0]).toContain('disabled title="Needs $150"');
  });

  it('falls back to every stand when the group is gone, and hides levels your rank cannot lift', () => {
    const s = prep();
    s.plots[LOTTIES_CORNER].stand = newStand(3);
    pickBulk({ group: 'level:3' });
    const html = bulkCards(kit, s).join('');
    expect(html).not.toContain('>Kiosks</button>'); // a Lemon Shack waits for Rank 5
    expect(html).toContain('<b>Upgrade every stand</b>');
    s.rank = 5;
    expect(bulkCards(kit, s).join('')).toContain('<b>Upgrade every Kiosk</b>');
  });
});
