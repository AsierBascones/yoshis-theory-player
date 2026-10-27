/**
 * midiHooktheoryAdapter.ts
 * Capa D: Adaptador Hooktheory e integración con la representación musical de la aplicación.
 *
 * Transforma el resultado de análisis tonal y armónico (MidiFullAnalysisResult) y la IR
 * (MidiMusicalIR) en estructuras canónicas de la aplicación:
 * - UniversalSong
 * - SongSection
 * - UniversalChord (conforme a CanonicalChordIR y reglas de bajo efectivo)
 * - UniversalMelodyNote (preservando pitch MIDI, octavas y rol melódico contextual)
 *
 * Normativa:
 * - Reutiliza theoryEngine.ts para todas las reglas armónicas sin duplicar lógica.
 * - Distingue fundamental del bajo efectivo y aplica color por bajo efectivo.
 * - Respeta dominantes secundarias (V/ii vs ii/V) y préstamos modales.
 * - Marca procedencia inferida e hipótesis alternativas cuando existen.
 * - Maneja abstención justificada (unknown) sin forzar acordes artificiales.
 */

import type {
  MidiFullAnalysisResult,
  MidiMusicalIR,
  AnalyzedHarmonicSegment,
  AnalyzedMelodyNote,
} from '../../types/midiIR';
import type {
  UniversalSong,
  SongSection,
  UniversalChord,
  UniversalMelodyNote,
  ScaleMode,
  KeySignature,
} from '../../types/music';
import { parseHookpadChord, NOTE_TO_PC } from '../theoryEngine';

export interface AdapterSongOptions {
  title?: string;
  artist?: string;
  referenceKeyTonic?: string;
  referenceKeyScale?: ScaleMode;
}

