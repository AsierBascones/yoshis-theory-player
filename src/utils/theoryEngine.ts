/**
 * theoryEngine.ts
 * Motor de resolución de teoría musical: convierte acordes y melodías relativos (sd)
 * a valores MIDI absolutos, pitches con nombre, colores y voicings.
 *
 * Re-exporta utilidades comunes de musicTheory.ts para mantener compatibilidad de imports.
 */

import * as Tone from 'tone';
import type {
  UniversalChord,
  KeySignature,
  KeyChange,
  ResolvedChord,
  ResolvedChordVoice,
} from '../types/music';
export type { KeyChange };
import { getDegreeColor, getColorByDegree } from './theoryColors';
import { SD_TO_SEMITONES } from './theoryParser';

// ── Re-exports de musicTheory.ts para compatibilidad ──
export {
  applySwingTransform,
  getScaleSpelling,
  formatPitch,
} from './musicTheory';

// ────────────────────────────────────────────────────────────────────────────
// normalizeBorrowed: Sanitizador seguro para arrays de semitonos o strings de borrowed
// ────────────────────────────────────────────────────────────────────────────
export function normalizeBorrowed(borrowed: unknown): string {
  if (!borrowed) return "";
  if (typeof borrowed === "string") return borrowed.toLowerCase();
  if (Array.isArray(borrowed)) {
    // Identificador seguro para arrays de escala/préstamo de Hooktheory
    return "custom_borrowed";
  }
  return "";
}

// ────────────────────────────────────────────────────────────────────────────
// getKeyAtBeat: Resolución dinámica por pulso de la modulación o tonalidad activa
// ────────────────────────────────────────────────────────────────────────────
export function getKeyAtBeat(keys: KeyChange[] | undefined | null, beat: number): KeyChange {
  if (!keys || keys.length === 0) return { beat: 1, tonic: "C", scale: "major" };
  const sorted = [...keys].sort((a, b) => a.beat - b.beat);
  let active = sorted[0];
  for (const k of sorted) {
    if (beat >= k.beat) active = k;
    else break;
  }
  return active;
}

// ────────────────────────────────────────────────────────────────────────────
// NOTE_TO_PC: Nombre de nota → Pitch Class (0–11, C = 0)
// ────────────────────────────────────────────────────────────────────────────
export const NOTE_TO_PC: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

const PC_TO_NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ────────────────────────────────────────────────────────────────────────────
// Semitonos diatónicos desde la tónica para escala mayor
// ────────────────────────────────────────────────────────────────────────────
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11]; // I ii iii IV V vi vii

// Intervalos de acorde según calidad (semitonos desde la fundamental)
const CHORD_INTERVALS: Record<string, number[]> = {
  maj:      [0, 4, 7],
  min:      [0, 3, 7],
  dim:      [0, 3, 6],
  aug:      [0, 4, 8],
  dom7:     [0, 4, 7, 10],
  maj7:     [0, 4, 7, 11],
  min7:     [0, 3, 7, 10],
  halfdim7: [0, 3, 6, 10],
  dim7:     [0, 3, 6, 9],
};

// ────────────────────────────────────────────────────────────────────────────
// Fórmulas modales de intervalos diatónicos (semitonos desde la tónica)
// ────────────────────────────────────────────────────────────────────────────
export const SCALE_MODE_OFFSETS: Record<string, number[]> = {
  major:             [0, 2, 4, 5, 7, 9, 11],
  ionian:            [0, 2, 4, 5, 7, 9, 11],
  maj:               [0, 2, 4, 5, 7, 9, 11],
  mixolydian:        [0, 2, 4, 5, 7, 9, 10], // b7
  mix:               [0, 2, 4, 5, 7, 9, 10],
  minor:             [0, 2, 3, 5, 7, 8, 10],
  aeolian:           [0, 2, 3, 5, 7, 8, 10],
  min:               [0, 2, 3, 5, 7, 8, 10],
  dorian:            [0, 2, 3, 5, 7, 9, 10],
  dor:               [0, 2, 3, 5, 7, 9, 10],
  phrygian:          [0, 1, 3, 5, 7, 8, 10],
  phr:               [0, 1, 3, 5, 7, 8, 10],
  lydian:            [0, 2, 4, 6, 7, 9, 11],
  lyd:               [0, 2, 4, 6, 7, 9, 11],
  locrian:           [0, 1, 3, 5, 6, 8, 10],
  loc:               [0, 1, 3, 5, 6, 8, 10],
  harmonic_minor:    [0, 2, 3, 5, 7, 8, 11],
  harmonicminor:     [0, 2, 3, 5, 7, 8, 11],
  harm_min:          [0, 2, 3, 5, 7, 8, 11],
  harm:              [0, 2, 3, 5, 7, 8, 11],
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
};

export const MODE_FORMULAS = SCALE_MODE_OFFSETS;

// ────────────────────────────────────────────────────────────────────────────
// resolvePitch: Grado relativo → MIDI absoluto + metadata
// ────────────────────────────────────────────────────────────────────────────
/**
 * Convierte un grado (sd) y octaveOffset a MIDI absoluto, pitch name, color.
 * En C Mixolidio, #7 con octave: 1 y baseOctave: 4 produce exactamente MIDI 83 (B5, 987.77 Hz).
 * @param sd          - Grado relativo ('1', 'b3', '#4', '#7', etc.)
 * @param octOffset   - Desplazamiento de octava (+1 = aguda, 0 = base, -1 = grave)
 * @param key         - KeySignature ({ tonic: 'C', scale: 'mixolydian' }) o string tónica
 * @param baseOctave  - Octava base (default 4 → C4 = 60, C5 = 72)
 */
export function resolvePitch(
  sd: string,
  octOffset: number = 0,
  key: KeySignature | string = { tonic: 'C', scale: 'major' },
  baseOctave = 4,
): { midi: number; pitch: string; color: string; isAltered: boolean } {
  const keyObj: KeySignature = typeof key === 'string'
    ? { tonic: key, scale: 'major' }
    : (key || { tonic: 'C', scale: 'major' });
  const tonic = keyObj.tonic || 'C';
  const scale = (keyObj.scale || 'major').toLowerCase();

  let tonicMidi: number;
  try {
    tonicMidi = Tone.Frequency(`${tonic}${baseOctave}`).toMidi();
  } catch {
    const tonicPc = NOTE_TO_PC[tonic] ?? 0;
    tonicMidi = (baseOctave + 1) * 12 + tonicPc;
  }

  const intervals = MODE_FORMULAS[scale] || MODE_FORMULAS.major;
  const match = sd.match(/^([b#]*)(\d+)$/);
  if (!match) {
    const defaultMidi = tonicMidi + (octOffset * 12);
    let noteName: string;
    try {
      noteName = Tone.Frequency(defaultMidi, 'midi').toNote();
    } catch {
      const noteIndex = ((defaultMidi % 12) + 12) % 12;
      const pitchOctave = Math.floor(defaultMidi / 12) - 1;
      noteName = `${PC_TO_NOTE[noteIndex]}${pitchOctave}`;
    }
    const { color } = getDegreeColor(sd);
    return {
      midi: defaultMidi,
      pitch: noteName,
      color,
      isAltered: false,
    };
  }

  const accidentals = match[1];
  const degreeNumber = parseInt(match[2], 10);
  const degreeIndex = (degreeNumber - 1) % 7;
  const extraOctaves = Math.floor((degreeNumber - 1) / 7);

  // Semitonos base según el modo de la sección (ej. en Mixolidio, degreeIndex 6 es 10 = Bb)
  let semitones = intervals[degreeIndex] + (extraOctaves * 12);

  // Alteraciones relativas (# suma 1, b resta 1)
  for (const char of accidentals) {
    if (char === '#') semitones += 1;
    if (char === 'b') semitones -= 1;
  }

  const finalMidi = tonicMidi + semitones + (octOffset * 12);
  let noteName: string;
  try {
    noteName = Tone.Frequency(finalMidi, 'midi').toNote();
  } catch {
    const noteIndex = ((finalMidi % 12) + 12) % 12;
    const pitchOctave = Math.floor(finalMidi / 12) - 1;
    noteName = `${PC_TO_NOTE[noteIndex]}${pitchOctave}`;
  }

  const { color } = getDegreeColor(sd);

  return {
    midi: finalMidi,
    pitch: noteName,
    color,
    isAltered: accidentals.length > 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Mapa diatónico estándar mayor: I, ii, iii, IV, V, vi, vii°
// ────────────────────────────────────────────────────────────────────────────
export const DIATONIC_MAP: Record<number, { roman: string; quality: UniversalChord['quality']; semitones: number; symbol: string }> = {
  1: { roman: "I",    quality: "maj", semitones: 0,  symbol: "C" },
  2: { roman: "ii",   quality: "min", semitones: 2,  symbol: "dm" },
  3: { roman: "iii",  quality: "min", semitones: 4,  symbol: "em" },
  4: { roman: "IV",   quality: "maj", semitones: 5,  symbol: "F" },
  5: { roman: "V",    quality: "maj", semitones: 7,  symbol: "G" },
  6: { roman: "vi",   quality: "min", semitones: 9,  symbol: "am" },
  7: { roman: "vii°", quality: "dim", semitones: 11, symbol: "b°" },
};

export const DIATONIC_SCALE_DEGREES = DIATONIC_MAP;
export const DIATONIC_QUALITIES = DIATONIC_MAP;

// ────────────────────────────────────────────────────────────────────────────
// Tablas diatónicas completas según la escala activa (modo eólico, jónico, etc.)
// ────────────────────────────────────────────────────────────────────────────
export const DIATONIC_DEGREES_BY_SCALE: Record<
  string,
  Record<number, { roman: string; quality: UniversalChord["quality"]; semitones: number }>
> = {
  major: {
    1: { roman: "I",    quality: "maj", semitones: 0 },
    2: { roman: "ii",   quality: "min", semitones: 2 },
    3: { roman: "iii",  quality: "min", semitones: 4 },
    4: { roman: "IV",   quality: "maj", semitones: 5 },
    5: { roman: "V",    quality: "maj", semitones: 7 },
    6: { roman: "vi",   quality: "min", semitones: 9 },
    7: { roman: "vii°", quality: "dim", semitones: 11 },
  },
  minor: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "ii°",  quality: "dim", semitones: 2 },
    3: { roman: "III",  quality: "maj", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "v",    quality: "min", semitones: 7 },
    6: { roman: "VI",   quality: "maj", semitones: 8 },
    7: { roman: "VII",  quality: "maj", semitones: 10 },
  },
  mixolydian: {
    1: { roman: "I",    quality: "maj", semitones: 0 },
    2: { roman: "ii",   quality: "min", semitones: 2 },
    3: { roman: "iii°", quality: "dim", semitones: 4 },
    4: { roman: "IV",   quality: "maj", semitones: 5 },
    5: { roman: "v",    quality: "min", semitones: 7 },
    6: { roman: "vi",   quality: "min", semitones: 9 },
    7: { roman: "VII",  quality: "maj", semitones: 10 },
  },
  dorian: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "ii",   quality: "min", semitones: 2 },
    3: { roman: "III",  quality: "maj", semitones: 3 },
    4: { roman: "IV",   quality: "maj", semitones: 5 },
    5: { roman: "v",    quality: "min", semitones: 7 },
    6: { roman: "vi°",  quality: "dim", semitones: 9 },
    7: { roman: "VII",  quality: "maj", semitones: 10 },
  },
  phrygian: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "II",   quality: "maj", semitones: 1 },
    3: { roman: "III",  quality: "maj", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "v°",   quality: "dim", semitones: 7 },
    6: { roman: "VI",   quality: "maj", semitones: 8 },
    7: { roman: "vii",  quality: "min", semitones: 10 },
  },
  lydian: {
    1: { roman: "I",    quality: "maj", semitones: 0 },
    2: { roman: "II",   quality: "maj", semitones: 2 },
    3: { roman: "iii",  quality: "min", semitones: 4 },
    4: { roman: "iv°",  quality: "dim", semitones: 6 },
    5: { roman: "V",    quality: "maj", semitones: 7 },
    6: { roman: "vi",   quality: "min", semitones: 9 },
    7: { roman: "vii",  quality: "min", semitones: 11 },
  },
  locrian: {
    1: { roman: "i°",   quality: "dim", semitones: 0 },
    2: { roman: "II",   quality: "maj", semitones: 1 },
    3: { roman: "iii",  quality: "min", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "v°",   quality: "dim", semitones: 6 },
    6: { roman: "VI",   quality: "maj", semitones: 8 },
    7: { roman: "vii",  quality: "min", semitones: 10 },
  },
  harmonic_minor: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "ii°",  quality: "dim", semitones: 2 },
    3: { roman: "III+", quality: "aug", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "V",    quality: "maj", semitones: 7 },
    6: { roman: "VI",   quality: "maj", semitones: 8 },
    7: { roman: "vii°", quality: "dim", semitones: 11 },
  },
};

