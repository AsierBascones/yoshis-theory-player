/**
 * theoryEngine.ts
 * Motor de resolución armónica declarativo, determinista y desacoplado (Arquitectura IR).
 * Procesa acordes Hookpad v2 / TheoryTab mediante un pipeline de etapas puras:
 * 1. buildIntermediateChord: construye el Modelo Intermedio (IntermediateChordModel)
 * 2. renderRomanNumeral: genera el cifrado de grado y función romana
 * 3. renderChordSymbol: genera el cifrado armónico absoluto con bajo
 * 4. renderSubLabels: genera las etiquetas secundarias modales y de sustitución
 *
 * Mantiene 100% de retrocompatibilidad con las firmas públicas existentes.
 */

import * as Tone from 'tone';
import type {
  UniversalChord,
  KeySignature,
  KeyChange,
  ResolvedChord,
  ResolvedChordVoice,
  ChordTone,
  AppliedFunction,
  IntermediateChordModel,
  CanonicalChordIR,
  ScaleMode,
  ChordQuality,
  PitchClass,
  MelodicRole,
  MetricAccent,
  PerceptualStabilityCategory,
  MelodicStabilityContext,
  MelodicStabilityResult,
  ModalMixtureResult,
} from '../types/music';
export type {
  KeyChange,
  ChordTone,
  AppliedFunction,
  IntermediateChordModel,
  CanonicalChordIR,
  ChordQuality,
  PitchClass,
  MelodicRole,
  MetricAccent,
  PerceptualStabilityCategory,
  MelodicStabilityContext,
  MelodicStabilityResult,
  ModalMixtureResult,
};
import { getDegreeColor } from './theoryColors';

// ── Re-exports de utilidades comunes para compatibilidad ──
export {
  applySwingTransform,
  getScaleSpelling,
  formatPitch,
} from './musicTheory';

// ────────────────────────────────────────────────────────────────────────────
// 1. Utilidades Matemáticas y Sanitización
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normalización matemática estricta a semitonos dentro de la octava [0..11].
 * Maneja de forma segura enteros negativos y superiores a 12.
 */
export const normalizeSemitone = (semi: number): number => ((semi % 12) + 12) % 12;

/**
 * Sanitizador seguro para arrays de semitonos o strings de borrowed.
 */
export function normalizeBorrowed(borrowed: unknown): string {
  if (!borrowed) return "";
  if (typeof borrowed === "string") return borrowed.toLowerCase();
  if (Array.isArray(borrowed)) return "custom_borrowed";
  return "";
}

/**
 * Resolución dinámica por pulso de la modulación o tonalidad activa.
 */
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

/**
 * Nombre de nota → Pitch Class (0–11, C = 0).
 */
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

export const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

