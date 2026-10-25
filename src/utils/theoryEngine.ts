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
  ResolvedChord,
  ResolvedChordVoice,
} from '../types/music';
import { getDegreeColor, getColorByDegree } from './theoryColors';
import { SD_TO_SEMITONES } from './theoryParser';

// ── Re-exports de musicTheory.ts para compatibilidad ──
export {
  applySwingTransform,
  getScaleSpelling,
  formatPitch,
} from './musicTheory';

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
export const MODE_FORMULAS: Record<string, number[]> = {
  major:             [0, 2, 4, 5, 7, 9, 11],
  ionian:            [0, 2, 4, 5, 7, 9, 11],
  dorian:            [0, 2, 3, 5, 7, 9, 10],
  phrygian:          [0, 1, 3, 5, 7, 8, 10],
  lydian:            [0, 2, 4, 6, 7, 9, 11],
  mixolydian:        [0, 2, 4, 5, 7, 9, 10],
  minor:             [0, 2, 3, 5, 7, 8, 10],
  aeolian:           [0, 2, 3, 5, 7, 8, 10],
  locrian:           [0, 1, 3, 5, 6, 8, 10],
  harmonic_minor:    [0, 2, 3, 5, 7, 8, 11],
  phrygian_dominant: [0, 1, 4, 5, 7, 8, 10],
};

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
// parseHookpadChord: Parser oficial y exhaustivo de acordes Hookpad v2.1.0
// ────────────────────────────────────────────────────────────────────────────
/**
 * Convierte cualquier acorde crudo de Hookpad/TheoryTab a UniversalChord,
 * soportando acordes secundarios (applied), préstamos modales (borrowed),
 * extensiones (7/9), inversiones y bajo real cifrado.
 */