DIATONIC_DEGREES_BY_SCALE.aeolian = DIATONIC_DEGREES_BY_SCALE.minor;
DIATONIC_DEGREES_BY_SCALE.ionian = DIATONIC_DEGREES_BY_SCALE.major;
DIATONIC_DEGREES_BY_SCALE.mix = DIATONIC_DEGREES_BY_SCALE.mixolydian;
DIATONIC_DEGREES_BY_SCALE.min = DIATONIC_DEGREES_BY_SCALE.minor;
DIATONIC_DEGREES_BY_SCALE.maj = DIATONIC_DEGREES_BY_SCALE.major;
DIATONIC_DEGREES_BY_SCALE.dor = DIATONIC_DEGREES_BY_SCALE.dorian;
DIATONIC_DEGREES_BY_SCALE.phr = DIATONIC_DEGREES_BY_SCALE.phrygian;
DIATONIC_DEGREES_BY_SCALE.lyd = DIATONIC_DEGREES_BY_SCALE.lydian;
DIATONIC_DEGREES_BY_SCALE.loc = DIATONIC_DEGREES_BY_SCALE.locrian;
DIATONIC_DEGREES_BY_SCALE.harmonicminor = DIATONIC_DEGREES_BY_SCALE.harmonic_minor;
DIATONIC_DEGREES_BY_SCALE.harm_min = DIATONIC_DEGREES_BY_SCALE.harmonic_minor;
DIATONIC_DEGREES_BY_SCALE.harm = DIATONIC_DEGREES_BY_SCALE.harmonic_minor;

// ────────────────────────────────────────────────────────────────────────────
// normalizeKey: Normalizador consistente de tonalidades (KeySignature | string)
// ────────────────────────────────────────────────────────────────────────────
export function normalizeKey(key: KeySignature | string | undefined | null): { tonic: string; scale: string } {
  if (!key) return { tonic: 'C', scale: 'major' };
  if (typeof key === 'string') {
    const keyMatch = key.replace(/^KEY:\s*/i, '').trim().match(/^([A-Ga-g][#b]?)\s*(.*)$/);
    if (keyMatch) {
      const tonic = keyMatch[1];
      const rest = keyMatch[2].toLowerCase();
      let scale = 'major';
      if (rest.includes('harm')) scale = 'harmonic_minor';
      else if (rest.includes('min') || rest.includes('aeol')) scale = 'minor';
      else if (rest.includes('mix')) scale = 'mixolydian';
      else if (rest.includes('dor')) scale = 'dorian';
      else if (rest.includes('phryg') || rest === 'phr') scale = 'phrygian';
      else if (rest.includes('lyd')) scale = 'lydian';
      else if (rest.includes('loc')) scale = 'locrian';
      return { tonic, scale };
    }
    return { tonic: key, scale: 'major' };
  }
  const tonic = key.tonic || 'C';
  const rawScale = (key.scale || 'major').toLowerCase();
  const scale = (rawScale.includes('harm')) ? 'harmonic_minor'
    : (rawScale.includes('aeol') || rawScale.includes('minor') || rawScale === 'min') ? 'minor'
    : (rawScale.includes('ion') || rawScale.includes('major') || rawScale === 'maj') ? 'major'
    : (rawScale.includes('mix') || rawScale === 'mix') ? 'mixolydian'
    : (rawScale.includes('dor') || rawScale === 'dor') ? 'dorian'
    : (rawScale.includes('phryg') || rawScale === 'phr') ? 'phrygian'
    : (rawScale.includes('lyd') || rawScale === 'lyd') ? 'lydian'
    : (rawScale.includes('loc') || rawScale === 'loc') ? 'locrian'
    : rawScale;
  return { tonic, scale };
}

// ────────────────────────────────────────────────────────────────────────────
// Fórmulas y definiciones completas para préstamos modales (Modal Borrowing)
// ────────────────────────────────────────────────────────────────────────────
export interface ModalChordInfo {
  roman: string;
  quality: UniversalChord["quality"];
  semitones: number;
  sublabel: string;
}

export const MODAL_MAP: Record<string, Record<number, ModalChordInfo>> = {
  major: {
    1: { roman: "I", quality: "maj", semitones: 0, sublabel: "(maj)" },
    2: { roman: "ii", quality: "min", semitones: 2, sublabel: "(maj)" },
    3: { roman: "iii", quality: "min", semitones: 4, sublabel: "(maj)" },
    4: { roman: "IV", quality: "maj", semitones: 5, sublabel: "(maj)" },
    5: { roman: "V", quality: "maj", semitones: 7, sublabel: "(maj)" },
    6: { roman: "vi", quality: "min", semitones: 9, sublabel: "(maj)" },
    7: { roman: "vii°", quality: "dim", semitones: 11, sublabel: "(maj)" },
  },
  ionian: {
    1: { roman: "I", quality: "maj", semitones: 0, sublabel: "(ion)" },
    2: { roman: "ii", quality: "min", semitones: 2, sublabel: "(ion)" },
    3: { roman: "iii", quality: "min", semitones: 4, sublabel: "(ion)" },
    4: { roman: "IV", quality: "maj", semitones: 5, sublabel: "(ion)" },
    5: { roman: "V", quality: "maj", semitones: 7, sublabel: "(ion)" },
    6: { roman: "vi", quality: "min", semitones: 9, sublabel: "(ion)" },
    7: { roman: "vii°", quality: "dim", semitones: 11, sublabel: "(ion)" },
  },
  mixolydian: {
    1: { roman: "I", quality: "maj", semitones: 0, sublabel: "(mix)" },
    2: { roman: "ii", quality: "min", semitones: 2, sublabel: "(mix)" },
    3: { roman: "iii°", quality: "dim", semitones: 4, sublabel: "(mix)" },
    4: { roman: "IV", quality: "maj", semitones: 5, sublabel: "(mix)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(mix)" },
    6: { roman: "vi", quality: "min", semitones: 9, sublabel: "(mix)" },
    7: { roman: "bVII", quality: "maj", semitones: 10, sublabel: "(mix)" },
  },
  dorian: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(dor)" },
    2: { roman: "ii", quality: "min", semitones: 2, sublabel: "(dor)" },
    3: { roman: "bIII", quality: "maj", semitones: 3, sublabel: "(dor)" },
    4: { roman: "IV", quality: "maj", semitones: 5, sublabel: "(dor)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(dor)" },
    6: { roman: "vi°", quality: "dim", semitones: 9, sublabel: "(dor)" },
    7: { roman: "bVII", quality: "maj", semitones: 10, sublabel: "(dor)" },
  },
  phrygian: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(phr)" },
    2: { roman: "bII", quality: "maj", semitones: 1, sublabel: "(phr)" },
    3: { roman: "bIII", quality: "maj", semitones: 3, sublabel: "(phr)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(phr)" },
    5: { roman: "v°", quality: "dim", semitones: 7, sublabel: "(phr)" },
    6: { roman: "bVI", quality: "maj", semitones: 8, sublabel: "(phr)" },
    7: { roman: "bvii", quality: "min", semitones: 10, sublabel: "(phr)" },
  },
  minor: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(m)" },
    2: { roman: "ii°", quality: "dim", semitones: 2, sublabel: "(m)" },
    3: { roman: "bIII", quality: "maj", semitones: 3, sublabel: "(m)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(m)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(m)" },
    6: { roman: "bVI", quality: "maj", semitones: 8, sublabel: "(m)" },
    7: { roman: "bVII", quality: "maj", semitones: 10, sublabel: "(m)" },
  },
  aeolian: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(m)" },
    2: { roman: "ii°", quality: "dim", semitones: 2, sublabel: "(m)" },
    3: { roman: "bIII", quality: "maj", semitones: 3, sublabel: "(m)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(m)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(m)" },
    6: { roman: "bVI", quality: "maj", semitones: 8, sublabel: "(m)" },
    7: { roman: "bVII", quality: "maj", semitones: 10, sublabel: "(m)" },
  },
  lydian: {
    1: { roman: "I", quality: "maj", semitones: 0, sublabel: "(lyd)" },
    2: { roman: "II", quality: "maj", semitones: 2, sublabel: "(lyd)" },
    3: { roman: "iii", quality: "min", semitones: 4, sublabel: "(lyd)" },
    4: { roman: "♯iv°", quality: "dim", semitones: 6, sublabel: "(lyd)" },
    5: { roman: "V", quality: "maj", semitones: 7, sublabel: "(lyd)" },
    6: { roman: "vi", quality: "min", semitones: 9, sublabel: "(lyd)" },
    7: { roman: "vii", quality: "min", semitones: 11, sublabel: "(lyd)" },
  },
  locrian: {
    1: { roman: "i°", quality: "dim", semitones: 0, sublabel: "(loc)" },
    2: { roman: "bII", quality: "maj", semitones: 1, sublabel: "(loc)" },
    3: { roman: "biii", quality: "min", semitones: 3, sublabel: "(loc)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(loc)" },
    5: { roman: "bV", quality: "maj", semitones: 6, sublabel: "(loc)" },
    6: { roman: "bVI", quality: "maj", semitones: 8, sublabel: "(loc)" },
    7: { roman: "bvii", quality: "min", semitones: 10, sublabel: "(loc)" },
  },
};

export const DIATONIC_SCALE_SEMITONES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
};

// ────────────────────────────────────────────────────────────────────────────
// parseHookpadChord: Parser oficial y exhaustivo de acordes Hookpad v2.1.0
// ────────────────────────────────────────────────────────────────────────────
/**
 * Convierte cualquier acorde crudo de Hookpad/TheoryTab a UniversalChord,
 * soportando acordes secundarios (applied), préstamos modales (borrowed),
 * extensiones (7/9), alteraciones accidentales (#5, b5), inversiones y bajo real cifrado.
 */
