// Every painting gets a title, written from how the run actually went.
// Deterministic: the same run always has the same name, so titles become
// something people quote ("did you see 'Nocturne, Leaving the Frame'?").
import { rng } from './sim.js';

const FORMS = [
  'Study', 'Composition', 'Nocturne', 'Etude', 'Portrait', 'Landscape', 'Meditation',
  'Elegy', 'Variation', 'Fugue', 'Self-Portrait', 'Interior', 'Figure', 'Arrangement',
  'Improvisation', 'Allegory', 'Fragment', 'Litany', 'Hymn', 'Interruption',
];
const SUBJECTS = [
  'for a Restless Hand', 'of a Long Afternoon', 'with Small Regrets', 'in the Manner of Nobody',
  'for Two Thumbs', 'of the Inner Margin', 'with Stones', 'without a Plan', 'in Borrowed Light',
  'for an Empty Room', 'of Almost Everything', 'with Gestures', 'after Midnight', 'of Quiet Panic',
  'for the Unhung', 'of a Wandering Nib', 'in Three Inks', 'of the Last Inch',
];
const ENDINGS = {
  line: ['Crossing Itself', 'Meeting Itself', 'Interrupted by Itself', 'Turning Inward', 'Biting Its Tail'],
  edge: ['Leaving the Frame', 'Falling off the Page', 'Seeking the Exit', 'Walking Out', 'At the Edge'],
  stone: ['Meeting the Stone', 'Against the Rock', 'Stopped by Weather', 'and the Immovable', 'Upon the Blot'],
  time: ['Without End', 'That Would Not Stop', 'Infinite', 'Still Going', 'Unfinished'],
};

export function titleFor(w, inkNames) {
  const r = rng((w.seed ^ (w.tick * 2654435761)) >>> 0);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const end = pick(ENDINGS[w.deathCause] || ENDINGS.line);
  const secs = w.tick / 60;

  if (secs < 4) return pick(['False Start', 'Hesitation', 'A Brief Remark', 'Haiku', 'Sneeze']);
  if (secs < 10) return `${pick(['Sketch', 'Gesture', 'Note', 'Doodle'])}, ${end}`;
  if (w.pigments >= 12) return `${pick(FORMS)} in ${w.pigments} Pigments, ${end}`;
  if (w.bestGrazeStreak >= 150) return `${pick(['Close Call', 'Near Miss', 'Vertigo', 'Nerve'])} No. ${w.bestGrazeStreak}`;
  const roll = r();
  if (roll < 0.33 && inkNames) return `${pick(FORMS)} in ${inkNames[w.ink]}, ${end}`;
  if (roll < 0.66) return `${pick(FORMS)} ${pick(SUBJECTS)}`;
  return `${pick(FORMS)}, ${end}`;
}