export function parseHookpadChord(raw: any, keyTonic = "C", scaleMode = "major"): UniversalChord {
  const rootNum = Number(raw.root ?? raw.sd ?? 1);
  const typeNum = Number(raw.type ?? 5) as 5 | 7 | 9 | 11 | 13;
  const applied = Number(raw.applied ?? raw.appliedTarget ?? 0);
  const borrowed = (raw.borrowed || "").toLowerCase();
  const inversion = Number(raw.inversion ?? 0) as 0 | 1 | 2 | 3;

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

  // 1. SECUNDARIOS (Applied > 0)
  // Hookpad guarda en raw.root el tipo de secundario (5=V, 7=vii°, 4=IV)
  // y en raw.applied el grado de destino (ej. 5=/V, 2=/ii, 3=/iii)
  if (applied > 0) {
    const targetInfo = DIATONIC_MAP[applied] || { roman: `${applied}`, semitones: 0, quality: "maj", symbol: "" };
    const targetSemitones = targetInfo.semitones;

    if (rootNum === 7) {
      // Prefijo vii°/X (Sensible secundaria: 1 semitono por debajo del destino)
      secondaryType = "vii°";
      quality = typeNum === 7 ? "dim7" : "dim";
      roman = typeNum === 7 ? `vii°⁷/${targetInfo.roman}` : `vii°/${targetInfo.roman}`;
      rootSemitones = (targetSemitones - 1 + 12) % 12;
      isAltered = true;
    } else if (rootNum === 5) {
      // Prefijo V/X (Dominante secundaria: 7 semitonos por encima del destino)
      secondaryType = "V";
      quality = typeNum === 7 ? "dom7" : "maj";
      roman = typeNum === 7 ? `V⁷/${targetInfo.roman}` : `V/${targetInfo.roman}`;
      rootSemitones = (targetSemitones + 7) % 12;
      isAltered = true;
    } else if (rootNum === 4) {
      // Prefijo IV/X (Subdominante secundaria: 5 semitonos por encima)
      secondaryType = "IV";
      quality = "maj";
      roman = `IV/${targetInfo.roman}`;
      rootSemitones = (targetSemitones + 5) % 12;
    } else if (rootNum === 2) {
      quality = typeNum === 7 ? "min7" : "min";
      roman = typeNum === 7 ? `ii⁷/${targetInfo.roman}` : `ii/${targetInfo.roman}`;
      rootSemitones = (targetSemitones + 2) % 12;
    }
  } 
  // 2. PRÉSTAMOS MODALES (Borrowed)
  else if (borrowed) {
    isAltered = true;
    if (borrowed === "phrygian" || borrowed.includes("phryg")) {
      if (rootNum === 3) { roman = typeNum === 7 ? "bIII⁷" : "bIII"; quality = "dom7"; rootSemitones = 3; }
      else if (rootNum === 7) { roman = "bvii"; quality = "min"; rootSemitones = 10; }
      else if (rootNum === 2) { roman = "bII"; quality = "maj"; rootSemitones = 1; }
      else if (rootNum === 6) { roman = "bvi"; quality = "min"; rootSemitones = 8; }
    } else if (borrowed === "dorian" || borrowed.includes("dor")) {
      if (rootNum === 4) { roman = typeNum === 7 ? "IV⁷" : "IV"; quality = "dom7"; rootSemitones = 5; }
      else if (rootNum === 6) { roman = "VI"; quality = "maj"; rootSemitones = 9; }
      else if (rootNum === 7) { roman = "bVII"; quality = "maj"; rootSemitones = 10; }
      else if (rootNum === 3) { roman = "bIII"; quality = "maj"; rootSemitones = 3; }
    } else if (borrowed === "minor" || borrowed.includes("aeol")) {
      if (rootNum === 6) { roman = "bVI"; quality = "maj"; rootSemitones = 8; }
      else if (rootNum === 7) { roman = "bVII"; quality = "maj"; rootSemitones = 10; }
      else if (rootNum === 3) { roman = typeNum === 7 ? "bIII⁷" : "bIII"; quality = "dom7"; rootSemitones = 3; }
    } else if (borrowed === "lydian" || borrowed.includes("lyd")) {
      if (rootNum === 7) { roman = "vii"; quality = "min"; rootSemitones = 11; }
      else if (rootNum === 4) { roman = "#IV"; quality = "maj"; rootSemitones = 6; }
    } else if (borrowed === "mixolydian" || borrowed.includes("mixo")) {
      if (rootNum === 7) { roman = "bVII"; quality = "maj"; rootSemitones = 10; }
    }
  } 
  // 3. DIATÓNICOS
  else {
    const base = DIATONIC_MAP[rootNum] || { roman: "I", quality: "maj", semitones: 0, symbol: "C" };
    roman = base.roman;
    quality = (raw.quality as UniversalChord["quality"]) || (base.quality as any);
    rootSemitones = base.semitones;

    if (typeNum === 7) {
      if (quality === "min") roman += "⁷";
      else if (rootNum === 5) roman = "V⁷";
      else if (quality === "dim") roman = "vii°⁷";
      else roman += "maj7";
      quality = rootNum === 5 ? "dom7" : quality === "min" ? "min7" : "maj7";
    }
  }

  // 4. BAJO CIFRADO POR INVERSIÓN
  if (inversion === 1) roman += typeNum === 7 ? "⁶₅" : "⁶";
  else if (inversion === 2) roman += typeNum === 7 ? "⁴₃" : "⁶₄";
  else if (inversion === 3) roman += "⁴₂";

  // Opciones avanzadas de acorde
  if (raw.options?.sus4) roman += "sus4";
  else if (raw.options?.sus2) roman += "sus2";

  // 5. CÁLCULO DE INTERVALOS Y NOTAS REALES
  const INTERVALS_MAP: Record<string, number[]> = {
    maj:      [0, 4, 7],
    min:      [0, 3, 7],
    dim:      [0, 3, 6],
    aug:      [0, 4, 8],
    dom7:     [0, 4, 7, 10],
    maj7:     [0, 4, 7, 11],
    min7:     [0, 3, 7, 10],
    dim7:     [0, 3, 6, 9],
    halfdim7: [0, 3, 6, 10]
  };

  let formula = [...(INTERVALS_MAP[quality] || [0, 4, 7])];
  if (raw.options?.sus4 && formula.length >= 2) formula[1] = 5;
  else if (raw.options?.sus2 && formula.length >= 2) formula[1] = 2;
  if (raw.options?.b5 && formula.length >= 3) formula[2] = 6;
  else if (raw.options?.sharp5 && formula.length >= 3) formula[2] = 8;
  if ((typeNum === 9 || raw.options?.add9) && !formula.includes(14)) formula.push(14);

  const rootMidi = tonicMidi + rootSemitones;
  
  // Notas del acorde en octava 4
  const allMidiNotes = formula.map((semitone) => rootMidi + semitone);

  // Armadura y selección de bemoles/sostenidos para ortografía enarmónica
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const useFlats = FLAT_KEYS.has(keyTonic) ||
    borrowed.includes('minor') || borrowed.includes('phryg') || borrowed.includes('aeol') ||
    roman.includes('b') || rootSemitones === 3 || rootSemitones === 10 || rootSemitones === 8 || rootSemitones === 1;

  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function midiToPitch(m: number): string {
    const pc = ((m % 12) + 12) % 12;
    const oct = Math.floor(m / 12) - 1;
    return `${PC_NAMES[pc]}${oct}`;
  }

  const notePitches = allMidiNotes.map((m) => midiToPitch(m));

  // Nota del bajo según la inversión (octava grave 3)
  const bassMidi = allMidiNotes[inversion % allMidiNotes.length] - 12;
  const bassPitch = midiToPitch(bassMidi);

  // Generar símbolo textual absoluto (ej: "C", "C/E", "f#°", "Eb7", "dm7/A", "G7sus4")
  const rootPc = ((rootMidi % 12) + 12) % 12;
  const rootName = PC_NAMES[rootPc];
  let symbol = rootName;
  if (quality === "min" || quality === "min7") symbol = `${rootName.toLowerCase()}m`;
  else if (quality === "dim" || quality === "dim7") symbol = `${rootName.toLowerCase()}°`;
  else if (quality === "aug") symbol = `${rootName}+`;

  if (typeNum === 7 || quality === "dom7") {
    if (!symbol.includes("7")) symbol += "7";
  } else if (quality === "maj7") {
    if (!symbol.includes("maj7")) symbol += "maj7";
  }

  if (raw.options?.sus4) symbol += "sus4";
  else if (raw.options?.sus2) symbol += "sus2";

  if (inversion > 0) {
    const bassPc = ((bassMidi % 12) + 12) % 12;
    const bassName = PC_NAMES[bassPc];
    symbol += `/${bassName}`;
  }

  const SEMI_TO_SD: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
    6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
  };
  const rootSd = isAltered ? (SEMI_TO_SD[rootSemitones] || String(rootNum)) : String(rootNum);

  let sublabel = raw.sublabel;
  if (!sublabel && borrowed) {
    if (borrowed.includes('phryg')) sublabel = '(phr)';
    else if (borrowed.includes('lyd')) sublabel = '(lyd)';
    else if (borrowed.includes('dor')) sublabel = '(dor)';
    else if (borrowed.includes('mixo')) sublabel = '(mixo)';
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
    appliedTarget: applied > 0 ? applied : undefined,
    applied: applied > 0 ? String(applied) : undefined,
    borrowed: borrowed || undefined,
    options: raw.options,
    notes: notePitches,
    bassNote: bassPitch,
    sublabel,
    color: chordColor,
    isAltered: isAltered || inversion > 0 || Boolean(borrowed) || applied > 0,
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
  const tonic = typeof key === 'string' ? key : key.tonic;
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
  const borrowed = (chord.borrowed || "").toLowerCase();
  const roman = chord.roman || "";

  // 1. Manejo de acordes con préstamo modal (borrowed) o con alteraciones en el número romano
  if ((borrowed.includes("phryg") || borrowed === "phrygian") && (rootSd === "3" || roman.includes("bIII"))) {
    rootSd = "b3";
  } else if ((borrowed.includes("minor") || borrowed === "minor" || borrowed.includes("aeol")) && roman.includes("bVI")) {
    rootSd = "b6";
  } else if ((borrowed.includes("minor") || borrowed === "minor" || borrowed.includes("aeol")) && roman.includes("bVII")) {
    rootSd = "b7";
  } else if ((borrowed.includes("minor") || borrowed === "minor" || borrowed.includes("aeol")) && roman.includes("bIII")) {
    rootSd = "b3";
  } else if (borrowed.includes("dorian") && roman.includes("bIII")) {
    rootSd = "b3";
  } else if (borrowed.includes("dorian") && roman.includes("bVII")) {
    rootSd = "b7";
  } else if (borrowed.includes("mixo") && roman.includes("bVII")) {
    rootSd = "b7";
  } else if (borrowed.includes("phryg") && (rootSd === "7" || roman.includes("bvii") || roman.includes("bVII"))) {
    rootSd = "b7";
  } else if (borrowed.includes("phryg") && (rootSd === "2" || roman.includes("bII"))) {
    rootSd = "b2";
  } else if (borrowed.includes("phryg") && (rootSd === "6" || roman.includes("bvi"))) {
    rootSd = "b6";
  } else if (borrowed.includes("lyd") && (rootSd === "4" || roman.includes("#IV"))) {
    rootSd = "#4";
  } else if (borrowed.includes("lyd") && (rootSd === "7" || roman.includes("vii"))) {
    rootSd = "7";
  } else if (roman.includes("bIII")) {
    rootSd = "b3";
  } else if (roman.includes("bVI")) {
    rootSd = "b6";
  } else if (roman.includes("bVII") || roman.includes("bvii")) {
    rootSd = "b7";
  } else if (roman.includes("bII")) {
    rootSd = "b2";
  } else if (roman.includes("#IV")) {
    rootSd = "#4";
  } else if (chord.applied && (roman.startsWith("vii°") || String(chord.rootSd) === '7')) {
    // Si es vii°/X, la fundamental es el sensible (1 semitono inferior) del acorde destino
    // Por ejemplo vii°/V en C: V es G (7 semitonos), por tanto el sensible es F# (6 semitonos)
    const targetSd = String(chord.applied);
    const targetSemitones = DEGREE_SEMITONES[targetSd] ?? (MAJOR_INTERVALS[parseInt(targetSd, 10) - 1] ?? 0);
    const rootSemitones = (targetSemitones - 1 + 12) % 12;
    return tonicMidi + rootSemitones;
  } else if (chord.applied && (roman.startsWith("V") || roman.startsWith("v") || String(chord.rootSd) === '5')) {
    const targetSd = String(chord.applied);
    const targetSemitones = DEGREE_SEMITONES[targetSd] ?? (MAJOR_INTERVALS[parseInt(targetSd, 10) - 1] ?? 0);
    const rootSemitones = (targetSemitones + 7) % 12;
    return tonicMidi + rootSemitones;
  }

  const offset = DEGREE_SEMITONES[rootSd] ?? (MAJOR_INTERVALS[parseInt(rootSd, 10) - 1] ?? 0);
  return tonicMidi + offset;
}

