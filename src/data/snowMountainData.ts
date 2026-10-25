/**
 * snowMountainData.ts
 * Transcripción estructurada por secciones al estilo Hooktheory (TheoryTab):
 * Super Mario 64 - Snow Mountain (Cool, Cool Mountain)
 * Koji Kondo - Do Mayor (C Major) - 140 BPM - Compás 4/4
 */

import type { RawChord, RawNote } from '../utils/theoryParser';

export interface SectionData {
  id: string;
  name: string;
  title: string;
  artist: string;
  bpm: number;
  timeSignature: [number, number];
  totalBeats: number;
  key?: { tonic: string; scale: string };
  keys: { beat: number; scale: string; tonic: string }[];
  chords: RawChord[];
  notes: RawNote[];
}

// ----------------------------------------------------
// 1. INTRO: 8 beats (2 compases, Hooktheory oficial)
// Tresillos cromáticos descendentes + Acorde V⁶ (G/B) en beat 7
// ----------------------------------------------------
export const INTRO_SECTION: SectionData = {
  id: 'intro',
  name: 'Intro',
  title: 'Super Mario 64 - Snow Mountain (Intro)',
  artist: 'Koji Kondo',
  bpm: 140,
  timeSignature: [4, 4],
  totalBeats: 8,
  keys: [{ beat: 1, scale: 'major', tonic: 'C' }],
  notes: [
    // Grupo 1 (Beat 1 a 2): Tresillo G5 - F#5 - G5 -> A5
    { beat: 1.0,   duration: 0.333, pitch: 'G5',  sd: '5',  octave: 0, color: '#30B8E8' },
    { beat: 1.333, duration: 0.333, pitch: 'F#5', sd: '#4', octave: 0, color: '#30C088', striped: true },
    { beat: 1.667, duration: 0.333, pitch: 'G5',  sd: '5',  octave: 0, color: '#30B8E8' },
    { beat: 2.0,   duration: 0.5,   pitch: 'A5',  sd: '6',  octave: 0, color: '#3060E8' },

    // Grupo 2 (Beat 3 a 4): Tresillo F5 - E5 - F5 -> G5
    { beat: 3.0,   duration: 0.333, pitch: 'F5',  sd: '4',  octave: 0, color: '#30C030' },
    { beat: 3.333, duration: 0.333, pitch: 'E5',  sd: '3',  octave: 0, color: '#E8D430' },
    { beat: 3.667, duration: 0.333, pitch: 'F5',  sd: '4',  octave: 0, color: '#30C030' },
    { beat: 4.0,   duration: 0.5,   pitch: 'G5',  sd: '5',  octave: 0, color: '#30B8E8' },

    // Grupo 3 (Beat 5 a 8): Tresillo E5 - Eb5 - E5 -> F5 -> D5 (larga)
    { beat: 5.0,   duration: 0.333, pitch: 'E5',  sd: '3',  octave: 0, color: '#E8D430' },
    { beat: 5.333, duration: 0.333, pitch: 'Eb5', sd: 'b3', octave: 0, color: '#E8A630', striped: true },
    { beat: 5.667, duration: 0.333, pitch: 'E5',  sd: '3',  octave: 0, color: '#E8D430' },
    { beat: 6.0,   duration: 0.5,   pitch: 'F5',  sd: '4',  octave: 0, color: '#30C030' },
    { beat: 7.0,   duration: 2.0,   pitch: 'D5',  sd: '2',  octave: 0, color: '#E87830' },
  ],
  chords: [
    // Beats 1 a 6 están completamente vacíos (sin acorde)
    {
      beat: 7,
      measure: 2,
      duration: 2,
      root: 5,
      inversion: 1,
      roman: 'V⁶',
      symbol: 'G/B',
      color: '#9030E8',
      rootMidi: 67,
      notes: ['B3', 'D4', 'G4'],
      midiNotes: [59, 62, 67],
    },
  ],
};