export function parseHookpadChord(raw: any, keyTonic = "C", scaleMode = "major"): UniversalChord {
  const rawMode = (scaleMode || 'major').toLowerCase();
  const mode = (rawMode.includes('harm')) ? 'harmonic_minor'
    : (rawMode.includes('aeol') || rawMode.includes('minor') || rawMode === 'min') ? 'minor'
    : (rawMode.includes('ion') || rawMode.includes('major') || rawMode === 'maj') ? 'major'
    : (rawMode.includes('mix') || rawMode === 'mix') ? 'mixolydian'
    : (rawMode.includes('dor') || rawMode === 'dor') ? 'dorian'
    : (rawMode.includes('phryg') || rawMode === 'phr') ? 'phrygian'
    : (rawMode.includes('lyd') || rawMode === 'lyd') ? 'lydian'
    : (rawMode.includes('loc') || rawMode === 'loc') ? 'locrian'
    : rawMode;
  const modeOffsets = SCALE_MODE_OFFSETS[mode] || SCALE_MODE_OFFSETS.major;
  const isMixoScale = mode === "mixolydian";
  const isMinorScale = mode === "minor";
  const diatonicScaleTable = DIATONIC_DEGREES_BY_SCALE[mode] || DIATONIC_DEGREES_BY_SCALE.major;

  const rootStr = String(raw.root ?? raw.sd ?? 1);
  const rootNum = parseInt(rootStr.replace(/\D/g, ''), 10) || 1;
  const rawType = raw.type ?? (raw.roman && (String(raw.roman).includes('7') || String(raw.roman).includes('⁷')) ? 7 : 5);
  const typeNum = Number(rawType) as 5 | 7 | 9 | 11 | 13;
  const applied = Number(raw.applied ?? raw.appliedTarget ?? 0);
  const borrowed = normalizeBorrowed(raw.borrowed);
  const inversion = Number(raw.inversion ?? 0) as 0 | 1 | 2 | 3;

  const rawSubstitutions: string[] = Array.isArray(raw.substitutions)
    ? raw.substitutions.map(String)
    : typeof raw.substitutions === "string"
      ? [raw.substitutions]
      : Array.isArray(raw.options?.substitutions)
        ? raw.options.substitutions.map(String)
        : raw.substitution
          ? [String(raw.substitution)]
          : [];
  const isTritoneSub = rawSubstitutions.includes("tri") ||
    Boolean(raw.options?.tri) ||
    Boolean(raw.roman && String(raw.roman).includes("subV"));

  const isF6InMixolydian = isMixoScale && (
    raw.symbol === "F6" ||
    raw.symbol === "F/A" ||
    raw.roman === "V⁶₅" ||
    raw.roman === "V65" ||
    (raw.symbol && String(raw.symbol).includes("F6"))
  );

  const rawAdds: (number | string)[] = Array.isArray(raw.adds)
    ? raw.adds
    : (raw.adds !== undefined && raw.adds !== null ? [raw.adds] : []);
  const hasAdd9 = rawAdds.includes(9) || rawAdds.includes("9") ||
    Boolean(raw.options?.add9) ||
    Boolean(raw.roman?.includes("add9") || raw.symbol?.includes("add9"));

  const rawSuspensions: (number | string)[] = Array.isArray(raw.suspensions)
    ? raw.suspensions
    : typeof raw.suspensions === "string" || typeof raw.suspensions === "number"
      ? [raw.suspensions]
      : Array.isArray(raw.options?.suspensions)
        ? raw.options.suspensions
        : [];

  const hasSus2 = rawSuspensions.some((s: any) => s === 2 || s === "2" || s === "sus2") ||
    Boolean(raw.options?.sus2) ||
    Boolean(raw.suspension === "sus2" || raw.suspension === 2 || raw.suspension === "2") ||
    Boolean(raw.roman?.includes("sus2") || raw.symbol?.includes("sus2"));

  const hasSus4 = rawSuspensions.some((s: any) => s === 4 || s === "4" || s === "sus4") ||
    Boolean(raw.options?.sus4) ||
    Boolean(raw.suspension === "sus4" || raw.suspension === 4 || raw.suspension === "4") ||
    Boolean(raw.roman?.includes("sus4") || raw.symbol?.includes("sus4"));

  const isSus2Sus4 = (hasSus2 && hasSus4) ||
    rawSuspensions.some((s: any) => s === "sus2sus4" || s === "2,4" || s === "2-4") ||
    Boolean(raw.options?.sus2sus4) ||
    Boolean(raw.roman?.includes("sus2sus4") || raw.symbol?.includes("sus2sus4"));

  const rawAlterations: string[] = Array.isArray(raw.alterations)
    ? raw.alterations.map(String).filter(Boolean)
    : typeof raw.alterations === "string" && raw.alterations.trim().length > 0
      ? [raw.alterations.trim()]
      : [];
  const hasSharp5 = rawAlterations.includes("#5") ||
    rawAlterations.includes("sharp5") ||
    rawAlterations.includes("+5") ||
    Boolean(raw.options?.sharp5) ||
    Boolean(raw.roman && (String(raw.roman).includes("⁺⁽♯⁵⁾") || String(raw.roman).includes("⁺⁷") || String(raw.roman).includes("+#5")));
  const hasFlat5 = rawAlterations.includes("b5") ||
    rawAlterations.includes("flat5") ||
    Boolean(raw.options?.b5);

  const isSharpOneChord = Boolean(
    rootStr === "#1" || rootStr === "1#" || rootStr.startsWith("#1") || rootStr.startsWith("♯1") ||
    raw.alteration === 1 || raw.alteration === "#" || raw.alteration === "#1" ||
    raw.rootAlteration === 1 || raw.accidental === 1 || raw.accidental === "#" ||
    raw.roman === "♯i°" || raw.roman === "#i°" || raw.roman === "♯i" || raw.roman === "#i" ||
    String(raw.roman).startsWith("♯i°") || String(raw.roman).startsWith("#i°") ||
    String(raw.roman).startsWith("♯i") || String(raw.roman).startsWith("#i") ||
    (rootNum === 1 && (raw.quality === "dim" || raw.quality === "dim7" || String(raw.symbol).startsWith("c#") || String(raw.symbol).startsWith("C#"))) ||
    (rootNum === 1 && (borrowed.includes("bor") || borrowed.includes("chromatic") || raw.sublabel === "(bor)") && (raw.quality === "dim" || raw.quality === "dim7" || raw.isAltered || String(raw.roman).includes("°") || String(raw.symbol).includes("°"))) ||
    (rootNum === 1 && rawAlterations.some(a => a === "#1" || a === "#" || a === "sharp" || a === "1"))
  );

  let tonicMidi: number;
  try {
    tonicMidi = Tone.Frequency(`${keyTonic}4`).toMidi();
  } catch {
    const pc = NOTE_TO_PC[keyTonic] ?? 0;
    tonicMidi = 60 + pc;
  }

  let roman = "";
  let quality: UniversalChord["quality"] = "maj";
  let rootSemitones = 0;
  let isAltered = false;
  let secondaryType: UniversalChord["secondaryType"] = undefined;
  let appliedTarget: number | undefined = undefined;
  let targetDegree = rootNum;
  let sublabel = raw.sublabel;

  // 1. ACORDES SECUNDARIOS / APLICADOS (applied > 0 o roman con barra "/") O SUSTITUCIONES TRITONALES (substitutions: ["tri"])
  // En Hookpad:
  // - raw.applied es el PREFIJO APLICADO que se ejecuta: 5 = V, 7 = vii°, 4 = IV, 2 = ii
  // - raw.root es el DESTINO sobre el que recae la función (/X): 3 = /iii, 2 = /ii, 5 = /V, etc.
  if (isTritoneSub && applied === 0 && (!raw.roman || !String(raw.roman).includes('/'))) {
    // Sustitución tritonal de la dominante primaria (V -> subV / subV⁷)
    const primaryDominantSemitones = modeOffsets[4] ?? 7;
    rootSemitones = (primaryDominantSemitones + 6) % 12;
    quality = typeNum === 7 ? "dom7" : "maj";
    isAltered = true;
    const invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : (typeNum === 7 ? "⁷" : "");
    roman = `subV${invFig}`;
  } else if (Number(raw.applied ?? 0) > 0) {
    let secondaryTypeNum = Number(raw.applied); // 5 = V, 7 = vii°, 4 = IV, 2 = ii
    let targetDegree = Number(raw.root ?? 1);   // 3 = /iii, 2 = /ii, 5 = /V

    // Desambiguación armónica estricta para acordes secundarios:
    // 1) En Hookpad o exportaciones, si uno de los dos es 7 (vii°), el 7 SIEMPRE es el prefijo y el otro es el destino (ej: vii°/V)
    //    (vii° NUNCA es destino porque no se tonicaliza una tríada disminuida).
    if (targetDegree === 7 && secondaryTypeNum !== 7) {
      targetDegree = secondaryTypeNum;
      secondaryTypeNum = 7;
    }
    // 2) Si uno es 5 (V) y el otro es 2 (ii), 3 (iii) o 6 (vi), el 5 SIEMPRE es el prefijo V.
    else if (secondaryTypeNum !== 5 && targetDegree === 5 && (secondaryTypeNum === 2 || secondaryTypeNum === 3 || secondaryTypeNum === 6)) {
      targetDegree = secondaryTypeNum;
      secondaryTypeNum = 5;
    }

    appliedTarget = targetDegree;
    secondaryType = secondaryTypeNum === 5 ? "V" : secondaryTypeNum === 7 ? "vii°" : secondaryTypeNum === 4 ? "IV" : secondaryTypeNum === 2 ? "ii" : "V";

    const targetInfo = diatonicScaleTable[targetDegree] || DIATONIC_MAP[targetDegree] || { roman: `${targetDegree}`, semitones: 0, quality: "maj", symbol: "" };
    const targetSemitones = modeOffsets[(targetDegree - 1) % 7] ?? targetInfo.semitones;

    let prefixRoman = "";
    if (secondaryTypeNum === 5) {
      rootSemitones = (targetSemitones + 7 + (isTritoneSub ? 6 : 0)) % 12;
      quality = hasSharp5 ? "aug" : (typeNum === 7 ? "dom7" : "maj");
      isAltered = true;

      if (isTritoneSub) {
        const invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : (typeNum === 7 ? "⁷" : "");
        prefixRoman = `subV${invFig}`;
      } else if (typeNum === 11) {
        prefixRoman = `V¹¹`;
      } else if (typeNum === 9) {
        prefixRoman = `V⁹`;
      } else if (typeNum === 7) {
        const invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷";
        prefixRoman = hasSharp5 ? (invFig === "⁷" ? "V⁺⁷" : `V⁺⁷${invFig}`) : `V${invFig}`;
      } else {
        const invFig = inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "";
        prefixRoman = hasSharp5 ? `V⁺⁽♯⁵⁾${invFig}` : `V${invFig}`;
      }
      if (hasAdd9 && typeNum !== 9 && !isTritoneSub) {
        prefixRoman += "⁽add9⁾";
      }
    } else if (secondaryTypeNum === 7) {
      quality = (typeNum === 7 || (raw.roman && (String(raw.roman).includes("7") || String(raw.roman).includes("⁷")))) ? "dim7" : "dim";
      rootSemitones = (targetSemitones - 1 + 12) % 12;
      isAltered = true;
      const invFig = quality === "dim7"
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      prefixRoman = `vii°${invFig}`;
    } else if (secondaryTypeNum === 4) {
      quality = typeNum === 7 ? "dom7" : "maj";
      rootSemitones = (targetSemitones + 5) % 12;
      isAltered = true;
      const invFig = typeNum === 7
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      prefixRoman = `IV${invFig}`;
    } else if (secondaryTypeNum === 2) {
      quality = typeNum === 7 ? "min7" : "min";
      rootSemitones = (targetSemitones + 2) % 12;
      isAltered = true;
      const invFig = typeNum === 7
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      prefixRoman = `ii${invFig}`;
    }

    roman = `${prefixRoman}/${targetInfo.roman}`;
  } else if (raw.roman && String(raw.roman).includes('/')) {
    // Para datos legados donde applied no esté definido pero roman traiga barra (ej: "V/ii")
    const parts = String(raw.roman).split('/');
    const prefix = parts[0].toLowerCase();
    const targetStr = parts[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const ROMAN_TARGET_MAP: Record<string, number> = {
      i: 1, '1': 1,
      ii: 2, '2': 2,
      iii: 3, '3': 3,
      iv: 4, '4': 4,
      v: 5, '5': 5,
      vi: 6, '6': 6,
      vii: 7, '7': 7,
    };
    let targetDegree = rootNum;
    if (ROMAN_TARGET_MAP[targetStr]) {
      targetDegree = ROMAN_TARGET_MAP[targetStr];
    }
    let secondaryTypeNum = 5;
    if (prefix.includes('vii') || prefix.includes('ø') || prefix.includes('°')) {
      secondaryTypeNum = 7;
    } else if (prefix.startsWith('subv')) {
      secondaryTypeNum = 5;
    } else if (prefix.startsWith('v')) {
      secondaryTypeNum = 5;
    } else if (prefix.startsWith('iv')) {
      secondaryTypeNum = 4;
    } else if (prefix.startsWith('ii')) {
      secondaryTypeNum = 2;
    }

    if (targetDegree === 7 && secondaryTypeNum !== 7) {
      targetDegree = secondaryTypeNum;
      secondaryTypeNum = 7;
    } else if (secondaryTypeNum !== 5 && targetDegree === 5 && (secondaryTypeNum === 2 || secondaryTypeNum === 3 || secondaryTypeNum === 6)) {
      targetDegree = secondaryTypeNum;
      secondaryTypeNum = 5;
    }

    appliedTarget = targetDegree;
    secondaryType = secondaryTypeNum === 5 ? "V" : secondaryTypeNum === 7 ? "vii°" : secondaryTypeNum === 4 ? "IV" : secondaryTypeNum === 2 ? "ii" : "V";

    const targetInfo = diatonicScaleTable[targetDegree] || DIATONIC_MAP[targetDegree] || { roman: `${targetDegree}`, semitones: 0, quality: "maj", symbol: "" };
    const targetSemitones = modeOffsets[(targetDegree - 1) % 7] ?? targetInfo.semitones;

    let secPrefix = "";
    if (secondaryTypeNum === 5) {
      quality = hasSharp5 ? "aug" : (typeNum === 7 ? "dom7" : "maj");
      rootSemitones = (targetSemitones + 7 + (isTritoneSub ? 6 : 0)) % 12;
      isAltered = true;
      const invFig = typeNum === 7
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      secPrefix = hasSharp5
        ? (typeNum === 7 ? (invFig === "⁷" ? "V⁺⁷" : `V⁺⁷${invFig}`) : `V⁺⁽♯⁵⁾${invFig}`)
        : `V${invFig}`;
      if (hasAdd9 && typeNum !== 9 && !isTritoneSub) {
        secPrefix += "⁽add9⁾";
      }
    } else if (secondaryTypeNum === 7) {
      quality = (typeNum === 7 || parts[0].includes("7") || parts[0].includes("⁷")) ? "dim7" : "dim";
      rootSemitones = (targetSemitones - 1 + 12) % 12;
      isAltered = true;
      const invFig = quality === "dim7"
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      secPrefix = `vii°${invFig}`;
    } else if (secondaryTypeNum === 4) {
      quality = typeNum === 7 ? "dom7" : "maj";
      rootSemitones = (targetSemitones + 5) % 12;
      isAltered = true;
      const invFig = typeNum === 7
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      secPrefix = `IV${invFig}`;
    } else if (secondaryTypeNum === 2) {
      quality = typeNum === 7 ? "min7" : "min";
      rootSemitones = (targetSemitones + 2) % 12;
      isAltered = true;
      const invFig = typeNum === 7
        ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
        : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
      secPrefix = `ii${invFig}`;
    }

    roman = `${secPrefix}/${targetInfo.roman}`;
  }
  // 1.5 Acorde prestado cromático ♯i°(bor) (ej: c#° en C mayor)
  else if (isSharpOneChord) {
    rootSemitones = 1; // Do# (1 semitono sobre tónica C)
    quality = (typeNum === 7 || raw.quality === "dim7" || String(raw.roman).includes("7") || String(raw.roman).includes("⁷")) ? "dim7" : "dim";
    isAltered = true;
    sublabel = "(bor)";
    const invFig = quality === "dim7"
      ? (inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷")
      : (inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "");
    roman = `♯i°${invFig}(bor)`;
  }
  // 2. PRÉSTAMOS MODALES (Modal Borrowing)
  else if (borrowed) {
    isAltered = true;
    const normalizedMode = borrowed.includes("phryg") ? "phrygian"
      : borrowed.includes("dor") ? "dorian"
      : (borrowed.includes("aeol") || borrowed.includes("minor")) ? "minor"
      : borrowed.includes("mixo") ? "mixolydian"
      : borrowed.includes("lyd") ? "lydian"
      : borrowed.includes("loc") ? "locrian"
      : (borrowed.includes("maj") || borrowed.includes("ion")) ? "major"
      : borrowed;

    const modalInfo = MODAL_MAP[normalizedMode]?.[rootNum];
    let romanBase = modalInfo?.roman || "I";
    quality = modalInfo?.quality || "maj";
    rootSemitones = modalInfo?.semitones ?? 0;
    sublabel = raw.sublabel || modalInfo?.sublabel || "";

    // Si el grado diatónico en la escala activa ya tiene exactamente los mismos semitonos que el modo prestado
    // (por ejemplo en modo Dórico o Menor, el grado 3 diatónico ya está a 3 semitonos),
    // no se prefija bemol ('b' o '♭'): "biii" -> "iii"
    if (modalInfo && modalInfo.semitones === modeOffsets[(rootNum - 1) % 7]) {
      romanBase = romanBase.replace(/^[b♭]/, '');
    }

    if (typeNum === 11) {
      if (rootNum === 5) {
        quality = "dom7";
        romanBase = "v¹¹";
      } else {
        romanBase = `${romanBase}¹¹`;
      }
    } else if (typeNum === 9) {
      if (normalizedMode === "mixolydian" && rootNum === 1) {
        quality = "dom7";
        romanBase = "I⁹";
      } else if (quality === "dim" || quality === "halfdim7") {
        quality = "halfdim7";
        romanBase = romanBase.replace("°", "ø");
        if (!romanBase.includes("ø")) romanBase += "ø";
        romanBase += "⁹";
      } else if (quality === "min") {
        quality = "min7";
        romanBase += "⁹";
      } else if (quality === "maj") {
        quality = "maj7";
        romanBase += "^Δ9";
      } else if (quality === "dom7") {
        romanBase += "⁹";
      }
    } else if (typeNum === 7) {
      if (normalizedMode === "mixolydian" && rootNum === 1) {
        quality = "dom7";
        romanBase = "I";
      } else if (normalizedMode === "phrygian" && rootNum === 3) {
        quality = "dom7";
        romanBase = "bIII";
      } else if (normalizedMode === "dorian" && rootNum === 4) {
        quality = "dom7";
        romanBase = "IV";
      } else if (normalizedMode === "lydian" && rootNum === 2) {
        quality = "dom7";
        romanBase = "II";
      } else if ((normalizedMode === "major" || normalizedMode === "ionian") && rootNum === 5) {
        quality = "dom7";
        romanBase = "V";
      } else if (quality === "dim") {
        quality = "halfdim7";
        romanBase = romanBase.replace("°", "ø");
        if (!romanBase.includes("ø")) romanBase += "ø";
      } else if (quality === "maj") {
        quality = "maj7";
        // En Hooktheory, séptimas mayores en acordes mayores prestados (ej. ♭VI^Δ7 en menor)
        // se denotan con el glifo delta ^Δ para distinguirlos de acordes dominantes:
        romanBase = romanBase.replace('b', '♭');
        if (!romanBase.includes('^Δ')) {
          romanBase += '^Δ';
        }
      } else if (quality === "min") {
        quality = "min7";
      }
    }

    if (hasAdd9 && typeNum !== 9) {
      romanBase += "⁽add9⁾";
    }

    const is7th = typeNum === 7 || quality.includes("7") || quality === "halfdim7";
    let invFig = "";
    if (typeNum === 9 || typeNum === 11 || hasAdd9) {
      invFig = inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "";
    } else if (is7th) {
      if (romanBase.includes('^Δ')) {
        invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "7";
      } else {
        invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : (romanBase.includes("⁷") ? "" : "⁷");
      }
    } else {
      invFig = inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "";
    }

    if (normalizedMode === "minor" && (sublabel === "(m)" || sublabel === "(min)" || !sublabel)) {
      sublabel = "(min)";
    } else if (normalizedMode === "major" && (sublabel === "(maj)" || !sublabel)) {
      sublabel = "(maj)";
    }
    const sub = sublabel ? (sublabel.startsWith('(') ? sublabel : `(${sublabel})`) : "";
    if (hasSharp5) {
      quality = "aug";
      roman = `${romanBase}⁺${invFig}⁽♯⁵⁾${sub}`;
    } else {
      roman = `${romanBase}${invFig}${sub}`;
    }
  }
  // 3. ACORDES DIATÓNICOS
  else {
    // Caso especial 3: Acorde V⁶₅ (F6) en Mixolidio
    if (isF6InMixolydian) {
      rootSemitones = 10; // Fa natural (10 semitonos desde Sol)
      quality = "maj";
      roman = "V⁶₅";
      sublabel = "";
    } else {
      const base = diatonicScaleTable[rootNum] || { roman: "I", quality: "maj", semitones: 0 };
      rootSemitones = modeOffsets[(rootNum - 1) % 7] ?? base.semitones;
      let romanBase = base.roman;
      quality = (raw.quality as UniversalChord["quality"]) || base.quality;

      // Caso especial 1: Acorde VII(add9) / VII en Mixolidio
      if (isMixoScale && rootNum === 7) {
        quality = typeNum === 7 ? "dom7" : (raw.quality as UniversalChord["quality"]) || "maj";
        const invFig = inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "";
        roman = `VII${invFig}`;
        if (hasAdd9) {
          roman += "⁽add9⁾";
        }
      } else {
        // Determinación de la cualidad de séptima diatónica según los intervalos del modo activo
        const thirdSemi = (modeOffsets[(rootNum - 1 + 2) % 7] - modeOffsets[(rootNum - 1) % 7] + 12) % 12;
        const fifthSemi = (modeOffsets[(rootNum - 1 + 4) % 7] - modeOffsets[(rootNum - 1) % 7] + 12) % 12;
        const seventhSemi = (modeOffsets[(rootNum - 1 + 6) % 7] - modeOffsets[(rootNum - 1) % 7] + 12) % 12;

        let diatonic7thQuality: UniversalChord["quality"] = "maj7";
        if (thirdSemi === 4 && fifthSemi === 7 && seventhSemi === 11) diatonic7thQuality = "maj7";
        else if (thirdSemi === 4 && fifthSemi === 7 && seventhSemi === 10) diatonic7thQuality = "dom7";
        else if (thirdSemi === 3 && fifthSemi === 7 && seventhSemi === 10) diatonic7thQuality = "min7";
        else if (thirdSemi === 3 && fifthSemi === 6 && seventhSemi === 10) diatonic7thQuality = "halfdim7";
        else if (thirdSemi === 3 && fifthSemi === 6 && seventhSemi === 9) diatonic7thQuality = "dim7";

        if (typeNum === 11) {
          if (rootNum === 5 && !isMinorScale) {
            roman = "V¹¹";
            quality = "maj";
          } else {
            roman = `${romanBase}¹¹`;
          }
        } else if (typeNum === 9) {
          if (diatonic7thQuality === "dom7") {
            quality = "dom7";
            roman = `${romanBase}⁹`;
          } else if (diatonic7thQuality === "maj7") {
            quality = "maj7";
            roman = `${romanBase}^Δ9`;
          } else if (diatonic7thQuality === "min7") {
            quality = "min7";
            roman = `${romanBase}⁹`;
          } else if (diatonic7thQuality === "halfdim7") {
            quality = "halfdim7";
            roman = `${romanBase.replace("°", "ø")}⁹`;
          } else {
            quality = "maj7";
            roman = `${romanBase}^Δ9`;
          }
        } else if (typeNum === 7) {
          quality = diatonic7thQuality;
          if (diatonic7thQuality === "maj7") {
            const invFig = inversion === 1 ? "^Δ⁶₅" : inversion === 2 ? "^Δ⁴₃" : inversion === 3 ? "^Δ⁴₂" : "^Δ7";
            roman = `${romanBase}${invFig}`;
          } else if (diatonic7thQuality === "halfdim7") {
            const invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷";
            roman = `${romanBase.replace("°", "ø")}${invFig}`;
          } else {
            const invFig = inversion === 1 ? "⁶₅" : inversion === 2 ? "⁴₃" : inversion === 3 ? "⁴₂" : "⁷";
            roman = `${romanBase}${invFig}`;
          }
        } else {
          // Tríadas (typeNum === 5)
          const invFig = inversion === 1 ? "⁶" : inversion === 2 ? "⁶₄" : "";
          if (hasSharp5) {
            quality = "aug";
            roman = `${romanBase}⁺${invFig}⁽♯⁵⁾`;
          } else {
            roman = `${romanBase}${invFig}`;
          }
        }

        if (hasAdd9 && typeNum !== 9) {
          roman += "⁽add9⁾";
        }
      }
    }
  }

  // Modificaciones armónicas: suspensiones (sus2, sus4, sus2sus4)
  if (isSus2Sus4) {
    if (!roman.includes("sus2sus4")) roman += "sus2sus4";
  } else if (hasSus2) {
    if (!roman.includes("sus2")) roman += "sus2";
  } else if (hasSus4) {
    if (!roman.includes("sus4")) roman += "sus4";
  }

  // 4. CÁLCULO DE INTERVALOS Y NOTAS REALES
  const INTERVALS_MAP: Record<string, number[]> = {
    maj:      [0, 4, 7],
    min:      [0, 3, 7],
    dim:      [0, 3, 6],
    aug:      [0, 4, 8],
    dom7:     [0, 4, 7, 10],
    maj7:     [0, 4, 7, 11],
    min7:     [0, 3, 7, 10],
    dim7:     [0, 3, 6, 9],
    halfdim7: [0, 3, 6, 10],
  };

  const isV11 = (typeNum === 11 && (rootNum === 5 || roman.startsWith("V¹¹")));

  let formula: number[];
  if (isV11) {
    // V¹¹: Fundamental Sol en bajo y tríada de Fa (Fa, La, Do) -> [0, 10, 14, 17]
    formula = [0, 10, 14, 17];
  } else if (isSus2Sus4) {
    const seventh = (typeNum === 7 || roman.includes('7') || roman.includes('⁷')) ? 10 : undefined;
    formula = seventh !== undefined ? [0, 2, 5, 7, seventh] : [0, 2, 5, 7];
  } else if (hasSus2) {
    const seventh = (typeNum === 7 || roman.includes('7') || roman.includes('⁷')) ? 10 : undefined;
    formula = seventh !== undefined ? [0, 2, 7, seventh] : [0, 2, 7];
  } else if (hasSus4) {
    const seventh = (typeNum === 7 || roman.includes('7') || roman.includes('⁷')) ? 10 : undefined;
    formula = seventh !== undefined ? [0, 5, 7, seventh] : [0, 5, 7];
  } else if (typeNum === 9) {
    const base = INTERVALS_MAP[quality] || [0, 4, 7, 11];
    formula = [...base.slice(0, 4), 14];
  } else if (hasAdd9) {
    const third = (quality === "min" || quality === "min7") ? 3 : 4;
    const fifth = hasSharp5 ? 8 : (quality === "dim" || quality === "halfdim7") ? 6 : 7;
    formula = [0, third, fifth, 14];
  } else {
    formula = [...(INTERVALS_MAP[quality] || [0, 4, 7])];
  }

  if (!isV11 && !isSus2Sus4 && !hasSus2 && !hasSus4) {
    if (hasSharp5 && formula.length >= 3) {
      formula[2] = 8;
    } else if (hasFlat5 && formula.length >= 3) {
      formula[2] = 6;
    }
  }

  const rootMidi = tonicMidi + rootSemitones;
  
  // Notas del acorde en registro central (octava 4)
  const allMidiNotes = formula.map((semitone) => rootMidi + semitone);

  // Armadura y selección de bemoles/sostenidos para ortografía enarmónica
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const tonicUpper = keyTonic ? (keyTonic[0].toUpperCase() + keyTonic.slice(1)) : 'C';
  const isMinorFlatKey = isMinorScale && ['D', 'G', 'C', 'F', 'BB', 'EB', 'AB', 'DB'].includes(tonicUpper.toUpperCase());
  const isSharpSecondary = secondaryType === "vii°" ||
    isSharpOneChord ||
    roman.startsWith("♯i") ||
    roman.startsWith("#i");
  const useFlats = !isSharpSecondary && (
    FLAT_KEYS.has(keyTonic) ||
    isMinorFlatKey ||
    isTritoneSub ||
    borrowed.includes('minor') || borrowed.includes('phryg') || borrowed.includes('aeol') ||
    borrowed.includes('mixo') || borrowed.includes('dor') ||
    roman.includes('b') || roman.includes('♭') ||
    (secondaryType === "V" && targetDegree === 4) ||
    (rootSemitones === 3 && borrowed.length > 0) ||
    (rootSemitones === 10 && borrowed.length > 0) ||
    (quality === "min" && rootSemitones === 7) || // Gm (v en mixo) usa Bb
    (quality === "dom7" && rootSemitones === 0)   // C7 (I7 en mixo) usa Bb
  );

  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const rootPc = ((rootMidi % 12) + 12) % 12;

  function midiToPitch(m: number): string {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    if (rootPc === 2 && pc === 6) return `F#${oct}`;
    if (rootPc === 9 && pc === 1) return `C#${oct}`;
    if (rootPc === 4 && pc === 8) return `G#${oct}`;
    if (rootPc === 11 && pc === 3) return `D#${oct}`;
    if (rootPc === 11 && pc === 6) return `F#${oct}`;
    return `${PC_NAMES[pc]}${oct}`;
  }

  const notePitches = allMidiNotes.map((m) => midiToPitch(m));

  // Nota del bajo según la inversión (octava grave 3)
  const bassMidi = allMidiNotes[inversion % allMidiNotes.length] - 12;
  const bassPitch = midiToPitch(bassMidi);

  // 5. GENERACIÓN DEL SÍMBOLO TEXTUAL ESTILO HOOKTHEORY
  const rootName = PC_NAMES[rootPc];
  let symbol = "";

  const is6thChord = (typeNum as number) === 6 || rawAdds.includes(6) || rawAdds.includes("6") ||
    raw.type === 6 || raw.type === "6" ||
    (inversion === 1 && (roman.startsWith("iii⁶₅") || roman.startsWith("iii65") || (rootNum === 3 && (typeNum === 7 || quality === "min7"))));

  if (isV11) {
    // V¹¹: tríada de IV sobre bajo de V (ej. F/G en Do Mayor)
    const ivPc = (rootPc - 2 + 12) % 12;
    const ivName = PC_NAMES[ivPc];
    symbol = `${ivName}/${rootName}`;
  } else if (is6thChord) {
    const isIii65 = inversion === 1 && (roman.startsWith("iii⁶₅") || roman.startsWith("iii65") || rootNum === 3);
    const sixthBassPc = isIii65 ? (rootPc + 3) % 12 : ((bassMidi % 12) + 12) % 12;
    symbol = `${PC_NAMES[sixthBassPc]}6`;
  } else if (quality === "halfdim7") {
    if (inversion === 1 && !borrowed && !isMinorScale && (roman.startsWith("vii") || roman.startsWith("VII"))) {
      // En Hooktheory, viiø⁶₅ en Do Mayor es dm6 (bajo Re)
      const bassPc = ((bassMidi % 12) + 12) % 12;
      const bassName = PC_NAMES[bassPc];
      symbol = `${bassName.toLowerCase()}m6`;
    } else {
      symbol = `${rootName.toLowerCase()}m7(b5)`;
      if (inversion > 0) {
        const bassPc = ((bassMidi % 12) + 12) % 12;
        const bassName = PC_NAMES[bassPc];
        symbol += `/${bassName}`;
      }
    }
  } else if (typeNum === 9) {
    if (quality === "maj7" || roman.includes("^Δ") || roman.includes("maj9")) {
      symbol = `${rootName}maj9`;
    } else if (quality === "min" || quality === "min7") {
      symbol = `${rootName.toLowerCase()}m9`;
    } else if (quality === "dom7" || rootNum === 5) {
      symbol = `${rootName}9`;
    } else {
      symbol = `${rootName}9`;
    }
    if (inversion > 0) {
      const bassPc = ((bassMidi % 12) + 12) % 12;
      const bassName = PC_NAMES[bassPc];
      symbol += `/${bassName}`;
    }
  } else {
    let baseName = rootName;
    const isSuspended = isSus2Sus4 || hasSus2 || hasSus4;
    if (!isSuspended) {
      if (quality === "min" || quality === "min7") baseName = `${rootName.toLowerCase()}m`;
      else if (quality === "dim" || quality === "dim7") baseName = `${rootName.toLowerCase()}°`;
      else if (hasSharp5) baseName = `${rootName}⁺⁽♯⁵⁾`;
      else if (quality === "aug") baseName = `${rootName}+`;
    } else {
      // Para acordes suspendidos, la 3ª queda suspendida y se omite 'm'
      baseName = rootName.toLowerCase();
    }

    symbol = baseName;

    if (!hasSharp5) {
      if (quality === "maj7" || roman.includes("^Δ") || roman.includes("maj7")) {
        if (!symbol.includes("maj7")) symbol += "maj7";
      } else if (typeNum === 7 || quality === "dom7" || quality === "dim7" || quality === "min7" || roman.includes("7") || roman.includes("⁷")) {
        if (!symbol.includes("7")) symbol += "7";
      }
    }

    if (hasAdd9) {
      symbol += "(add9)";
    }

    if (isSus2Sus4) symbol += " sus2sus4";
    else if (hasSus2) symbol += " sus2";
    else if (hasSus4) symbol += "sus4";

    if (isF6InMixolydian) {
      symbol = "F6";
    } else if (inversion > 0) {
      const bassPc = ((bassMidi % 12) + 12) % 12;
      const bassName = PC_NAMES[bassPc];
      symbol += `/${bassName}`;
    }
  }

  const SEMI_TO_SD: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
    6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
  };
  let rootSd = isAltered ? (SEMI_TO_SD[rootSemitones] || String(rootNum)) : String(rootNum);
  if (isSharpOneChord || roman.startsWith("♯i") || roman.startsWith("#i")) {
    rootSd = "#1";
  }

  if (!sublabel && borrowed) {
    if (borrowed.includes('phryg')) sublabel = '(phr)';
    else if (borrowed.includes('mixo')) sublabel = '(mix)';
    else if (borrowed.includes('dor')) sublabel = '(dor)';
    else if (borrowed.includes('lyd')) sublabel = '(lyd)';
    else if (borrowed.includes('aeol') || borrowed.includes('minor')) sublabel = '(m)';
  }

  const degreeSdForColor = SEMI_TO_SD[rootSemitones] || rootSd;
  const { color: chordColor } = getDegreeColor(degreeSdForColor);

  return {
    id: raw.id || `chord_${raw.beat}`,
    beat: Number(raw.beat ?? 1),
    duration: Number(raw.duration ?? 4),
    roman,
    symbol,
    rootSd,
    quality,
    type: typeNum,
    inversion,
    secondaryType,
    appliedTarget,
    applied: Number(raw.applied ?? 0) > 0 ? String(raw.applied) : undefined,
    borrowed: borrowed || undefined,
    alterations: hasSharp5 ? ["#5"] : hasFlat5 ? ["b5"] : (rawAlterations.length > 0 ? rawAlterations : undefined),
    substitutions: rawSubstitutions.length > 0 ? rawSubstitutions : (isTritoneSub ? ["tri"] : undefined),
    suspensions: rawSuspensions.length > 0 ? rawSuspensions : (isSus2Sus4 ? ["sus2", "sus4"] : hasSus2 ? ["sus2"] : hasSus4 ? ["sus4"] : undefined),
    suspension: isSus2Sus4 ? "sus2sus4" : hasSus2 ? "sus2" : hasSus4 ? "sus4" : undefined,
    options: {
      ...raw.options,
      sharp5: hasSharp5 ? true : undefined,
      b5: hasFlat5 ? true : undefined,
      substitutions: rawSubstitutions.length > 0 ? rawSubstitutions : (isTritoneSub ? ["tri"] : undefined),
      tri: isTritoneSub ? true : undefined,
    },
    notes: notePitches,
    bassNote: bassPitch,
    sublabel,
    color: chordColor,
    isAltered: isAltered || inversion > 0 || Boolean(borrowed) || applied > 0 || isTritoneSub,
    _rootSemitones: rootSemitones,
  };
}

export const parseHooktheoryChord = parseHookpadChord;

// ────────────────────────────────────────────────────────────────────────────
// Semitonos de los grados diatónicos y alterados respecto a la tónica
// ────────────────────────────────────────────────────────────────────────────
export const DEGREE_SEMITONES: Record<string, number> = {
  "1": 0, "#1": 1, "b2": 1,
  "2": 2, "#2": 3, "b3": 3,
  "3": 4,
  "4": 5, "#4": 6, "b5": 6,
  "5": 7, "#5": 8, "b6": 8,
  "6": 9, "#6": 10, "b7": 10,
  "7": 11,
};

/**
 * Cálculo universal de la fundamental del acorde (rootMidi).
 * Analiza rigurosamente alteraciones modales y accidentales antes de calcular la nota base.
 * @param chord - Acorde universal
 * @param key   - KeySignature o tónica ('C', 'Eb')
 * @param baseOctave - Octava de referencia (default 4 para registro central, o 3)
 */
export function getChordRootMidi(
  chord: UniversalChord,
  key: KeySignature | string,
  baseOctave = 3,
): number {
  const { tonic, scale } = normalizeKey(key);
  const modeOffsets = SCALE_MODE_OFFSETS[scale] || SCALE_MODE_OFFSETS.major;

  let tonicMidi: number;
  try {
    tonicMidi = Tone.Frequency(`${tonic}${baseOctave}`).toMidi();
  } catch {
    const tonicPc = NOTE_TO_PC[tonic] ?? 0;
    tonicMidi = (baseOctave + 1) * 12 + tonicPc;
  }

  // Si el acorde incluye _rootSemitones precalculado, usarlo directamente
  if (typeof chord._rootSemitones === 'number') {
    return tonicMidi + chord._rootSemitones;
  }

  let rootSd = chord.rootSd || "1";
  const borrowed = normalizeBorrowed(chord.borrowed);
  const roman = chord.roman || "";

  // Caso especial: ♯i°(bor) (Do# / C# en C mayor)
  if (rootSd === "#1" || rootSd === "1#" || roman.startsWith("♯i") || roman.startsWith("#i")) {
    return tonicMidi + 1;
  }

  // Caso especial: V⁶₅ o F6 en Mixolidio
  if (scale === "mixolydian" && (chord.symbol === "F6" || roman === "V⁶₅" || (chord.symbol && chord.symbol.includes("F6")))) {
    return tonicMidi + 10; // Fa natural (10 semitonos)
  }

  // Sustituciones tritonales (substitutions: ["tri"] o roman con subV)
  if (chord.substitutions?.includes("tri") || (roman && roman.startsWith("subV"))) {
    let targetDegree = chord.appliedTarget ? Number(chord.appliedTarget) : 1;
    if (roman.includes('/')) {
      const targetStr = roman.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const ROMAN_TARGET_MAP: Record<string, number> = {
        i: 1, '1': 1, ii: 2, '2': 2, iii: 3, '3': 3, iv: 4, '4': 4, v: 5, '5': 5, vi: 6, '6': 6, vii: 7, '7': 7
      };
      if (ROMAN_TARGET_MAP[targetStr]) targetDegree = ROMAN_TARGET_MAP[targetStr];
    } else if (chord.applied && String(chord.applied) !== '0') {
      targetDegree = Number(chord.applied);
    }
    const hasTarget = Boolean(chord.appliedTarget || (chord.applied && String(chord.applied) !== '0') || roman.includes('/'));
    if (!hasTarget) {
      const primaryDom = modeOffsets[4] ?? 7;
      return tonicMidi + ((primaryDom + 6) % 12);
    }
    const targetSemitones = DIATONIC_SCALE_SEMITONES[targetDegree] ?? (modeOffsets[(targetDegree - 1) % 7] ?? 0);
    const rootSemitones = (targetSemitones + 7 + 6) % 12;
    return tonicMidi + rootSemitones;
  }

  // 1. Manejo de acordes secundarios / aplicados (vii°/X, V/X, IV/X, ii/X)
  const isApplied = Boolean(
    chord.appliedTarget ||
    (chord.applied && String(chord.applied) !== '0') ||
    chord.secondaryType ||
    roman.includes('/')
  );
  if (isApplied) {
    let targetDegree = chord.appliedTarget ? Number(chord.appliedTarget) : 1;
    if (roman.includes('/')) {
      const targetStr = roman.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const ROMAN_TARGET_MAP: Record<string, number> = {
        i: 1, '1': 1,
        ii: 2, '2': 2,
        iii: 3, '3': 3,
        iv: 4, '4': 4,
        v: 5, '5': 5,
        vi: 6, '6': 6,
        vii: 7, '7': 7,
      };
      if (ROMAN_TARGET_MAP[targetStr]) {
        targetDegree = ROMAN_TARGET_MAP[targetStr];
      }
    } else if (chord.appliedTarget) {
      targetDegree = Number(chord.appliedTarget);
    } else if (chord.applied && String(chord.applied) !== '0') {
      const appNum = Number(chord.applied);
      if (appNum === 7 || appNum === 5 || appNum === 4 || appNum === 2) {
        const rootNum = parseInt(String(chord.rootSd || '1').replace(/\D/g, ''), 10) || 1;
        targetDegree = rootNum !== appNum ? rootNum : 1;
      } else {
        targetDegree = appNum;
      }
    }

    const targetSemitones = DIATONIC_SCALE_SEMITONES[targetDegree] ?? (modeOffsets[(targetDegree - 1) % 7] ?? 0);
    const secPrefix = roman.includes('/') ? roman.split('/')[0] : '';
    const isVii = chord.secondaryType === "vii°" || secPrefix.startsWith("vii°") || secPrefix.startsWith("viiø") || (!chord.secondaryType && !secPrefix && String(chord.applied) === "7");
    const isV = chord.secondaryType === "V" || secPrefix.startsWith("V") || secPrefix.startsWith("v") || (!chord.secondaryType && !secPrefix && String(chord.applied) === "5");
    const isIV = chord.secondaryType === "IV" || secPrefix.startsWith("IV") || secPrefix.startsWith("iv") || (!chord.secondaryType && !secPrefix && String(chord.applied) === "4");
    const isIi = chord.secondaryType === "ii" || secPrefix.startsWith("ii") || (!chord.secondaryType && !secPrefix && String(chord.applied) === "2");

    if (isVii) {
      // La fundamental de vii° siempre está estrictamente 1 semitono por debajo del destino
      const rootSemitones = (targetSemitones - 1 + 12) % 12;
      return tonicMidi + rootSemitones;
    } else if (isV) {
      const isTri = chord.substitutions?.includes("tri") || secPrefix.startsWith("subV");
      const rootSemitones = (targetSemitones + 7 + (isTri ? 6 : 0)) % 12;
      return tonicMidi + rootSemitones;
    } else if (isIV) {
      const rootSemitones = (targetSemitones + 5) % 12;
      return tonicMidi + rootSemitones;
    } else if (isIi) {
      const rootSemitones = (targetSemitones + 2) % 12;
      return tonicMidi + rootSemitones;
    }
  }

  // 2. Manejo de acordes con préstamo modal (borrowed)
  if (borrowed) {
    const normalizedMode = borrowed.includes("phryg") ? "phrygian"
      : borrowed.includes("dor") ? "dorian"
      : (borrowed.includes("aeol") || borrowed.includes("minor")) ? "minor"
      : borrowed.includes("mixo") ? "mixolydian"
      : borrowed.includes("lyd") ? "lydian"
      : borrowed.includes("loc") ? "locrian"
      : (borrowed.includes("maj") || borrowed.includes("ion")) ? "major"
      : borrowed;
    const rootNum = parseInt(rootSd.replace(/\D/g, ''), 10) || 1;
    const modalDef = MODAL_MAP[normalizedMode]?.[rootNum];
    if (modalDef) {
      return tonicMidi + modalDef.semitones;
    }
  }

  if (roman.includes("bIII")) {
    rootSd = "b3";
  } else if (roman.includes("bVI")) {
    rootSd = "b6";
  } else if (roman.includes("bVII") || roman.includes("bvii") || roman.includes("♭VII")) {
    rootSd = "b7";
  } else if (roman.includes("bII")) {
    rootSd = "b2";
  } else if (roman.includes("#IV") || roman.includes("♯iv") || roman.includes("♯IV") || roman.includes("#iv")) {
    rootSd = "#4";
  }

  const rootNum = parseInt(rootSd.replace(/\D/g, ''), 10) || 1;
  // degreeOffset deriva estrictamente de SCALE_MODE_OFFSETS para la escala activa
  const degreeOffset = modeOffsets[(rootNum - 1) % 7] ?? 0;
  let accidentalShift = 0;
  if (rootSd.startsWith('b') || rootSd.startsWith('♭')) accidentalShift = -1;
  else if (rootSd.startsWith('#') || rootSd.startsWith('♯')) accidentalShift = 1;
  if (accidentalShift === -1 && degreeOffset < (SCALE_MODE_OFFSETS.major[(rootNum - 1) % 7] ?? 0)) {
    accidentalShift = 0;
  }
  return tonicMidi + degreeOffset + accidentalShift;
}

// ────────────────────────────────────────────────────────────────────────────
// getTransposedChordSymbol: Símbolo dinámico del acorde según la tonalidad activa
// ────────────────────────────────────────────────────────────────────────────
/**
 * Calcula el símbolo del acorde dinámicamente en base a la tónica activa y el modo.
 * Ejemplo: C -> G, F -> C, G7 -> D7, Eb7 -> Bb7, f#° -> c#°, C/E -> G/B, viiø⁶₅ -> dm6.
 */
export function getTransposedChordSymbol(
  chord: UniversalChord | any,
  currentKey: KeySignature | string,
): string {
  if (!chord) return '';
  const { tonic, scale } = normalizeKey(currentKey);
  const keyObj: KeySignature = { tonic, scale: scale as any };

  const rootSd = chord.rootSd || String(chord.root || '1');
  const rootMidi = getChordRootMidi({ ...chord, rootSd } as UniversalChord, keyObj, 4);
  const rootPc = ((rootMidi % 12) + 12) % 12;

  const borrowed = normalizeBorrowed(chord.borrowed);
  const roman = chord.roman || '';
  const inv = Number(chord.inversion ?? 0);
  const isTritoneSub = chord.substitutions?.includes('tri') || (roman && roman.startsWith('subV'));
  const isSharpSecondary = chord.secondaryType === "vii°" ||
    (roman.startsWith("vii°") && Boolean(chord.applied || chord.appliedTarget || roman.includes('/'))) ||
    roman.startsWith("♯i") || roman.startsWith("#i") || rootSd === "#1";

  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const tonicUpper = tonic ? (tonic[0].toUpperCase() + tonic.slice(1)) : 'C';
  const isMinorFlatKey = scale === 'minor' && ['D', 'G', 'C', 'F', 'BB', 'EB', 'AB', 'DB'].includes(tonicUpper.toUpperCase());

  const useFlats = !isSharpSecondary && (
    FLAT_KEYS.has(tonic) ||
    isMinorFlatKey ||
    isTritoneSub ||
    borrowed.includes('minor') || borrowed.includes('phryg') || borrowed.includes('aeol') ||
    borrowed.includes('mixo') || borrowed.includes('dor') ||
    roman.includes('b') || roman.includes('♭') || rootSd.includes('b') ||
    (chord.quality === "min" && rootPc === 7) // Gm en C mixo usa Bb
  );

  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  if (chord.type === 11 || (chord.roman && chord.roman.startsWith('V¹¹'))) {
    const ivPc = (rootPc - 2 + 12) % 12;
    const ivName = PC_NAMES[ivPc];
    const vName = PC_NAMES[rootPc];
    return `${ivName}/${vName}`;
  }

  if (scale === "mixolydian" && (chord.symbol === "F6" || roman === "V⁶₅" || (chord.symbol && String(chord.symbol).includes("F6")))) {
    if (inv === 1) return 'F6';
    if (inv > 0) {
      const bassPc = (rootPc + 4) % 12;
      return `F6/${PC_NAMES[bassPc]}`;
    }
    return 'F6';
  }

  const rawQuality = String(chord.quality || '');
  const rawAlterations: string[] = Array.isArray(chord.alterations)
    ? chord.alterations.map(String).filter(Boolean)
    : typeof (chord.alterations as any) === "string" && (chord.alterations as any).trim().length > 0
      ? [(chord.alterations as any).trim()]
      : [];
  const hasSharp5 = rawAlterations.includes("#5") ||
    rawAlterations.includes("sharp5") ||
    rawAlterations.includes("+5") ||
    Boolean(chord.options?.sharp5) ||
    Boolean(roman && (roman.includes("⁺⁽♯⁵⁾") || roman.includes("⁺⁷") || roman.includes("+#5")));

  const isHalfDim = (rawQuality === 'halfdim7' || roman.includes('ø') || (chord.symbol && (chord.symbol.includes('ø') || chord.symbol.includes('m7(b5)')))) &&
    !roman.includes('VII') && !roman.includes('bVII');

  if (isHalfDim) {
    if (inv === 1 && !borrowed && scale === 'major' && (roman.startsWith('vii') || roman.startsWith('VII'))) {
      // 1ª inversión de semidisminuido diatónico en mayor: cifrado jazz/Hookpad (ej. dm6)
      const bassPc = (rootPc + 3) % 12;
      return `${PC_NAMES[bassPc].toLowerCase()}m6`;
    }
    const rootName = PC_NAMES[rootPc];
    let sym = `${rootName.toLowerCase()}m7(b5)`;
    if (inv > 0) {
      const intervals = [0, 3, 6, 10];
      const bassInterval = intervals[inv % intervals.length] || 0;
      const bassPc = (rootPc + bassInterval) % 12;
      sym += `/${PC_NAMES[bassPc]}`;
    }
    return sym;
  }

  const rawAdds = Array.isArray(chord.adds) ? chord.adds : (chord.adds != null ? [chord.adds] : []);
  const hasAdd9 = rawAdds.includes(9) || rawAdds.includes('9') ||
    Boolean(chord.options?.add9) ||
    roman.includes('add9') ||
    (chord.symbol && chord.symbol.includes('add9'));

  const rawSuspensions: (number | string)[] = Array.isArray(chord.suspensions)
    ? chord.suspensions
    : typeof chord.suspensions === "string" || typeof chord.suspensions === "number"
      ? [chord.suspensions]
      : Array.isArray(chord.options?.suspensions)
        ? chord.options.suspensions
        : [];

  const hasSus2 = rawSuspensions.some((s: any) => s === 2 || s === "2" || s === "sus2") ||
    Boolean(chord.options?.sus2) ||
    Boolean(chord.suspension === "sus2" || chord.suspension === 2 || chord.suspension === "2") ||
    Boolean(roman.includes("sus2") || (chord.symbol && String(chord.symbol).includes("sus2")));

  const hasSus4 = rawSuspensions.some((s: any) => s === 4 || s === "4" || s === "sus4") ||
    Boolean(chord.options?.sus4) ||
    Boolean(chord.suspension === "sus4" || chord.suspension === 4 || chord.suspension === "4") ||
    Boolean(roman.includes("sus4") || (chord.symbol && String(chord.symbol).includes("sus4")));

  const isSus2Sus4 = (hasSus2 && hasSus4) ||
    rawSuspensions.some((s: any) => s === "sus2sus4" || s === "2,4" || s === "2-4") ||
    Boolean(chord.options?.sus2sus4) ||
    Boolean(roman.includes("sus2sus4") || (chord.symbol && String(chord.symbol).includes("sus2sus4")));

  const isSuspended = isSus2Sus4 || hasSus2 || hasSus4;

  const romanNumerator = roman.includes('/') ? roman.split('/')[0] : roman;

  if (chord.type === 9) {
    let sym = '';
    if (rawQuality === 'maj7' || romanNumerator.includes('^Δ') || romanNumerator.includes('maj9')) {
      sym = `${PC_NAMES[rootPc]}maj9`;
    } else if (rawQuality === 'min' || rawQuality === 'min7' || (/[a-z]/.test(romanNumerator) && !romanNumerator.startsWith('V') && !romanNumerator.startsWith('IV') && !romanNumerator.includes('°'))) {
      sym = `${PC_NAMES[rootPc].toLowerCase()}m9`;
    } else {
      sym = `${PC_NAMES[rootPc]}9`;
    }
    if (inv > 0) {
      const intervals = [0, 4, 7, 10, 14];
      const bassInterval = intervals[inv % intervals.length] || 0;
      const bassPc = (rootPc + bassInterval) % 12;
      sym += `/${PC_NAMES[bassPc]}`;
    }
    return sym;
  }

  const isMinor = rawQuality === 'min' || rawQuality === 'min7' ||
    (rawQuality === '' && /[a-z]/.test(romanNumerator) && !romanNumerator.includes('°') && !romanNumerator.startsWith('V') && !romanNumerator.startsWith('IV'));
  const isDim = rawQuality === 'dim' || rawQuality === 'dim7' || romanNumerator.includes('°') || (chord.symbol && chord.symbol.includes('°'));
  const isAug = rawQuality === 'aug' || hasSharp5 || romanNumerator.includes('+') || (chord.symbol && chord.symbol.includes('+'));
  const has7 = romanNumerator.includes('7') || romanNumerator.includes('⁷') || rawQuality.includes('7') || (chord.symbol && chord.symbol.includes('7'));
  const isMaj7 = rawQuality === 'maj7' ||
    romanNumerator.includes('maj7') ||
    romanNumerator.includes('M7') ||
    romanNumerator.includes('^Δ') ||
    romanNumerator.includes('Δ');

  if (roman.startsWith("♯i") || roman.startsWith("#i") || (rootSd === "#1" && (isDim || rawQuality === "dim" || rawQuality === "dim7"))) {
    const sharpOnePc = (rootPc % 12 + 12) % 12;
    const name = PC_NAMES[sharpOnePc].toLowerCase();
    const invSuffix = inv > 0 ? `/${PC_NAMES[(sharpOnePc + (inv === 1 ? 3 : inv === 2 ? 6 : 9)) % 12]}` : '';
    return `${name}°${invSuffix}`;
  }

  const is6thChord = chord.type === 6 || chord.type === "6" ||
    rawAdds.includes(6) || rawAdds.includes("6") ||
    (inv === 1 && (roman.startsWith("iii⁶₅") || roman.startsWith("iii65") || (rootSd === "3" && (has7 || rawQuality === "min7")))) ||
    (chord.symbol && String(chord.symbol).endsWith("6") && !String(chord.symbol).includes("m6"));

  if (is6thChord) {
    const isIii65 = inv === 1 && (roman.startsWith("iii⁶₅") || roman.startsWith("iii65") || rootSd === "3");
    const sixthBassPc = isIii65 ? (rootPc + 3) % 12 : (rootPc + (inv === 1 ? 4 : inv === 2 ? 7 : inv === 3 ? 9 : 0)) % 12;
    const sixthBassName = PC_NAMES[sixthBassPc];
    return `${sixthBassName}6`;
  }

  let rootPitch = PC_NAMES[rootPc];
  if (isSuspended) {
    rootPitch = rootPitch.toLowerCase();
  } else if (isMinor || isDim) {
    rootPitch = rootPitch.toLowerCase();
  }

  let suffix = '';
  if (!isSuspended) {
    if (isMinor) suffix += 'm';
    if (isDim) suffix += '°';
  }
  if (hasSharp5) suffix += '⁺⁽♯⁵⁾';
  else if (isAug) suffix += '+';

  if (!hasSharp5) {
    if (isMaj7) {
      suffix += 'maj7';
    } else if (has7) {
      suffix += '7';
    }
  }

  if (hasAdd9) {
    suffix += '(add9)';
  }

  if (isSus2Sus4) suffix += " sus2sus4";
  else if (hasSus2) suffix += " sus2";
  else if (hasSus4) suffix += "sus4";

  // Si tiene inversión, transponer también la nota del bajo
  if (inv > 0) {
    let intervals: number[];
    if (isSus2Sus4) {
      intervals = has7 ? [0, 2, 5, 7, 10] : [0, 2, 5, 7];
    } else if (hasSus2) {
      intervals = has7 ? [0, 2, 7, 10] : [0, 2, 7];
    } else if (hasSus4) {
      intervals = has7 ? [0, 5, 7, 10] : [0, 5, 7];
    } else {
      const qualityKey = isDim ? (has7 ? 'dim7' : 'dim')
        : isMinor ? (has7 ? 'min7' : 'min')
        : isAug ? 'aug'
        : has7 ? 'dom7' : 'maj';
      intervals = (hasSharp5 ? [0, 4, 8] : (CHORD_INTERVALS[qualityKey] || CHORD_INTERVALS['maj']));
    }
    const bassInterval = intervals[inv % intervals.length] || 0;
    const bassPc = (rootPc + bassInterval) % 12;
    const bassName = PC_NAMES[bassPc];
    suffix += `/${bassName}`;
  }

  return `${rootPitch}${suffix}`;
}

// ────────────────────────────────────────────────────────────────────────────
// resolveChordVoicing: UniversalChord → ResolvedChord (MIDI + symbol + voices)
// ────────────────────────────────────────────────────────────────────────────
/**
 * Resuelve un acorde universal a MIDI absoluto con voicing cerrado estilo Hooktheory.
 * Voicing cerrado de 3 o 4 notas en el registro central a partir de la fundamental real.
 *
 * @param chord - Acorde universal (con rootSd, quality, inversion)
 * @param key   - KeySignature o string tónica
 * @param baseOctave - Octava base para fundamentales (default 4, desplazable con chordsOctaveShift)
 */
export function resolveChordVoicing(
  chord: UniversalChord,
  key: KeySignature | string,
  baseOctave = 3,
): ResolvedChord {
  const { tonic, scale } = normalizeKey(key);
  const tonicPc = NOTE_TO_PC[tonic] ?? 0;

  // 1. Fundamental real en registro central Hooktheory
  const rootMidiBase = getChordRootMidi(chord, { tonic, scale: scale as any }, 4);
  const rootPc = ((rootMidiBase % 12) + 12) % 12;

  const inv = Number(chord.inversion ?? 0);
  const borrowed = normalizeBorrowed(chord.borrowed);
  const roman = chord.roman || '';
  const isSharpSecondary = chord.secondaryType === "vii°" ||
    (roman.startsWith("vii°") && (roman.includes("/") || Boolean(chord.applied || chord.appliedTarget))) ||
    roman.startsWith("♯i") || roman.startsWith("#i") || chord.rootSd === "#1";

  // 2. Nombres de notas según armadura y contexto modal
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const tonicUpper = tonic ? (tonic[0].toUpperCase() + tonic.slice(1)) : 'C';
  const isMinorFlatKey = scale === 'minor' && ['D', 'G', 'C', 'F', 'BB', 'EB', 'AB', 'DB'].includes(tonicUpper.toUpperCase());
  const useFlats = !isSharpSecondary && (
    FLAT_KEYS.has(tonic) ||
    isMinorFlatKey ||
    borrowed.includes('minor') || borrowed.includes('phryg') || borrowed.includes('aeol') ||
    borrowed.includes('mixo') || borrowed.includes('dor') ||
    roman.includes('b') || roman.includes('♭') || (chord.rootSd && chord.rootSd.includes('b')) ||
    (chord.quality === "min" && rootPc === 7) ||
    (chord.quality === "dom7" && rootPc === 0)
  );
  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // 3. Símbolo del acorde estilo Hooktheory
  const computedSymbol = getTransposedChordSymbol(chord, key);
  const symbol = chord.customSymbol || computedSymbol;

  const rawAlterations: string[] = Array.isArray(chord.alterations)
    ? chord.alterations.map(String).filter(Boolean)
    : typeof (chord.alterations as any) === "string" && (chord.alterations as any).trim().length > 0
      ? [(chord.alterations as any).trim()]
      : [];
  const hasSharp5 = rawAlterations.includes("#5") ||
    rawAlterations.includes("sharp5") ||
    rawAlterations.includes("+5") ||
    Boolean(chord.options?.sharp5) ||
    Boolean(roman && (roman.includes("⁺⁽♯⁵⁾") || roman.includes("⁺⁷") || roman.includes("+#5"))) ||
    Boolean(symbol && (symbol.includes("⁺⁽♯⁵⁾") || symbol.includes("+#5") || symbol.includes("+(#5)")));

  const rawAdds = Array.isArray((chord as any).adds)
    ? (chord as any).adds
    : ((chord as any).adds != null ? [(chord as any).adds] : []);
  const hasAdd9 = rawAdds.includes(9) || rawAdds.includes('9') ||
    Boolean(chord.options?.add9) ||
    Boolean(chord.roman?.includes('add9') || chord.symbol?.includes('add9'));

  const rawSuspensions: (number | string)[] = Array.isArray(chord.suspensions)
    ? chord.suspensions
    : typeof chord.suspensions === "string" || typeof chord.suspensions === "number"
      ? [chord.suspensions]
      : Array.isArray(chord.options?.suspensions)
        ? chord.options.suspensions
        : [];

  const hasSus2 = rawSuspensions.some((s: any) => s === 2 || s === "2" || s === "sus2") ||
    Boolean(chord.options?.sus2) ||
    Boolean(chord.suspension === "sus2" || chord.suspension === 2 || chord.suspension === "2") ||
    Boolean(roman.includes("sus2") || (chord.symbol && String(chord.symbol).includes("sus2")));

  const hasSus4 = rawSuspensions.some((s: any) => s === 4 || s === "4" || s === "sus4") ||
    Boolean(chord.options?.sus4) ||
    Boolean(chord.suspension === "sus4" || chord.suspension === 4 || chord.suspension === "4") ||
    Boolean(roman.includes("sus4") || (chord.symbol && String(chord.symbol).includes("sus4")));

  const isSus2Sus4 = (hasSus2 && hasSus4) ||
    rawSuspensions.some((s: any) => s === "sus2sus4" || s === "2,4" || s === "2-4") ||
    Boolean(chord.options?.sus2sus4) ||
    Boolean(roman.includes("sus2sus4") || (chord.symbol && String(chord.symbol).includes("sus2sus4")));

  const isV11 = chord.type === 11 || (chord.roman && chord.roman.startsWith('V¹¹'));

  const isAppliedLeadingTone = chord.secondaryType === "vii°" ||
    (roman.startsWith("vii°") && (roman.includes("/") || Boolean(chord.applied || chord.appliedTarget)));

  const effectiveQuality = isAppliedLeadingTone
    ? ((chord.type === 7 || chord.quality === "dim7" || roman.includes("7") || roman.includes("⁷")) ? "dim7" : "dim")
    : chord.quality;

  let chordIntervals: number[];
  if (isV11) {
    // V¹¹: Fundamental Sol en bajo y tríada de Fa (Fa, La, Do) -> [0, 10, 14, 17]
    chordIntervals = [0, 10, 14, 17];
  } else if (isSus2Sus4) {
    const seventh = (chord.type === 7 || roman.includes('7') || roman.includes('⁷')) ? 10 : undefined;
    chordIntervals = seventh !== undefined ? [0, 2, 5, 7, seventh] : [0, 2, 5, 7];
  } else if (hasSus2) {
    const seventh = (chord.type === 7 || roman.includes('7') || roman.includes('⁷')) ? 10 : undefined;
    chordIntervals = seventh !== undefined ? [0, 2, 7, seventh] : [0, 2, 7];
  } else if (hasSus4) {
    const seventh = (chord.type === 7 || roman.includes('7') || roman.includes('⁷')) ? 10 : undefined;
    chordIntervals = seventh !== undefined ? [0, 5, 7, seventh] : [0, 5, 7];
  } else if (chord.type === 9) {
    const baseQuality = effectiveQuality === 'halfdim7' ? 'halfdim7'
      : effectiveQuality.startsWith('min') ? 'min7'
      : (chord.roman?.includes('^Δ') || effectiveQuality === 'maj7') ? 'maj7'
      : 'dom7';
    const baseIntervals = CHORD_INTERVALS[baseQuality] || [0, 4, 7, 11];
    chordIntervals = [...baseIntervals.slice(0, 4), 14];
  } else if (hasAdd9) {
    const third = (effectiveQuality === 'min' || effectiveQuality === 'min7') ? 3 : 4;
    const fifth = hasSharp5 ? 8 : (effectiveQuality === 'dim' || effectiveQuality === 'halfdim7') ? 6 : 7;
    chordIntervals = [0, third, fifth, 14];
  } else {
    const isMaj7Chord = effectiveQuality === 'maj7' || chord.roman?.includes('^Δ') || chord.roman?.includes('maj7') || chord.roman?.includes('Δ');
    const intervals = (hasSharp5 && effectiveQuality !== 'dim' && effectiveQuality !== 'dim7')
      ? [0, 4, 8, 10]
      : isMaj7Chord
      ? [0, 4, 7, 11]
      : (CHORD_INTERVALS[effectiveQuality] || CHORD_INTERVALS['maj']);
    const count = (chord.type === 7 || effectiveQuality.includes('7') || effectiveQuality === 'halfdim7' || isMaj7Chord) ? 4 : 3;
    chordIntervals = [...intervals.slice(0, count)];
    if (hasSharp5 && chordIntervals.length >= 3) {
      chordIntervals[2] = 8;
    }
  }

  const bassInterval = chordIntervals[inv % chordIntervals.length] || 0;
  const bassPc = (rootPc + bassInterval) % 12;
  const bassName = PC_NAMES[bassPc];

  // 4. Generación de las voces del acorde en el registro central cerrado
  let midis = chordIntervals.map((semi) => rootMidiBase + semi);

  if (inv > 0 && !isV11) {
    const count = chordIntervals.length;
    const shiftCount = inv % count;
    const rotated: number[] = [];
    for (let i = shiftCount; i < count; i++) {
      rotated.push(midis[i]);
    }
    for (let i = 0; i < shiftCount; i++) {
      rotated.push(midis[i] + 12);
    }
    midis = rotated;
  }

  // Ajuste al registro central cerrado Hooktheory (C3 a E4/G4)
  if (midis[midis.length - 1] > 76) {
    midis = midis.map((m) => m - 12);
  }

  // Desplazamiento de octava de acordes (±8va)
  const octaveShift = (baseOctave - 3) * 12;
  if (octaveShift !== 0) {
    midis = midis.map((m) => m + octaveShift);
  }

  // Deduplicación estricta de alturas MIDI en el mismo acorde para evitar duplicaciones
  const uniqueMidis: number[] = [];
  for (const m of midis) {
    if (!uniqueMidis.includes(m)) {
      uniqueMidis.push(m);
    }
  }

  function midiToPitch(m: number): string {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    if (rootPc === 2 && pc === 6) return `F#${oct}`;
    if (rootPc === 9 && pc === 1) return `C#${oct}`;
    if (rootPc === 4 && pc === 8) return `G#${oct}`;
    if (rootPc === 11 && pc === 3) return `D#${oct}`;
    if (rootPc === 11 && pc === 6) return `F#${oct}`;
    return `${PC_NAMES[pc]}${oct}`;
  }

  function getDegreeSd(pc: number): string {
    const semi = ((pc - tonicPc) % 12 + 12) % 12;
    const SEMI_TO_SD: Record<number, string> = {
      0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
      6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
    };
    return SEMI_TO_SD[semi] || '1';
  }

  const harmonicVoices: ResolvedChordVoice[] = uniqueMidis.map((m) => {
    const pc = ((m % 12) + 12) % 12;
    const sd = getDegreeSd(pc);
    const { color, isAltered } = getDegreeColor(sd);
    const pitch = midiToPitch(m);
    const noteLabel = PC_NAMES[pc];

    const intervalFromRoot = ((pc - rootPc) % 12 + 12) % 12;
    let voiceNumber = '1';
    if (intervalFromRoot === 3 || intervalFromRoot === 4) voiceNumber = '3';
    else if (intervalFromRoot === 5) voiceNumber = '11';
    else if (intervalFromRoot === 6 || intervalFromRoot === 7 || intervalFromRoot === 8) voiceNumber = '5';
    else if (intervalFromRoot >= 9 && intervalFromRoot <= 11) voiceNumber = '7';
    else if (intervalFromRoot === 2) voiceNumber = '9';

    return {
      midi: m,
      pitch,
      label: voiceNumber,
      noteLabel,
      sd,
      color,
      isAltered,
      isBass: false,
      voiceNumber,
    };
  });

  if (isV11 && harmonicVoices.length > 0) {
    harmonicVoices[0].isBass = true;
    harmonicVoices[0].label = 'Bass';
    harmonicVoices[0].voiceNumber = 'Bass';
  }

  let voices: ResolvedChordVoice[] = harmonicVoices;
  let allSoundingMidis: number[] = [...uniqueMidis];

  // Si tiene inversión (ej. I⁶ sobre C/E), agregar la voz del bajo en octava grave (E3)
  if (inv > 0) {
    let bassMidi = rootMidiBase + bassInterval - 12 + octaveShift;
    // Asegurar registro de bajo acústico (bajo la voz armónica más grave) y evitar duplicados
    while (uniqueMidis.includes(bassMidi) || (uniqueMidis.length > 0 && bassMidi >= uniqueMidis[0])) {
      bassMidi -= 12;
    }
    const bassPitch = midiToPitch(bassMidi);
    const bassSd = getDegreeSd(bassPc);
    const { color: bassColor, isAltered: bassAltered } = getDegreeColor(bassSd);
    const bassVoice: ResolvedChordVoice = {
      midi: bassMidi,
      pitch: bassPitch,
      label: 'Bass',
      noteLabel: bassName,
      sd: bassSd,
      color: bassColor,
      isAltered: bassAltered,
      isBass: true,
      voiceNumber: 'Bass',
    };
    voices = [bassVoice, ...harmonicVoices];
    allSoundingMidis = [bassMidi, ...uniqueMidis];
  }

  const notes = voices.map((v) => v.pitch);
  const midiNotes = allSoundingMidis;

  const rootDegreeSd = getDegreeSd(rootPc);
  const { color: chordColor, isAltered: rootAltered } = getDegreeColor(rootDegreeSd);

  return {
    id: chord.id,
    beat: chord.beat,
    duration: chord.duration,
    roman: chord.roman,
    symbol: chord.customSymbol || symbol,
    rootMidi: allSoundingMidis[0],
    voices,
    midiNotes,
    notes,
    color: chordColor,
    isAltered: rootAltered || Boolean(chord.borrowed) || Boolean(chord.applied) || voices.some((v) => v.isAltered),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// resolveChordVoices: Atajo directo para obtener ResolvedChordVoice[]
// ────────────────────────────────────────────────────────────────────────────
/**
 * Resuelve las voces de un acorde directamente (usado por PianoRoll).
 * @param chord     - Acorde universal
 * @param key       - KeySignature
 * @param _maxVoices - (ignorado, se mantiene por compatibilidad de firma)
 */
export function resolveChordVoices(
  chord: UniversalChord,
  key: KeySignature | string,
  baseOctave = 3,
): ResolvedChordVoice[] {
  const resolved = resolveChordVoicing(chord, key, baseOctave);
  return resolved.voices;
}
