/**
 * musicTheory.ts
 * Utilidades armónicas avanzadas para Hooktheory / TheoryTab:
 * - 9 Modos Principales estrictos con sus cualidades de acordes
 * - Círculo de Quintas interactivo
 * - Rango de transposición inteligente (Shortest Pitch Distance entre -6 y +5 semitonos)
 * - Clamp / Envolvente de Octava en melodía (60 a 84) y acordes (48 a 60)
 * - Ortografía modal estricta de escalas para cualquier tonalidad
 * - Mutación modal completa de notas melódicas y acordes en tiempo real
 */

import * as Tone from 'tone';
import { pitchToMidi, type RawChord, type RawNote } from './theoryParser';
import { getColorByDegree } from './theoryColors';

export const CIRCLE_OF_FIFTHS = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'
] as const;

export type KeyName = typeof CIRCLE_OF_FIFTHS[number];

export const KEY_INDEXES: Record<string, number> = {
  'C': 0, 'Db': 1, 'C#': 1, 'D': 2, 'Eb': 3, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'Ab': 8, 'G#': 8, 'A': 9, 'Bb': 10, 'A#': 10, 'B': 11
};

export const KEY_PITCH_CLASS = KEY_INDEXES;

/**
 * Cálculo por el camino más corto (Shortest Pitch Distance):
 * Normaliza para que el desplazamiento esté acotado entre -6 y +5 semitonos
 * evitando registros inaudibles (saltos a C7 o C2).
 */
export function getOptimalTransposeInterval(oldKey: string, newKey: string): number {
  const diff = (KEY_INDEXES[newKey] ?? 0) - (KEY_INDEXES[oldKey] ?? 0);
  return ((diff + 6) % 12) - 6;
}

export interface ScaleModeDef {
  name: string;
  intervals: number[];
  chordQualities: string[];
}

/**
 * Definición estricta de los 9 Modos Principales
 */
export const SCALE_MODES: Record<string, ScaleModeDef> = {
  // 1. Mayor (Jónico)
  major: {
    name: 'Mayor (Jónico)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    chordQualities: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
  },
  // 2. Dórico
  dorian: {
    name: 'Dórico',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    chordQualities: ['i', 'ii', 'bIII', 'IV', 'v', 'vi°', 'bVII']
  },
  // 3. Frigio
  phrygian: {
    name: 'Frigio',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    chordQualities: ['i', 'bII', 'bIII', 'iv', 'v°', 'bVI', 'bvii']
  },
  // 4. Lidio
  lydian: {
    name: 'Lidio',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    chordQualities: ['I', 'II', 'iii', '#iv°', 'V', 'vi', 'vii']
  },
  // 5. Mixolidio
  mixolydian: {
    name: 'Mixolidio',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    chordQualities: ['I', 'ii', 'iii°', 'IV', 'v', 'vi', 'bVII']
  },
  // 6. Menor (Eólico)
  minor: {
    name: 'Menor (Eólico)',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    chordQualities: ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII']
  },
  // 7. Locrio
  locrian: {
    name: 'Locrio',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    chordQualities: ['i°', 'bII', 'biii', 'iv', 'bV', 'bVI', 'bvii']
  },
  // 8. Menor Armónica
  harmonic_minor: {
    name: 'Menor Armónica',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    chordQualities: ['i', 'ii°', 'bIII+', 'iv', 'V', 'bVI', 'vii°']
  },
  // 9. Frigio Dominante
  phrygian_dominant: {
    name: 'Frigio Dominante',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    chordQualities: ['I', 'bII', 'iii°', 'iv', 'v°', 'bVI', 'bvii']
  }
};

