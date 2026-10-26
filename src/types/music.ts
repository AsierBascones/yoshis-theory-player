/**
 * music.ts
 * Esquema de Datos Universal de Música (Universal Music Schema).
 * Describe cualquier canción exclusivamente mediante notación relativa (sd),
 * métrica, duraciones y cualidades armónicas, desacoplado de afinaciones o implementaciones.
 */

export type ScaleMode =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'harmonic_minor'
  | 'phrygian_dominant';

export interface KeySignature {
  tonic: string;        // 'C', 'Db', 'D', 'Eb', etc.
  scale: ScaleMode;     // 'major', 'mixolydian', etc.
}

export interface KeyChange {
  beat: number;
  scale: string;
  tonic: string;
}

export interface TimeSignature {
  numerator: number;        // Numerador (ej. 4, 3, 6, 9, 12)
  denominator: number;      // Denominador (ej. 4, 8)
  startQuarter: number;     // Posición de inicio en negras canónicas (0 = inicio del compás 1)
  beat?: number;            // Posición de inicio en beat base 1 (startQuarter + 1)
  startTick?: number;       // Posición en ticks (startQuarter * 480)
}

export type MeterChange = TimeSignature;

export type MetricProvenance = 'explicit' | 'inferred' | 'fallback';
export type MetricAmbiguity = 'none' | 'low' | 'medium' | 'high' | 'ambiguous';
export type MeterType = 'simple' | 'compound' | 'irregular' | 'additive';

export interface CanonicalMeter {
  numerator: number;              // ej. 2, 3, 4, 5, 6, 7, 9, 12...
  denominator: number;            // ej. 4, 8, 2, 16...
  durationQuarters: number;       // Longitud del compás en negras canónicas: (numerator / denominator) * 4
  pulsesPerMeasure: number;       // Pulsos principales de metrónomo (ej. 6/8 -> 2 pulsos; 4/4 -> 4; 9/8 -> 3; 12/8 -> 4; 5/4 -> 5)
  pulseDurationQuarters: number;  // Duración típica de pulso (ej. 4/4 -> 1.0; 6/8 -> 1.5)
  subdivisionsPerMeasure: number; // Subdivisiones típicas (ej. 4/4 -> 8; 6/8 -> 6; 12/8 -> 12)
  type: MeterType;                // 'simple' | 'compound' | 'irregular' | 'additive'
  pulseGrouping?: number[];       // ej. [3, 2] o [2, 3] para 5/8; [3, 3] para 6/8
  startQuarter: number;           // Posición donde entra este compás (0 = inicio)
  beat: number;                   // startQuarter + 1
  startTick?: number;
  label: string;                  // "4/4", "3/4", "6/8", etc.
  provenance: MetricProvenance;   // 'explicit' | 'inferred' | 'fallback'
  ambiguity: MetricAmbiguity;     // 'none' | 'low' | 'medium' | 'high' | 'ambiguous'
  confidence: number;             // 0.0 a 1.0
  inferenceRationale?: string;    // Explicación de cómo se dedujo
}

export interface UniversalMelodyNote {
  id: string;
  beat: number;         // Beat de inicio (base 1)
  duration: number;     // Duración en beats (0.5, 1.0, etc.)
  sd: string;           // Grado relativo ('1', 'b3', '#4', '7')
  octaveOffset: number; // Desplazamiento de octava (0 = central C5/C4, +1 = aguda, -1 = grave)
}

export type UniversalNote = UniversalMelodyNote;

export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'solo'
  | 'custom';

export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'dom7'
  | 'maj7'
  | 'min7'
  | 'halfdim7'
  | 'dim7'
  | 'custom';

// ── Modelo Intermedio de Acorde (Intermediate Representation - IR) ──

export interface ChordTone {
  interval: number;       // Semitonos reales sin comprimir (ej. 14 para 9ª, 17 para 11ª, 21 para 13ª)
  degree: number;         // Función interválica: 1, 2, 3, 4, 5, 6, 7, 9, 11, 13
  alteration: number;     // Desplazamiento cromático (-1 para ♭, +1 para ♯)
  source: "root" | "structural" | "extension" | "add" | "suspension" | "alteration";
}

export interface AppliedFunction {
  appliedDegree: number;          // Grado que ejerce la función (ej. 5 para V/, 7 para vii°/)
  appliedFunctionDegree: number;  // Grado funcional aplicado (ej. 7, 5, 4, 2)
  targetDegree: number;           // Grado de destino (ej. 2 para /ii, 1 para /I)
  targetRootSemitones: number;    // Altura real de la fundamental del destino (0..11)
  targetSemitones: number;        // Compatibilidad: altura absoluta de la raíz del destino (0..11)
  appliedRootSemitones: number;   // Altura real de la fundamental del acorde aplicado (0..11)
  isTritoneSub: boolean;          // true si proviene de substitutions: ["tri"] (Δ-sub)
}

/**
 * Representación Intermedia Canónica (CanonicalChordIR)
 * Desacopla la ingestión cruda de los datos resueltos para visualización y síntesis.
 */
