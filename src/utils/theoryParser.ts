/**
 * theoryParser.ts
 * Parser de notación Hooktheory (TheoryTab).
 * Convierte grados de la escala (sd) y octavas a números MIDI y frecuencias exactas.
 */

export interface RawNote {
  beat: number;
  duration: number;
  sd: string | number;
  octave?: number;
  pitch?: string;
  color?: string;
  striped?: boolean;
  isAltered?: boolean;
  isRest?: boolean;
}

export interface RawChord {
  beat: number;
  measure?: number;
  duration: number;
  roman: string;
  sublabel?: string;
  symbol: string;
  root: string | number;
  type?: number;
  applied?: string | number;
  borrowed?: string;
  isAltered?: boolean;
  inversion?: number;
  color?: string;
  notes?: string[];
  rootMidi?: number;
  midiNotes?: number[];
  voices?: any[];
}

export interface KeySignature {
  beat: number;
  scale: string;
  tonic: string;
}

export interface MusicData {
  title: string;
  artist: string;
  bpm: number;
  timeSignature: [number, number];
  totalBeats: number;
  keys: KeySignature[];
  chords: RawChord[];
  notes: RawNote[];
}

export interface ParsedNote {
  beat: number;
  duration: number;
  sd: string;
  scaleDegree: number; // 1-7
  octave: number;
  midi: number;
  freq: number;
  name: string;
  color?: string;
  striped?: boolean;
  isAltered?: boolean;
  isRest: boolean;
}

/**
 * Grado 'sd' a semitonos en Hooktheory (Do = 0):
 * 1: 0, b2/#1: 1, 2: 2, b3/#2: 3, 3: 4, 4: 5, b5/#4: 6, 5: 7, b6/#5: 8, 6: 9, b7/#6: 10, 7: 11
 */
export const SD_TO_SEMITONES: Record<string, number> = {
  '1': 0,
  '#1': 1,
  'b2': 1,
  '2': 2,
  '#2': 3,
  'b3': 3,
  '3': 4,
  '#3': 5,
  'b4': 4,
  '4': 5,
  '#4': 6,
  'b5': 6,
  '5': 7,
  '#5': 8,
  'b6': 8,
  '6': 9,
  '#6': 10,
  'b7': 10,
  '7': 11,
  'b1': 11,
  '#7': 0,
};

// ----------------------------------------------------------------------
// Mapeo diatónico y posicionamiento vertical estilo Hooktheory
// ----------------------------------------------------------------------

// Offset vertical respecto a la fila base del grado natural
export const DIATONIC_ROW_OFFSET: Record<string, { baseDegree: number; offset: number }> = {
  "1":  { baseDegree: 1, offset: 0 },
  "#1": { baseDegree: 1, offset: -0.5 },
  "b2": { baseDegree: 2, offset: 0.5 },
  "2":  { baseDegree: 2, offset: 0 },
  "#2": { baseDegree: 2, offset: -0.5 },
  "b3": { baseDegree: 3, offset: 0.5 },
  "3":  { baseDegree: 3, offset: 0 },
  "4":  { baseDegree: 4, offset: 0 },
  "#4": { baseDegree: 4, offset: -0.5 }, // F# queda entre F y G
  "b5": { baseDegree: 5, offset: 0.5 },
  "5":  { baseDegree: 5, offset: 0 },
  "#5": { baseDegree: 5, offset: -0.5 },
  "b6": { baseDegree: 6, offset: 0.5 }, // Ab queda entre G y A
  "6":  { baseDegree: 6, offset: 0 },
  "#6": { baseDegree: 6, offset: -0.5 },
  "b7": { baseDegree: 7, offset: 0.5 },
  "7":  { baseDegree: 7, offset: 0 },
  "#7": { baseDegree: 7, offset: -0.5 },
};

/**
 * Calcula 'top' usando las filas visibles diatónicas (C6 descendiendo hasta C4 o C3).
 * Las notas alteradas se sitúan exactamente a mitad de camino (±0.5 filas) entre carriles.
 */
