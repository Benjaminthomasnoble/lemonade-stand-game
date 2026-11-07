import { describe, expect, it } from 'vitest';
import { newGame } from '../sim/economy.ts';
import { corkboardBody } from './corkboard.ts';

describe('the Rivals Corkboard', () => {
  it("pins each boss's own Reputation stars", () => {
    const s = newGame(91);
    s.rivals.fizzco.reputation = 3.46;
    const board = corkboardBody(s);
    expect(board).toMatch(/data-testid="cork-fizzco"[\s\S]*?data-testid="cork-stars" title="Reputation 3\.46 stars[^"]*">3\.5 stars</);
    expect(board).toMatch(/data-testid="cork-hollis"[\s\S]*?>3\.0 stars</); // 3.0 until a rival's first night
  });
});