// ----------------------------------------------------
// 2. VERSE: 64 beats
// chords: I -> IV -> vii°/V -> iii -> iii7(phr) -> ii7 -> V7 -> I...
// ----------------------------------------------------
export const VERSE_NOTES: RawNote[] = [
  // --- FRASE 1: Compases 1 a 4 (Beats 1 a 16) ---
  // Compás 1 (M1) sobre I (C): Melodía en E5 (grado 3, amarillo)
  { beat: 1.0, duration: 1.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 2.5, duration: 1.0, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 3.5, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 4.0, duration: 0.5, pitch: "A5", sd: "6", octave: 0, color: "#3060E8" },
  { beat: 4.5, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },

  // Compás 2 (M2) sobre I (C): Resolución en C5 (grado 1, rojo)
  { beat: 5.0, duration: 4.0, pitch: "C5", sd: "1", octave: 0, color: "#E83030" },

  // Compases 3 y 4 (Beats 9 a 16) sobre IV (F) y vii°/V (F#°)
  { beat: 9.0, duration: 1.5, pitch: "A4", sd: "6", octave: -1, color: "#3060E8" },
  { beat: 10.5, duration: 1.0, pitch: "A4", sd: "6", octave: -1, color: "#3060E8" },
  { beat: 11.5, duration: 0.5, pitch: "C5", sd: "1", octave: 0, color: "#E83030" },
  { beat: 12.0, duration: 0.5, pitch: "D5", sd: "2", octave: 0, color: "#E87830" },
  { beat: 12.5, duration: 0.5, pitch: "C5", sd: "1", octave: 0, color: "#E83030" },
  { beat: 13.0, duration: 3.5, pitch: "A4", sd: "6", octave: -1, color: "#3060E8" },
  { beat: 16.5, duration: 0.5, pitch: "Ab4", sd: "b6", octave: -1, color: "#308CE8", isAltered: true },

  // Compases 5 y 6 (Beats 17 a 24) sobre iii (Em) y iii7(phr) (Eb7)
  { beat: 17.0, duration: 1.5, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 18.5, duration: 1.5, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 20.0, duration: 1.0, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 21.5, duration: 1.5, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 23.0, duration: 1.0, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 24.0, duration: 1.0, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },

  // Compases 7 y 8 (Beats 25 a 32) sobre ii7 (Dm7) y V7 (G7)
  { beat: 25.5, duration: 1.5, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 27.0, duration: 1.0, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 28.0, duration: 1.0, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 29.0, duration: 3.5, pitch: "D5", sd: "2", octave: 0, color: "#E87830" },
  { beat: 32.5, duration: 0.5, pitch: "D#5", sd: "#2", octave: 0, color: "#E8A630", isAltered: true },

  // Segunda mitad: Compases 9 a 16 (Beats 33 a 64)
  { beat: 33.0, duration: 1.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 34.5, duration: 1.0, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 35.5, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 36.0, duration: 0.5, pitch: "A5", sd: "6", octave: 0, color: "#3060E8" },
  { beat: 36.5, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 37.0, duration: 4.0, pitch: "Bb5", sd: "b7", octave: 0, color: "#6048E8", isAltered: true },

  { beat: 41.0, duration: 1.5, pitch: "A5", sd: "6", octave: 0, color: "#3060E8" },
  { beat: 42.5, duration: 1.0, pitch: "A5", sd: "6", octave: 0, color: "#3060E8" },
  { beat: 43.5, duration: 0.5, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 44.0, duration: 0.5, pitch: "D6", sd: "2", octave: 1, color: "#E87830" },
  { beat: 44.5, duration: 0.5, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 45.0, duration: 3.5, pitch: "A5", sd: "6", octave: 0, color: "#3060E8" },
  { beat: 48.5, duration: 0.5, pitch: "Ab5", sd: "b6", octave: 0, color: "#308CE8", isAltered: true },

  { beat: 49.0, duration: 1.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 50.5, duration: 1.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 52.0, duration: 1.0, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 53.5, duration: 1.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 55.0, duration: 1.0, pitch: "G4", sd: "5", octave: -1, color: "#30B8E8" },
  { beat: 56.0, duration: 1.0, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 57.0, duration: 4.0, pitch: "C5", sd: "1", octave: 0, color: "#E83030" }
];