export interface CanonicalChordIR {
  // 1. Datos originales preservados intactos (sin pérdida ni mutación)
  readonly rawOriginal: Readonly<Record<string, unknown>>;

  // 2. Contexto tonal activo
  readonly context: {
    readonly tonic: string;               // ej. "C", "A", "Eb"
    readonly tonicPitchClass: number;     // 0..11
    readonly scaleMode: ScaleMode;        // "major", "minor", "dorian", etc.
    readonly activeBeat: number;          // Beat de inicio en la línea de tiempo
  };

  // 3. Identidad armónica y grados
  readonly identity: {
    readonly rootPitchClass: number;      // Clase de altura de la fundamental (0..11)
    readonly rootName: string;            // Nombre enarmónico de la fundamental ("C", "F#", "Eb")
    readonly degreeIndex: number;         // Grado diatónico respecto a la tónica (1..7)
    readonly degreeScaleDegree: string;   // Grado con alteración relativa ("1", "b3", "#4")
    readonly chordQuality: ChordQuality;  // "maj" | "min" | "dim" | "aug" | "dom7" | "maj7" | "min7" | "halfdim7" | "dim7"
    readonly baseType: 5 | 7 | 9 | 11 | 13;
  };

  // 4. Modulación secundaria o préstamo modal
  readonly secondary: {
    readonly isApplied: boolean;
    readonly appliedFunctionDegree?: number; // 5 para V/, 7 para vii°/, etc.
    readonly targetDegree?: number;          // Grado destino (1..7)
    readonly targetPitchClass?: number;      // 0..11
    readonly isTritoneSub: boolean;          // Sustitución tritonal
    readonly borrowedMode?: string;          // Modo de préstamo ("minor", "phrygian", etc.)
  };

  // 5. Colección completa de factores armónicos teóricos
  readonly tones: ReadonlyArray<ChordTone>;

  // 6. Bajo e inversión
  readonly bassAndInversion: {
    readonly requestedInversion: number; // 0, 1, 2, 3
    readonly validatedInversion: number; // Inversión realizable según las voces disponibles
    readonly bassPitchClass: number;     // 0..11
    readonly bassName: string;           // "C", "E", "Bb", "F#"
    readonly isAmbiguous: boolean;       // Si la nota de la inversión estaba omitida
  };

  // 7. Salidas resueltas para presentación y síntesis
  readonly outputs: {
    readonly effectivePitches: number[]; // [0..11] únicos normalizados (para Canvas)
    readonly audioVoicingMidi: number[]; // Notas MIDI con registro exacto (para Sampler)
    readonly romanNumeral: string;       // "I⁶", "vii°⁷/ii", "bIII⁷", "V⁷/V"
    readonly chordSymbol: string;        // "C/E", "A#°7", "Eb7", "G7"
    readonly sublabel: string;           // "(phr)", "(m)", "(Δ-sub)", ""
    readonly functionalLabels: Array<{   // Etiquetas deterministas para PianoRoll
      readonly midi: number;
      readonly label: string;            // '1', '3', '5', 'b7', 'b9', 'Bass'
      readonly voiceNumber: string;
    }>;
  };
}

export interface IntermediateChordModel {
  // Contexto tonal
  tonicSemitones: number;
  scaleContext: string;           // major, dorian, phrygian, etc.
  degreeIndex: number;            // 1..7

  // Raíz y función secundaria
  rootSemitones: number;          // Altura absoluta de la raíz del acorde (0..11)
  bassSemitones: number;          // Altura absoluta de la nota del bajo del acorde (0..11)
  rootName: string;
  applied: AppliedFunction | null;
  appliedFunctionDegree?: number;
  targetDegree?: number;
  targetRootSemitones?: number;
  appliedRootSemitones?: number;

  // Voces funcionales y sonoras
  tones: ChordTone[];             // Colección funcional completa (conserva intervalos > 12)
  effectivePitches: number[];     // Clases de altura [0..11] normalizadas y deduplicadas (para Canvas)
  audioVoicingMidi: number[];     // Notas MIDI completas con octavas/registros (para WebAudio)
  addedIntervals: number[];       // Intervalos de extensiones y notas añadidas (ej. [9, 11, 13, 6])

  // Bajo e Inversión
  requestedInversion: number;     // Inversión original del JSON (0, 1, 2, 3)
  validatedInversion: number;     // Inversión realizable según las voces disponibles
  resolvedInversion: number;      // Inversión resuelta (alias formal de validatedInversion)
  bassTone: ChordTone;            // Voz resuelta para el bajo (o adaptada deterministamente si es ambigua)
  bassName: string;               // Nombre enarmónico del bajo
  isAmbiguousInversion: boolean;  // Flag si la inversión original carece de voz (ej. inv 1 con no3)

  // Metadatos para formateadores
  chordQuality: ChordQuality;
  type: 5 | 7 | 9 | 11 | 13;
  borrowedMode: string | null;
  useFlats?: boolean;
  omits: number[];
  suspensions: number[];
  adds: number[];
  alterations: string[];

  // Referencia canónica opcional
  canonical?: CanonicalChordIR;
}

