/**
 * midiIR.ts
 * Representación Musical Intermedia (MidiMusicalIR) para archivos MIDI estándar.
 * Totalmente desacoplada de la notación relativa de Hooktheory.
 * Preserva la temporalidad exacta en ticks, pistas, canales, eventos de tempo y métrica,
 * con soporte normativo para MIDI_INTERPRETER_SPECIFICATION_v2.1:
 * - SysEx fidelity y reconstrucción lógica independiente (Sección 11.1)
 * - Mapa de tempo normativo (modo estricto y compatibilidad) (Secciones 12.2 y 12.3)
 * - Identidad, procedencia y orden de eventos simultáneos (Sección 13.2)
 * - Tres niveles de garantías de análisis musical y abstención justificada (Secciones 16 y 23)
 */

import type { ScaleMode } from './music';

export type MidiFormat = 0 | 1;

// ────────────────────────────────────────────────────────────────────────────
// 1. Tipos de Eventos Crudos y Fidelidad de Almacenamiento SMF (Sección 13.2)
// ────────────────────────────────────────────────────────────────────────────

export type MidiEventType =
  | 'note_on'
  | 'note_off'
  | 'poly_pressure'
  | 'control_change'
  | 'program_change'
  | 'channel_pressure'
  | 'pitch_bend'
  | 'sysex_f0'
  | 'sysex_f7'
  | 'meta_tempo'
  | 'meta_time_sig'
  | 'meta_key_sig'
  | 'meta_track_name'
  | 'meta_end_of_track'
  | 'meta_other';

export interface MidiRawEventIR {
  readonly id: string; // ej: "evt_t0_o12_k480" (estable y determinista)
  readonly trackIndex: number;
  readonly orderInTrack: number; // Orden original dentro de la pista
  readonly absoluteTick: number;
  readonly deltaTime: number;
  readonly byteOffset?: number; // Posición de origen en bytes dentro del archivo
  readonly type: MidiEventType;
  readonly statusByte: number;
  readonly channel?: number;
  readonly data: Readonly<Uint8Array>;
}

export interface SimultaneousEventPolicy {
  readonly preferProgramChangeBeforeNoteOn: boolean;
  readonly preferNoteOffBeforeNoteOnSamePitch: boolean;
  readonly interTrackTieBreaker: 'trackIndex' | 'preserveUncertainty';
}

// ────────────────────────────────────────────────────────────────────────────
// 2. SysEx: Representación Original y Reconstrucción Independiente (Sección 11.1)
// ────────────────────────────────────────────────────────────────────────────

export type SysExEventType = 'F0' | 'F7';

export interface MidiSysExEventIR {
  readonly id: string;
  readonly trackIndex: number;
  readonly orderInTrack: number;
  readonly absoluteTick: number;
  readonly eventType: SysExEventType; // 'F0' o 'F7'
  readonly vlqLengthBytes: number;     // Bytes consumidos por la longitud VLQ en el archivo
  readonly declaredLength: number;     // Número de bytes declarados en el campo de longitud
  readonly payload: Readonly<Uint8Array>; // Bytes exactos del payload almacenado (sin mutaciones)
  readonly byteOffset?: number;
  readonly endsWithF7: boolean;        // Si el payload termina en 0xF7
}

export type SysExInterpretationType =
  | 'complete'      // Mensaje completo (inicia con F0 y termina en F7)
  | 'fragment'      // Fragmento inicial F0 que requiere continuación posterior
  | 'continuation'  // Evento F7 que continúa un fragmento anterior
  | 'escape'        // Evento de escape F7 independiente según SMF Spec 1.0
  | 'incomplete'    // Secuencia no terminada al alcanzar el final de la pista
  | 'invalid';      // Secuencia ambigua o no conforme

export interface SysExDiagnostic {
  readonly code:
    | 'SYSEX_UNTERMINATED_AT_EOT'
    | 'SYSEX_ORPHAN_CONTINUATION'
    | 'SYSEX_OVERLAPPING_FRAGMENTS'
    | 'SYSEX_EMPTY_PAYLOAD'
    | 'SYSEX_TRUNCATED_PAYLOAD'
    | 'SYSEX_MALFORMED_VLQ'
    | 'SYSEX_NON_COMPLIANT_ESCAPE';
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly trackIndex: number;
  readonly eventId?: string;
  readonly byteOffset?: number;
}