SCALE_MODES['dor'] = SCALE_MODES['dorian'];
SCALE_MODES['mix'] = SCALE_MODES['mixolydian'];
SCALE_MODES['min'] = SCALE_MODES['minor'];
SCALE_MODES['maj'] = SCALE_MODES['major'];
SCALE_MODES['phr'] = SCALE_MODES['phrygian'];
SCALE_MODES['lyd'] = SCALE_MODES['lydian'];
SCALE_MODES['loc'] = SCALE_MODES['locrian'];
SCALE_MODES['harmonicminor'] = SCALE_MODES['harmonic_minor'];
SCALE_MODES['harm_min'] = SCALE_MODES['harmonic_minor'];
SCALE_MODES['harm'] = SCALE_MODES['harmonic_minor'];

const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC: Record<string, number> = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NOTES  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db']);

/**
 * Genera la ortografía musical exacta de los 7 grados diatónicos para cualquier clave y modo.
 */
export function getScaleSpelling(key: string, modeId = 'major'): string[] {
  const mode = SCALE_MODES[modeId] ?? SCALE_MODES['major'];
  const keyLetter = key[0].toUpperCase();
  const startIdx = LETTER_NAMES.indexOf(keyLetter);
  const tonicPc = KEY_INDEXES[key] ?? 0;

  return Array.from({ length: 7 }, (_, i) => {
    const baseLetter = LETTER_NAMES[(startIdx + i) % 7];
    const baseLetterPc = NATURAL_PC[baseLetter];
    const targetPc = (tonicPc + mode.intervals[i]) % 12;
    const diff = (targetPc - baseLetterPc + 12) % 12;

    if (diff === 0) return baseLetter;
    if (diff === 1) return `${baseLetter}#`;
    if (diff === 2) return `${baseLetter}##`;
    if (diff === 11) return `${baseLetter}b`;
    if (diff === 10) return `${baseLetter}bb`;
    return baseLetter;
  });
}

export interface DynamicScaleRow {
  octave: number;
  degree: number;
  noteName: string;
  baseMidi: number;
}

/**
 * Construye la estructura de filas diatónicas de arriba hacia abajo (de topOctave a bottomOctave).
 * topOctave = 2 (C6), bottomOctave = 0 (C4) -> 15 filas estándar C4 a C6.
 */
export function buildRowStructure(
  bottomOctave = 0,
  topOctave = 2
): Array<{ octave: number; degree: number }> {
  const structure: Array<{ octave: number; degree: number }> = [];

  // Tónica de la octava superior (ej. C6 cuando topOctave = 2)
  structure.push({ octave: topOctave, degree: 1 });

  // Cada octava en orden descendente
  for (let oct = topOctave - 1; oct >= bottomOctave; oct--) {
    for (let deg = 7; deg >= 1; deg--) {
      structure.push({ octave: oct, degree: deg });
    }
  }

  return structure;
}

// 18 filas diatónicas por defecto (compatibilidad)
export const BASE_ROW_STRUCTURE: Array<{ octave: number; degree: number }> = buildRowStructure(-1, 2).slice(0, 18);

/**
 * Genera dinámicamente las filas diatónicas del Piano Roll para la tonalidad, modo y rango de octavas.
 */
export function generateScaleRows(
  targetKey: string,
  modeId = 'major',
  semitoneOffset = 0,
  bottomOctave = 0,
  topOctave = 2
): DynamicScaleRow[] {
  const mode = SCALE_MODES[modeId] ?? SCALE_MODES['major'];
  const spelling = getScaleSpelling(targetKey, modeId);
  const baseTonicMidi = 60 + semitoneOffset;
  const rowStructure = buildRowStructure(bottomOctave, topOctave);

  return rowStructure.map((item) => {
    const degIndex = item.degree - 1;
    const noteLetter = spelling[degIndex] ?? 'C';
    const degSemitone = mode.intervals[degIndex] ?? 0;
    const midi = baseTonicMidi + item.octave * 12 + degSemitone;
    const octaveNum = Math.floor(midi / 12) - 1;

    return {
      octave: item.octave,
      degree: item.degree,
      noteName: `${noteLetter}${octaveNum}`,
      baseMidi: midi,
    };
  });
}

