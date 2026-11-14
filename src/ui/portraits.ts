// Clay portraits baked from the 3D figures (tools/bake-faces.mjs writes public/faces/<id>.png).
// Bosses for the phone polaroid, Corkboard pins, boss board and Sandbox picks; speakers for the scene ticket.
import type { RivalId } from '../sim/balance.ts';

/** Every baked face and who it is. */
export const PORTRAITS = {
  vera: 'Vera Sourwood', tilly: 'Tilly Hollis', preston: 'Preston Fizzwell III', juni: 'Juni Grind', brock: 'Brock Bodine', sterling: 'Sterling Snoot',
  steward: 'a Sourwood Steward', dex: 'Dex Moody', marisol: 'Marisol', skip: 'Skip Larkin', benny: 'Benny Buzz', budd: 'Sheriff Budd', fontaine: 'Mayor Fontaine', squawk: 'Captain Squawk',
  lottie: 'Lottie',
} as const;
export type PortraitId = keyof typeof PORTRAITS;

/** Each rival's boss portrait. */
export const BOSS_PORTRAIT: Record<RivalId, PortraitId> = { sourwood: 'vera', hollis: 'tilly', fizzco: 'preston', coldbrew: 'juni', blenders: 'brock', snootwater: 'sterling' };

/** The image URL of a baked face (192 px square, transparent, about head and shoulders). */
export const portraitUrl = (id: PortraitId): string => `${import.meta.env.BASE_URL}faces/${id}.png`;

/** A scene speaker's face by the name a scene line gives (sceneLine's who, SPEAKERS in sim/scenes.ts), if one is baked. */
export function speakerPortrait(who: string): PortraitId | undefined {
  const w = who.toLowerCase();
  if (w.includes('steward')) return 'steward';
  if (w.includes('squawk') || w.includes('gull')) return 'squawk';
  if (w.includes('sheriff') || w.includes('budd')) return 'budd';
  if (w.includes('mayor') || w.includes('fontaine')) return 'fontaine';
  if (w.includes('skip')) return 'skip';
  if (w.includes('benny')) return 'benny';
  if (w.includes('marisol')) return 'marisol';
  if (w.includes('dex')) return 'dex';
  if (w.includes('vera')) return 'vera';
  if (w.includes('tilly')) return 'tilly';
  if (w.includes('preston')) return 'preston';
  if (w.includes('juni')) return 'juni';
  if (w.includes('brock')) return 'brock';
  if (w.includes('sterling')) return 'sterling';
  if (w.includes('lottie') || w.includes('grandma')) return 'lottie';
  return undefined;
}