export const VERSE_CHORDS: RawChord[] = [
  // Compás 1 y 2 (M1 y M2): El acorde I abarca 8 beats enteros
  {
    beat: 1,
    measure: 1,
    duration: 8,
    root: 1,
    type: 5,
    roman: 'I',
    symbol: 'C',
    color: '#E83030',
    notes: ['C4', 'E4', 'G4'],
    rootMidi: 60,
    midiNotes: [60, 64, 67],
  },
  // Compás 3 (M3)
  {
    beat: 9,
    measure: 3,
    duration: 4,
    root: 4,
    type: 5,
    roman: 'IV',
    symbol: 'F',
    color: '#30C030',
    notes: ['F4', 'A4', 'C5'],
    rootMidi: 65,
    midiNotes: [60, 65, 69],
  },
  // Compás 4 (M4)
  {
    beat: 13,
    measure: 4,
    duration: 4,
    root: 7,
    applied: 5,
    type: 5,
    roman: 'vii°/V',
    symbol: 'f#°',
    color: '#1DB33D',
    isAltered: true,
    notes: ['F#4', 'A4', 'C5'],
    rootMidi: 66,
    midiNotes: [66, 69, 72],
  },
  // Compás 5 (M5)
  {
    beat: 17,
    measure: 5,
    duration: 4,
    root: 3,
    type: 5,
    roman: 'iii',
    symbol: 'em',
    color: '#E8D430',
    notes: ['E4', 'G4', 'B4'],
    rootMidi: 64,
    midiNotes: [59, 64, 67],
  },
  // Compás 6 (M6)
  {
    beat: 21,
    measure: 6,
    duration: 4,
    root: 3,
    type: 7,
    borrowed: 'phrygian',
    roman: 'bIII⁷',
    sublabel: '(phr)',
    symbol: 'Eb7',
    color: '#E8A630',
    isAltered: true,
    notes: ['Eb4', 'G4', 'Bb4', 'Db5'],
    rootMidi: 63,
    midiNotes: [63, 67, 70, 73],
  },
  // Compás 7 (M7)
  {
    beat: 25,
    measure: 7,
    duration: 4,
    root: 2,
    type: 7,
    roman: 'ii⁷',
    symbol: 'dm7',
    color: '#E87830',
    notes: ['D4', 'F4', 'A4', 'C5'],
    rootMidi: 62,
    midiNotes: [60, 62, 65, 69],
  },
  // Compás 8 (M8)
  {
    beat: 29,
    measure: 8,
    duration: 4,
    root: 5,
    type: 7,
    roman: 'V⁷',
    symbol: 'G7',
    color: '#30B8E8',
    notes: ['G4', 'B4', 'D5', 'F5'],
    rootMidi: 67,
    midiNotes: [59, 62, 65, 67],
  },
  // Compás 9 (M9)
  {
    beat: 33,
    measure: 9,
    duration: 4,
    root: 1,
    type: 5,
    roman: 'I',
    symbol: 'C',
    color: '#E83030',
    notes: ['C4', 'E4', 'G4'],
    rootMidi: 60,
    midiNotes: [60, 64, 67],
  },
  // Compás 10 (M10)
  {
    beat: 37,
    measure: 10,
    duration: 4,
    root: 7,
    applied: 2,
    type: 7,
    roman: 'vii°⁷/ii',
    symbol: 'c#°7',
    color: '#E87830',
    isAltered: true,
    notes: ['C#4', 'E4', 'G4', 'Bb4'],
    rootMidi: 61,
    midiNotes: [61, 64, 67, 70],
  },
  // Compás 11 (M11)
  {
    beat: 41,
    measure: 11,
    duration: 4,
    root: 2,
    type: 7,
    roman: 'ii⁷',
    symbol: 'dm7',
    color: '#E87830',
    notes: ['D4', 'F4', 'A4', 'C5'],
    rootMidi: 62,
    midiNotes: [60, 62, 65, 69],
  },
  // Compás 12 (M12, Beat 45 a 48, duración 4 beats):
  {
    beat: 45,
    measure: 12,
    duration: 4,
    root: 7,
    applied: 3,
    type: 7,
    roman: 'vii°⁷/iii',
    symbol: 'd#°7',
    isAltered: true,
    color: '#E87830',
    notes: ['D#4', 'F#4', 'A4', 'C5'],
    rootMidi: 63,
    midiNotes: [63, 66, 69, 72],
  },
  // Compás 13 (M13, Beat 49 a 52) — Compartido: 2 acordes de 2 beats cada uno
  {
    beat: 49,
    measure: 13,
    duration: 2,
    root: 3,
    type: 7,
    roman: 'iii⁷',
    symbol: 'em7',
    color: '#E8D430',
    notes: ['E4', 'G4', 'B4', 'D5'],
    rootMidi: 64,
    midiNotes: [59, 64, 67, 71],
  },
  {
    beat: 51,
    measure: 13,
    duration: 2,
    root: 3,
    type: 7,
    borrowed: 'phrygian',
    roman: 'bIII⁷',
    sublabel: '(phr)',
    symbol: 'Eb7',
    isAltered: true,
    color: '#E8A630',
    notes: ['Eb4', 'G4', 'Bb4', 'Db5'],
    rootMidi: 63,
    midiNotes: [63, 67, 70, 73],
  },
  // Compás 14 (M14, Beat 53 a 56) — Compartido: 2 acordes de 2 beats cada uno
  {
    beat: 53,
    measure: 14,
    duration: 2,
    root: 2,
    type: 7,
    roman: 'ii⁷',
    symbol: 'dm7',
    color: '#E87830',
    notes: ['D4', 'F4', 'A4', 'C5'],
    rootMidi: 62,
    midiNotes: [60, 62, 65, 69],
  },
  {
    beat: 55,
    measure: 14,
    duration: 2,
    root: 5,
    type: 7,
    roman: 'V⁷',
    symbol: 'G7',
    color: '#30B8E8',
    notes: ['G4', 'B4', 'D5', 'F5'],
    rootMidi: 67,
    midiNotes: [59, 62, 65, 67],
  },
  // Compases 15 y 16 (M15-M16, Beats 57 a 64, duración 8 beats enteros):
  // El acorde I dura dos compases completos de reposo antes del Coro
  {
    beat: 57,
    measure: 15,
    duration: 8,
    root: 1,
    type: 5,
    roman: 'I',
    symbol: 'C',
    color: '#E83030',
    notes: ['C4', 'E4', 'G4'],
    rootMidi: 60,
    midiNotes: [60, 64, 67],
  },
];

