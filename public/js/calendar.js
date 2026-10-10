// Shared date + naming helpers (browser and server).
// Exhibitions run on UTC days so the whole world shares one painting a day.

export const EPOCH = '2026-10-10'; // Exhibition No. 1

export function dateFor(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateFor(Date.parse(s + 'T00:00:00Z')) === s;
}

export function dayNumber(date) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(EPOCH + 'T00:00:00Z')) / 86400000) + 1;
}

export function dateOfDay(n) {
  return dateFor(Date.parse(EPOCH + 'T00:00:00Z') + (n - 1) * 86400000);
}

// Names are signatures on paintings: short, uppercase, letters/digits and a
// few marks. A small blocklist keeps the wall presentable; moderation tools
// come later.
const BLOCK = ['FUCK', 'SHIT', 'CUNT', 'NIGG', 'FAGG', 'RAPE', 'HITLER', 'NAZI', 'KKK', 'WHORE', 'SLUT', 'PENIS', 'COCK', 'DICK', 'PUSSY', 'RETARD'];

export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} ._\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 14);
  if (s.length < 2) return null;
  const flat = s.replace(/0/g, 'O').replace(/[1!]/g, 'I').replace(/3/g, 'E').replace(/[^A-Z]/g, '');
  if (BLOCK.some((b) => flat.includes(b))) return null;
  return s;
}