export interface SysExInterpretation {
  readonly type: SysExInterpretationType;
  readonly sourceEvents: ReadonlyArray<MidiSysExEventIR>;
  readonly reconstructedBytes?: Readonly<Uint8Array>; // Bytes preparados para transmisión MIDI
  readonly isTransmittable: boolean;
  readonly diagnostics: ReadonlyArray<SysExDiagnostic>;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Mapa de Tempo Normativo y Conformidad SMF (Secciones 12.2 y 12.3)
// ────────────────────────────────────────────────────────────────────────────

export interface TempoEventReference {
  readonly eventId: string;
  readonly trackIndex: number;
  readonly absoluteTick: number;
  readonly orderInTrack: number;
  readonly microsecondsPerQuarter: number; // MPQN (ej. 500000 = 120 BPM)
  readonly bpm: number;
  readonly isConforming: boolean;          // true si está en pista 0 en Formato 1
  readonly isZeroOrInvalid: boolean;       // true si microsecondsPerQuarter <= 0
  readonly byteOffset?: number;
}

export interface TempoDiagnostic {
  readonly code:
    | 'TEMPO_OUTSIDE_TRACK_0'
    | 'TEMPO_ZERO_OR_NEGATIVE'
    | 'TEMPO_SIMULTANEOUS_CONFLICT'
    | 'TEMPO_NO_EVENTS_DEFAULT_APPLIED'
    | 'TEMPO_STRICT_UNAVAILABLE';
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly trackIndex: number;
  readonly tick: number;
  readonly eventId?: string;
}

export interface TempoSegment {
  readonly startTick: number;
  readonly endTick?: number;
  readonly microsecondsPerQuarter: number;
  readonly bpm: number;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds?: number;
  readonly sourceEvents: ReadonlyArray<TempoEventReference>;
  readonly winningEvent: TempoEventReference;
  readonly resolutionMode: 'strict' | 'compatibility';
  readonly hasConflict: boolean;
}

export interface TempoMapIR {
  readonly mode: 'strict' | 'compatibility';
  readonly isValid: boolean;
  readonly segments: ReadonlyArray<TempoSegment>;
  readonly rawEvents: ReadonlyArray<TempoEventReference>;
  readonly diagnostics: ReadonlyArray<TempoDiagnostic>;
  readonly policy: string;
}

export interface TemporalConversionResult {
  readonly seconds: number;
  readonly resolutionMode: 'strict' | 'compatibility';
  readonly isExact: boolean;
  readonly segmentIndex: number;
  readonly diagnostic?: TempoDiagnostic;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Notas y Pistas Intermedias
// ────────────────────────────────────────────────────────────────────────────

export interface MidiTempoIR {
  readonly ticks: number;
  readonly bpm: number;
  readonly timeSeconds: number;
}

export interface MidiTimeSignatureIR {
  readonly ticks: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly measures?: number;
}

export interface MidiKeySignatureIR {
  readonly ticks: number;
  readonly key: string; // ej. "C", "G", "Eb", "F#", "Am", etc.
  readonly scale: 'major' | 'minor';
}

export interface MidiNoteIR {
  readonly id: string;
  readonly pitchMidi: number;       // 0..127 (preservada la altura absoluta sin colapsar a octava)
  readonly pitchClass: number;      // 0..11
  readonly octave: number;          // Altura de octava (ej. C4 = 60 -> octava 4)
  readonly startTick: number;       // Posición de inicio en ticks absolutos
  readonly durationTicks: number;   // Duración en ticks
  readonly endTick: number;         // startTick + durationTicks
  readonly startSeconds: number;    // Tiempo de inicio en segundos reales
  readonly durationSeconds: number; // Duración en segundos reales
  readonly velocity: number;        // Normalizada entre 0.0 y 1.0 (velocity/127)
  readonly trackIndex: number;      // Índice de pista origen
  readonly channel: number;         // Canal MIDI (0..15)
  readonly isPercussion?: boolean;  // true si proviene de pista o canal de percusión
  readonly startEventId?: string;   // Referencia al evento Note On de origen
  readonly endEventId?: string;     // Referencia al evento Note Off de origen
  readonly isOrphanNote?: boolean;  // true si el Note Off fue sintetizado o faltante
}

export interface MidiTrackIR {
  readonly index: number;
  readonly name: string;
  readonly channel: number;
  readonly programNumber: number;
  readonly instrumentName: string;
  readonly isPercussion: boolean;
  readonly notes: ReadonlyArray<MidiNoteIR>;
  readonly durationTicks: number;
  readonly durationSeconds: number;
}

export interface MidiHeaderIR {
  readonly format: MidiFormat;
  readonly ppq: number; // Ticks por negra (Pulses Per Quarter Note)
  readonly tempos: ReadonlyArray<MidiTempoIR>;
  readonly timeSignatures: ReadonlyArray<MidiTimeSignatureIR>;
  readonly keySignatures: ReadonlyArray<MidiKeySignatureIR>;
  readonly durationTicks: number;
  readonly durationSeconds: number;
  readonly name?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Niveles de Garantía de Análisis Musical e Inferencia (Secciones 16 y 23)
// ────────────────────────────────────────────────────────────────────────────

export type AnalysisGuaranteeLevel =
  | 'LEVEL_A_PARSING_FIDELITY'
  | 'LEVEL_B_TEMPORAL_FIDELITY'
  | 'LEVEL_C_MUSICAL_INFERENCE';

export type MusicalEvidenceLevel =
  | 'sufficient_evidence'    // Evidencia clara e inequívoca
  | 'probable'               // Resultado probable (ej. díada con contexto favorable)
  | 'plausible_alternatives' // Varias alternativas armónicas plausibles
  | 'unknown';               // Abstención justificada por información insuficiente

export interface HarmonicHypothesis {
  readonly chordSymbol: string;
  readonly romanNumeral: string;
  readonly rootPitchClass: number;
  readonly quality: string;
  readonly inversion: number;
  readonly score: number;
  readonly rationale: string;
}

export interface MusicalAnalysisResultIR {
  readonly guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE';
  readonly evidenceLevel: MusicalEvidenceLevel;
  readonly preferredHypothesis?: HarmonicHypothesis;
  readonly candidateHypotheses: ReadonlyArray<HarmonicHypothesis>;
  readonly provenance: 'inferred' | 'manual' | 'metadata';
  readonly sourceNoteIds: ReadonlyArray<string>;
  readonly startTick: number;
  readonly endTick: number;
  readonly referenceKey?: { tonic: string; scale: 'major' | 'minor' };
  readonly algorithmVersion: string;
  readonly explanation?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Tipos de la Fase 3: Análisis Tonal, Armónico y Melódico Integral
// ────────────────────────────────────────────────────────────────────────────

export interface KeyCandidate {
  readonly tonic: string;
  readonly scale: 'major' | 'minor';
  readonly confidence: number; // 0.0 .. 1.0 (correlación normalizada)
  readonly isExplicitMeta: boolean;
}

export interface KeyEstimateResult {
  readonly primaryKey: KeyCandidate;
  readonly candidateKeys: ReadonlyArray<KeyCandidate>;
  readonly isAmbiguous: boolean;
  readonly keyChanges?: ReadonlyArray<{ tick: number; key: KeyCandidate }>;
}

export interface AnalyzedHarmonicSegment {
  readonly startTick: number;
  readonly endTick: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly chordSymbol: string;
  readonly romanNumeral: string;
  readonly rootPitchClass: number;
  readonly quality: string;
  readonly type?: 5 | 7 | 9 | 11 | 13;
  readonly adds?: ReadonlyArray<number | string>;
  readonly suspensions?: ReadonlyArray<number | string>;
  readonly inversion: number;
  readonly bassPitchClass: number;
  readonly lowestMidi?: number;
  readonly isSecondary: boolean;
  readonly secondaryType?: string;
  readonly appliedTarget?: number;
  readonly isBorrowed: boolean;
  readonly borrowedMode?: string;
  readonly localKeyTonic?: string;
  readonly localKeyScale?: ScaleMode;
  readonly evidenceLevel: MusicalEvidenceLevel;
  readonly alternativeHypotheses: ReadonlyArray<HarmonicHypothesis>;
  readonly sourceNoteIds: ReadonlyArray<string>;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Tipos de Análisis Polifónico: Inferencia de Manos y Voces
// ────────────────────────────────────────────────────────────────────────────

export type HandAssignment = 'left' | 'right' | 'indeterminate';

export type MusicalVoiceRole =
  | 'bass'
  | 'accompaniment_chord'
  | 'arpeggio_support'
  | 'primary_melody'
  | 'counter_melody'
  | 'ornament'
  | 'unclassified';

export interface AnalyzedVoiceNote {
  readonly noteId: string;
  readonly hand: HandAssignment;
  readonly handConfidence: number; // 0.0 .. 1.0
  readonly handRationale: string;
  readonly voiceRole: MusicalVoiceRole;
  readonly voiceConfidence: number; // 0.0 .. 1.0
  readonly voiceRationale: string;
  readonly confidence: number; // Confianza combinada
  readonly rationale: string;
  readonly isContrapuntal?: boolean;
}

export interface VoiceAnalysisResult {
  readonly voiceNotes: Readonly<Record<string, AnalyzedVoiceNote>>;
  readonly detectedTexture:
    | 'monophonic'
    | 'homophonic'
    | 'polyphonic'
    | 'stride_ragtime'
    | 'arpeggiated'
    | 'mixed';
  readonly hasIndependentTracks: boolean;
  readonly confidence: number;
}

export interface AnalyzedMelodyNote {
  readonly id: string;
  readonly startTick: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly pitchMidi: number;
  readonly pitchClass: number;
  readonly scaleDegree: string;
  readonly octaveOffset: number;
  readonly isChordTone: boolean;
  readonly melodicRole:
    | 'chord_tone'
    | 'passing_tone'
    | 'neighbor_tone'
    | 'suspension'
    | 'unclassified';
  readonly hand?: HandAssignment;
  readonly voiceRole?: MusicalVoiceRole;
  readonly voiceConfidence?: number;
  readonly voiceRationale?: string;
}

export interface MidiFullAnalysisResult {
  readonly guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE';
  readonly keyEstimate: KeyEstimateResult;
  readonly harmonicSegments: ReadonlyArray<AnalyzedHarmonicSegment>;
  readonly melodyNotes: ReadonlyArray<AnalyzedMelodyNote>;
  readonly voiceAnalysis?: VoiceAnalysisResult;
  readonly totalBars: number;
  readonly beatsPerBar: number;
  readonly ppq: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Raíz Canónica MidiMusicalIR
// ────────────────────────────────────────────────────────────────────────────

export interface MidiMusicalIR {
  readonly header: Readonly<MidiHeaderIR>;
  readonly tracks: ReadonlyArray<MidiTrackIR>;
  readonly allNotes: ReadonlyArray<MidiNoteIR>; // Colección unificada ordenada cronológicamente
  readonly provenance: {
    readonly source: 'midi_file';
    readonly format: MidiFormat;
    readonly rawByteLength: number;
    readonly totalTracksOriginal: number;
  };
  // Campos ampliados normativos v2.1 (compatibles y opcionales para preservar contratos)
  readonly rawEvents?: ReadonlyArray<MidiRawEventIR>;
  readonly sysExEvents?: ReadonlyArray<MidiSysExEventIR>;
  readonly sysExInterpretations?: ReadonlyArray<SysExInterpretation>;
  readonly tempoMapStrict?: Readonly<TempoMapIR>;
  readonly tempoMapCompatibility?: Readonly<TempoMapIR>;
  readonly musicalAnalyses?: ReadonlyArray<MusicalAnalysisResultIR>;
  readonly voiceAnalysis?: Readonly<VoiceAnalysisResult>;
}

export type MidiParseErrorCode =
  | 'EMPTY_FILE'
  | 'TRUNCATED_HEADER'
  | 'INVALID_MAGIC_HEADER'
  | 'UNSUPPORTED_FORMAT'
  | 'CORRUPT_DATA'
  | 'PARSE_FAILURE';

export class MidiParseError extends Error {
  readonly code: MidiParseErrorCode;
  readonly details?: unknown;

  constructor(code: MidiParseErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'MidiParseError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, MidiParseError.prototype);
  }
}