export const VERSE_SECTION: SectionData = {
  id: 'verse',
  name: 'Verse',
  title: 'Super Mario 64 - Snow Mountain (Verse)',
  artist: 'Koji Kondo',
  bpm: 140,
  timeSignature: [4, 4],
  totalBeats: 64,
  keys: [{ beat: 1, scale: 'major', tonic: 'C' }],
  chords: VERSE_CHORDS,
  notes: VERSE_NOTES,
};

// ----------------------------------------------------
// 3. CHORUS: 64 beats (Fuente oficial limpia CHORUS_DATA)
// ----------------------------------------------------
const rawChorusNotes: RawNote[] = [
  { beat: 1, duration: 2, sd: '6', octave: 0, pitch: 'A5' },
  // silencio en beat 3 (duración 1)
  { beat: 4, duration: 1, sd: '6', octave: 0, pitch: 'A5' },
  { beat: 5, duration: 2, sd: '5', octave: 0, pitch: 'G5' },
  { beat: 7, duration: 1, sd: '6', octave: 0, pitch: 'A5' },
  { beat: 8, duration: 1, sd: '3', octave: 0, pitch: 'E5' },
  { beat: 9, duration: 2, sd: '4', octave: 0, pitch: 'F5' },
  { beat: 11, duration: 2, sd: '5', octave: 0, pitch: 'G5' },
  { beat: 13, duration: 2, sd: '3', octave: 0, pitch: 'E5' },
  // tresillo en beat 16
  { beat: 16, duration: 0.333, sd: '4', octave: 0, pitch: 'F5' },
  { beat: 16.333, duration: 0.333, sd: 'b5', octave: 0, pitch: 'Gb5' },
  { beat: 16.667, duration: 0.333, sd: '5', octave: 0, pitch: 'G5' },
  { beat: 17, duration: 2, sd: '6', octave: 0, pitch: 'A5' },
  { beat: 20, duration: 1, sd: '6', octave: 0, pitch: 'A5' },
  { beat: 21, duration: 2, sd: '5', octave: 0, pitch: 'G5' },
  { beat: 23, duration: 1, sd: '6', octave: 0, pitch: 'A5' },
  { beat: 24, duration: 1, sd: '3', octave: 0, pitch: 'E5' },
  { beat: 25, duration: 2, sd: '4', octave: 0, pitch: 'F5' },
  { beat: 27, duration: 1, sd: '3', octave: 0, pitch: 'E5' },
  { beat: 28, duration: 1, sd: '2', octave: 0, pitch: 'D5' },
  { beat: 29, duration: 2, sd: '1', octave: 0, pitch: 'C5' },
];

