/**
 * Colour tokens and the contrast maths behind R6.1.
 *
 * Kept out of CSS so the numbers can be asserted in `node --test`: the PRD
 * fixes `--muted` at #7a8796 and requires every small-text pair to reach
 * 4.5:1.
 */
export const TOKENS = Object.freeze({
  bg: '#06080b',
  surface: '#0a0d12',
  text: '#e8edf2',
  subtle: '#93a0af',
  muted: '#7a8796',
  accent: '#7cffb2',
  food: '#ff8a5b',
});

/** Foreground/background pairs that carry small text; all must reach 4.5:1. */
export const TEXT_PAIRS = Object.freeze([
  ['text', 'surface'],
  ['text', 'bg'],
  ['subtle', 'surface'],
  ['subtle', 'bg'],
  ['muted', 'surface'],
  ['muted', 'bg'],
  ['accent', 'bg'],
  ['accent', 'surface'],
]);

/** Non-text pairs (food, borders) only need 3:1 to stay distinguishable. */
export const GRAPHIC_PAIRS = Object.freeze([
  ['food', 'surface'],
  ['accent', 'surface'],
]);

function channel(value) {
  const normalised = value / 255;
  return normalised <= 0.03928
    ? normalised / 12.92
    : ((normalised + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance for a #rrggbb colour. */
export function luminance(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = channel((value >> 16) & 255);
  const g = channel((value >> 8) & 255);
  const b = channel(value & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