export function calculateNoteTop(
  sd: string,
  octave: number,
  rowHeight: number,
  topOctave = 2
): { top: number; isAltered: boolean; baseDegree: number } {
  const mapping = DIATONIC_ROW_OFFSET[sd] || { baseDegree: Number(sd) || 1, offset: 0 };
  
  // Índice diatónico absoluto (C4 = 0, D4 = 1 ... C5 = 7, etc.)
  const diatonicIndex = (octave * 7) + (mapping.baseDegree - 1);
  
  // Posición invertida (los agudos arriba, graves abajo)
  // maxDiatonicIndex corresponde a la nota superior visible (topOctave * 7, ej. C6 = 14)
  const maxDiatonicIndex = topOctave * 7; 
  const rowIndex = maxDiatonicIndex - diatonicIndex;
  
  const finalRowPosition = rowIndex + mapping.offset;
  
  return {
    top: finalRowPosition * rowHeight,
    isAltered: mapping.offset !== 0,
    baseDegree: mapping.baseDegree,
  };
}

export const SD_TO_DEGREE_NUMBER: Record<string, number> = {
  '1': 1,
  '#1': 1,
  'b2': 2,
  '2': 2,
  '#2': 2,
  'b3': 3,
  '3': 3,
  '#3': 3,
  'b4': 4,
  '4': 4,
  '#4': 4,
  'b5': 5,
  '5': 5,
  '#5': 5,
  'b6': 6,
  '6': 6,
  '#6': 6,
  'b7': 7,
  '7': 7,
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

/**
 * Infiere el número de octava relativo (Hooktheory: 0=C4, 1=C5, 2=C6)
 * a partir de un string de pitch como "G5", "F#5", "Eb5", "C6".
 */
export function inferOctaveFromPitch(pitch?: string, defaultOctave = 1): number {
  if (!pitch) return defaultOctave;
  const match = pitch.match(/\d+$/);
  if (match) {
    const sciOctave = parseInt(match[0], 10);
    return sciOctave - 4; // 4 -> 0 (C4), 5 -> 1 (C5), 6 -> 2 (C6)
  }
  return defaultOctave;
}

export function pitchToMidi(pitch: string): number | null {
  const noteMatch = pitch.match(/^([A-G][#b]?)(\d+)$/);
  if (!noteMatch) return null;
  const name = noteMatch[1];
  const oct = parseInt(noteMatch[2], 10);
  const semitonesMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': -1
  };
  const semi = semitonesMap[name];
  if (semi === undefined) return null;
  return (oct + 1) * 12 + semi;
}

/**
 * Fórmula exacta de Hooktheory para C Major:
 * midi = 60 + semitones + (octave * 12)
 * (octave 0: C4-B4 (60-71), octave 1: C5-B5 (72-83), octave 2: C6-B6 (84-95))
 */
export function parseTheoryNote(note: RawNote): ParsedNote {
  const sdStr = String(note.sd).trim();
  const semitones = SD_TO_SEMITONES[sdStr] ?? 0;
  const degreeNum = DIATONIC_ROW_OFFSET[sdStr]?.baseDegree ?? SD_TO_DEGREE_NUMBER[sdStr] ?? 1;

  const octave = note.octave !== undefined
    ? note.octave
    : inferOctaveFromPitch(note.pitch, 1);

  const midiFromPitch = note.pitch ? pitchToMidi(note.pitch) : null;
  const midi = midiFromPitch ?? (60 + semitones + (octave * 12));
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const name = note.pitch ?? midiToNoteName(midi);
  const isAltered = note.isAltered !== undefined
    ? note.isAltered
    : (DIATONIC_ROW_OFFSET[sdStr]?.offset !== 0 || note.striped === true || sdStr.includes('#') || sdStr.includes('b'));

  return {
    beat: note.beat,
    duration: note.duration,
    sd: sdStr,
    scaleDegree: degreeNum,
    octave,
    midi,
    freq,
    name,
    color: note.color,
    striped: isAltered,
    isAltered,
    isRest: Boolean(note.isRest),
  };
}

export function parseMelodyNotes(rawNotes: RawNote[]): ParsedNote[] {
  return rawNotes
    .filter((n) => !n.isRest)
    .map(parseTheoryNote);
}