/**
 * Formatea un número MIDI a nombre de nota musical acorde a la ortografía modal activa.
 */
export function formatPitch(midi: number, spelling: string[], key: string): string {
  const pc = ((midi % 12) + 12) % 12;
  const octaveNum = Math.floor(midi / 12) - 1;

  for (let i = 0; i < 7; i++) {
    const letter = spelling[i];
    const letterBase = letter.replace(/[#b]/g, '');
    let letterPc = NATURAL_PC[letterBase] ?? 0;
    if (letter.includes('#')) letterPc += letter.split('#').length - 1;
    if (letter.includes('b')) letterPc -= letter.split('b').length - 1;
    letterPc = (letterPc + 12) % 12;

    if (letterPc === pc) {
      return `${letter}${octaveNum}`;
    }
  }

  const useFlats = FLAT_KEYS.has(key);
  const name = useFlats ? FLAT_NOTES[pc] : SHARP_NOTES[pc];
  return `${name}${octaveNum}`;
}

export function transposeNoteLetter(
  root: string,
  semitones: number,
  targetKey: string
): string {
  if (semitones === 0) return root;

  const isLower = root === root.toLowerCase();
  const normalized = root.toUpperCase();
  const noteList = FLAT_KEYS.has(targetKey) ? FLAT_NOTES : SHARP_NOTES;

  let pc = SHARP_NOTES.indexOf(normalized);
  if (pc === -1) pc = FLAT_NOTES.indexOf(normalized);
  if (pc === -1) return root;

  const newPc = (pc + (semitones % 12) + 12) % 12;
  const transposed = noteList[newPc];
  return isLower ? transposed.toLowerCase() : transposed;
}

export function transposeChordSymbol(
  symbol: string,
  semitones: number,
  targetKey: string
): string {
  if (!symbol || semitones === 0) return symbol;

  const match = symbol.match(/^([A-Ga-g][#b]?)([^/]*)(?:\/([A-Ga-g][#b]?))?$/);
  if (!match) return symbol;

  const root = match[1];
  const quality = match[2] || '';
  const bass = match[3];

  const transposedRoot = transposeNoteLetter(root, semitones, targetKey);
  const transposedBass = bass ? `/${transposeNoteLetter(bass, semitones, targetKey)}` : '';

  return `${transposedRoot}${quality}${transposedBass}`;
}

/**
 * ── MUTACIÓN MODAL DE NOTAS MELÓDICAS ──
 * Fórmula Hooktheory con Clamp de confort (C4 a C6 / MIDI 60 a 84):
 * MIDI = TonicMidi + ScaleIntervals[baseDegree - 1] + accidentalOffset + (octave * 12)
 */
export function mutateNotesForMode(
  originalNotes: RawNote[],
  key: string,
  modeId = 'major',
  semitoneOffset = 0
): RawNote[] {
  const mode = SCALE_MODES[modeId] ?? SCALE_MODES['major'];
  const tonicMidi = 60 + semitoneOffset;
  const spelling = getScaleSpelling(key, modeId);

  return originalNotes.map((rawNote) => {
    const sdStr = String(rawNote.sd);
    const baseDegree = parseInt(sdStr.replace(/[^1-7]/g, '')) || 1;
    const modeInterval = mode.intervals[baseDegree - 1];
    const octave = rawNote.octave ?? 1;

    let targetSemitonesFromTonic = MAJOR_INTERVALS[baseDegree - 1];
    let isAltered = false;
    let accidentalOffset = 0;

    if (sdStr.includes('#')) {
      targetSemitonesFromTonic = MAJOR_INTERVALS[baseDegree - 1] + 1;
      if (targetSemitonesFromTonic === modeInterval) {
        isAltered = false;
        accidentalOffset = 0;
      } else {
        isAltered = true;
        accidentalOffset = targetSemitonesFromTonic - modeInterval;
      }
    } else if (sdStr.includes('b')) {
      targetSemitonesFromTonic = MAJOR_INTERVALS[baseDegree - 1] - 1;
      if (targetSemitonesFromTonic === modeInterval) {
        isAltered = false;
        accidentalOffset = 0;
      } else {
        isAltered = true;
        accidentalOffset = targetSemitonesFromTonic - modeInterval;
      }
    } else {
      accidentalOffset = 0;
      isAltered = false;
    }

    const soundingSemitones = modeInterval + accidentalOffset;
    let soundingMidi = tonicMidi + soundingSemitones + octave * 12;

    // ── Clamp / Envolvente de Octava en la Melodía (MIDI 60 a 84 / C4 a C6) ──
    while (soundingMidi > 84) soundingMidi -= 12;
    while (soundingMidi < 60) soundingMidi += 12;

    const pitchName = formatPitch(soundingMidi, spelling, key);

    return {
      ...rawNote,
      pitch: pitchName,
      midi: soundingMidi,
      color: getColorByDegree(baseDegree),
      isAltered,
    };
  });
}

/**
 * ── MUTACIÓN MODAL DE ACORDES Y CUALIDADES ARMÓNICAS ──
 * Aplica chordQualities estrictas de los 9 modos y clamp de registro para el sintetizador (C3 a C4 / MIDI 48 a 60).
 */
/**
 * ── MUTACIÓN MODAL Y TRANSPOSICIÓN DE ACORDES ──
 * Preserva intactos acordes prestados (borrowed), secundarios (applied), etiquetas modales (sublabel)
 * y grados relativos, actualizando únicamente el símbolo y las notas transpuestas.
 */
export function mutateChordsForMode(
  originalChords: RawChord[],
  key: string,
  modeId = 'major',
  semitoneOffset = 0
): RawChord[] {
  const spelling = getScaleSpelling(key, modeId);

  return originalChords.map((chord) => {
    // 1. Transponer símbolo en texto (ej. Eb7 -> F7 si sube un tono)
    const transposedSymbol = transposeChordSymbol(chord.symbol, semitoneOffset, key);

    // 2. Sumar semitoneOffset a cada nota en formato MIDI con clamp para sintetizador (C3 a C4 / MIDI 48 a 60)
    const baseMidis =
      chord.midiNotes && chord.midiNotes.length > 0
        ? chord.midiNotes
        : chord.notes && chord.notes.length > 0
        ? chord.notes.map((n) => pitchToMidi(n)).filter((m): m is number => m !== null)
        : [chord.rootMidi ?? 60];

    const clampedMidis = baseMidis.map((m) => {
      let midi = m + semitoneOffset;
      while (midi > 60) midi -= 12;
      while (midi < 48) midi += 12;
      return midi;
    });

    let transposedRootMidi = (chord.rootMidi ?? baseMidis[0] ?? 60) + semitoneOffset;
    while (transposedRootMidi > 60) transposedRootMidi -= 12;
    while (transposedRootMidi < 48) transposedRootMidi += 12;

    const noteNames = clampedMidis.map((m) => formatPitch(m, spelling, key));

    // Si es un acorde prestado (borrowed), secundario (applied), con sublabel modal o alterado:
    // NO regenerar desde cero: Preservar intactos roman, borrowed, applied, type, inversion y sublabel.
    const isSpecialChord =
      chord.borrowed !== undefined ||
      chord.applied !== undefined ||
      chord.sublabel !== undefined ||
      chord.isAltered === true;

    if (isSpecialChord) {
      return {
        ...chord,
        roman: chord.roman,
        borrowed: chord.borrowed,
        applied: chord.applied,
        type: chord.type,
        inversion: chord.inversion,
        sublabel: chord.sublabel,
        color: chord.color,
        isAltered: chord.isAltered,
        symbol: transposedSymbol,
        rootMidi: transposedRootMidi,
        midiNotes: clampedMidis,
        notes: noteNames,
      };
    }

    // Para acordes diatónicos: si es major (o modo base), preservamos su análisis armónico (roman)
    const mode = SCALE_MODES[modeId] ?? SCALE_MODES['major'];
    if (modeId === 'major' || !mode) {
      return {
        ...chord,
        symbol: transposedSymbol,
        rootMidi: transposedRootMidi,
        midiNotes: clampedMidis,
        notes: noteNames,
      };
    }

    // Mutación diatónica según chordQualities del modo seleccionado
    const rootDeg = typeof chord.root === 'number' ? chord.root : parseInt(String(chord.root)) || 1;
    const i = (rootDeg - 1 + 7) % 7;
    const baseRoman = mode.chordQualities[i] ?? chord.roman;
    const isSeventh = chord.type === 7 || chord.roman.includes('7') || chord.roman.includes('⁷');

    let mutatedRoman = baseRoman;
    if (isSeventh) {
      if (baseRoman.endsWith('°')) {
        mutatedRoman = `${baseRoman.slice(0, -1)}°⁷`;
      } else {
        mutatedRoman = `${baseRoman}⁷`;
      }
    }
    if (chord.inversion === 1) {
      mutatedRoman = `${mutatedRoman}⁶`;
    }

    return {
      ...chord,
      roman: mutatedRoman,
      symbol: transposedSymbol,
      rootMidi: transposedRootMidi,
      midiNotes: clampedMidis,
      notes: noteNames,
    };
  });
}

/**
 * Transpone una canción completa sumando 'interval' semitonos
 * preservando intactos todos los números romanos, acordes prestados y secundarios.
 */
export function transposeSong<T extends { notes: RawNote[]; chords: RawChord[] }>(
  song: T,
  interval: number,
  targetKey: string,
  modeId = 'major'
): T {
  const mutatedNotes = mutateNotesForMode(song.notes, targetKey, modeId, interval);
  const mutatedChords = mutateChordsForMode(song.chords, targetKey, modeId, interval);
  return {
    ...song,
    notes: mutatedNotes,
    chords: mutatedChords,
  };
}

/**
 * Cálculo dinámico del rango visible (Auto-Fit) para el teclado:
 * Analiza todas las notas de la melodía y de los acordes para determinar el rango óptimo.
 */
export function calculateSongPitchRange(
  notes: Array<{ pitch?: string; midi?: number }>,
  chords: Array<{ notes?: string[]; midiNotes?: number[] }>
) {
  const allPitches = [
    ...notes.map((n) => n.pitch),
    ...chords.flatMap((c) => c.notes || []),
  ].filter(Boolean) as string[];

  const midiValues: number[] = [];

  for (const n of notes) {
    if (typeof n.midi === 'number') {
      midiValues.push(n.midi);
    }
  }

  for (const c of chords) {
    if (c.midiNotes && c.midiNotes.length > 0) {
      midiValues.push(...c.midiNotes);
    }
  }

  if (midiValues.length === 0 && allPitches.length > 0) {
    allPitches.forEach((p) => {
      try {
        midiValues.push(Tone.Frequency(p).toMidi());
      } catch {}
    });
  }

  if (midiValues.length === 0) {
    return {
      startPitch: 'C3',
      endPitch: 'C6',
      startMidi: 48,
      endMidi: 84,
    };
  }

  const minMidi = Math.min(...midiValues);
  const maxMidi = Math.max(...midiValues);

  // Añadimos margen y alineamos al Do (C) inferior y Si o Do superior
  const startMidi = Math.max(21, minMidi - (minMidi % 12)); // Alinear al 'C' inferior
  const endMidi = Math.min(108, maxMidi + (12 - (maxMidi % 12))); // Alinear al siguiente 'B' o 'C'

  return {
    startPitch: Tone.Frequency(startMidi, 'midi').toNote(),
    endPitch: Tone.Frequency(endMidi, 'midi').toNote(),
    startMidi,
    endMidi,
  };
}

export interface AutoPitchRangeResult {
  minPitch: string;
  maxPitch: string;
  startMidi: number;
  endMidi: number;
  bottomOctave: number;
  topOctave: number;
}

/**
 * Cálculo del Auto Range vertical estricto para el Piano Roll:
 * Recolecta obligatoriamente las notas de la melodía y de los acordes (polifonía completa),
 * redondeando el límite inferior hacia el Do (C) anterior para que el bajo (G3, E3, C3)
 * nunca quede cortado ni aplastado en C4.
 */
export function calculateAutoPitchRange(
  melodyNotes: Array<{ pitch?: string; midi?: number }>,
  chords: Array<{ notes?: string[]; midiNotes?: number[]; rootMidi?: number }>
): AutoPitchRangeResult {
  const midiValues: number[] = [];

  for (const n of melodyNotes) {
    if (typeof n.midi === 'number') {
      midiValues.push(n.midi);
    } else if (n.pitch) {
      try {
        midiValues.push(Tone.Frequency(n.pitch).toMidi());
      } catch {}
    }
  }

  for (const c of chords) {
    if (c.midiNotes && c.midiNotes.length > 0) {
      midiValues.push(...c.midiNotes);
    } else if (c.notes && c.notes.length > 0) {
      c.notes.forEach((p) => {
        try {
          midiValues.push(Tone.Frequency(p).toMidi());
        } catch {}
      });
    } else if (typeof c.rootMidi === 'number') {
      midiValues.push(c.rootMidi);
    }
  }

  // Fallback seguro de C3 a C6 (MIDI 48 a 84)
  if (midiValues.length === 0) {
    return {
      minPitch: 'C3',
      maxPitch: 'C6',
      startMidi: 48,
      endMidi: 84,
      bottomOctave: -1,
      topOctave: 2,
    };
  }

  const minMidi = Math.min(...midiValues);
  const maxMidi = Math.max(...midiValues);

  // Redondear el límite inferior hacia el Do (C) anterior para no cortar acordes
  // Por ejemplo, si el bajo toca G3 (MIDI 55), startMidi debe ser C3 (MIDI 48)
  const startMidi = Math.max(24, Math.floor(minMidi / 12) * 12);
  // Redondear el límite superior hacia el siguiente Si (B) o Do (C)
  const endMidi = Math.min(108, Math.ceil(maxMidi / 12) * 12);

  const bottomOctave = Math.floor((startMidi - 60) / 12);
  const topOctave = Math.ceil((endMidi - 60) / 12);

  return {
    minPitch: Tone.Frequency(startMidi, 'midi').toNote(),
    maxPitch: Tone.Frequency(endMidi, 'midi').toNote(),
    startMidi,
    endMidi,
    bottomOctave,
    topOctave,
  };
}

/**
 * Deformación geométrica visual del Swing en tiempo real (Hooktheory).
 * En subdivisión 8n: el primer medio beat se expande y el segundo se comprime.
 * En subdivisión 16n: cada semicorchea par se retrasa y la anterior se estira.
 */
export function applySwingTransform(
  beat: number,
  duration: number,
  swingEnabled: boolean,
  swingAmount: number, // 0.0 a 1.0 (ej. 0.67)
  subdivision: '8n' | '16n'
): { visualBeat: number; visualDuration: number } {
  if (!swingEnabled || swingAmount === 0.5) {
    return { visualBeat: beat, visualDuration: duration };
  }

  const subSize = subdivision === '8n' ? 0.5 : 0.25; // Tamaño del paso
  const swingRatio = swingAmount; // Por ejemplo 0.67

  // Función para transformar un punto temporal continuo
  const getSwungPoint = (t: number) => {
    const pairIndex = Math.floor(t / (subSize * 2));
    const posInPair = (t % (subSize * 2)) / (subSize * 2); // 0.0 a 1.0 dentro del par

    let swungPosInPair: number;
    if (posInPair < 0.5) {
      // Primera mitad: se expande hasta swingRatio
      swungPosInPair = (posInPair / 0.5) * swingRatio;
    } else {
      // Segunda mitad: se comprime en el espacio restante (1 - swingRatio)
      swungPosInPair = swingRatio + ((posInPair - 0.5) / 0.5) * (1 - swingRatio);
    }

    return pairIndex * (subSize * 2) + swungPosInPair * (subSize * 2);
  };

  const startPoint = beat - 1; // Base 0
  const endPoint = startPoint + duration;

  const swungStart = getSwungPoint(startPoint);
  const swungEnd = getSwungPoint(endPoint);

  return {
    visualBeat: swungStart + 1,
    visualDuration: Math.max(0.05, swungEnd - swungStart),
  };
}

/**
 * Afinación estándar de guitarra (MIDI):
 * Cuerda 6 (Low E): 40 (E2)
 * Cuerda 5 (A): 45 (A2)
 * Cuerda 4 (D): 50 (D3)
 * Cuerda 3 (G): 55 (G3)
 * Cuerda 2 (B): 59 (B3)
 * Cuerda 1 (High E): 64 (E4)
 */
export const GUITAR_STRINGS_MIDI = [40, 45, 50, 55, 59, 64];

export interface FretRangeResult {
  startFret: number;
  endFret: number;
  visibleFretsCount: number;
}

/**
 * Auto-Fit inteligente del rango de trastes para Guitarra:
 * Analiza todas las notas de la melodía y acordes de la canción/sección,
 * determina la posición ergonómica estándar en el diapasón (trastes 0 a 24)
 * y devuelve el rango acotado.
 */
export function calculateFretRangeForSong(
  notes: Array<{ pitch?: string; midi?: number }>,
  chords: Array<{ notes?: string[]; midiNotes?: number[] }>
): FretRangeResult {
  const midiValues: number[] = [];

  for (const n of notes) {
    if (typeof n.midi === 'number') {
      midiValues.push(n.midi);
    } else if (n.pitch) {
      try {
        midiValues.push(Tone.Frequency(n.pitch).toMidi());
      } catch {}
    }
  }

  for (const c of chords) {
    if (c.midiNotes && c.midiNotes.length > 0) {
      midiValues.push(...c.midiNotes);
    } else if (c.notes) {
      c.notes.forEach((p) => {
        try {
          midiValues.push(Tone.Frequency(p).toMidi());
        } catch {}
      });
    }
  }

  if (midiValues.length === 0) {
    return {
      startFret: 0,
      endFret: 12,
      visibleFretsCount: 13,
    };
  }

  const frets: number[] = [];
  for (const m of midiValues) {
    // Buscar la posición de traste más baja / ergonómica en el diapasón (0 a 24)
    let bestFret: number | null = null;
    for (const openMidi of GUITAR_STRINGS_MIDI) {
      const fret = m - openMidi;
      if (fret >= 0 && fret <= 24) {
        if (bestFret === null || fret < bestFret) {
          bestFret = fret;
        }
      }
    }
    if (bestFret !== null) {
      frets.push(bestFret);
    }
  }

  if (frets.length === 0) {
    return {
      startFret: 0,
      endFret: 12,
      visibleFretsCount: 13,
    };
  }

  const minFret = Math.min(...frets);
  const maxFret = Math.max(...frets);

  // Si el traste mínimo está cerca del inicio (0-2), anclamos en 0 para mostrar la cejuela (Nut)
  const startFret = minFret <= 2 ? 0 : Math.max(0, minFret);
  const endFret = Math.min(24, Math.max(startFret + 4, maxFret));

  return {
    startFret,
    endFret,
    visibleFretsCount: endFret - startFret + 1,
  };
}