const rawChorusChords: RawChord[] = [
  { beat: 1, measure: 1, duration: 4, root: '4', rootMidi: 65, notes: ['F4', 'A4', 'C5'], midiNotes: [60, 65, 69], roman: 'IV', symbol: 'F', color: '#30C030' },
  { beat: 5, measure: 2, duration: 4, root: '1', inversion: 1, rootMidi: 60, notes: ['E4', 'G4', 'C5'], midiNotes: [64, 67, 72], roman: 'I⁶', symbol: 'C/E', color: '#E83030' },
  { beat: 9, measure: 3, duration: 2, root: '2', rootMidi: 62, notes: ['D4', 'F4', 'A4'], midiNotes: [62, 65, 69], roman: 'ii', symbol: 'Dm', color: '#E87830' },
  { beat: 11, measure: 3, duration: 2, root: '5', rootMidi: 67, notes: ['G4', 'B4', 'D5', 'F5'], midiNotes: [59, 62, 65, 67], roman: 'V⁷', symbol: 'G⁷', color: '#30B8E8' },
  { beat: 13, measure: 4, duration: 4, root: '1', rootMidi: 60, notes: ['C4', 'E4', 'G4'], midiNotes: [60, 64, 67], roman: 'I', symbol: 'C', color: '#E83030' },
  { beat: 17, measure: 5, duration: 4, root: '4', rootMidi: 65, notes: ['F4', 'A4', 'C5'], midiNotes: [60, 65, 69], roman: 'IV', symbol: 'F', color: '#30C030' },
  { beat: 21, measure: 6, duration: 4, root: '1', inversion: 1, rootMidi: 60, notes: ['E4', 'G4', 'C5'], midiNotes: [64, 67, 72], roman: 'I⁶', symbol: 'C/E', color: '#E83030' },
  { beat: 25, measure: 7, duration: 2, root: '2', rootMidi: 62, notes: ['D4', 'F4', 'A4'], midiNotes: [62, 65, 69], roman: 'ii', symbol: 'Dm', color: '#E87830' },
  { beat: 27, measure: 7, duration: 2, root: '5', rootMidi: 67, notes: ['G4', 'B4', 'D5', 'F5'], midiNotes: [59, 62, 65, 67], roman: 'V⁷', symbol: 'G⁷', color: '#30B8E8' },
  { beat: 29, measure: 8, duration: 4, root: '1', rootMidi: 60, notes: ['C4', 'E4', 'G4'], midiNotes: [60, 64, 67], roman: 'I', symbol: 'C', color: '#E83030' },
];

