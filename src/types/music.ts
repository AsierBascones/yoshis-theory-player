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

export interface UniversalMelodyNote {
  id: string;
  beat: number;         // Beat de inicio (base 1)
  duration: number;     // Duración en beats (0.5, 1.0, etc.)
  sd: string;           // Grado relativo ('1', 'b3', '#4', '7')
  octaveOffset: number; // Desplazamiento de octava (0 = central C5/C4, +1 = aguda, -1 = grave)
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
  secondaryType?: "V" | "IV" | "vii°"; // Prefijo secundario
  appliedTarget?: number;              // Grado destino (1-7)
  applied?: string;                    // Grado destino en string
  borrowed?: string;                   // "phrygian", "dorian", "minor", etc.
  options?: {
    sus2?: boolean;
    sus4?: boolean;
    add9?: boolean;
    add11?: boolean;
    b5?: boolean;
    sharp5?: boolean;
    no3?: boolean;
    no5?: boolean;
  };
  notes: string[];      // Frecuencias exactas ["F#4", "A4", "C5"]
  bassNote: string;     // Nota que ejerce de bajo real según la inversión
  midiNotes?: number[];
  sublabel?: string;
  color?: string;
  isAltered?: boolean;
  _rootSemitones?: number; // Semitonos absolutos precalculados respecto a la tónica
  customSymbol?: string;
}

export interface SongSection {
  id: string;
  name: string;         // 'Intro', 'Verse', 'Chorus', 'Outro', 'All'
  key: KeySignature;    // Tonalidad local
  keys?: { beat: number; scale: string; tonic: string }[]; // Modulaciones o cambios de tonalidad
  beatsPerBar: number;  // 4
  totalBars: number;
  melody: UniversalMelodyNote[];
  chords: UniversalChord[];
}

export interface UniversalSong {
  id: string;
  title: string;
  artist: string;
  bpm: number;
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