export interface UniversalChord {
  id: string;
  beat: number;
  duration: number;
  roman: string;        // "I⁶", "vii°/V", "bIII⁷", "ii⁴₃", "V⁷sus4"
  symbol: string;       // "C/E", "f#°", "Eb7", "dm7/A", "G7sus4"
  rootSd: string;       // Grado de la fundamental relativa ("1", "b3", "4", "#4")
  quality: "maj" | "min" | "dim" | "aug" | "dom7" | "maj7" | "min7" | "halfdim7" | "dim7";
  type: 5 | 7 | 9 | 11 | 13;
  inversion: 0 | 1 | 2 | 3;
  secondaryType?: "V" | "IV" | "vii°" | "ii"; // Prefijo secundario
  appliedTarget?: number;              // Grado destino (1-7)
  applied?: string;                    // Grado de función aplicada en string (ej. "7", "5", "4", "2")
  appliedFunctionDegree?: number;      // Grado funcional aplicado (7, 5, 4, 2)
  targetDegree?: number;               // Grado destino (1-7)
  targetRootSemitones?: number;        // Altura real de la fundamental del destino (0..11)
  appliedRootSemitones?: number;       // Altura real de la fundamental del acorde aplicado (0..11)
  borrowed?: string;                   // "phrygian", "dorian", "minor", etc.
  alterations?: string[];              // ["#5", "b5", etc.]
  adds?: (number | string)[];          // [9, 11, etc.]
  omits?: (number | string)[];         // [3, 5, etc.]
  suspensions?: (number | string)[];   // [2], [4], [2, 4], ["sus2", "sus4"]
  suspension?: string | number;        // "sus2" | "sus4" | 2 | 4
  substitutions?: string[];            // ["tri"]
  options?: {
    sus2?: boolean;
    sus4?: boolean;
    sus2sus4?: boolean;
    suspensions?: (number | string)[];
    substitutions?: string[];
    tri?: boolean;
    add9?: boolean;
    add11?: boolean;
    flat9?: boolean;
    b9?: boolean;
    b5?: boolean;
    sharp5?: boolean;
    sharp9?: boolean;
    no3?: boolean;
    no5?: boolean;
    six?: boolean;
    omits?: (number | string)[];
  };
  notes: string[];      // Frecuencias exactas ["F#4", "A4", "C5"]
  bassNote: string;     // Nota que ejerce de bajo real según la inversión
  midiNotes?: number[];
  voices?: ResolvedChordVoice[];
  sublabel?: string;
  color?: string;
  isAltered?: boolean;
  _rootSemitones?: number; // Semitonos absolutos precalculados respecto a la tónica
  bassSemitones?: number;  // Semitonos absolutos del bajo (0..11)
  resolvedInversion?: number;
  addedIntervals?: number[];
  customSymbol?: string;
  ir?: CanonicalChordIR;
  model?: IntermediateChordModel;
}

export interface SongSection {
  id: string;
  name: string;         // 'Intro', 'Verse', 'Chorus', 'Outro', 'All'
  type?: SectionType;
  meter?: { beats: number; beatUnit: number };
  timeSignature?: [number, number];
  canonicalMeter?: CanonicalMeter;
  meters?: MeterChange[]; // Cambios de compás a lo largo de la sección
  hasExplicitMeters?: boolean; // Flag si el archivo contenía información métrica explícita
  bpm?: number;
  key: KeySignature;    // Tonalidad local
  keys?: KeyChange[];   // Modulaciones o cambios de tonalidad
  beatsPerBar: number;  // 4, 3, etc.
  totalBars: number;
  totalMeasures?: number;
  melody: UniversalMelodyNote[];
  notes?: UniversalMelodyNote[];
  chords: UniversalChord[];
}

export interface SongProject {
  title: string;
  artist?: string;
  activeSectionId: string;
  sections: SongSection[];
}

export interface UniversalSong {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  timeSignature?: [number, number];
  canonicalMeter?: CanonicalMeter;
  meters?: MeterChange[];
  defaultSwing: {
    enabled: boolean;
    percentage: number;
    subdivision: '8n' | '16n';
  };
  globalKey: KeySignature;
  sections: SongSection[];
}

// ── Tipos Resueltos en Tiempo Real para Renderizado y Síntesis ──

export interface ResolvedMelodyNote {
  id: string;
  beat: number;
  duration: number;
  visualBeat: number;
  visualDuration: number;
  sd: string;
  octaveOffset: number;
  midi: number;
  pitch: string;
  color: string;
  isAltered: boolean;
}

export interface ResolvedChordVoice {
  midi: number;
  pitch: string;
  label: string;
  noteLabel: string;
  sd: string;
  color: string;
  isAltered: boolean;
  isBass?: boolean;
  voiceNumber?: string;
}

export interface ResolvedChord {
  id: string;
  beat: number;
  duration: number;
  roman: string;
  symbol: string;
  rootMidi: number;
  voices: ResolvedChordVoice[];
  midiNotes: number[];
  notes: string[];
  color: string;
  isAltered: boolean;
}