function buildFullChorusNotes(): RawNote[] {
  const allNotes = [...rawChorusNotes];
  for (const n of rawChorusNotes) {
    allNotes.push({
      ...n,
      beat: n.beat + 32,
    });
  }
  return allNotes;
}

function buildFullChorusChords(): RawChord[] {
  const allChords = [...rawChorusChords];
  for (const c of rawChorusChords) {
    allChords.push({
      ...c,
      beat: c.beat + 32,
      measure: Math.floor((c.beat + 32 - 1) / 4) + 1,
    });
  }
  return allChords;
}

export const CHORUS_SECTION: SectionData = {
  id: 'chorus',
  name: 'Chorus',
  title: 'Super Mario 64 - Snow Mountain (Chorus)',
  artist: 'Koji Kondo',
  bpm: 140,
  timeSignature: [4, 4],
  totalBeats: 64,
  keys: [{ beat: 1, scale: 'major', tonic: 'C' }],
  chords: buildFullChorusChords(),
  notes: buildFullChorusNotes(),
};

// ----------------------------------------------------
// 4. OUTRO: 32 beats (8 compases exactos)
// chords: I7 -> I7 -> IV7(dor) -> IV7(dor) -> I7 -> I7 -> IV7(dor) -> V7
// ----------------------------------------------------
export const OUTRO_NOTES: RawNote[] = [
  // Frase 1: Compases 1 y 2 (Beats 1 a 8) sobre I7 (C7)
  { beat: 1.0, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 2.0, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 2.5, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 3.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 4.0, duration: 0.5, pitch: "B5", sd: "#7", octave: 1, color: "#B5179E", isAltered: true },
  { beat: 4.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },

  { beat: 5.0, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 6.0, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 6.5, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 7.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 8.0, duration: 0.5, pitch: "B5", sd: "#7", octave: 1, color: "#B5179E", isAltered: true },
  { beat: 8.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },

  // Frase 2: Compases 3 y 4 (Beats 9 a 16) sobre IV7 (F7 dorian)
  { beat: 9.0,  duration: 1.0, pitch: "A5",  sd: "6",  octave: 0, color: "#3060E8" },
  { beat: 10.0, duration: 0.5, pitch: "Eb5", sd: "b3", octave: 0, color: "#E8A630", isAltered: true },
  { beat: 10.5, duration: 1.0, pitch: "F5",  sd: "4",  octave: 0, color: "#30C030" },
  { beat: 11.5, duration: 0.5, pitch: "Eb5", sd: "b3", octave: 0, color: "#E8A630", isAltered: true },
  { beat: 12.0, duration: 0.5, pitch: "A5",  sd: "6",  octave: 0, color: "#3060E8" },
  { beat: 12.5, duration: 0.5, pitch: "F5",  sd: "4",  octave: 0, color: "#30C030" },

  { beat: 13.0, duration: 1.0, pitch: "A5",  sd: "6",  octave: 0, color: "#3060E8" },
  { beat: 14.0, duration: 0.5, pitch: "Eb5", sd: "b3", octave: 0, color: "#E8A630", isAltered: true },
  { beat: 14.5, duration: 1.0, pitch: "F5",  sd: "4",  octave: 0, color: "#30C030" },
  { beat: 15.5, duration: 0.5, pitch: "Eb5", sd: "b3", octave: 0, color: "#E8A630", isAltered: true },
  { beat: 16.0, duration: 0.5, pitch: "A5",  sd: "6",  octave: 0, color: "#3060E8" },
  { beat: 16.5, duration: 0.5, pitch: "F5",  sd: "4",  octave: 0, color: "#30C030" },

  // Frase 3: Compases 5 y 6 (Beats 17 a 24) sobre I7 (C7)
  { beat: 17.0, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 18.0, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 18.5, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 19.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 20.0, duration: 0.5, pitch: "B5", sd: "#7", octave: 1, color: "#B5179E", isAltered: true },
  { beat: 20.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },

  { beat: 21.0, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 22.0, duration: 0.5, pitch: "G5", sd: "5", octave: 0, color: "#30B8E8" },
  { beat: 22.5, duration: 1.0, pitch: "C6", sd: "1", octave: 1, color: "#E83030" },
  { beat: 23.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },
  { beat: 24.0, duration: 0.5, pitch: "B5", sd: "#7", octave: 1, color: "#B5179E", isAltered: true },
  { beat: 24.5, duration: 0.5, pitch: "E5", sd: "3", octave: 0, color: "#E8D430" },

  // Frase 4: Compás 7 (Beats 25 a 28) sobre IV7 (F7 dorian)
  { beat: 25.0, duration: 1.0, pitch: "A5",  sd: "6",  octave: 0, color: "#3060E8" },
  { beat: 26.0, duration: 0.5, pitch: "Eb5", sd: "b3", octave: 0, color: "#E8A630", isAltered: true },
  { beat: 26.5, duration: 1.0, pitch: "F5",  sd: "4",  octave: 0, color: "#30C030" },
  { beat: 27.5, duration: 0.5, pitch: "Eb5", sd: "b3", octave: 0, color: "#E8A630", isAltered: true },
  { beat: 28.0, duration: 0.5, pitch: "A5",  sd: "6",  octave: 0, color: "#3060E8" },
  { beat: 28.5, duration: 0.5, pitch: "F5",  sd: "4",  octave: 0, color: "#30C030" },

  // Frase 4 cierre: Compás 8 (Beats 29 a 32) sobre V7 (G7)
  { beat: 29.0, duration: 1.0, pitch: "B5", sd: "#7", octave: 1, color: "#B5179E", isAltered: true },
  { beat: 30.0, duration: 0.5, pitch: "D5", sd: "2",  octave: 0, color: "#D97025" },
  { beat: 30.5, duration: 1.0, pitch: "F5", sd: "4",  octave: 0, color: "#1DB33D" },
  { beat: 31.5, duration: 0.5, pitch: "D5", sd: "2",  octave: 0, color: "#D97025" },
  { beat: 32.0, duration: 0.5, pitch: "B5", sd: "#7", octave: 1, color: "#B5179E", isAltered: true },
  { beat: 32.5, duration: 0.5, pitch: "F5", sd: "4",  octave: 0, color: "#1DB33D" }
];