// ────────────────────────────────────────────────────────────────────────────
// getTransposedChordSymbol: Símbolo dinámico del acorde según la tonalidad activa
// ────────────────────────────────────────────────────────────────────────────
/**
 * Calcula el símbolo del acorde dinámicamente en base a la tónica activa y el modo.
 * Ejemplo: C -> G, F -> C, G7 -> D7, Eb7 -> Bb7, f#° -> c#°, C/E -> G/B.
 */
export function getTransposedChordSymbol(
  chord: UniversalChord | any,
  currentKey: KeySignature | string,
): string {
  if (!chord) return '';
  const keyObj: KeySignature = typeof currentKey === 'string'
    ? { tonic: currentKey, scale: 'major' }
    : (currentKey || { tonic: 'C', scale: 'major' });

  const rootSd = chord.rootSd || String(chord.root || '1');
  const rootMidi = getChordRootMidi({ ...chord, rootSd } as UniversalChord, keyObj, 4);
  const rootPc = ((rootMidi % 12) + 12) % 12;

  const borrowed = (chord.borrowed || '').toLowerCase();
  const roman = chord.roman || '';
  const inv = Number(chord.inversion ?? 0);

  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const useFlats = FLAT_KEYS.has(keyObj.tonic) ||
    borrowed.includes('minor') || borrowed.includes('phryg') || borrowed.includes('aeol') ||
    roman.includes('b') || rootSd.includes('b');

  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const rawQuality = String(chord.quality || '');
  const isMinor = rawQuality === 'min' || rawQuality === 'min7' ||
    (rawQuality === '' && /[a-z]/.test(roman) && !roman.includes('°'));
  const isDim = rawQuality === 'dim' || rawQuality === 'dim7' || roman.includes('°') || (chord.symbol && chord.symbol.includes('°'));
  const isAug = rawQuality === 'aug' || roman.includes('+') || (chord.symbol && chord.symbol.includes('+'));
  const has7 = roman.includes('7') || roman.includes('⁷') || rawQuality.includes('7') || (chord.symbol && chord.symbol.includes('7'));
  const isMaj7 = rawQuality === 'maj7' || roman.includes('maj7') || roman.includes('M7');

  let rootPitch = PC_NAMES[rootPc];
  if (isMinor || isDim) {
    rootPitch = rootPitch.toLowerCase();
  }

  let suffix = '';
  if (isMinor) suffix += 'm';
  if (isDim) suffix += '°';
  if (isAug) suffix += '+';

  if (isMaj7) {
    suffix += 'maj7';
  } else if (has7) {
    suffix += '7';
  }

  // Si tiene inversión (ej. C/E), transponer también la nota del bajo
  if (inv > 0) {
    const qualityKey = isDim ? (has7 ? 'dim7' : 'dim')
      : isMinor ? (has7 ? 'min7' : 'min')
      : has7 ? 'dom7' : 'maj';
    const intervals = CHORD_INTERVALS[qualityKey] || CHORD_INTERVALS['maj'];
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
  const tonic = typeof key === 'string' ? key : key.tonic;
  const tonicPc = NOTE_TO_PC[tonic] ?? 0;

  // 1. Fundamental real en registro central Hooktheory
  const rootMidiBase = getChordRootMidi(chord, key, 4);
  const rootPc = ((rootMidiBase % 12) + 12) % 12;

  const inv = Number(chord.inversion ?? 0);
  const borrowed = (chord.borrowed || '').toLowerCase();
  const roman = chord.roman || '';

  // 2. Nombres de notas según armadura y contexto modal
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const useFlats = FLAT_KEYS.has(tonic) ||
    borrowed.includes('minor') || borrowed.includes('phryg') || borrowed.includes('aeol') ||
    roman.includes('b') || (chord.rootSd && chord.rootSd.includes('b'));
  const PC_NAMES = useFlats
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // 3. Símbolo del acorde estilo Hooktheory (ej. C, C/E, am, bbm, bm, f#°, Eb7)
  const rootName = PC_NAMES[rootPc];
  const isMinor = chord.quality === 'min' || chord.quality === 'min7';
  const isDim = chord.quality === 'dim' || chord.quality === 'dim7';
  const isAug = chord.quality === 'aug';

  let baseSymbol = (isMinor || isDim) ? rootName.toLowerCase() : rootName;
  if (isMinor) baseSymbol += 'm';
  else if (isDim) baseSymbol += '°';
  else if (isAug) baseSymbol += '+';

  if (chord.quality === 'dom7' || chord.quality === 'min7' || chord.quality === 'dim7' || chord.quality === 'halfdim7') {
    baseSymbol += '7';
  } else if (chord.quality === 'maj7') {
    baseSymbol += 'maj7';
  }

  const intervals = CHORD_INTERVALS[chord.quality] || CHORD_INTERVALS['maj'];
  const count = (chord.type === 7 || chord.quality.includes('7')) ? 4 : 3;
  const chordIntervals = intervals.slice(0, count);

  const bassInterval = intervals[inv % intervals.length] || 0;
  const bassPc = (rootPc + bassInterval) % 12;
  const bassName = PC_NAMES[bassPc];

  let symbol = baseSymbol;
  if (inv > 0) {
    symbol += `/${bassName}`;
  }

  // 4. Generación de las voces del acorde en el registro central cerrado
  let midis = chordIntervals.map((semi) => rootMidiBase + semi);

  if (inv > 0) {
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
    else if (intervalFromRoot === 6 || intervalFromRoot === 7 || intervalFromRoot === 8) voiceNumber = '5';
    else if (intervalFromRoot >= 9 && intervalFromRoot <= 11) voiceNumber = '7';

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

  let voices: ResolvedChordVoice[] = harmonicVoices;
  let allSoundingMidis: number[] = [...uniqueMidis];

  // Si tiene inversión (ej. I⁶ sobre C/E), agregar la voz del bajo en octava grave (E3)
  if (inv > 0) {
    const bassMidi = rootMidiBase + bassInterval - 12 + octaveShift;
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
