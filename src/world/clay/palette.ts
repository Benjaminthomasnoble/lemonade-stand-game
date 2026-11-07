// The Kitchen-Table Clay palette: the mockup's P, plus the canon owner colours
// (design spec "Palette and patterns"), which stay exactly as the sim defines them.
import { FACTIONS, PLAYER_COLOR, type RivalId } from '../../sim/economy.ts';

/** Plasticine bars from the mockup (clay-mockup/dirs/clay/core.js). Bold, warm, saturated. */
export const P = {
  cream: '#FFF1D6', lemon: '#F7C948', green: '#7CC47F', teal: '#3BB4C1', terra: '#E8704F', walnut: '#8B5E3C',
  plum: '#2E2A4F', amber: '#FFB55E', blush: '#F4A3B5', white: '#FFFDF6', ink: '#2E2A4F',
  skin: '#F6C9A0', skin2: '#E3A27A', skin3: '#B9784F', skin4: '#8A5638',
  sw: '#5B2A6E', gold: '#C9A227', tea: '#B5651D', ging: '#D64545', cola: '#C8102E', chrome: '#B8C2CC',
  esp: '#3B2A20', oat: '#E8DCC4', neon: '#FF4FA3', mango: '#FF9F1C', lagoon: '#00A6A6', straw: '#E8C36A',
  stick: '#E9C98F', denim: '#4F6FA8', sand: '#F3DDA6',
  // world extras used by the scene (from the mockup's world.js)
  asphalt: '#5f5a74', walk: '#f1e2c6', curb: '#d8cbb4', paint: '#fff6e0', path: '#ecd3a8',
  leaf: '#5FA35A', leaf2: '#8fd08a', leaf3: '#6bb56f', soil: '#6b4a33', soil2: '#5a3d2a', pebble: '#b9a99a',
} as const;

/** A ramp of 8 skin tones (spec: assigned at random, never tied to faction or villainy). */
export const SKINS = ['#FBE0C6', '#F6C9A0', '#F2C29A', '#E9B48A', '#E3A27A', '#C98E66', '#B9784F', '#8A5638'] as const;

export const hexOf = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Owner main and accent colours, unchanged from canon (the sim's FACTIONS and PLAYER_COLOR). */
export const OWNER: Record<'player' | RivalId, { main: string; accent: string; accent2?: string }> = {
  player: { main: hexOf(PLAYER_COLOR), accent: '#FFFFFF' },
  sourwood: { main: hexOf(FACTIONS.sourwood.color), accent: hexOf(FACTIONS.sourwood.accent) },
  hollis: { main: hexOf(FACTIONS.hollis.color), accent: hexOf(FACTIONS.hollis.accent) },
  fizzco: { main: hexOf(FACTIONS.fizzco.color), accent: hexOf(FACTIONS.fizzco.accent) },
  coldbrew: { main: hexOf(FACTIONS.coldbrew.color), accent: '#E8DCC4', accent2: hexOf(FACTIONS.coldbrew.accent) },
  blenders: { main: hexOf(FACTIONS.blenders.color), accent: hexOf(FACTIONS.blenders.accent) },
};