export const OUTRO_SECTION: SectionData = {
  id: 'outro',
  name: 'Outro',
  title: 'Super Mario 64 - Snow Mountain (Outro)',
  artist: 'Koji Kondo',
  bpm: 140,
  timeSignature: [4, 4],
  totalBeats: 32,
  key: { tonic: 'C', scale: 'mixolydian' },
  keys: [{ beat: 1, scale: 'mixolydian', tonic: 'C' }],
  chords: [
    { beat: 1, measure: 1, duration: 4, roman: 'I⁷', symbol: 'C7', root: '1', color: '#E83030', rootMidi: 60, notes: ['C4', 'E4', 'G4', 'Bb4'], midiNotes: [60, 64, 67, 70] },
    { beat: 5, measure: 2, duration: 4, roman: 'I⁷', symbol: 'C7', root: '1', color: '#E83030', rootMidi: 60, notes: ['C4', 'E4', 'G4', 'Bb4'], midiNotes: [60, 64, 67, 70] },
    { beat: 9, measure: 3, duration: 4, roman: 'IV⁷', sublabel: '(dor)', symbol: 'F7', root: '4', borrowed: 'dorian', isAltered: true, color: '#30C030', rootMidi: 65, notes: ['F4', 'A4', 'C5', 'Eb5'], midiNotes: [60, 63, 65, 69] },
    { beat: 13, measure: 4, duration: 4, roman: 'IV⁷', sublabel: '(dor)', symbol: 'F7', root: '4', borrowed: 'dorian', isAltered: true, color: '#30C030', rootMidi: 65, notes: ['F4', 'A4', 'C5', 'Eb5'], midiNotes: [60, 63, 65, 69] },
    { beat: 17, measure: 5, duration: 4, roman: 'I⁷', symbol: 'C7', root: '1', color: '#E83030', rootMidi: 60, notes: ['C4', 'E4', 'G4', 'Bb4'], midiNotes: [60, 64, 67, 70] },
    { beat: 21, measure: 6, duration: 4, roman: 'I⁷', symbol: 'C7', root: '1', color: '#E83030', rootMidi: 60, notes: ['C4', 'E4', 'G4', 'Bb4'], midiNotes: [60, 64, 67, 70] },
    { beat: 25, measure: 7, duration: 4, roman: 'IV⁷', sublabel: '(dor)', symbol: 'F7', root: '4', borrowed: 'dorian', isAltered: true, color: '#30C030', rootMidi: 65, notes: ['F4', 'A4', 'C5', 'Eb5'], midiNotes: [60, 63, 65, 69] },
    { beat: 29, measure: 8, duration: 4, roman: 'V⁷', sublabel: '(maj)', symbol: 'G7', root: '5', borrowed: 'major', isAltered: true, color: '#30B8E8', rootMidi: 67, notes: ['G4', 'B4', 'D5', 'F5'], midiNotes: [59, 62, 65, 67] },
  ],
  notes: OUTRO_NOTES,
};

