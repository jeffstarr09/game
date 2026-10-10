// Riso drum inks. Hex values approximate the real Riso spot colours so a
// painting on screen matches the poster that comes off the press.
import { rng, hashString } from './sim.js';

export const INKS = {
  'Fluorescent Pink': '#FF48B0',
  'Federal Blue': '#3D5588',
  'Medium Blue': '#3255A4',
  Blue: '#0078BF',
  Teal: '#00838A',
  Green: '#00A95C',
  'Hunter Green': '#407060',
  Yellow: '#FFE800',
  Sunflower: '#FFB511',
  Orange: '#FF6C2F',
  'Fluorescent Orange': '#FF7477',
  'Bright Red': '#F15060',
  Scarlet: '#F65058',
  Burgundy: '#914E72',
  Purple: '#765BA7',
  Violet: '#9D7AD2',
  Aqua: '#5EC8E5',
  Mint: '#82D8D5',
  Black: '#1D1D1B',
};

// [key ink (the line you start with), second, third, paper]
const EDITIONS = [
  ['Federal Blue', 'Fluorescent Pink', 'Sunflower', '#F2EDE4'],
  ['Black', 'Bright Red', 'Aqua', '#F1ECE2'],
  ['Medium Blue', 'Fluorescent Orange', 'Mint', '#F4EFE6'],
  ['Teal', 'Fluorescent Pink', 'Sunflower', '#F3EEE3'],
  ['Burgundy', 'Aqua', 'Yellow', '#F2ECE0'],
  ['Hunter Green', 'Fluorescent Orange', 'Violet', '#F1EDE4'],
  ['Purple', 'Orange', 'Mint', '#F3EEE6'],
  ['Blue', 'Scarlet', 'Yellow', '#F4F0E8'],
  ['Black', 'Fluorescent Pink', 'Teal', '#EFEAE0'],
  ['Federal Blue', 'Orange', 'Aqua', '#F2EEE6'],
  ['Green', 'Fluorescent Pink', 'Purple', '#F3EFE7'],
  ['Burgundy', 'Sunflower', 'Medium Blue', '#F1EBE1'],
];

export function paletteFor(seed) {
  const r = rng(hashString('edition/' + seed));
  const e = EDITIONS[Math.floor(r() * EDITIONS.length)];
  // Fixed misregistration per edition: every print of the day shares it,
  // exactly as one physical riso run would.
  const off = () => (r() - 0.5) * 3.2;
  return {
    names: e.slice(0, 3),
    inks: e.slice(0, 3).map((n) => INKS[n]),
    paper: e[3],
    reg: [
      [0, 0],
      [off(), off()],
      [off(), off()],
    ],
    halftoneAngle: 15 + Math.floor(r() * 4) * 15,
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
