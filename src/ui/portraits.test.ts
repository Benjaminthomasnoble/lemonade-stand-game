// Every clay portrait the UI can ask for is baked (npm run bake:faces), and scene speakers find theirs.
import { describe, expect, it } from 'vitest';
import { BOSS_PORTRAIT, PORTRAITS, speakerPortrait, type PortraitId } from './portraits.ts';
import { SPEAKERS } from '../sim/scenes.ts';

describe('clay portraits', () => {
  it('has a baked image for every face', () => {
    const baked = Object.keys(import.meta.glob('../../public/faces/*.png')).map((f) => f.replace(/^.*\/|\.png$/g, ''));
    for (const id of Object.keys(PORTRAITS)) expect(baked, id).toContain(id);
  });
  it('covers every boss and every scene speaker', () => {
    for (const id of Object.values(BOSS_PORTRAIT)) expect(PORTRAITS[id]).toBeTruthy();
    for (const [id, name] of Object.entries(SPEAKERS)) expect(speakerPortrait(name)).toBe(id as PortraitId);
    expect(speakerPortrait('The Steward')).toBe('steward');
    expect(speakerPortrait('Captain Squawk')).toBe('squawk');
    expect(speakerPortrait('Someone new')).toBeUndefined();
  });
});