// ----------------------------------------------------
// 5. ALL SECTIONS: Concatena Intro + Verse + Chorus + Outro (168 beats)
// ----------------------------------------------------
function buildAllSections(): SectionData {
  const sections = [INTRO_SECTION, VERSE_SECTION, CHORUS_SECTION, OUTRO_SECTION];
  let currentOffset = 0;
  const allChords: RawChord[] = [];
  const allNotes: RawNote[] = [];
  const allKeys: { beat: number; scale: string; tonic: string }[] = [];

  for (const s of sections) {
    if (s.keys) {
      for (const k of s.keys) {
        allKeys.push({
          ...k,
          beat: k.beat + currentOffset,
        });
      }
    } else if (s.key) {
      allKeys.push({
        beat: 1 + currentOffset,
        scale: s.key.scale,
        tonic: s.key.tonic,
      });
    }

    for (const c of s.chords) {
      allChords.push({
        ...c,
        beat: c.beat + currentOffset,
        measure: Math.floor((c.beat + currentOffset - 1) / 4) + 1,
      });
    }

    for (const n of s.notes) {
      allNotes.push({
        ...n,
        beat: n.beat + currentOffset,
      });
    }

    currentOffset += s.totalBeats;
  }

  return {
    id: 'all',
    name: 'All Sections',
    title: 'Super Mario 64 - Snow Mountain (Full Theme)',
    artist: 'Koji Kondo',
    bpm: 140,
    timeSignature: [4, 4],
    totalBeats: currentOffset, // 8 + 64 + 64 + 32 = 168 beats
    keys: allKeys.length > 0 ? allKeys : [{ beat: 1, scale: 'major', tonic: 'C' }],
    chords: allChords,
    notes: allNotes,
  };
}

export const ALL_SECTIONS = buildAllSections();

export const SECTIONS_MAP: Record<string, SectionData> = {
  all: ALL_SECTIONS,
  intro: INTRO_SECTION,
  verse: VERSE_SECTION,
  chorus: CHORUS_SECTION,
  outro: OUTRO_SECTION,
};

export const SECTIONS_LIST: SectionData[] = [
  ALL_SECTIONS,
  INTRO_SECTION,
  VERSE_SECTION,
  CHORUS_SECTION,
  OUTRO_SECTION,
];