const DEGREE_MAP_MAJOR: Record<number, string> = {
  0: '1', 1: '#1', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_MAP_MINOR: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

/**
 * Convierte un segmento armónico inferido en un UniversalChord canónico de Hooktheory.
 */
export function convertMidiHarmonicSegmentToUniversalChord(
  seg: AnalyzedHarmonicSegment,
  keyTonic: string,
  keyScale: ScaleMode
): UniversalChord {
  // Manejo de abstención justificada (unknown) ante ventanas vacías o atonalidad
  if (seg.evidenceLevel === 'unknown') {
    return {
      id: `c_${seg.startBeat}`,
      beat: seg.startBeat,
      duration: seg.durationBeats,
      roman: '?',
      symbol: '?',
      root: keyTonic,
      rootSd: '1',
      quality: 'maj',
      type: 5,
      inversion: 0,
      bassNote: keyTonic,
      notes: [`${keyTonic}3`],
      isAltered: false,
      color: '#6B7280', // Gris neutro para acorde no determinado
      // Metadatos de inferencia y trazabilidad
      ...({
        inferred: true,
        evidenceLevel: 'unknown',
        alternativeHypotheses: seg.alternativeHypotheses || [],
        sourceNoteIds: seg.sourceNoteIds || [],
      } as any),
    };
  }

  // Mapeo a formato de entrada para parseHookpadChord considerando tonalidad local o global
  const effTonic = seg.localKeyTonic || keyTonic;
  const effScale = seg.localKeyScale || keyScale;
  const tonicPc = NOTE_TO_PC[effTonic] ?? 0;
  const semitonesFromTonic = (seg.rootPitchClass - tonicPc + 12) % 12;
  const degreeMap = effScale === 'minor' ? DEGREE_MAP_MINOR : DEGREE_MAP_MAJOR;
  const rootSd = degreeMap[semitonesFromTonic] || '1';

  const rawInput: any = {
    id: `c_${seg.startBeat}`,
    beat: seg.startBeat,
    duration: seg.durationBeats,
    root: rootSd,
    rootSd,
    quality: seg.quality,
    type: seg.type ?? (seg.quality.includes('7') ? 7 : 5),
    adds: seg.adds ? [...seg.adds] : undefined,
    suspensions: seg.suspensions ? [...seg.suspensions] : undefined,
    inversion: seg.inversion as 0 | 1 | 2 | 3,
    secondaryType: seg.secondaryType,
    appliedTarget: seg.appliedTarget,
    targetDegree: seg.appliedTarget,
    applied: seg.appliedTarget !== undefined ? String(seg.appliedTarget) : undefined,
    borrowed: seg.borrowedMode,
  };

  // Delegar en el motor canónico de teoría musical existente con la tonalidad efectiva
  const canonicalChord = parseHookpadChord(rawInput, effTonic, effScale);

  // Enriquecer con metadatos de trazabilidad y garantías
  return {
    ...canonicalChord,
    // Metadatos de procedencia e inferencia
    ...({
      inferred: true,
      evidenceLevel: seg.evidenceLevel,
      alternativeHypotheses: seg.alternativeHypotheses || [],
      sourceNoteIds: seg.sourceNoteIds || [],
    } as any),
  };
}

/**
 * Convierte una nota melódica analizada en una UniversalMelodyNote de Hooktheory.
 */
export function convertMidiMelodyNoteToUniversalNote(
  note: AnalyzedMelodyNote
): UniversalMelodyNote {
  return {
    id: note.id,
    beat: note.startBeat,
    duration: note.durationBeats,
    sd: note.scaleDegree,
    octaveOffset: note.octaveOffset,
    // Atributos extendidos no destructivos (preservan pitch original y clasificación de voces)
    pitchMidi: note.pitchMidi,
    isChordTone: note.isChordTone,
    melodicRole: note.melodicRole,
    hand: note.hand,
    voiceRole: note.voiceRole,
    voiceConfidence: note.voiceConfidence,
    voiceRationale: note.voiceRationale,
  };
}

/**
 * Transforma el análisis musical integral (MidiFullAnalysisResult) y la IR binaria
 * en una estructura UniversalSong completamente compatible con el reproductor y editor.
 */
export function convertMidiAnalysisToUniversalSong(
  analysis: MidiFullAnalysisResult,
  ir: MidiMusicalIR,
  options?: AdapterSongOptions
): UniversalSong {
  const primaryKey = analysis.keyEstimate.primaryKey;
  const keyTonic = options?.referenceKeyTonic || primaryKey.tonic || 'C';
  const keyScale = (options?.referenceKeyScale || primaryKey.scale || 'major') as ScaleMode;

  const globalKey: KeySignature = {
    tonic: keyTonic,
    scale: keyScale,
  };

  // Mapear modulaciones o cambios de tonalidad si fueron detectados en la IR
  const keyChanges = (analysis.keyEstimate.keyChanges || []).map((kc) => ({
    beat: 1 + kc.tick / analysis.ppq,
    tonic: kc.key.tonic,
    scale: kc.key.scale as ScaleMode,
  }));

  const keys = keyChanges.length > 0 ? keyChanges : [{ beat: 1, tonic: keyTonic, scale: keyScale }];

  // Extraer tempo inicial del mapa de tempo o header
  const initialStrictBpm = ir.tempoMapStrict?.segments[0]?.bpm;
  const isStrictDefault = Boolean(ir.tempoMapStrict?.policy?.includes('default_applied'));
  const compatBpm = ir.tempoMapCompatibility?.segments[0]?.bpm;
  const headerBpm = ir.header.tempos[0]?.bpm;
  const bpm = (!isStrictDefault && initialStrictBpm)
    ? initialStrictBpm
    : (compatBpm || headerBpm || initialStrictBpm || 120);

  // Mapear métricas y cambios de compás reales declarados en la cabecera
  const rawTimeSigs = ir.header.timeSignatures || [];
  const primaryTimeSig: [number, number] = rawTimeSigs.length > 0
    ? [rawTimeSigs[0].numerator, rawTimeSigs[0].denominator]
    : [analysis.beatsPerBar, 4];

  const meters = rawTimeSigs.map((ts) => ({
    numerator: ts.numerator,
    denominator: ts.denominator,
    startQuarter: ts.ticks / analysis.ppq,
    beat: 1 + ts.ticks / analysis.ppq,
    startTick: ts.ticks,
  }));

  // Convertir melodía
  const melodyNotes: UniversalMelodyNote[] = analysis.melodyNotes.map(
    convertMidiMelodyNoteToUniversalNote
  );

  // Convertir acordes armónicos
  const chords: UniversalChord[] = analysis.harmonicSegments.map((seg) =>
    convertMidiHarmonicSegmentToUniversalChord(seg, keyTonic, keyScale)
  );

  // Calcular compases finales garantizando que no se corte contenido
  const primaryBarDurationQuarters = (primaryTimeSig[0] / primaryTimeSig[1]) * 4;
  const lastMelodyEnd = melodyNotes.reduce((max, n) => Math.max(max, n.beat + n.duration), 1);
  const lastChordEnd = chords.reduce((max, c) => Math.max(max, c.beat + c.duration), 1);
  const absoluteEndBeat = Math.max(lastMelodyEnd, lastChordEnd);
  const calculatedBars = Math.max(1, Math.ceil((absoluteEndBeat - 1) / primaryBarDurationQuarters));
  const finalTotalBars = Math.max(analysis.totalBars, calculatedBars);

  const section: SongSection = {
    id: 'main',
    name: 'Full Song',
    key: globalKey,
    keys,
    meters: meters.length > 0 ? meters : undefined,
    hasExplicitMeters: meters.length > 0,
    timeSignature: primaryTimeSig,
    bpm: Math.round(bpm),
    beatsPerBar: primaryTimeSig[0],
    totalBars: finalTotalBars,
    totalMeasures: finalTotalBars,
    melody: melodyNotes,
    chords,
  };

  const songTitle = options?.title || ir.header.name || 'Imported MIDI';
  const artistName = options?.artist || 'MIDI Import';

  return {
    id: `midi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: songTitle,
    artist: artistName,
    bpm: Math.round(bpm),
    timeSignature: primaryTimeSig,
    meters: meters.length > 0 ? meters : undefined,
    defaultSwing: { enabled: false, percentage: 50, subdivision: '8n' },
    globalKey,
    sections: [section],
    // Conserva la IR intermedia original para trazabilidad completa e inmutabilidad
    ...({
      rawMidiIR: ir,
      midiFullAnalysis: analysis,
      voiceAnalysis: analysis.voiceAnalysis,
    } as any),
  };
}