export const CHORD_INTERVALS: Record<string, number[]> = {
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

export const SCALE_MODE_OFFSETS: Record<string, number[]> = {
  major:             [0, 2, 4, 5, 7, 9, 11],
  ionian:            [0, 2, 4, 5, 7, 9, 11],
  maj:               [0, 2, 4, 5, 7, 9, 11],
  mixolydian:        [0, 2, 4, 5, 7, 9, 10],
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

export const DIATONIC_SCALE_SEMITONES: Record<number, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
};

export const DEGREE_SEMITONES: Record<string, number> = {
  "1": 0, "#1": 1, "b2": 1,
  "2": 2, "#2": 3, "b3": 3,
  "3": 4,
  "4": 5, "#4": 6, "b5": 6,
  "5": 7, "#5": 8, "b6": 8,
  "6": 9, "#6": 10, "b7": 10,
  "7": 11,
};

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
    3: { roman: "bIII", quality: "maj", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "v",    quality: "min", semitones: 7 },
    6: { roman: "bVI",  quality: "maj", semitones: 8 },
    7: { roman: "bVII", quality: "maj", semitones: 10 },
  },
  mixolydian: {
    1: { roman: "I",    quality: "maj", semitones: 0 },
    2: { roman: "ii",   quality: "min", semitones: 2 },
    3: { roman: "iii°", quality: "dim", semitones: 4 },
    4: { roman: "IV",   quality: "maj", semitones: 5 },
    5: { roman: "v",    quality: "min", semitones: 7 },
    6: { roman: "vi",   quality: "min", semitones: 9 },
    7: { roman: "bVII", quality: "maj", semitones: 10 },
  },
  dorian: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "ii",   quality: "min", semitones: 2 },
    3: { roman: "bIII", quality: "maj", semitones: 3 },
    4: { roman: "IV",   quality: "maj", semitones: 5 },
    5: { roman: "v",    quality: "min", semitones: 7 },
    6: { roman: "vi°",  quality: "dim", semitones: 9 },
    7: { roman: "bVII", quality: "maj", semitones: 10 },
  },
  phrygian: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "bII",  quality: "maj", semitones: 1 },
    3: { roman: "bIII", quality: "maj", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "v°",   quality: "dim", semitones: 7 },
    6: { roman: "bVI",  quality: "maj", semitones: 8 },
    7: { roman: "bvii", quality: "min", semitones: 10 },
  },
  lydian: {
    1: { roman: "I",    quality: "maj", semitones: 0 },
    2: { roman: "II",   quality: "maj", semitones: 2 },
    3: { roman: "iii",  quality: "min", semitones: 4 },
    4: { roman: "♯iv°", quality: "dim", semitones: 6 },
    5: { roman: "V",    quality: "maj", semitones: 7 },
    6: { roman: "vi",   quality: "min", semitones: 9 },
    7: { roman: "vii",  quality: "min", semitones: 11 },
  },
  locrian: {
    1: { roman: "i°",   quality: "dim", semitones: 0 },
    2: { roman: "bII",  quality: "maj", semitones: 1 },
    3: { roman: "biii", quality: "min", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "bV",   quality: "maj", semitones: 6 },
    6: { roman: "bVI",  quality: "maj", semitones: 8 },
    7: { roman: "bvii", quality: "min", semitones: 10 },
  },
  harmonic_minor: {
    1: { roman: "i",    quality: "min", semitones: 0 },
    2: { roman: "ii°",  quality: "dim", semitones: 2 },
    3: { roman: "III+", quality: "aug", semitones: 3 },
    4: { roman: "iv",   quality: "min", semitones: 5 },
    5: { roman: "V",    quality: "maj", semitones: 7 },
    6: { roman: "bVI",  quality: "maj", semitones: 8 },
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

export const DIATONIC_7TH_QUALITIES_BY_MODE: Record<
  string,
  Record<number, "maj7" | "min7" | "dom7" | "halfdim7" | "dim7">
> = {
  major: {
    1: "maj7", 2: "min7", 3: "min7", 4: "maj7", 5: "dom7", 6: "min7", 7: "halfdim7"
  },
  minor: {
    1: "min7", 2: "halfdim7", 3: "maj7", 4: "min7", 5: "min7", 6: "maj7", 7: "dom7"
  },
  mixolydian: {
    1: "dom7", 2: "min7", 3: "halfdim7", 4: "maj7", 5: "min7", 6: "min7", 7: "maj7"
  },
  dorian: {
    1: "min7", 2: "min7", 3: "maj7", 4: "dom7", 5: "min7", 6: "halfdim7", 7: "maj7"
  },
  phrygian: {
    1: "min7", 2: "maj7", 3: "dom7", 4: "min7", 5: "halfdim7", 6: "maj7", 7: "min7"
  },
  lydian: {
    1: "maj7", 2: "dom7", 3: "min7", 4: "halfdim7", 5: "maj7", 6: "min7", 7: "min7"
  },
  locrian: {
    1: "halfdim7", 2: "maj7", 3: "min7", 4: "min7", 5: "maj7", 6: "dom7", 7: "min7"
  },
  harmonic_minor: {
    1: "min7", 2: "halfdim7", 3: "maj7", 4: "min7", 5: "dom7", 6: "maj7", 7: "dim7"
  },
};

DIATONIC_7TH_QUALITIES_BY_MODE.aeolian = DIATONIC_7TH_QUALITIES_BY_MODE.minor;
DIATONIC_7TH_QUALITIES_BY_MODE.ionian = DIATONIC_7TH_QUALITIES_BY_MODE.major;
DIATONIC_7TH_QUALITIES_BY_MODE.mix = DIATONIC_7TH_QUALITIES_BY_MODE.mixolydian;
DIATONIC_7TH_QUALITIES_BY_MODE.min = DIATONIC_7TH_QUALITIES_BY_MODE.minor;
DIATONIC_7TH_QUALITIES_BY_MODE.maj = DIATONIC_7TH_QUALITIES_BY_MODE.major;
DIATONIC_7TH_QUALITIES_BY_MODE.dor = DIATONIC_7TH_QUALITIES_BY_MODE.dorian;
DIATONIC_7TH_QUALITIES_BY_MODE.phr = DIATONIC_7TH_QUALITIES_BY_MODE.phrygian;
DIATONIC_7TH_QUALITIES_BY_MODE.lyd = DIATONIC_7TH_QUALITIES_BY_MODE.lydian;
DIATONIC_7TH_QUALITIES_BY_MODE.loc = DIATONIC_7TH_QUALITIES_BY_MODE.locrian;
DIATONIC_7TH_QUALITIES_BY_MODE.harmonicminor = DIATONIC_7TH_QUALITIES_BY_MODE.harmonic_minor;
DIATONIC_7TH_QUALITIES_BY_MODE.harm_min = DIATONIC_7TH_QUALITIES_BY_MODE.harmonic_minor;
DIATONIC_7TH_QUALITIES_BY_MODE.harm = DIATONIC_7TH_QUALITIES_BY_MODE.harmonic_minor;

/**
 * REQ-1.1: Obtiene la clase de altura en Z12 [0..11] a partir de nombre de nota o número MIDI.
 */
export function getPitchClass(noteOrMidi: string | number): number {
  if (typeof noteOrMidi === "number") {
    return normalizeSemitone(noteOrMidi);
  }
  const clean = String(noteOrMidi).trim();
  const match = clean.match(/^([A-Ga-g][#b]?)/);
  if (match) {
    const key = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    if (NOTE_TO_PC[key] !== undefined) return NOTE_TO_PC[key];
    if (NOTE_TO_PC[match[1]] !== undefined) return NOTE_TO_PC[match[1]];
  }
  return NOTE_TO_PC[clean] ?? 0;
}

/**
 * REQ-2.2: Calcula ordenadamente las clases de altura de los 7 grados de una escala o modo:
 * Scale(T, M) = {(T + o_i) mod 12 | o_i in M}
 */
export function getScalePitchClasses(
  tonic: string | number,
  mode: string = "major"
): number[] {
  const tonicPc = typeof tonic === "number" ? normalizeSemitone(tonic) : getPitchClass(tonic);
  const normMode = mode.toLowerCase();
  const offsets = SCALE_MODE_OFFSETS[normMode] ?? SCALE_MODE_OFFSETS["major"];
  return offsets.map(o => normalizeSemitone(tonicPc + o));
}

/**
 * REQ-1.3 & REQ-3.2/3.3: Obtiene los intervalos reales en semitonos para cualquier cualidad armónica.
 */
export function getChordIntervals(quality: ChordQuality | string): number[] {
  return CHORD_INTERVALS[quality] ? [...CHORD_INTERVALS[quality]] : [0, 4, 7];
}

/**
 * REQ-5.1: Determina la cualidad diatónica de tríada o tétrada para cualquier grado (1..7) y modo.
 */
export function getDiatonicChordQuality(
  degree: number,
  mode: string = "major",
  is7th: boolean = false
): ChordQuality {
  const normMode = mode.toLowerCase();
  const deg = Math.max(1, Math.min(7, Math.round(degree)));
  if (is7th) {
    return (DIATONIC_7TH_QUALITIES_BY_MODE[normMode]?.[deg] as ChordQuality) ?? "maj7";
  }
  return (DIATONIC_DEGREES_BY_SCALE[normMode]?.[deg]?.quality as ChordQuality) ?? "maj";
}

/**
 * REQ-2.3: Obtiene la clase de altura (0..11) correspondiente a un grado relativo (ej. 1, 3, "b3", "#4")
 * dado el contexto tonal (tónica y modo).
 */
export function getDegreePitchClass(
  degree: number | string,
  tonic: string | number,
  mode: string = "major"
): number {
  const tonicPc = typeof tonic === "number" ? normalizeSemitone(tonic) : getPitchClass(tonic);
  const normMode = mode.toLowerCase();
  const modeOffsets = SCALE_MODE_OFFSETS[normMode] ?? SCALE_MODE_OFFSETS["major"];

  const degStr = String(degree).trim();
  const baseNum = parseInt(degStr.replace(/[^0-9]/g, ""), 10) || 1;
  const clampedNum = Math.max(1, Math.min(7, baseNum));
  const baseOffset = modeOffsets[clampedNum - 1] ?? 0;

  let accidental = 0;
  if (degStr.includes("#") || degStr.includes("♯")) {
    accidental = (degStr.match(/[#♯]/g) || []).length;
  } else if (degStr.includes("b") || degStr.includes("♭")) {
    accidental = -(degStr.match(/[b♭]/g) || []).length;
  }

  return normalizeSemitone(tonicPc + baseOffset + accidental);
}

/**
 * REQ-6.1: Pertenencia al acorde activo:
 * ChordMember(p, C) <=> pc(p) in PitchClasses(C)
 */
export function isChordTone(
  pitchOrMidi: number | string,
  chord: CanonicalChordIR | IntermediateChordModel | UniversalChord
): boolean {
  const pc = getPitchClass(pitchOrMidi);
  let pitches: number[] = [];
  if ('outputs' in chord && chord.outputs?.effectivePitches) {
    pitches = chord.outputs.effectivePitches;
  } else if ('effectivePitches' in chord && Array.isArray((chord as any).effectivePitches)) {
    pitches = (chord as any).effectivePitches;
  } else if ('midiNotes' in chord && Array.isArray(chord.midiNotes)) {
    pitches = chord.midiNotes.map(m => normalizeSemitone(m));
  } else if ('notes' in chord && Array.isArray(chord.notes)) {
    pitches = chord.notes.map(n => getPitchClass(n));
  }
  return pitches.includes(pc);
}

/**
 * REQ-6.2: Clasificación contextual de estabilidad melódica:
 * Evalúa si una nota melódica es tónica del acorde, factor estructural, extensión,
 * nota de escala o tensión cromática, y calcula la distancia a la nota armónica más cercana.
 */
/**
 * REQ-7.1 / REQ-6.2: Clasificación de acento métrico según la métrica del compás:
 * - 'strong': downbeat (tiempo 1 del compás)
 * - 'medium': acento secundario (ej. tiempo 3 en 4/4, tiempo 2 compuesto en 6/8)
 * - 'weak': tiempos débiles o subdivisiones
 */
export function getMetricAccent(
  beat: number = 1,
  timeSignature: [number, number] = [4, 4]
): MetricAccent {
  const [num, den] = timeSignature;
  const quarterBeatsPerBar = (num * 4) / den;
  const offsetInBar = ((beat - 1) % quarterBeatsPerBar + quarterBeatsPerBar) % quarterBeatsPerBar;
  const EPS = 0.05;

  if (offsetInBar < EPS || Math.abs(offsetInBar - quarterBeatsPerBar) < EPS) {
    return 'strong';
  }

  if (num === 4 && den === 4) {
    if (Math.abs(offsetInBar - 2.0) < EPS) {
      return 'medium';
    }
  } else if (num === 6 && den === 8) {
    if (Math.abs(offsetInBar - 1.5) < EPS) {
      return 'medium';
    }
  } else if (num === 12 && den === 8) {
    if (Math.abs(offsetInBar - 3.0) < EPS) {
      return 'medium';
    }
  }

  return 'weak';
}

function parsePitchToMidi(pitch: string): number {
  const match = pitch.trim().match(/^([A-Ga-g][#b]?)(\d+)$/);
  if (match) {
    const key = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const pc = NOTE_TO_PC[key] ?? 0;
    const oct = parseInt(match[2], 10);
    return (oct + 1) * 12 + pc;
  }
  const cleanKey = pitch.trim().charAt(0).toUpperCase() + pitch.trim().slice(1).toLowerCase();
  const pc = NOTE_TO_PC[cleanKey] ?? 0;
  return 60 + pc; // Octava 4 por defecto
}

/**
 * REQ-6.1 & REQ-6.2: Evaluación y clasificación contextual de estabilidad melódica.
 * Distingue explícitamente entre:
 * 1. Pertenencia al acorde (ChordMember): propiedad matemática binaria pc in PitchClasses(C).
 * 2. Estabilidad perceptiva: interacción entre función melódica, peso métrico y resolución por paso conjunto.
 * Identifica notas de paso (passing tones), bordaduras (neighbor tones), suspensiones, anticipaciones,
 * apoyaturas y notas de escape (échappées).
 */
export function getMelodicStability(
  pitchOrMidi: number | string,
  chord: CanonicalChordIR | IntermediateChordModel | UniversalChord,
  scaleMode: string = 'major',
  context?: MelodicStabilityContext
): MelodicStabilityResult {
  const currentMidi = typeof pitchOrMidi === 'number' ? pitchOrMidi : parsePitchToMidi(pitchOrMidi);
  const pc = getPitchClass(pitchOrMidi);
  const isTone = isChordTone(pc, chord);

  let rootPc = 0;
  if ('identity' in chord && chord.identity?.rootPitchClass !== undefined) {
    rootPc = chord.identity.rootPitchClass;
  } else if ('rootSemitones' in chord && typeof (chord as any).rootSemitones === 'number') {
    rootPc = (chord as any).rootSemitones;
  } else if ('_rootSemitones' in chord && typeof (chord as any)._rootSemitones === 'number') {
    rootPc = (chord as any)._rootSemitones;
  }

  const intervalFromRoot = normalizeSemitone(pc - rootPc);

  let effectivePitches: number[] = [];
  if ('outputs' in chord && chord.outputs?.effectivePitches) {
    effectivePitches = chord.outputs.effectivePitches;
  } else if ('ir' in chord && chord.ir?.outputs?.effectivePitches) {
    effectivePitches = chord.ir.outputs.effectivePitches;
  } else if ('model' in chord && chord.model?.effectivePitches) {
    effectivePitches = chord.model.effectivePitches;
  } else if ('effectivePitches' in chord && Array.isArray((chord as any).effectivePitches)) {
    effectivePitches = (chord as any).effectivePitches;
  } else if ('midiNotes' in chord && Array.isArray(chord.midiNotes)) {
    effectivePitches = Array.from(new Set(chord.midiNotes.map(m => normalizeSemitone(m))));
  } else if ('notes' in chord && Array.isArray(chord.notes)) {
    effectivePitches = Array.from(new Set(chord.notes.map(n => getPitchClass(n))));
  }

  let distanceToNearest = 0;
  if (!isTone && effectivePitches.length > 0) {
    distanceToNearest = Math.min(
      ...effectivePitches.map(cpc => {
        const diff = Math.abs(pc - cpc);
        return Math.min(diff, 12 - diff);
      })
    );
  }

  const metricAccent = getMetricAccent(context?.beat ?? 1, context?.timeSignature ?? [4, 4]);

  const prevMidi = context?.prevNoteMidi;
  const nextMidi = context?.nextNoteMidi;
  const hasNeighbors = prevMidi !== undefined && nextMidi !== undefined;

  let resolvesByStep = false;
  if (nextMidi !== undefined) {
    const diffNext = Math.abs(nextMidi - currentMidi);
    const nextIsChordTone = isChordTone(nextMidi, chord);
    resolvesByStep = (diffNext === 1 || diffNext === 2) && nextIsChordTone;
  }

  let role: MelodicRole = 'chromatic';
  let perceptualStability: PerceptualStabilityCategory = 'dissonant';
  let stabilityScore = 0.1;
  let label = '';

  if (pc === rootPc) {
    role = 'root';
    label = 'Root';
    perceptualStability = metricAccent === 'strong' ? 'very_stable' : 'stable';
    stabilityScore = metricAccent === 'strong' ? 1.0 : 0.9;
  } else if (isTone) {
    role = 'chord_tone';
    label = intervalFromRoot === 3 || intervalFromRoot === 4 ? '3rd' :
            intervalFromRoot === 6 || intervalFromRoot === 7 || intervalFromRoot === 8 ? '5th' :
            intervalFromRoot === 9 || intervalFromRoot === 10 || intervalFromRoot === 11 ? '7th' : 'Chord Tone';
    perceptualStability = metricAccent === 'strong' ? 'very_stable' : 'stable';
    stabilityScore = metricAccent === 'strong' ? 0.9 : 0.85;
  } else {
    // ── Clasificación Contextual de Notas No Armónicas (Non-Harmonic Tones) ──
    if (hasNeighbors && prevMidi !== undefined && nextMidi !== undefined) {
      const diffPrev = Math.abs(currentMidi - prevMidi);
      const diffNext = Math.abs(nextMidi - currentMidi);
      const isStepFromPrev = diffPrev === 1 || diffPrev === 2;
      const isStepToNext = diffNext === 1 || diffNext === 2;
      const nextIsChordTone = isChordTone(nextMidi, chord);
      const prevIsChordTone = isChordTone(prevMidi, chord);

      const isDirectionSame = (currentMidi - prevMidi) * (nextMidi - currentMidi) > 0;
      const isReturnToSame = normalizeSemitone(prevMidi) === normalizeSemitone(nextMidi);

      if (isStepFromPrev && isStepToNext && isDirectionSame && nextIsChordTone) {
        // 1. Nota de Paso (Passing Tone)
        role = 'passing_tone';
        label = metricAccent === 'weak' ? 'Unaccented Passing Tone' : 'Accented Passing Tone';
        perceptualStability = metricAccent === 'weak' ? 'ornamental_stable' : 'tense_unresolved';
        stabilityScore = metricAccent === 'weak' ? 0.65 : 0.45;
      } else if (isStepFromPrev && isStepToNext && isReturnToSame && nextIsChordTone) {
        // 2. Bordadura (Neighbor Tone)
        role = 'neighbor_tone';
        label = currentMidi > prevMidi ? 'Upper Neighbor Tone' : 'Lower Neighbor Tone';
        perceptualStability = metricAccent === 'weak' ? 'ornamental_stable' : 'tense_unresolved';
        stabilityScore = metricAccent === 'weak' ? 0.65 : 0.45;
      } else if (normalizeSemitone(prevMidi) === pc && nextMidi < currentMidi && isStepToNext && nextIsChordTone && metricAccent !== 'weak') {
        // 3. Suspensión (Suspension)
        role = 'suspension';
        label = 'Suspension';
        perceptualStability = 'tense_unresolved';
        stabilityScore = 0.4;
      } else if (isStepFromPrev && normalizeSemitone(nextMidi) === pc && metricAccent === 'weak') {
        // 4. Anticipación (Anticipation)
        role = 'anticipation';
        label = 'Anticipation';
        perceptualStability = 'ornamental_stable';
        stabilityScore = 0.6;
      } else if (diffPrev >= 3 && isStepToNext && nextIsChordTone && metricAccent !== 'weak') {
        // 5. Apoyatura (Appoggiatura)
        role = 'appoggiatura';
        label = 'Appoggiatura';
        perceptualStability = 'tense_unresolved';
        stabilityScore = 0.35;
      } else if (isStepFromPrev && prevIsChordTone && diffNext >= 3 && ((nextMidi - currentMidi) * (currentMidi - prevMidi) < 0)) {
        // 6. Nota de Escape (Escape Tone / Échappée)
        role = 'escape_tone';
        label = 'Escape Tone';
        perceptualStability = 'ornamental_stable';
        stabilityScore = 0.5;
      }
    }

    // Si no fue clasificada como adorno específico por falta de contexto o salto:
    if (label === '') {
      if (intervalFromRoot === 14 % 12 || intervalFromRoot === 2 || intervalFromRoot === 5 || intervalFromRoot === 9) {
        role = 'extension';
        label = intervalFromRoot === 2 ? '9th Tension' : intervalFromRoot === 5 ? '11th Tension' : '13th Tension';
        perceptualStability = 'colored_stable';
        stabilityScore = 0.7;
      } else {
        const modeOffsets = SCALE_MODE_OFFSETS[scaleMode.toLowerCase()] ?? SCALE_MODE_OFFSETS['major'];
        const isScaleTone = modeOffsets.includes(normalizeSemitone(pc - rootPc));
        if (isScaleTone) {
          role = 'scale_tone';
          label = 'Scale Tone';
          perceptualStability = resolvesByStep ? 'ornamental_stable' : (metricAccent === 'weak' ? 'stable' : 'tense_unresolved');
          stabilityScore = resolvesByStep ? 0.6 : (metricAccent === 'weak' ? 0.5 : 0.3);
        } else {
          role = 'chromatic';
          label = 'Chromatic Non-chord Tone';
          perceptualStability = resolvesByStep ? 'ornamental_stable' : 'dissonant';
          stabilityScore = resolvesByStep ? 0.4 : 0.1;
        }
      }
    }
  }

  return {
    pitchClass: pc,
    isChordTone: isTone,
    role,
    metricAccent,
    perceptualStability,
    stabilityScore,
    distanceToNearestChordTone: distanceToNearest,
    intervalFromRoot,
    resolvesByStep,
    label,
  };
}

/**
 * REQ-5.3: Detección y resolución de mezclas modales y acordes prestados.
 * Identifica la procedencia del modo paralelo, recopila modos candidatos cuando existe ambigüedad
 * y aplica una jerarquía de preferencia documentada sin inventar procedencias únicas arbitrarias.
 */
export function detectModalMixture(
  rawBorrowed: unknown,
  tonic: string | number,
  scaleContext: string = "major",
  rootSemitones: number,
  chordQuality: ChordQuality,
  degreeIndex: number
): ModalMixtureResult {
  const normExplicit = normalizeBorrowed(rawBorrowed);
  if (normExplicit && normExplicit !== "custom_borrowed") {
    let modeClean = normExplicit;
    if (modeClean.includes("phryg")) modeClean = "phrygian";
    else if (modeClean.includes("lyd")) modeClean = "lydian";
    else if (modeClean.includes("dor")) modeClean = "dorian";
    else if (modeClean.includes("mix")) modeClean = "mixolydian";
    else if (modeClean.includes("loc")) modeClean = "locrian";
    else if (modeClean.includes("min") || modeClean.includes("aeol")) modeClean = "minor";
    else if (modeClean.includes("maj") || modeClean.includes("ion")) modeClean = "major";

    return {
      isBorrowed: true,
      provenance: 'explicit',
      borrowedMode: modeClean,
      candidateModes: [modeClean],
      isAmbiguous: false,
      explanation: `Préstamo modal explícito declarado en los metadatos (${modeClean})`,
    };
  }

  const tonicPc = typeof tonic === "number" ? normalizeSemitone(tonic) : getPitchClass(tonic);
  const normActive = scaleContext.toLowerCase();
  const activeOffsets = SCALE_MODE_OFFSETS[normActive] ?? SCALE_MODE_OFFSETS["major"];

  // 1. Comprobar si el acorde es diatónico en el contexto activo
  const diatonicTriadQuality = DIATONIC_DEGREES_BY_SCALE[normActive]?.[degreeIndex]?.quality;
  const diatonic7thQuality = DIATONIC_7TH_QUALITIES_BY_MODE[normActive]?.[degreeIndex];
  const diatonicPc = normalizeSemitone(tonicPc + activeOffsets[degreeIndex - 1]);

  const isDiatonicRoot = diatonicPc === rootSemitones;
  const isDiatonicQuality = chordQuality === diatonicTriadQuality || chordQuality === diatonic7thQuality;

  if (isDiatonicRoot && isDiatonicQuality) {
    return {
      isBorrowed: false,
      provenance: 'none',
      borrowedMode: null,
      candidateModes: [],
      isAmbiguous: false,
      explanation: `Acorde diatónico nativo en el modo activo (${normActive})`,
    };
  }

  // 2. Prospección en los modos paralelos de la tónica
  const PARALLEL_MODES = normActive === "major"
    ? ["minor", "mixolydian", "dorian", "phrygian", "lydian", "locrian"]
    : ["major", "dorian", "mixolydian", "phrygian", "lydian", "locrian"];

  const candidateModes: string[] = [];

  for (const pMode of PARALLEL_MODES) {
    const offsets = SCALE_MODE_OFFSETS[pMode];
    if (!offsets) continue;

    for (let d = 1; d <= 7; d++) {
      const pPc = normalizeSemitone(tonicPc + offsets[d - 1]);
      if (pPc === rootSemitones) {
        const triadQ = DIATONIC_DEGREES_BY_SCALE[pMode]?.[d]?.quality;
        const tetradQ = DIATONIC_7TH_QUALITIES_BY_MODE[pMode]?.[d];
        if (chordQuality === triadQ || chordQuality === tetradQ ||
            (chordQuality === "maj" && (triadQ === "maj" || tetradQ === "maj7" || tetradQ === "dom7")) ||
            (chordQuality === "min" && (triadQ === "min" || tetradQ === "min7"))) {
          if (!candidateModes.includes(pMode)) {
            candidateModes.push(pMode);
          }
        }
      }
    }
  }

  if (candidateModes.length === 0) {
    return {
      isBorrowed: false,
      provenance: 'none',
      borrowedMode: null,
      candidateModes: [],
      isAmbiguous: false,
      explanation: 'No se encontraron coincidencias directas en los modos paralelos principales',
    };
  }

  // 3. Regla de preferencia teórica documentada ante ambigüedad
  const intervalFromTonic = normalizeSemitone(rootSemitones - tonicPc);
  let preferredMode = candidateModes[0];

  if (normActive === "major") {
    // bVI (8 st), bIII (3 st), iv (5 st min), ii° (2 st dim) -> procedencia primaria: minor (eólico paralelo)
    if (intervalFromTonic === 8 || intervalFromTonic === 3 || (intervalFromTonic === 5 && chordQuality === "min") || (intervalFromTonic === 2 && chordQuality === "dim")) {
      preferredMode = candidateModes.includes("minor") ? "minor" : preferredMode;
    } else if (intervalFromTonic === 1) { // bII (napolitano) -> frigio
      preferredMode = candidateModes.includes("phrygian") ? "phrygian" : preferredMode;
    } else if (intervalFromTonic === 10) { // bVII -> mixolidio o menor
      preferredMode = candidateModes.includes("mixolydian") ? "mixolydian" : (candidateModes.includes("minor") ? "minor" : preferredMode);
    } else if (intervalFromTonic === 6 || (intervalFromTonic === 2 && chordQuality === "maj")) { // #iv° o II -> lidio
      preferredMode = candidateModes.includes("lydian") ? "lydian" : preferredMode;
    }
  } else {
    // IV mayor (5 st maj) o ii menor (2 st min) -> dórico
    if ((intervalFromTonic === 5 && chordQuality === "maj") || (intervalFromTonic === 2 && chordQuality === "min")) {
      preferredMode = candidateModes.includes("dorian") ? "dorian" : preferredMode;
    } else if ((intervalFromTonic === 0 && chordQuality === "maj") || (intervalFromTonic === 7 && chordQuality === "maj")) { // I mayor o V mayor
      preferredMode = candidateModes.includes("major") ? "major" : preferredMode;
    } else if (intervalFromTonic === 1) { // bII -> frigio
      preferredMode = candidateModes.includes("phrygian") ? "phrygian" : preferredMode;
    }
  }

  const isAmbiguous = candidateModes.length > 1;
  const explanation = isAmbiguous
    ? `Préstamo inferido con ambigüedad: modos compatibles [${candidateModes.join(", ")}]. Preferencia armónica asignada a '${preferredMode}'.`
    : `Préstamo modal inferido unívocamente del modo paralelo '${preferredMode}'.`;

  return {
    isBorrowed: true,
    provenance: 'inferred',
    borrowedMode: preferredMode,
    candidateModes,
    isAmbiguous,
    explanation,
  };
}

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
    7: { roman: "♭VII", quality: "maj", semitones: 10, sublabel: "(mix)" },
  },
  dorian: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(dor)" },
    2: { roman: "ii", quality: "min", semitones: 2, sublabel: "(dor)" },
    3: { roman: "♭III", quality: "maj", semitones: 3, sublabel: "(dor)" },
    4: { roman: "IV", quality: "maj", semitones: 5, sublabel: "(dor)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(dor)" },
    6: { roman: "vi°", quality: "dim", semitones: 9, sublabel: "(dor)" },
    7: { roman: "♭VII", quality: "maj", semitones: 10, sublabel: "(dor)" },
  },
  phrygian: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(phr)" },
    2: { roman: "♭II", quality: "maj", semitones: 1, sublabel: "(phr)" },
    3: { roman: "♭III", quality: "maj", semitones: 3, sublabel: "(phr)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(phr)" },
    5: { roman: "v°", quality: "dim", semitones: 7, sublabel: "(phr)" },
    6: { roman: "♭VI", quality: "maj", semitones: 8, sublabel: "(phr)" },
    7: { roman: "♭vii", quality: "min", semitones: 10, sublabel: "(phr)" },
  },
  minor: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(m)" },
    2: { roman: "ii°", quality: "dim", semitones: 2, sublabel: "(m)" },
    3: { roman: "♭III", quality: "maj", semitones: 3, sublabel: "(m)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(m)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(m)" },
    6: { roman: "♭VI", quality: "maj", semitones: 8, sublabel: "(m)" },
    7: { roman: "♭VII", quality: "maj", semitones: 10, sublabel: "(m)" },
  },
  aeolian: {
    1: { roman: "i", quality: "min", semitones: 0, sublabel: "(m)" },
    2: { roman: "ii°", quality: "dim", semitones: 2, sublabel: "(m)" },
    3: { roman: "♭III", quality: "maj", semitones: 3, sublabel: "(m)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(m)" },
    5: { roman: "v", quality: "min", semitones: 7, sublabel: "(m)" },
    6: { roman: "♭VI", quality: "maj", semitones: 8, sublabel: "(m)" },
    7: { roman: "♭VII", quality: "maj", semitones: 10, sublabel: "(m)" },
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
    2: { roman: "♭II", quality: "maj", semitones: 1, sublabel: "(loc)" },
    3: { roman: "♭iii", quality: "min", semitones: 3, sublabel: "(loc)" },
    4: { roman: "iv", quality: "min", semitones: 5, sublabel: "(loc)" },
    5: { roman: "♭V", quality: "maj", semitones: 6, sublabel: "(loc)" },
    6: { roman: "♭VI", quality: "maj", semitones: 8, sublabel: "(loc)" },
    7: { roman: "♭vii", quality: "min", semitones: 10, sublabel: "(loc)" },
  },
};

/**
 * Grado relativo (sd) → MIDI absoluto + metadata.
 */
export function resolvePitch(
  sd: string,
  octOffset: number = 0,
  key: KeySignature | string = { tonic: 'C', scale: 'major' },
  baseOctave = 4,
): { midi: number; pitch: string; color: string; isAltered: boolean } {
  const keyObj = normalizeKey(key);
  const tonic = keyObj.tonic || 'C';
  const scale = keyObj.scale || 'major';

  let tonicMidi: number;
  try {
    tonicMidi = Tone.Frequency(`${tonic}${baseOctave}`).toMidi();
  } catch {
    const tonicPc = NOTE_TO_PC[tonic] ?? 0;
    tonicMidi = (baseOctave + 1) * 12 + tonicPc;
  }

  const intervals = SCALE_MODE_OFFSETS[scale] || SCALE_MODE_OFFSETS.major;
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

  let semitones = intervals[degreeIndex] + (extraOctaves * 12);
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
// 2. Constructor del Modelo Intermedio Común (IR Pipeline)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Función pura que construye el Modelo Intermedio de Acorde (IntermediateChordModel)
 * a partir de cualquier payload crudo o tipo UniversalChord.
 */
export function buildIntermediateChord(
  raw: any,
  key: KeySignature | string,
  baseOctave = 3,
): IntermediateChordModel {
  // ── 1. Evaluación absoluta y segura de alteraciones en cabecera (previene TDZ) ──
  const rawAlterations: string[] = Array.isArray(raw.alterations)
    ? raw.alterations.map(String).filter(Boolean)
    : typeof raw.alterations === "string" && raw.alterations.trim().length > 0
      ? [raw.alterations.trim()]
      : [];
  const rawAdds: (number | string)[] = Array.isArray(raw.adds)
    ? raw.adds
    : (raw.adds !== undefined && raw.adds !== null ? [raw.adds] : []);
  const rawOmits: (number | string)[] = Array.isArray(raw.omits)
    ? raw.omits
    : (raw.omits !== undefined && raw.omits !== null ? [raw.omits] : (raw.options?.omits || []));
  const rawSuspensions: (number | string)[] = Array.isArray(raw.suspensions)
    ? raw.suspensions
    : typeof raw.suspensions === "string" || typeof raw.suspensions === "number"
      ? [raw.suspensions]
      : Array.isArray(raw.options?.suspensions)
        ? raw.options.suspensions
        : [];
  const rawSubstitutions: string[] = Array.isArray(raw.substitutions)
    ? raw.substitutions.map(String)
    : typeof raw.substitutions === "string"
      ? [raw.substitutions]
      : Array.isArray(raw.options?.substitutions)
        ? raw.options.substitutions.map(String)
        : raw.substitution
          ? [String(raw.substitution)]
          : [];

  const hasSharp5 = rawAlterations.some((a: any) => a === "#5" || a === "+5" || a === 5 || a === "sharp5") ||
    Boolean(raw.options?.sharp5) ||
    Boolean(raw.roman && (String(raw.roman).includes("⁺⁽♯⁵⁾") || String(raw.roman).includes("⁺⁷") || String(raw.roman).includes("+#5") || String(raw.roman).includes("+5"))) ||
    Boolean(raw.symbol && (String(raw.symbol).includes("⁺⁽♯⁵⁾") || String(raw.symbol).includes("+#5") || String(raw.symbol).includes("+(#5)") || String(raw.symbol).includes("+5")));
  const hasFlat5 = rawAlterations.some((a: any) => a === "b5" || a === "-5" || a === "♭5" || a === "flat5") ||
    Boolean(raw.options?.b5);
  const hasFlat9 = rawAlterations.some((a: any) => a === "b9" || a === "-9" || a === "♭9" || a === "flat9") ||
    rawAdds.some((a: any) => a === "b9" || a === "-9" || a === "♭9") ||
    Boolean(raw.options?.flat9) ||
    Boolean(raw.options?.b9) ||
    Boolean(raw.roman && (String(raw.roman).includes("♭9") || String(raw.roman).includes("b9") || String(raw.roman).includes("⁽♭⁹⁾")));
  const hasSharp9 = rawAlterations.some((a: any) => a === "#9" || a === "+9" || a === "♯9" || a === "sharp9") ||
    rawAdds.some((a: any) => a === "#9" || a === "+9" || a === "♯9") ||
    Boolean(raw.options?.sharp9) ||
    Boolean(raw.roman && (String(raw.roman).includes("#9") || String(raw.roman).includes("♯⁹"))) ||
    Boolean(raw.symbol && (String(raw.symbol).includes("#9") || String(raw.symbol).includes("♯⁹")));

  const hasAdd4 = rawAdds.some(a => a === 4 || a === "4" || a === "add4") ||
    Boolean(raw.options?.add4) ||
    Boolean(raw.roman?.includes("add4") || raw.symbol?.includes("add4"));
  const hasAdd6 = rawAdds.some(a => a === 6 || a === "6" || a === "add6") ||
    raw.type === 6 || raw.type === "6" ||
    Boolean(raw.options?.six) ||
    Boolean(raw.options?.add6) ||
    Boolean(raw.roman?.includes("add6") || raw.symbol?.includes("add6"));
  const hasAdd9 = rawAdds.includes(9) || rawAdds.includes("9") ||
    Boolean(raw.options?.add9) ||
    Boolean(raw.roman?.includes("add9") || raw.symbol?.includes("add9"));
  const hasAdd11 = rawAdds.includes(11) || rawAdds.includes("11") ||
    raw.type === 11 || raw.type === "11" ||
    Boolean(raw.options?.add11) ||
    Boolean(raw.roman?.includes("11") || raw.roman?.includes("¹¹") || (raw.symbol && String(raw.symbol).includes("11")));
  const hasAdd13 = rawAdds.includes(13) || rawAdds.includes("13") ||
    raw.type === 13 || raw.type === "13" ||
    Boolean(raw.options?.thirteen) ||
    Boolean(raw.roman?.includes("13") || raw.roman?.includes("¹³") || (raw.symbol && String(raw.symbol).includes("13")));

  const hasSharp11 = rawAlterations.some((a: any) => a === "#11" || a === "+11" || a === "♯11") ||
    rawAdds.some((a: any) => a === "#11" || a === "+11" || a === "♯11") ||
    Boolean(raw.options?.sharp11) ||
    Boolean(raw.roman?.includes("#11") || raw.roman?.includes("♯¹¹") || (raw.symbol && String(raw.symbol).includes("#11")));
  const hasFlat11 = rawAlterations.some((a: any) => a === "b11" || a === "-11" || a === "♭11") ||
    rawAdds.some((a: any) => a === "b11" || a === "-11" || a === "♭11") ||
    Boolean(raw.options?.flat11) ||
    Boolean(raw.roman?.includes("b11") || raw.roman?.includes("♭¹¹") || (raw.symbol && String(raw.symbol).includes("b11")));

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

  const hasNo3 = rawOmits.some((o: any) => o === 3 || o === "3" || o === "no3" || o === "omit3") || Boolean(raw.options?.no3);
  const hasNo5 = rawOmits.some((o: any) => o === 5 || o === "5" || o === "no5" || o === "omit5") || Boolean(raw.options?.no5);
  const hasNo9 = rawOmits.some((o: any) => o === 9 || o === "9" || o === "no9" || o === "omit9") || Boolean(raw.options?.no9);
  const hasNo11 = rawOmits.some((o: any) => o === 11 || o === "11" || o === "no11" || o === "omit11") || Boolean(raw.options?.no11);

  const isTritoneSub = rawSubstitutions.includes("tri") ||
    rawSubstitutions.includes("tritone") ||
    Boolean(raw.options?.tri) ||
    Boolean(raw.sublabel === "(Δ-sub)" || raw.sublabel === "Δ-sub") ||
    Boolean(raw.roman && (String(raw.roman).includes("subV") || String(raw.roman).includes("Δ-sub"))) ||
    Boolean(raw.symbol && String(raw.symbol).includes("Δ-sub"));

  // ── 2. Contexto tonal ──
  const { tonic, scale: scaleContext } = normalizeKey(key);
  const tonicSemitones = NOTE_TO_PC[tonic] ?? 0;
  const modeOffsets = SCALE_MODE_OFFSETS[scaleContext] || SCALE_MODE_OFFSETS.major;

  const rootSd = String(raw.rootSd ?? raw.sd ?? raw.root ?? 1);
  const rootNum = parseInt(rootSd.replace(/\D/g, ''), 10) || 1;
  const degreeIndex = rootNum;

  let borrowedMode: string | null = null;
  const rawBorrowed = raw.borrowed ?? raw.options?.borrowed;
  if (Array.isArray(rawBorrowed)) {
    borrowedMode = "custom";
  } else if (typeof rawBorrowed === "string" && rawBorrowed.trim().length > 0) {
    const bLower = rawBorrowed.toLowerCase().trim();
    if (bLower.includes("phryg")) borrowedMode = "phrygian";
    else if (bLower.includes("dor")) borrowedMode = "dorian";
    else if (bLower.includes("aeol") || bLower.includes("minor") || bLower === "m" || bLower === "min") borrowedMode = "minor";
    else if (bLower.includes("mixo")) borrowedMode = "mixolydian";
    else if (bLower.includes("lyd")) borrowedMode = "lydian";
    else if (bLower.includes("loc")) borrowedMode = "locrian";
    else if (bLower.includes("maj") || bLower.includes("ion")) borrowedMode = "major";
    else borrowedMode = bLower;
  } else if (raw.sublabel && String(raw.sublabel).includes("bor")) {
    borrowedMode = "custom";
  }

  // ── 3. Raíz y Función Secundaria ──
  let applied: AppliedFunction | null = null;
  let rootSemitones = 0;

  if (Array.isArray(rawBorrowed) && rawBorrowed.length >= 7) {
    const degIdx = (rootNum - 1 + 7) % 7;
    const rawOffset = Number(rawBorrowed[degIdx]);
    rootSemitones = normalizeSemitone(tonicSemitones + normalizeSemitone(rawOffset));
  } else if (isTritoneSub) {
    let targetDegree = raw.appliedTarget ? Number(raw.appliedTarget) : 1;
    const roman = String(raw.roman || '');
    if (roman.includes('/')) {
      const targetStr = roman.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const ROMAN_TARGET_MAP: Record<string, number> = {
        i: 1, '1': 1, ii: 2, '2': 2, iii: 3, '3': 3, iv: 4, '4': 4, v: 5, '5': 5, vi: 6, '6': 6, vii: 7, '7': 7
      };
      if (ROMAN_TARGET_MAP[targetStr]) targetDegree = ROMAN_TARGET_MAP[targetStr];
    } else if (raw.applied && String(raw.applied) !== '0') {
      const appNum = Number(raw.applied);
      targetDegree = (appNum === 5 && rootNum !== 5) ? rootNum : appNum;
    } else if (rootSd && rootSd !== "b2" && rootSd !== "#1") {
      targetDegree = rootNum;
    }
    const targetOffset = (modeOffsets && modeOffsets[(targetDegree - 1) % 7] !== undefined)
      ? modeOffsets[(targetDegree - 1) % 7]
      : (DIATONIC_SCALE_SEMITONES[targetDegree] ?? 0);
    const targetSemitones = normalizeSemitone(tonicSemitones + targetOffset);
    rootSemitones = normalizeSemitone(targetSemitones + 1);
    applied = {
      appliedDegree: 5,
      appliedFunctionDegree: 5,
      targetDegree,
      targetRootSemitones: targetSemitones,
      targetSemitones,
      appliedRootSemitones: rootSemitones,
      isTritoneSub: true,
    };
  } else if (
    raw.appliedTarget ||
    (raw.applied && String(raw.applied) !== '0') ||
    raw.secondaryType ||
    raw.appliedFunctionDegree ||
    raw.targetDegree ||
    (raw.roman && String(raw.roman).includes('/'))
  ) {
    let targetDegree = 1;
    let appliedFunctionDegree = 5;

    const roman = String(raw.roman || '');
    const secPrefix = roman.includes('/') ? roman.split('/')[0] : '';
    const ROMAN_TARGET_MAP: Record<string, number> = {
      i: 1, '1': 1, ii: 2, '2': 2, iii: 3, '3': 3, iv: 4, '4': 4, v: 5, '5': 5, vi: 6, '6': 6, vii: 7, '7': 7
    };

    // 1. Determinar targetDegree
    if (raw.targetDegree !== undefined && Number(raw.targetDegree) > 0) {
      targetDegree = Number(raw.targetDegree);
    } else if (roman.includes('/')) {
      const targetStr = roman.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ROMAN_TARGET_MAP[targetStr]) {
        targetDegree = ROMAN_TARGET_MAP[targetStr];
      } else if (raw.appliedTarget) {
        targetDegree = Number(raw.appliedTarget);
      } else if (rootNum > 0) {
        targetDegree = rootNum;
      }
    } else if (raw.appliedTarget !== undefined && Number(raw.appliedTarget) > 0) {
      targetDegree = Number(raw.appliedTarget);
    } else if (raw.applied && String(raw.applied) !== '0') {
      const appNum = Number(raw.applied);
      // En Hooktheory JSON, raw.root es el grado destino cuando raw.applied es la función
      if (appNum === 7 || appNum === 5 || appNum === 4 || appNum === 2) {
        targetDegree = rootNum > 0 ? rootNum : 1;
      } else {
        targetDegree = appNum;
      }
    } else if (rootNum > 0) {
      targetDegree = rootNum;
    }

    // 2. Determinar appliedFunctionDegree
    if (raw.appliedFunctionDegree !== undefined && Number(raw.appliedFunctionDegree) > 0) {
      appliedFunctionDegree = Number(raw.appliedFunctionDegree);
    } else if (roman.includes('/')) {
      if (secPrefix.startsWith("vii°") || secPrefix.startsWith("viiø") || secPrefix.startsWith("vii")) {
        appliedFunctionDegree = 7;
      } else if (secPrefix.startsWith("IV") || secPrefix.startsWith("iv")) {
        appliedFunctionDegree = 4;
      } else if (secPrefix.startsWith("ii") || secPrefix.startsWith("II")) {
        appliedFunctionDegree = 2;
      } else {
        appliedFunctionDegree = 5;
      }
    } else if (raw.secondaryType) {
      if (raw.secondaryType === "vii°") appliedFunctionDegree = 7;
      else if (raw.secondaryType === "IV") appliedFunctionDegree = 4;
      else if (raw.secondaryType === "ii") appliedFunctionDegree = 2;
      else appliedFunctionDegree = 5;
    } else if (raw.applied && String(raw.applied) !== '0') {
      const appNum = Number(raw.applied);
      if (appNum === 7 || appNum === 5 || appNum === 4 || appNum === 2) {
        appliedFunctionDegree = appNum;
      } else {
        appliedFunctionDegree = 5;
      }
    }

    const isVii = appliedFunctionDegree === 7;
    const isIV = appliedFunctionDegree === 4;
    const isIi = appliedFunctionDegree === 2;

    const targetOffset = (modeOffsets && modeOffsets[(targetDegree - 1) % 7] !== undefined)
      ? modeOffsets[(targetDegree - 1) % 7]
      : (DIATONIC_SCALE_SEMITONES[targetDegree] ?? 0);
    const targetSemitones = normalizeSemitone(tonicSemitones + targetOffset);

    let appliedRootSemitones: number;
    if (isVii) {
      appliedRootSemitones = normalizeSemitone(targetSemitones - 1);
    } else if (isIV) {
      appliedRootSemitones = normalizeSemitone(targetSemitones + 5);
    } else if (isIi) {
      appliedRootSemitones = normalizeSemitone(targetSemitones + 2);
    } else {
      appliedRootSemitones = normalizeSemitone(targetSemitones + 7);
    }

    rootSemitones = appliedRootSemitones;

    applied = {
      appliedDegree: appliedFunctionDegree,
      appliedFunctionDegree,
      targetDegree,
      targetRootSemitones: targetSemitones,
      targetSemitones,
      appliedRootSemitones,
      isTritoneSub: false,
    };
  } else if (typeof raw._rootSemitones === 'number') {
    rootSemitones = normalizeSemitone(raw._rootSemitones);
  } else if (
    rootSd === "#1" || rootSd === "1#" || String(raw.roman).startsWith("♯i") || String(raw.roman).startsWith("#i") ||
    (rootNum === 1 && (raw.alteration === 1 || raw.alteration === "#" || raw.accidental === 1 || raw.accidental === "#" || (raw.quality && (raw.quality === "dim" || raw.quality === "dim7") && (borrowedMode || raw.isAltered))))
  ) {
    rootSemitones = normalizeSemitone(tonicSemitones + 1);
  } else if (
    rootSd === "#2" || rootSd === "2#" || String(raw.roman).startsWith("♯ii") || String(raw.roman).startsWith("#ii") ||
    (rootNum === 2 && (raw.alteration === 1 || raw.alteration === "#" || raw.accidental === 1 || raw.accidental === "#" || (raw.quality && (raw.quality === "dim" || raw.quality === "dim7") && (borrowedMode || String(raw.sublabel).includes("bor")))))
  ) {
    rootSemitones = normalizeSemitone(tonicSemitones + 3);
  } else if (
    (rootNum === 7 || rootSd === "7" || rootSd === "#7") &&
    (String(raw.roman).startsWith("VII") && !String(raw.roman).startsWith("VII°") && !String(raw.roman).startsWith("vii")) &&
    (borrowedMode || String(raw.roman).includes("(bor)"))
  ) {
    rootSemitones = normalizeSemitone(tonicSemitones + 11);
  } else if (
    rootSd === "#4" || rootSd === "4#" || String(raw.roman).startsWith("♯IV") || String(raw.roman).startsWith("#IV")
  ) {
    rootSemitones = normalizeSemitone(tonicSemitones + 6);
  } else if (borrowedMode && MODAL_MAP[borrowedMode]?.[rootNum]) {
    rootSemitones = normalizeSemitone(tonicSemitones + MODAL_MAP[borrowedMode][rootNum].semitones);
  } else {
    let accidental = 0;
    if (rootSd.startsWith('b') || rootSd.startsWith('♭') || String(raw.roman).includes("♭") || String(raw.roman).includes("b")) {
      if (rootSd.startsWith('b') || rootSd.startsWith('♭')) accidental = -1;
    } else if (rootSd.startsWith('#') || rootSd.startsWith('♯')) {
      accidental = 1;
    }
    const degOffset = modeOffsets[(rootNum - 1) % 7] ?? 0;
    if (accidental === -1 && degOffset < (SCALE_MODE_OFFSETS.major[(rootNum - 1) % 7] ?? 0)) {
      accidental = 0;
    }
    rootSemitones = normalizeSemitone(tonicSemitones + degOffset + accidental);
  }

  // ── 4. Nombres de notas según armadura y contexto modal ──
  const hasFlatDegree = rootSd.startsWith('b') || rootSd.startsWith('♭') || /^[b♭][IivV]/.test(String(raw.roman || ''));

  const isExplicitFlat = isTritoneSub ||
    Boolean(applied?.isTritoneSub) ||
    hasFlatDegree ||
    (borrowedMode === 'phrygian' && rootNum === 2) ||
    (borrowedMode === 'locrian' && (rootNum === 2 || rootNum === 5));

  const isSharpSecondary = !isExplicitFlat && (
    Boolean(applied && applied.appliedDegree === 7) ||
    rootSd.startsWith("#") ||
    rootSd.startsWith("♯") ||
    String(raw.roman || '').startsWith("♯") ||
    String(raw.roman || '').startsWith("#") ||
    (borrowedMode === 'lydian' && rootNum === 4)
  );

  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const tonicUpper = tonic ? (tonic[0].toUpperCase() + tonic.slice(1)) : 'C';
  const isMinorFlatKey = scaleContext === 'minor' && ['D', 'G', 'C', 'F', 'BB', 'EB', 'AB', 'DB'].includes(tonicUpper.toUpperCase());
  const useFlats = isExplicitFlat || (!isSharpSecondary && (
    FLAT_KEYS.has(tonic) ||
    isMinorFlatKey ||
    borrowedMode === 'minor' || borrowedMode === 'phrygian' || borrowedMode === 'aeolian' ||
    borrowedMode === 'mixolydian' || borrowedMode === 'dorian' || borrowedMode === 'locrian' ||
    (raw.quality === "min" && rootSemitones === 7) ||
    (raw.quality === "dom7" && rootSemitones === 0)
  ));

  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const rootName = PC_NAMES[rootSemitones];

  // ── 5. Resolución de la cualidad del acorde (chordQuality) ──
  const rawType = Number(raw.type ?? (
    String(raw.roman || '').includes('7') ||
    String(raw.roman || '').includes('⁷') ||
    (typeof raw.quality === 'string' && (raw.quality.includes('7') || raw.quality === 'halfdim7'))
      ? 7
      : 5
  ));
  const is7th = rawType >= 7 || (typeof raw.quality === 'string' && (raw.quality.includes('7') || raw.quality === 'halfdim7'));

  let chordQuality: "maj" | "min" | "dim" | "aug" | "dom7" | "maj7" | "min7" | "halfdim7" | "dim7" | "custom" = "maj";

  if (hasSharp5 || raw.quality === "aug" || String(raw.roman || '').includes("⁺") || String(raw.roman || '').includes("+")) {
    if (is7th) {
      if (raw.quality === "maj7" || String(raw.roman || '').includes("^Δ") || String(raw.roman || '').includes("Δ") || String(raw.symbol || '').includes("maj7")) {
        chordQuality = "maj7";
      } else {
        chordQuality = "dom7";
      }
    } else {
      chordQuality = "aug";
    }
  } else if (
    raw.quality === "dim" || raw.quality === "dim7" || raw.quality === "halfdim7" ||
    String(raw.roman || '').includes("°") || String(raw.roman || '').includes("ø") ||
    String(raw.symbol || '').includes("°") || String(raw.symbol || '').includes("ø") ||
    (applied && applied.appliedDegree === 7) ||
    (rootNum === 1 && String(raw.roman || '').startsWith("♯i°")) ||
    (rootNum === 7 && scaleContext === "major" && !applied && !borrowedMode)
  ) {
    if (is7th) {
      if (raw.quality === "dim7" || String(raw.roman || '').includes("°⁷") || String(raw.symbol || '').includes("°7")) {
        chordQuality = "dim7";
      } else if (raw.quality === "halfdim7" || String(raw.roman || '').includes("ø") || String(raw.symbol || '').includes("m7(b5)")) {
        chordQuality = "halfdim7";
      } else if (applied && applied.appliedDegree === 7) {
        chordQuality = raw.quality === "halfdim7" ? "halfdim7" : "dim7";
      } else if (rootNum === 7 && scaleContext === "major") {
        chordQuality = "halfdim7";
      } else {
        chordQuality = "dim7";
      }
    } else {
      chordQuality = "dim";
    }
  } else if (applied) {
    if (applied.isTritoneSub || applied.appliedDegree === 5) {
      chordQuality = is7th ? "dom7" : "maj";
    } else if (applied.appliedDegree === 4) {
      chordQuality = is7th ? (raw.quality === "dom7" || String(raw.roman || '').includes("IV7") ? "dom7" : "maj7") : "maj";
    } else if (applied.appliedDegree === 2) {
      chordQuality = is7th ? "min7" : "min";
    } else {
      chordQuality = is7th ? "dom7" : "maj";
    }
  } else if (hasFlat9 || hasSharp9) {
    chordQuality = "dom7";
  } else if (raw.quality === "maj" || raw.quality === "min" || raw.quality === "dom7" || raw.quality === "maj7" || raw.quality === "min7") {
    chordQuality = raw.quality;
  } else {
    // Modo determinante: modo prestado si existe, o tonalidad activa
    const activeMode = borrowedMode || scaleContext || "major";
    if (is7th) {
      if (!borrowedMode && hasFlatDegree && (rootNum === 6 || rootNum === 3 || rootNum === 2)) {
        chordQuality = "maj7";
      } else if (!borrowedMode && hasFlatDegree && rootNum === 7) {
        chordQuality = "dom7";
      } else {
        const mode7th = DIATONIC_7TH_QUALITIES_BY_MODE[activeMode]?.[rootNum];
        if (mode7th) {
          chordQuality = mode7th;
        } else if (String(raw.roman || '').includes("^Δ") || String(raw.symbol || '').includes("maj7")) {
          chordQuality = "maj7";
        } else {
          chordQuality = (rootNum === 5 || activeMode === "mixolydian") ? "dom7" : "maj7";
        }
      }
    } else {
      let modeTriad = DIATONIC_DEGREES_BY_SCALE[activeMode]?.[rootNum]?.quality ||
        MODAL_MAP[activeMode]?.[rootNum]?.quality ||
        "maj";
      if (!borrowedMode && hasFlatDegree && (rootNum === 6 || rootNum === 3 || rootNum === 7 || rootNum === 2)) {
        modeTriad = "maj";
      }
      chordQuality = modeTriad;
    }
  }

  // ── 5b. Detección y validación de mezcla modal (REQ-5.3) ──
  const modalMixture = detectModalMixture(
    rawBorrowed,
    tonic,
    scaleContext,
    rootSemitones,
    chordQuality,
    degreeIndex
  );

  if (!borrowedMode && modalMixture.isBorrowed && !applied) {
    borrowedMode = modalMixture.borrowedMode;
  }

  // ── 6. Colección de voces funcionales (ChordTone[]) ──
  const tones: ChordTone[] = [];

  // Fundamental (grado 1)
  tones.push({
    interval: 0,
    degree: 1,
    alteration: 0,
    source: 'root',
  });

  // 3ª o suspensiones (grado 3 / 2 / 4)
  if (!hasNo3) {
    if (isSus2Sus4) {
      tones.push({ interval: 2, degree: 2, alteration: 0, source: 'suspension' });
      tones.push({ interval: 5, degree: 4, alteration: 0, source: 'suspension' });
    } else if (hasSus2) {
      tones.push({ interval: 2, degree: 2, alteration: 0, source: 'suspension' });
    } else if (hasSus4) {
      tones.push({ interval: 5, degree: 4, alteration: 0, source: 'suspension' });
    } else {
      const isMin3 = chordQuality === "min" || chordQuality === "min7" || chordQuality === "dim" || chordQuality === "dim7" || chordQuality === "halfdim7";
      tones.push({
        interval: isMin3 ? 3 : 4,
        degree: 3,
        alteration: 0,
        source: 'structural',
      });
    }
  }

  // 5ª (grado 5)
  if (!hasNo5) {
    if (hasSharp5) {
      tones.push({ interval: 8, degree: 5, alteration: 1, source: 'alteration' });
    } else if (hasFlat5 || chordQuality === "dim" || chordQuality === "dim7" || chordQuality === "halfdim7") {
      tones.push({
        interval: 6,
        degree: 5,
        alteration: -1,
        source: (chordQuality === "dim" || chordQuality === "dim7" || chordQuality === "halfdim7") ? 'structural' : 'alteration',
      });
    } else {
      tones.push({ interval: 7, degree: 5, alteration: 0, source: 'structural' });
    }
  }

  // 6ª (grado 6, type 6 / adds 6)
  const is6th = (raw.type as any) === 6 || hasAdd6;
  if (is6th) {
    tones.push({ interval: 9, degree: 6, alteration: 0, source: (raw.type === 6 || raw.type === "6") ? 'extension' : 'add' });
  }

  // 7ª (grado 7)
  if (is7th && !is6th) {
    let seventhInterval = 10;
    if (chordQuality === "maj7") {
      seventhInterval = 11;
    } else if (chordQuality === "dim7") {
      seventhInterval = 9;
    }
    tones.push({
      interval: seventhInterval,
      degree: 7,
      alteration: chordQuality === "maj7" ? 0 : (chordQuality === "dim7" ? -1 : 0),
      source: 'structural',
    });
  }

  // 9ª y alteraciones (grado 9) - Conserva intervalos reales sin comprimir
  if (!hasNo9) {
    if (hasFlat9) {
      tones.push({ interval: 13, degree: 9, alteration: -1, source: 'alteration' });
    } else if (hasSharp9) {
      tones.push({ interval: 15, degree: 9, alteration: 1, source: 'alteration' });
    } else if (rawType >= 9 || hasAdd9) {
      tones.push({ interval: 14, degree: 9, alteration: 0, source: rawType >= 9 ? 'extension' : 'add' });
    }
  }

  // 11ª y notas añadidas (grado 11 / add4)
  if (!hasNo11) {
    if (hasSharp11) {
      tones.push({ interval: 18, degree: 11, alteration: 1, source: 'alteration' });
    } else if (hasFlat11) {
      tones.push({ interval: 16, degree: 11, alteration: -1, source: 'alteration' });
    } else if (rawType >= 11 || hasAdd11) {
      tones.push({ interval: 17, degree: 11, alteration: 0, source: rawType >= 11 ? 'extension' : 'add' });
    } else if (hasAdd4 && !hasSus4 && !isSus2Sus4) {
      tones.push({ interval: 5, degree: 4, alteration: 0, source: 'add' });
    }
  }

  // 13ª (grado 13)
  if (rawType >= 13 || hasAdd13) {
    tones.push({ interval: 21, degree: 13, alteration: 0, source: rawType >= 13 ? 'extension' : 'add' });
  }

  const is13thChord = tones.some(t => t.degree === 13 && t.source === 'extension');
  const is11thChord = tones.some(t => t.degree === 11 && t.source === 'extension');
  const is9thChord = tones.some(t => t.degree === 9 && t.source === 'extension');
  const is7thChord = tones.some(t => t.degree === 7);
  const resolvedType: 5 | 7 | 9 | 11 | 13 = is13thChord ? 13 : is11thChord ? 11 : is9thChord ? 9 : is7thChord ? 7 : 5;

  // ── 7. effectivePitches: Clases de altura normalizadas [0..11] para Canvas ──
  const effectivePitches = Array.from(
    new Set(tones.map(t => normalizeSemitone(rootSemitones + t.interval)))
  ).sort((a, b) => a - b);

  // ── 8. Bajo e Inversión ──
  const requestedInversion = Number(raw.inversion ?? 0);
  let validatedInversion = requestedInversion;
  let isAmbiguousInversion = false;
  let bassTone: ChordTone;

  if (requestedInversion === 1) {
    const thirdVoice = tones.find(t => t.degree === 3 || (isSus2Sus4 ? t.degree === 2 : false) || t.degree === 2 || t.degree === 4);
    if (!thirdVoice || hasNo3) {
      isAmbiguousInversion = true;
      validatedInversion = 0;
      bassTone = tones.find(t => t.degree === 1) || tones[0];
    } else {
      bassTone = thirdVoice;
    }
  } else if (requestedInversion === 2) {
    const fifthVoice = tones.find(t => t.degree === 5);
    if (!fifthVoice || hasNo5) {
      isAmbiguousInversion = true;
      validatedInversion = 0;
      bassTone = tones.find(t => t.degree === 1) || tones[0];
    } else {
      bassTone = fifthVoice;
    }
  } else if (requestedInversion === 3) {
    const seventhVoice = tones.find(t => t.degree === 7);
    if (!seventhVoice) {
      isAmbiguousInversion = true;
      validatedInversion = 0;
      bassTone = tones.find(t => t.degree === 1) || tones[0];
    } else {
      bassTone = seventhVoice;
    }
  } else {
    bassTone = tones.find(t => t.degree === 1) || tones[0];
    validatedInversion = 0;
  }

  const bassPc = normalizeSemitone(rootSemitones + bassTone.interval);
  const bassName = PC_NAMES[bassPc];
  const bassIntervalFromRoot = normalizeSemitone(bassPc - rootSemitones);

  // Determinar el grado relativo del bajo respecto a la tónica y modo activo (REQ-2.3, REQ-4.1)
  let bassDegreeIndex = 1;
  let bassScaleDegree = "1";
  let bassAlteration = 0;

  let foundExact = false;
  for (let d = 1; d <= 7; d++) {
    const diatonicPc = normalizeSemitone(tonicSemitones + modeOffsets[d - 1]);
    if (diatonicPc === bassPc) {
      bassDegreeIndex = d;
      bassScaleDegree = String(d);
      bassAlteration = 0;
      foundExact = true;
      break;
    }
  }

  if (!foundExact) {
    const semiFromTonic = normalizeSemitone(bassPc - tonicSemitones);
    if (semiFromTonic === 10) {
      bassDegreeIndex = 7;
      bassScaleDegree = "b7";
      bassAlteration = -1;
    } else if (semiFromTonic === 8) {
      bassDegreeIndex = 6;
      bassScaleDegree = "b6";
      bassAlteration = -1;
    } else if (semiFromTonic === 3) {
      bassDegreeIndex = 3;
      bassScaleDegree = "b3";
      bassAlteration = -1;
    } else if (semiFromTonic === 1) {
      if (isSharpSecondary || bassName.includes("#")) {
        bassDegreeIndex = 1;
        bassScaleDegree = "#1";
        bassAlteration = 1;
      } else {
        bassDegreeIndex = 2;
        bassScaleDegree = "b2";
        bassAlteration = -1;
      }
    } else if (semiFromTonic === 6) {
      if (useFlats && (bassName.includes("b") || bassName.includes("♭"))) {
        bassDegreeIndex = 5;
        bassScaleDegree = "b5";
        bassAlteration = -1;
      } else {
        bassDegreeIndex = 4;
        bassScaleDegree = "#4";
        bassAlteration = 1;
      }
    } else {
      // Fallback por proximidad diatónica (priorizando bemol sobre sostenido)
      for (let d = 1; d <= 7; d++) {
        const diatonicPc = normalizeSemitone(tonicSemitones + modeOffsets[d - 1]);
        const diff = normalizeSemitone(bassPc - diatonicPc);
        if (diff === 11) {
          bassDegreeIndex = d;
          bassScaleDegree = `b${d}`;
          bassAlteration = -1;
          break;
        } else if (diff === 1) {
          bassDegreeIndex = d;
          bassScaleDegree = `#${d}`;
          bassAlteration = 1;
          break;
        }
      }
    }
  }

  const { color: bassColor } = getDegreeColor(bassScaleDegree);

  // ── 9. audioVoicingMidi: Notas MIDI exactas para WebAudio ──
  let tonicMidi: number;
  try {
    tonicMidi = Tone.Frequency(`${tonic}${baseOctave}`).toMidi();
  } catch {
    tonicMidi = (baseOctave + 1) * 12 + tonicSemitones;
  }
  const rootMidi = tonicMidi + rootSemitones;
  let bassMidi = (baseOctave * 12) + bassPc;

  const isAlteredDominant = (hasFlat9 || hasSharp9) && tones.some(t => t.degree === 7);

  // Para dominantes alterados 7(b9) y 7(#9), política a 4 voces:
  // Bajo: Fundamental en tesitura grave.
  // Voces superiores: 3ª, 7ª y 9ª alterada (omitiendo la 5ª y sin duplicar fundamental en agudos).
  const tonesForUpperVoicing = isAlteredDominant
    ? tones.filter(t => t.degree === 3 || t.degree === 7 || t.degree === 9)
    : tones;

  const upperMidis = tonesForUpperVoicing.map(t => {
    let m = rootMidi + (t.interval % 12);
    if (m < rootMidi) m += 12;
    if (t.interval >= 12) m += 12;
    return m;
  });

  while (upperMidis.includes(bassMidi) || (upperMidis.length > 0 && bassMidi >= upperMidis[0])) {
    bassMidi -= 12;
  }

  const audioVoicingMidi = (requestedInversion > 0 || isAlteredDominant)
    ? Array.from(new Set([bassMidi, ...upperMidis])).sort((a, b) => a - b)
    : Array.from(new Set(upperMidis)).sort((a, b) => a - b);

  const bassSemitones = bassPc;
  const resolvedInversion = validatedInversion;
  const addedIntervals = tones
    .filter(t => t.source === 'add' || t.source === 'extension')
    .map(t => t.interval);

  const model: IntermediateChordModel = {
    tonicSemitones,
    scaleContext,
    degreeIndex,
    rootSemitones,
    bassSemitones,
    rootName,
    applied,
    appliedFunctionDegree: applied?.appliedFunctionDegree,
    targetDegree: applied?.targetDegree,
    targetRootSemitones: applied?.targetRootSemitones,
    appliedRootSemitones: applied?.appliedRootSemitones,
    tones,
    effectivePitches,
    audioVoicingMidi,
    addedIntervals,
    requestedInversion,
    validatedInversion,
    resolvedInversion,
    bassTone,
    bassName,
    isAmbiguousInversion,
    bassDegreeIndex,
    bassScaleDegree,
    bassAlteration,
    bassIntervalFromRoot,
    bassColor,
    chordQuality,
    type: resolvedType,
    borrowedMode,
    modalMixture,
    useFlats,
    omits: rawOmits.map(Number).filter(n => !isNaN(n)),
    suspensions: rawSuspensions.map(Number).filter(n => !isNaN(n)),
    adds: rawAdds.map(Number).filter(n => !isNaN(n)),
    alterations: rawAlterations,
  };

  model.canonical = buildCanonicalChordIR(model, raw, key);
  return model;
}

/**
 * Construye la Representación Intermedia Canónica (CanonicalChordIR)
 * a partir de un IntermediateChordModel resuelto y su contexto.
 */
export function buildCanonicalChordIR(
  model: IntermediateChordModel,
  raw: any,
  key: KeySignature | string
): CanonicalChordIR {
  const { tonic, scale } = normalizeKey(key);
  const roman = renderRomanNumeral(model);
  const symbol = renderChordSymbol(model);
  const sublabel = renderSubLabels(model);
  const functionalLabels = model.audioVoicingMidi.map((m, idx) => {
    const pc = normalizeSemitone(m);
    const isBass = idx === 0;
    const { label, voiceNumber } = getChordVoiceFunctionalLabel(pc, model, isBass);
    return { midi: m, label, voiceNumber };
  });

  return {
    rawOriginal: Object.freeze({ ...raw }),
    context: {
      tonic,
      tonicPitchClass: model.tonicSemitones,
      scaleMode: scale as any,
      activeBeat: Number(raw?.beat || 1),
    },
    identity: {
      rootPitchClass: model.rootSemitones,
      rootName: model.rootName,
      degreeIndex: model.degreeIndex,
      degreeScaleDegree: String(raw?.rootSd ?? raw?.sd ?? model.degreeIndex),
      chordQuality: model.chordQuality,
      baseType: model.type,
    },
    secondary: {
      isApplied: Boolean(model.applied),
      appliedFunctionDegree: model.applied?.appliedFunctionDegree,
      targetDegree: model.applied?.targetDegree,
      targetPitchClass: model.applied?.targetRootSemitones,
      isTritoneSub: Boolean(model.applied?.isTritoneSub),
      borrowedMode: model.borrowedMode || undefined,
      borrowed: model.modalMixture ? {
        isBorrowed: model.modalMixture.isBorrowed,
        provenance: model.modalMixture.provenance,
        mode: model.modalMixture.borrowedMode,
        candidateModes: [...model.modalMixture.candidateModes],
        isAmbiguous: model.modalMixture.isAmbiguous,
        explanation: model.modalMixture.explanation,
      } : undefined,
    },
    tones: Object.freeze([...model.tones]),
    bassAndInversion: {
      requestedInversion: model.requestedInversion,
      validatedInversion: model.validatedInversion,
      bassPitchClass: model.bassSemitones,
      bassName: model.bassName,
      isAmbiguous: model.isAmbiguousInversion,
      bassDegreeIndex: model.bassDegreeIndex,
      bassScaleDegree: model.bassScaleDegree,
      bassAlteration: model.bassAlteration,
      bassIntervalFromRoot: model.bassIntervalFromRoot,
    },
    outputs: {
      effectivePitches: [...model.effectivePitches],
      audioVoicingMidi: [...model.audioVoicingMidi],
      romanNumeral: roman,
      chordSymbol: symbol,
      sublabel,
      bassColor: model.bassColor,
      functionalLabels,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Renderizadores Puros e Independientes
// ────────────────────────────────────────────────────────────────────────────

const ROMAN_TARGETS: Record<number, string> = {
  1: "I", 2: "ii", 3: "iii", 4: "IV", 5: "V", 6: "vi", 7: "vii°"
};

/**
 * Renderizador puro del cifrado romano y grados de Hookpad.
 */
export function renderRomanNumeral(model: IntermediateChordModel): string {
  const is13th = model.type === 13 || model.tones.some(t => t.degree === 13 && t.source === 'extension');
  const is11th = model.type === 11 || model.tones.some(t => t.degree === 11 && t.source === 'extension');
  const is9th = model.type === 9 || model.tones.some(t => t.degree === 9 && t.source === 'extension');
  const is7th = model.tones.some(t => t.degree === 7);
  const is6th = model.tones.some(t => t.degree === 6);
  const isMaj7 = model.chordQuality === "maj7";
  const inv = model.requestedInversion;

  let invFig = "";
  if (is13th && inv === 0) {
    invFig = isMaj7 ? "^Δ¹³" : "¹³";
  } else if (is11th && inv === 0) {
    invFig = isMaj7 ? "^Δ¹¹" : "¹¹";
  } else if (is9th && inv === 0) {
    invFig = isMaj7 ? "^Δ⁹" : "⁹";
  } else if (is7th) {
    if (isMaj7) {
      invFig = inv === 1 ? "^Δ⁶₅" : inv === 2 ? "^Δ⁴₃" : inv === 3 ? "^Δ⁴₂" : "^Δ⁷";
    } else {
      invFig = inv === 1 ? "⁶₅" : inv === 2 ? "⁴₃" : inv === 3 ? "⁴₂" : "⁷";
    }
  } else if (is6th) {
    invFig = inv === 1 ? "⁶₅" : "⁶";
  } else {
    invFig = inv === 1 ? "⁶" : inv === 2 ? "⁶₄" : "";
  }

  // 1. Sustitución tritonal (substitutions: ["tri"])
  if (model.applied?.isTritoneSub) {
    const target = ROMAN_TARGETS[model.applied.targetDegree] || "I";
    return `♭II${invFig}/${target} (Δ-sub)`;
  }

  // 2. Acorde secundario / aplicado
  if (model.applied) {
    const target = ROMAN_TARGETS[model.applied.targetDegree] || "I";
    let prefix = "V";
    if (model.applied.appliedDegree === 7) {
      prefix = model.chordQuality === "halfdim7" ? "viiø" : "vii°";
    } else if (model.applied.appliedDegree === 4) {
      prefix = "IV";
    } else if (model.applied.appliedDegree === 2) {
      prefix = "ii";
    }

    let alterationStr = "";
    if (model.alterations.some(a => a === "#5" || a === "+5" || a === "5")) {
      alterationStr = "⁺⁽♯⁵⁾";
    }
    if (model.tones.some(t => t.degree === 9 && t.alteration === -1)) {
      alterationStr += "⁽♭⁹⁾";
    }

    let susStr = "";
    if (model.suspensions.includes(2) && model.suspensions.includes(4)) {
      susStr = "sus2sus4";
    } else if (model.suspensions.includes(2)) {
      susStr = "sus2";
    } else if (model.suspensions.includes(4)) {
      susStr = "sus4";
    }

    return `${prefix}${alterationStr}${invFig}${susStr}/${target}`;
  }

  // 3. Grados cromáticos prestados específicos
  const semiFromTonic = normalizeSemitone(model.rootSemitones - model.tonicSemitones);
  if (semiFromTonic === 1 && (model.chordQuality === "dim" || model.chordQuality === "dim7")) {
    return `♯i°${invFig}(bor)`;
  }
  if (semiFromTonic === 3 && (model.chordQuality === "dim" || model.chordQuality === "dim7")) {
    const ext = (model.tones.some(t => t.degree === 11) && !invFig.includes("¹¹")) ? "¹¹" : "";
    return `♯ii°${ext}${invFig}(bor)`;
  }
  if (semiFromTonic === 6 && model.degreeIndex === 4) {
    return `♯IV${invFig} (bor)`;
  }
  if (semiFromTonic === 11 && model.degreeIndex === 7 && model.borrowedMode) {
    return `VII${invFig}(bor)`;
  }

  // 4. Préstamos modales
  if (model.borrowedMode && MODAL_MAP[model.borrowedMode]?.[model.degreeIndex]) {
    const baseRoman = MODAL_MAP[model.borrowedMode][model.degreeIndex].roman;
    let label = `(${model.borrowedMode.slice(0, 3)})`;
    if (model.borrowedMode === "minor" || model.borrowedMode === "m") label = "(min)";

    let augStr = "";
    if (model.alterations.some(a => a === "#5" || a === "+5" || a === "5")) {
      augStr = "⁺";
    }

    let omitStr = "";
    if (model.omits.includes(3) && model.omits.includes(5)) omitStr = "⁽ⁿᵒ³ⁿᵒ⁵⁾";
    else if (model.omits.includes(3)) omitStr = "⁽ⁿᵒ³⁾";
    else if (model.omits.includes(5)) omitStr = "⁽ⁿᵒ⁵⁾";

    const sharp5Label = augStr ? "⁽♯⁵⁾" : "";
    return `${baseRoman}${augStr}${invFig}${sharp5Label}${omitStr}${label}`;
  }

  // 5. Acordes diatónicos estándar
  const diatonicDef = DIATONIC_DEGREES_BY_SCALE[model.scaleContext]?.[model.degreeIndex];
  let baseRoman = diatonicDef?.roman || "I";

  let susStr = "";
  if (model.suspensions.includes(2) && model.suspensions.includes(4)) {
    susStr = "sus2sus4";
  } else if (model.suspensions.includes(2)) {
    susStr = "sus2";
  } else if (model.suspensions.includes(4)) {
    susStr = "sus4";
  }

  let altStr = "";
  if (model.alterations.some(a => a === "#5" || a === "+5" || a === "5")) {
    altStr += "⁺⁽♯⁵⁾";
  }
  if (model.tones.some(t => t.degree === 9 && t.alteration === -1)) {
    altStr += "⁽♭⁹⁾";
  }
  if (model.tones.some(t => t.degree === 9 && t.alteration === 1)) {
    altStr += "⁽♯⁹⁾";
  }

  let addStr = "";
  const hasAdd4 = model.tones.some(t => t.degree === 4 && t.source === 'add');
  const hasAdd9 = model.tones.some(t => t.degree === 9 && t.source === 'add');
  const hasAdd11Only = model.tones.some(t => t.degree === 11 && t.source === 'add') && !is11th;
  const hasAdd13Only = model.tones.some(t => t.degree === 13 && t.source === 'add') && !is13th;
  if (hasAdd4 && hasAdd9) {
    addStr = "⁽add4add9⁾";
  } else if (hasAdd9) {
    addStr = "⁽ᵃᵈᵈ⁹⁾";
  } else if (hasAdd4) {
    addStr = "⁽ᵃᵈᵈ⁴⁾";
  } else if (hasAdd11Only) {
    addStr = "⁽ᵃᵈᵈ¹¹⁾";
  } else if (hasAdd13Only) {
    addStr = "⁽ᵃᵈᵈ¹³⁾";
  }

  let omitStr = "";
  if (model.omits.includes(3) && model.omits.includes(5)) omitStr = "⁽ⁿᵒ³ⁿᵒ⁵⁾";
  else if (model.omits.includes(3)) omitStr = "⁽ⁿᵒ³⁾";
  else if (model.omits.includes(5)) omitStr = "⁽ⁿᵒ⁵⁾";

  return `${baseRoman}${invFig}${altStr}${susStr}${addStr}${omitStr}`;
}

/**
 * Renderizador puro del símbolo armónico absoluto con bajo.
 */
export function renderChordSymbol(model: IntermediateChordModel): string {
  const rootLetter = model.rootName;

  let suffix = "";
  const is13th = model.type === 13 || model.tones.some(t => t.degree === 13 && t.source === 'extension');
  const is11th = model.type === 11 || model.tones.some(t => t.degree === 11 && t.source === 'extension');
  const is9th = model.type === 9 || model.tones.some(t => t.degree === 9 && t.alteration === 0 && t.source === 'extension');
  const is7th = model.tones.some(t => t.degree === 7);
  const is6th = model.tones.some(t => t.degree === 6);
  const isMaj7 = model.chordQuality === "maj7";
  const hasSharp5 = model.alterations.some(a => a === "#5" || a === "+5" || a === "5");
  const hasFlat5 = model.alterations.some(a => a === "b5" || a === "-5" || a === "♭5");
  const hasFlat9 = model.tones.some(t => t.degree === 9 && t.alteration === -1);
  const hasSharp9 = model.tones.some(t => t.degree === 9 && t.alteration === 1);
  const hasSus2 = model.suspensions.includes(2);
  const hasSus4 = model.suspensions.includes(4);
  const isSus2Sus4 = hasSus2 && hasSus4;

  if (model.chordQuality === "dim") {
    suffix = "°";
  } else if (model.chordQuality === "dim7") {
    suffix = model.tones.some(t => t.degree === 11) ? "°7(b9b11)" : "°7";
  } else if (model.chordQuality === "halfdim7") {
    if (is11th) {
      suffix = "m11(b5)";
    } else if (is9th) {
      suffix = "m9(b5)";
    } else {
      suffix = "m7(b5)";
    }
  } else if (model.chordQuality === "aug") {
    suffix = "+(#5)";
  } else if (model.chordQuality === "min") {
    if (is13th) {
      suffix = "m13";
    } else if (is11th) {
      suffix = "m11";
    } else if (is9th) {
      suffix = "m9";
    } else if (is6th) {
      suffix = "m6";
    } else {
      suffix = "m";
    }
  } else if (model.chordQuality === "min7") {
    if (is13th) {
      suffix = "m13";
    } else if (is11th) {
      suffix = "m11";
    } else if (is9th) {
      suffix = "m9";
    } else {
      suffix = hasSus2 ? "m7sus2" : "m7";
    }
  } else if (isMaj7) {
    if (model.requestedInversion === 3) {
      suffix = "";
    } else {
      if (is13th) {
        suffix = "maj13";
      } else if (is11th) {
        suffix = "maj11";
      } else if (is9th) {
        suffix = "maj9";
      } else if (hasSus2) {
        suffix = "maj7 sus2";
      } else {
        suffix = "maj7";
      }
      if (hasSharp5) suffix += "⁽♯⁵⁾";
    }
  } else if (model.chordQuality === "dom7") {
    if (is13th) {
      suffix = "13";
    } else if (is11th) {
      suffix = "11";
    } else if (is9th) {
      suffix = "9";
    } else {
      suffix = "7";
    }
    if (hasSharp5) suffix = "⁺⁽♯⁵⁾₇";
  }

  // 6th chord (major 6th) si no es minor 6
  if (is6th && model.chordQuality !== "min" && !suffix.includes("6")) {
    suffix += "6";
  }

  // Suspensions en tríadas / acordes mayores
  if (!suffix.includes("sus")) {
    if (isSus2Sus4) suffix += "sus2sus4";
    else if (hasSus2 && !suffix.includes("maj7")) suffix += "sus2";
    else if (hasSus4) suffix += "sus4";
  }

  // Extensiones y notas añadidas
  const hasAdd4 = model.tones.some(t => t.degree === 4 && t.source === 'add');
  const hasAdd9 = model.tones.some(t => t.degree === 9 && t.source === 'add');
  const hasAdd11Only = model.tones.some(t => t.degree === 11 && t.source === 'add') && !is11th;
  const hasAdd13Only = model.tones.some(t => t.degree === 13 && t.source === 'add') && !is13th;
  if (hasAdd4 && hasAdd9) {
    suffix += "⁽add4add9⁾";
  } else if (hasAdd9 && !suffix.includes("maj9") && !suffix.includes("m9") && !suffix.includes("9")) {
    suffix += "⁽add9⁾";
  } else if (hasAdd11Only && !suffix.includes("11")) {
    suffix += "⁽add11⁾";
  } else if (hasAdd13Only && !suffix.includes("13") && !suffix.includes("6") && !suffix.includes("⁶")) {
    suffix += "⁽add13⁾";
  }

  // Alteraciones
  if (hasFlat9) suffix += "(b9)";
  if (hasSharp9) suffix += "(#9)";
  if (hasFlat5 && !model.chordQuality.includes("dim")) suffix += "(b5)";

  // Omisiones
  if (model.omits.includes(3) && model.omits.includes(5)) suffix += "⁽ⁿᵒ³ⁿᵒ⁵⁾";
  else if (model.omits.includes(3)) suffix += "⁽ⁿᵒ³⁾";
  else if (model.omits.includes(5)) suffix += "⁽ⁿᵒ⁵⁾";

  // Bajo de inversión (slash note)
  let slashBass = "";
  if (model.requestedInversion > 0 && !model.isAmbiguousInversion) {
    slashBass = `/${model.bassName}`;
  }

  return `${rootLetter}${suffix}${slashBass}`;
}

/**
 * Renderizador puro de etiquetas secundarias (sublabels).
 */
export function renderSubLabels(model: IntermediateChordModel): string {
  if (model.applied?.isTritoneSub) return "(Δ-sub)";
  if (model.borrowedMode) {
    if (model.borrowedMode === "minor" || model.borrowedMode === "m") return "(m)";
    if (model.borrowedMode === "phrygian") return "(phr)";
    if (model.borrowedMode === "dorian") return "(dor)";
    if (model.borrowedMode === "mixolydian") return "(mix)";
    if (model.borrowedMode === "lydian") return "(lyd)";
    if (model.borrowedMode === "locrian") return "(loc)";
    return "(bor)";
  }
  return "";
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Adaptadores de Compatibilidad con el Sistema Existente
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convierte cualquier acorde crudo de Hookpad a UniversalChord utilizando el pipeline IR.
 */
export function parseHookpadChord(
  raw: any,
  keyTonicOrKey: string | { tonic: string; scale?: string } = "C",
  scaleMode = "major",
): UniversalChord {
  const key: KeySignature = typeof keyTonicOrKey === 'object' && keyTonicOrKey !== null
    ? { tonic: keyTonicOrKey.tonic, scale: (keyTonicOrKey.scale || 'major') as any }
    : { tonic: keyTonicOrKey, scale: scaleMode as any };

  const model = buildIntermediateChord(raw, key);

  const roman = raw.customRoman || renderRomanNumeral(model);
  const symbol = raw.customSymbol || renderChordSymbol(model);
  const sublabel = raw.customSublabel || renderSubLabels(model);

  const pcNames = model.useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const notePitches = model.tones.map(t => {
    const pc = normalizeSemitone(model.rootSemitones + t.interval);
    return `${pcNames[pc]}4`;
  });

  const rootDegreeSd = String(model.degreeIndex);
  const { color: rootColor, isAltered: rootAltered } = getDegreeColor(rootDegreeSd);
  // REQ-9.2: El color del bloque armónico SIEMPRE se deriva del grado del bajo efectivo
  // En posición fundamental el bajo coincide con la fundamental; en inversiones o slash chords corresponde a la nota inferior real.
  const chordColor = model.bassColor ?? rootColor;

  const isBassAltered = model.bassAlteration !== undefined && model.bassAlteration !== 0;
  const isChordAltered = isBassAltered || rootAltered || Boolean(model.borrowedMode) || Boolean(model.applied) || Boolean(raw.isAltered);

  const typeNum = model.type;

  return {
    id: raw.id || String(raw.beat || 1),
    beat: Number(raw.beat || 1),
    duration: Number(raw.duration || 4),
    roman,
    symbol,
    rootSd: rootDegreeSd,
    quality: (model.chordQuality === "custom" ? "maj" : model.chordQuality) as any,
    type: typeNum,
    inversion: model.requestedInversion as 0 | 1 | 2 | 3,
    secondaryType: model.applied ? (model.applied.appliedDegree === 7 ? "vii°" : model.applied.appliedDegree === 4 ? "IV" : model.applied.appliedDegree === 2 ? "ii" : "V") : undefined,
    appliedTarget: model.applied?.targetDegree,
    applied: model.applied ? String(model.applied.appliedFunctionDegree) : undefined,
    appliedFunctionDegree: model.applied?.appliedFunctionDegree,
    targetDegree: model.applied?.targetDegree,
    targetRootSemitones: model.applied?.targetRootSemitones,
    appliedRootSemitones: model.applied?.appliedRootSemitones,
    borrowed: model.borrowedMode || undefined,
    alterations: model.alterations,
    adds: model.adds,
    omits: model.omits,
    suspensions: model.suspensions,
    substitutions: raw.substitutions,
    options: raw.options,
    notes: notePitches,
    bassNote: model.bassName,
    bassDegreeIndex: model.bassDegreeIndex,
    bassScaleDegree: model.bassScaleDegree,
    bassColor: model.bassColor,
    midiNotes: model.audioVoicingMidi,
    sublabel,
    color: chordColor,
    isAltered: isChordAltered,
    _rootSemitones: model.rootSemitones,
    bassSemitones: model.bassSemitones,
    resolvedInversion: model.resolvedInversion,
    addedIntervals: model.addedIntervals,
    ir: model.canonical,
    model,
  };
}

export const parseHooktheoryChord = parseHookpadChord;

/**
 * Cálculo universal de la fundamental del acorde (rootMidi).
 */
export function getChordRootMidi(
  chord: UniversalChord,
  key: KeySignature | string,
  baseOctave = 3,
): number {
  const model = buildIntermediateChord(chord, key, baseOctave);
  const { tonic } = normalizeKey(key);
  let tonicMidi: number;
  try {
    tonicMidi = Tone.Frequency(`${tonic}${baseOctave}`).toMidi();
  } catch {
    tonicMidi = (baseOctave + 1) * 12 + model.tonicSemitones;
  }
  return tonicMidi + model.rootSemitones;
}

/**
 * Calcula el símbolo del acorde dinámicamente en base a la tónica activa y el modo.
 */
export function getTransposedChordSymbol(
  chord: UniversalChord | any,
  currentKey: KeySignature | string,
): string {
  if (!chord) return '';
  const model = buildIntermediateChord(chord, currentKey);
  return chord.customSymbol || renderChordSymbol(model);
}

/**
 * Asigna la etiqueta funcional determinista a cada voz de un acorde para PianoRoll y WebAudio.
 */
export function getChordVoiceFunctionalLabel(
  pc: number,
  model: IntermediateChordModel,
  isBass: boolean
): { label: string; voiceNumber: string } {
  const intervalFromRoot = normalizeSemitone(pc - model.rootSemitones);

  if (isBass && model.requestedInversion > 0 && !model.isAmbiguousInversion) {
    return { label: 'Bass', voiceNumber: 'Bass' };
  }

  // Buscar tonos coincidentes en el modelo
  const matchingTones = model.tones.filter(t => normalizeSemitone(t.interval) === intervalFromRoot);
  if (matchingTones.length > 0) {
    let chosenTone = matchingTones[0];
    if (matchingTones.length > 1 && !isBass) {
      const extTone = matchingTones.find(t => t.degree >= 9 || t.degree === 4 || t.degree === 2 || t.degree === 6);
      if (extTone) chosenTone = extTone;
    }

    if (chosenTone.degree === 1) return { label: '1', voiceNumber: '1' };
    if (chosenTone.degree === 2) return { label: '2', voiceNumber: '2' };
    if (chosenTone.degree === 3) return { label: '3', voiceNumber: '3' };
    if (chosenTone.degree === 4) return { label: '4', voiceNumber: '4' };
    if (chosenTone.degree === 5) {
      const lbl = chosenTone.alteration === 1 ? '#5' : chosenTone.alteration === -1 ? 'b5' : '5';
      return { label: lbl, voiceNumber: lbl };
    }
    if (chosenTone.degree === 6) return { label: '6', voiceNumber: '6' };
    if (chosenTone.degree === 7) {
      const lbl = chosenTone.alteration === -1 || model.chordQuality === 'dim7'
        ? '°7'
        : (chosenTone.interval === 10 || model.chordQuality === 'dom7' || model.chordQuality === 'min7' || model.chordQuality === 'halfdim7')
          ? 'b7'
          : '7';
      return { label: lbl, voiceNumber: lbl };
    }
    if (chosenTone.degree === 9) {
      const lbl = chosenTone.alteration === -1 || chosenTone.interval === 13
        ? 'b9'
        : chosenTone.alteration === 1 || chosenTone.interval === 15
          ? '#9'
          : '9';
      return { label: lbl, voiceNumber: lbl };
    }
    if (chosenTone.degree === 11) {
      const lbl = chosenTone.alteration === 1 || chosenTone.interval === 18
        ? '#11'
        : chosenTone.alteration === -1 || chosenTone.interval === 16
          ? 'b11'
          : '11';
      return { label: lbl, voiceNumber: lbl };
    }
    if (chosenTone.degree === 13) {
      const lbl = chosenTone.alteration === -1 ? 'b13' : '13';
      return { label: lbl, voiceNumber: lbl };
    }
  }

  // Fallbacks seguros por intervalo respecto a la fundamental
  if (intervalFromRoot === 0) return { label: '1', voiceNumber: '1' };
  if (intervalFromRoot === 1) return { label: 'b9', voiceNumber: 'b9' };
  if (intervalFromRoot === 2) return { label: '9', voiceNumber: '9' };
  if (intervalFromRoot === 3) return { label: (model.chordQuality === 'min' || model.chordQuality === 'min7' || model.chordQuality === 'dim' || model.chordQuality === 'dim7' || model.chordQuality === 'halfdim7') ? '3' : '#9', voiceNumber: (model.chordQuality === 'min' || model.chordQuality === 'min7' || model.chordQuality === 'dim' || model.chordQuality === 'dim7' || model.chordQuality === 'halfdim7') ? '3' : '#9' };
  if (intervalFromRoot === 4) return { label: '3', voiceNumber: '3' };
  if (intervalFromRoot === 5) return { label: '11', voiceNumber: '11' };
  if (intervalFromRoot === 6) return { label: '5', voiceNumber: '5' };
  if (intervalFromRoot === 7) return { label: '5', voiceNumber: '5' };
  if (intervalFromRoot === 8) return { label: '5', voiceNumber: '5' };
  if (intervalFromRoot === 9) return { label: '6', voiceNumber: '6' };
  if (intervalFromRoot === 10) return { label: 'b7', voiceNumber: 'b7' };
  if (intervalFromRoot === 11) return { label: '7', voiceNumber: '7' };

  return { label: '1', voiceNumber: '1' };
}

/**
 * Resuelve un acorde universal a MIDI absoluto con voicing cerrado estilo Hooktheory.
 */
export function resolveChordVoicing(
  chord: UniversalChord,
  key: KeySignature | string,
  baseOctave = 3,
): ResolvedChord {
  const model = buildIntermediateChord(chord, key, baseOctave);
  const roman = chord.roman || renderRomanNumeral(model);
  const symbol = chord.customSymbol || renderChordSymbol(model);

  const { tonic } = normalizeKey(key);
  const tonicPc = NOTE_TO_PC[tonic] ?? 0;
  const pcNames = model.useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function getDegreeSd(pc: number): string {
    const semi = ((pc - tonicPc) % 12 + 12) % 12;
    const SEMI_TO_SD: Record<number, string> = {
      0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
      6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
    };
    return SEMI_TO_SD[semi] || '1';
  }

  function midiToPitch(m: number): string {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    return `${pcNames[pc]}${oct}`;
  }

  const harmonicVoices: ResolvedChordVoice[] = model.audioVoicingMidi.map((m, idx) => {
    const pc = ((m % 12) + 12) % 12;
    const sd = getDegreeSd(pc);
    const { color, isAltered } = getDegreeColor(sd);
    const pitch = midiToPitch(m);
    const noteLabel = pcNames[pc];
    const isBass = idx === 0;

    const { label: voiceLabel, voiceNumber } = getChordVoiceFunctionalLabel(pc, model, isBass);

    return {
      midi: m,
      pitch,
      label: voiceLabel,
      noteLabel,
      sd,
      color,
      isAltered,
      isBass,
      voiceNumber,
    };
  });

  const voices: ResolvedChordVoice[] = harmonicVoices;

  const notes = voices.map((v) => v.pitch);
  const rootDegreeSd = getDegreeSd(model.rootSemitones);
  const { color: chordColor, isAltered: rootAltered } = getDegreeColor(rootDegreeSd);

  return {
    id: chord.id,
    beat: chord.beat,
    duration: chord.duration,
    roman,
    symbol,
    rootMidi: model.audioVoicingMidi[0] || 60,
    voices,
    midiNotes: model.audioVoicingMidi,
    notes,
    color: chordColor,
    isAltered: rootAltered || Boolean(model.borrowedMode) || Boolean(model.applied) || voices.some((v) => v.isAltered),
  };
}

/**
 * Resuelve las voces de un acorde directamente (usado por PianoRoll).
 */
export function resolveChordVoices(
  chord: UniversalChord,
  key: KeySignature | string,
  baseOctave = 3,
): ResolvedChordVoice[] {
  if (chord.voices && chord.voices.length > 0) {
    return chord.voices;
  }
  const resolved = resolveChordVoicing(chord, key, baseOctave);
  return resolved.voices;
}
