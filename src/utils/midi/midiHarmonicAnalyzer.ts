/**
 * midiHarmonicAnalyzer.ts
 * Analizador armónico y melódico integral para la Fase 3 de MIDI Hooktheory Engine.
 * Transforma MidiMusicalIR en análisis armónico estructurado:
 * - Segmentación armónica adaptativa respetando fronteras de compás.
 * - Reconocimiento de fundamentales, bajos, inversiones, funciones secundarias y préstamos modales.
 * - Análisis melódico contextual: distingue notas de acorde frente a notas de paso y bordaduras.
 * - Genera MidiFullAnalysisResult con trazabilidad de procedencia e hipótesis alternativas.
 */

import type {
  MidiMusicalIR,
  MidiNoteIR,
  MidiFullAnalysisResult,
  AnalyzedHarmonicSegment,
  AnalyzedMelodyNote,
  MusicalEvidenceLevel,
  HarmonicHypothesis,
  AnalyzedVoiceNote,
} from '../../types/midiIR';
import type { ScaleMode } from '../../types/music';
import { estimateKeyCandidates } from './midiTonalAnalyzer';
import { recognizeChordFromMidiNotes } from '../midiImporter';
import { parseHookpadChord, NOTE_TO_PC } from '../theoryEngine';
import { classifyMidiVoices } from './midiVoiceClassifier';

const DEGREE_MAP_MAJOR: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_MAP_MINOR: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

export interface HarmonicAnalysisOptions {
  referenceKeyTonic?: string;
  referenceKeyScale?: ScaleMode;
  melodyTrackIndex?: number;
  harmonyResolutionBeats?: 2 | 4;
}

/**
 * Realiza el análisis tonal, armónico y melódico completo sobre una estructura MidiMusicalIR.
 */
export function analyzeMidiMusicalIR(
  ir: MidiMusicalIR,
  options?: HarmonicAnalysisOptions
): MidiFullAnalysisResult {
  const ppq = ir.header.ppq || 480;

  // 0. Inferencia no destructiva de voces, manos y texturas de acompañamiento
  const voiceAnalysis = classifyMidiVoices(ir);
  const voiceNotes = voiceAnalysis.voiceNotes;

  // 1. Estimación tonal o adopción de tonalidad de referencia explícita
  const keyEstimation = estimateKeyCandidates(ir);
  const keyTonic = options?.referenceKeyTonic || keyEstimation.primaryKey.tonic;
  const keyScale = options?.referenceKeyScale || keyEstimation.primaryKey.scale;
  const tonicPc = NOTE_TO_PC[keyTonic] ?? 0;
  const degreeMap = keyScale === 'minor' ? DEGREE_MAP_MINOR : DEGREE_MAP_MAJOR;

  // 2. Métrica, compás dinámico y línea temporal
  const timeSigs = ir.header.timeSignatures.length > 0
    ? [...ir.header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
    : [{ ticks: 0, numerator: 4, denominator: 4 }];

  const totalTicks = ir.header.durationTicks || 0;
  const resolutionBeats = options?.harmonyResolutionBeats || 2;

  // Construcción de la cuadrícula de compases respetando cambios de métrica dinámicos
  interface BarInfo {
    barIndex: number;
    startTick: number;
    endTick: number;
    durationTicks: number;
    startBeat: number;
    durationBeats: number;
    numerator: number;
    denominator: number;
  }

  const bars: BarInfo[] = [];
  let curTick = 0;
  let curBeat = 1;
  let bIdx = 0;

  const getTimeSigAtTick = (tick: number) => {
    let active = timeSigs[0];
    for (const ts of timeSigs) {
      if (ts.ticks <= tick) {
        active = ts;
      } else {
        break;
      }
    }
    return active;
  };

  const getKeyAtTick = (tick: number) => {
    if (!keyEstimation.keyChanges || keyEstimation.keyChanges.length === 0) {
      return { tonic: keyTonic, scale: keyScale };
    }
    let activeKey = { tonic: keyTonic, scale: keyScale };
    for (const kc of keyEstimation.keyChanges) {
      if (kc.tick <= tick) {
        activeKey = { tonic: kc.key.tonic, scale: (kc.key.scale === 'minor' ? 'minor' : 'major') as ScaleMode };
      } else {
        break;
      }
    }
    return activeKey;
  };

  const maxTicks = Math.max(totalTicks, 1);
  while (curTick < maxTicks || bIdx === 0) {
    const ts = getTimeSigAtTick(curTick);
    const num = ts.numerator || 4;
    const den = ts.denominator || 4;
    // Duración exacta del compás en negras canónicas (1 negra canónica = ppq ticks)
    const barDurationQuarters = (num / den) * 4;
    const barDurationTicks = Math.round(barDurationQuarters * ppq);

    bars.push({
      barIndex: bIdx,
      startTick: curTick,
      endTick: curTick + barDurationTicks,
      durationTicks: barDurationTicks,
      startBeat: curBeat,
      durationBeats: barDurationQuarters,
      numerator: num,
      denominator: den,
    });

    curTick += barDurationTicks;
    curBeat += barDurationQuarters;
    bIdx++;
    if (bIdx > 10000) break; // Salvaguarda contra bucles infinitos
  }

  const totalBars = bars.length;
  const beatsPerBar = bars[0]?.numerator || 4;

  // 3. Separación de melodía y acompañamiento
  let melodyNotesRaw: MidiNoteIR[] = [];
  let accompanimentNotesRaw: MidiNoteIR[] = [];

  let melodyIdx = options?.melodyTrackIndex ?? -1;
  const melodicTracks = ir.tracks.filter((t) => !t.isPercussion && t.notes.length > 0);

  // Si no se especificó pista melódica y hay >= 2 pistas, autodetectar la más aguda como Lead
  if (melodyIdx < 0 && melodicTracks.length >= 2) {
    const sorted = [...melodicTracks].sort((a, b) => {
      const avgA = a.notes.reduce((s, n) => s + n.pitchMidi, 0) / a.notes.length;
      const avgB = b.notes.reduce((s, n) => s + n.pitchMidi, 0) / b.notes.length;
      return avgB - avgA;
    });
    melodyIdx = sorted[0].index;
  }

  if (melodyIdx >= 0 && ir.tracks[melodyIdx]) {
    melodyNotesRaw = [...ir.tracks[melodyIdx].notes];
    for (const t of ir.tracks) {
      if (t.index !== melodyIdx && !t.isPercussion) {
        accompanimentNotesRaw.push(...t.notes);
      }
    }
  } else if (ir.tracks.length >= 2) {
    // Fallback auto
    if (melodicTracks.length >= 2) {
      const sorted = [...melodicTracks].sort((a, b) => {
        const avgA = a.notes.reduce((s, n) => s + n.pitchMidi, 0) / a.notes.length;
        const avgB = b.notes.reduce((s, n) => s + n.pitchMidi, 0) / b.notes.length;
        return avgB - avgA;
      });
      melodyNotesRaw = [...sorted[0].notes];
      for (let i = 1; i < sorted.length; i++) {
        accompanimentNotesRaw.push(...sorted[i].notes);
      }
    } else if (melodicTracks.length === 1) {
      // Pista única: conservar todas las notas en la melodía del Piano Roll sin descartar ninguna
      melodyNotesRaw = [...melodicTracks[0].notes];
      accompanimentNotesRaw = [...melodicTracks[0].notes];
    }
  } else {
    // 1 sola pista total: conservar todas las notas en el Piano Roll
    melodyNotesRaw = ir.allNotes.filter((n) => !n.isPercussion);
    accompanimentNotesRaw = [...melodyNotesRaw];
  }

  // Colección de notas que informan el análisis armónico:
  // Se excluyen estrictamente notas de percusión. Si se especificó o autodetectó una pista
  // de melodía en un archivo multitrack (melodicTracks.length > 1) y hay pistas de acompañamiento,
  // se usa accompanimentNotesRaw. En piano solo o pista única, se usan todas las notas tonales.
  const isMultiTrackSeparated = melodyIdx >= 0 && melodicTracks.length > 1;
  const harmonicNotesPool = (
    isMultiTrackSeparated && accompanimentNotesRaw.length > 0
      ? accompanimentNotesRaw
      : ir.allNotes
  ).filter((n) => !n.isPercussion);

  // 4. Segmentación y Reconocimiento Armónico por Compás Dinámico
  const harmonicSegments: AnalyzedHarmonicSegment[] = [];

  for (const bar of bars) {
    const barKey = getKeyAtTick(bar.startTick);
    const localTonic = options?.referenceKeyTonic || barKey.tonic;
    const localScale = options?.referenceKeyScale || barKey.scale;

    if ((resolutionBeats === 2 && bar.numerator === 4 && bar.denominator === 4) ||
        (resolutionBeats === 2 && bar.numerator === 2 && bar.denominator === 2)) {
      // Compás completo
      const fullBarSeg = analyzeSegmentWindow(
        harmonicNotesPool,
        bar.startTick,
        bar.endTick,
        bar.startBeat,
        bar.durationBeats,
        localTonic,
        localScale,
        ppq,
        undefined,
        ir.allNotes,
        voiceNotes
      );

      // Medio compás
      const barDurTicks = bar.durationTicks ?? (bar.endTick - bar.startTick);
      const halfTicks = Math.round(barDurTicks / 2);
      const half1Start = bar.startTick;
      const half1End = bar.startTick + halfTicks;
      const half2Start = half1End;
      const half2End = bar.endTick;
      const halfDurationBeats = bar.durationBeats / 2;

      const seg1 = analyzeSegmentWindow(
        harmonicNotesPool,
        half1Start,
        half1End,
        bar.startBeat,
        halfDurationBeats,
        localTonic,
        localScale,
        ppq,
        undefined,
        ir.allNotes,
        voiceNotes
      );
      const seg2 = analyzeSegmentWindow(
        harmonicNotesPool,
        half2Start,
        half2End,
        bar.startBeat + halfDurationBeats,
        halfDurationBeats,
        localTonic,
        localScale,
        ppq,
        {
          previousBassMidi: seg1.lowestMidi,
          previousBassPc: seg1.bassPitchClass,
          previousRootPc: seg1.rootPitchClass,
          previousInversion: seg1.inversion,
          barPrimaryRootPc: seg1.rootPitchClass,
          barPrimaryInversion: seg1.inversion,
        },
        ir.allNotes,
        voiceNotes
      );

      // Decisión adaptativa de Fusión vs. Separación mediante función objetivo
      const shouldMerge = evaluateAdaptiveSegmentation(
        fullBarSeg,
        seg1,
        seg2,
        harmonicNotesPool,
        ir.allNotes,
        bar
      );

      if (shouldMerge) {
        harmonicSegments.push({
          ...fullBarSeg,
          localKeyTonic: localTonic,
          localKeyScale: localScale,
        });
      } else {
        harmonicSegments.push({ ...seg1, localKeyTonic: localTonic, localKeyScale: localScale });
        harmonicSegments.push({ ...seg2, localKeyTonic: localTonic, localKeyScale: localScale });
      }
    } else {
      // Compás completo adaptado a métricas 3/4, 6/8, 5/8 o resolución global
      const seg = analyzeSegmentWindow(
        harmonicNotesPool,
        bar.startTick,
        bar.endTick,
        bar.startBeat,
        bar.durationBeats,
        localTonic,
        localScale,
        ppq,
        undefined,
        ir.allNotes,
        voiceNotes
      );
      harmonicSegments.push({ ...seg, localKeyTonic: localTonic, localKeyScale: localScale });
    }
  }

  // 5. Análisis Melódico Contextual (Notas de acorde vs Notas de paso / bordaduras)
  const analyzedMelody: AnalyzedMelodyNote[] = melodyNotesRaw.map((n, idx) => {
    // Conversión canónica exacta de ticks a beats (1 beat = 1 negra canónica = ppq ticks)
    // Se preserva la resolución rítmica real sin forzar cuantizaciones destructivas a 0.25
    const startBeat = Math.round((1 + n.startTick / ppq) * 10000) / 10000;
    const durationBeats = Math.max(0.0625, Math.round((n.durationTicks / ppq) * 10000) / 10000);
    const semitonesAboveTonic = (n.pitchClass - tonicPc + 12) % 12;
    const scaleDegree = degreeMap[semitonesAboveTonic] || '1';
    const tonicBaseMidi = 72 + tonicPc;
    const octaveOffset = Math.floor((n.pitchMidi - tonicBaseMidi) / 12);

    // Buscar segmento armónico activo en este tick
    const activeSeg = harmonicSegments.find(
      (s) => n.startTick >= s.startTick && n.startTick < s.endTick
    );

    // Obtener las clases de altura del acorde activo
    const chordPcs = activeSeg ? getChordPitchClasses(activeSeg.rootPitchClass, activeSeg.quality) : [tonicPc];
    const isChordTone = chordPcs.includes(n.pitchClass);

    // Clasificación melódica contextual
    let melodicRole: AnalyzedMelodyNote['melodicRole'] = 'unclassified';
    if (isChordTone) {
      melodicRole = 'chord_tone';
    } else {
      const prevNote = melodyNotesRaw[idx - 1];
      const nextNote = melodyNotesRaw[idx + 1];

      if (prevNote && nextNote) {
        const stepFromPrev = Math.abs(n.pitchMidi - prevNote.pitchMidi);
        const stepToNext = Math.abs(nextNote.pitchMidi - n.pitchMidi);

        if (stepFromPrev <= 2 && stepToNext <= 2) {
          // Movimiento conjunto
          if (
            (n.pitchMidi > prevNote.pitchMidi && nextNote.pitchMidi > n.pitchMidi) ||
            (n.pitchMidi < prevNote.pitchMidi && nextNote.pitchMidi < n.pitchMidi)
          ) {
            melodicRole = 'passing_tone'; // Nota de paso (misma dirección)
          } else if (prevNote.pitchMidi === nextNote.pitchMidi) {
            melodicRole = 'neighbor_tone'; // Bordadura (regresa a la nota original)
          }
        }
      } else {
        melodicRole = 'passing_tone';
      }
    }

    const vNote = voiceNotes[n.id];

    return {
      id: n.id,
      startTick: n.startTick,
      startBeat,
      durationBeats,
      pitchMidi: n.pitchMidi,
      pitchClass: n.pitchClass,
      scaleDegree,
      octaveOffset,
      isChordTone,
      melodicRole,
      hand: vNote?.hand ?? 'indeterminate',
      voiceRole: vNote?.voiceRole ?? 'unclassified',
      voiceConfidence: vNote?.confidence ?? 0.5,
      voiceRationale: vNote?.rationale,
    };
  });

  return {
    guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE',
    keyEstimate: keyEstimation,
    harmonicSegments,
    melodyNotes: analyzedMelody,
    voiceAnalysis,
    totalBars,
    beatsPerBar,
    ppq,
  };
}

interface SegmentAnalysisContext {
  previousBassMidi?: number;
  previousBassPc?: number;
  previousRootPc?: number;
  previousInversion?: number;
  barPrimaryRootPc?: number;
  barPrimaryInversion?: number;
}

/**
 * Separa de forma polifónica la voz superior (melodía) de las voces de acompañamiento
 * en piezas de piano solo o pista única, evitando cortes rígidos por número fijo de pitch.
 */
function extractTopVoiceAndAccompaniment(notes: ReadonlyArray<MidiNoteIR>): {
  melodyNotes: MidiNoteIR[];
  accompanimentNotes: MidiNoteIR[];
} {
  const tonalNotes = notes.filter((n) => !n.isPercussion);
  if (tonalNotes.length === 0) return { melodyNotes: [], accompanimentNotes: [] };

  const sorted = [...tonalNotes].sort((a, b) => a.startTick - b.startTick || b.pitchMidi - a.pitchMidi);
  const melodyNotes: MidiNoteIR[] = [];
  const accompanimentNotes: MidiNoteIR[] = [];

  let i = 0;
  while (i < sorted.length) {
    const curTick = sorted[i].startTick;
    const cluster: MidiNoteIR[] = [];
    while (i < sorted.length && Math.abs(sorted[i].startTick - curTick) <= 20) {
      cluster.push(sorted[i]);
      i++;
    }
    cluster.sort((a, b) => b.pitchMidi - a.pitchMidi);
    melodyNotes.push(cluster[0]);
    for (let c = 1; c < cluster.length; c++) {
      accompanimentNotes.push(cluster[c]);
    }
  }

  return { melodyNotes, accompanimentNotes };
}

/**
 * Función objetivo de segmentación armónica adaptativa:
 * Evalúa parsimonia, estabilidad y continuidad armónica entre el compás completo y sus subventanas.
 * FUSIONA si representan la misma armonía (incluido bajo alternante C-G o arpegios).
 * SEPARA si existe un cambio armónico real con evidencia estructural sólida (ej. ii -> V).
 */
function evaluateAdaptiveSegmentation(
  full: AnalyzedHarmonicSegment,
  half1: AnalyzedHarmonicSegment,
  half2: AnalyzedHarmonicSegment,
  pool: ReadonlyArray<MidiNoteIR>,
  allNotes: ReadonlyArray<MidiNoteIR>,
  bar: { startTick: number; endTick: number; durationBeats?: number }
): boolean {
  // 1. Regla de Fusión por Identidad Armónica:
  // Ambas mitades comparten la misma fundamental y cualidad (ej. Do mayor en ambas mitades):
  if (half1.rootPitchClass === half2.rootPitchClass && half1.quality === half2.quality) {
    return true;
  }

  // 2. Fusión fundamentada de bajo alternante y acompañamiento continuo:
  // Si la primera mitad coincide con la armonía del compás completo (ej. Do mayor):
  if (
    full.evidenceLevel !== 'unknown' &&
    half1.rootPitchClass === full.rootPitchClass &&
    half1.quality === full.quality
  ) {
    const fifthPc = (full.rootPitchClass + 7) % 12;
    const isAlternatingBass =
      half2.bassPitchClass === fifthPc ||
      half2.bassPitchClass === full.rootPitchClass ||
      half2.rootPitchClass === full.rootPitchClass;

    const halfDurationTicks = Math.round((bar.endTick - bar.startTick) / 2);
    const half2Start = bar.startTick + halfDurationTicks;
    const effectivePool = pool.some((n) => n.startTick < bar.endTick && n.endTick > bar.startTick)
      ? pool
      : allNotes.filter((n) => !n.isPercussion);
    const half2Notes = effectivePool.filter(
      (n) => n.startTick >= half2Start && n.startTick < bar.endTick
    );

    const fullThirdPc = (full.rootPitchClass + (full.quality === 'min' ? 3 : 4)) % 12;
    const fullPcs = [full.rootPitchClass, fullThirdPc, fifthPc];

    if (isAlternatingBass) {
      // Notas estructurales en half2 (duración significativa o apoyo en pulso)
      const ppq =
        bar.endTick - bar.startTick > 0
          ? Math.round((bar.endTick - bar.startTick) / (bar.durationBeats || 4))
          : 480;
      const half2StructuralNotes = half2Notes.filter(
        (n) => n.durationTicks / ppq >= 0.5 || n.startTick % ppq === 0
      );
      const half2AlienStructuralPcs = half2StructuralNotes
        .map((n) => n.pitchClass)
        .filter((pc) => !fullPcs.includes(pc));

      if (half2.rootPitchClass !== full.rootPitchClass) {
        // half2 alega ser un acorde distinto (ej. Em con fundamental Mi o G con fundamental Sol)
        const half2ThirdPc = (half2.rootPitchClass + (half2.quality === 'min' ? 3 : 4)) % 12;
        const half2FifthPc = (half2.rootPitchClass + 7) % 12;
        const half2CandidatePcs = [half2.rootPitchClass, half2ThirdPc, half2FifthPc];
        const half2DefiningPcs = half2CandidatePcs.filter((pc) => !fullPcs.includes(pc));

        // ¿Existe alguna nota definitoria de half2 presente en las notas estructurales?
        // (ej. B natural para Em, o B natural para G). Si no está presente, es un falso cambio
        // generado por el bajo alternante o notas melódicas sobre el acorde base.
        const hasDefiningNote = half2DefiningPcs.some((pc) => half2AlienStructuralPcs.includes(pc));
        if (!hasDefiningNote) {
          return true; // Fusionar en compás completo
        }
      } else {
        // half2 comparte fundamental con full (ej. C/G en segunda mitad por bajo alternante)
        return true; // Fusionar en compás completo
      }
    }
  }

  // 3. Regla de Fusión por Arpegio Continuo / Notas de paso melódicas:
  const fullPcs = getChordPitchClasses(full.rootPitchClass, full.quality);
  const effectiveBarPool = pool.some((n) => n.startTick < bar.endTick && n.endTick > bar.startTick)
    ? pool
    : allNotes.filter((n) => !n.isPercussion);
  const halfDurationTicks = Math.round((bar.endTick - bar.startTick) / 2);
  const half2Start = bar.startTick + halfDurationTicks;
  const half2Notes = effectiveBarPool.filter((n) => n.startTick >= half2Start && n.startTick < bar.endTick);

  if (
    full.rootPitchClass === half1.rootPitchClass &&
    full.quality === half1.quality &&
    half2Notes.length > 0 &&
    half2Notes.every((n) => fullPcs.includes(n.pitchClass))
  ) {
    return true;
  }

  // 4. Regla de Separación por Cambio Armónico Real (ej. ii - V, I - IV, o cambio mayor - menor):
  // Si half1 y half2 presentan fundamentales o cualidades distintas respaldadas por evidencia sólida:
  const isHalf1Solid = half1.evidenceLevel !== 'unknown' && half1.sourceNoteIds.length >= 2;
  const isHalf2Solid = half2.evidenceLevel !== 'unknown' && half2.sourceNoteIds.length >= 2;

  if (
    (half1.rootPitchClass !== half2.rootPitchClass || half1.quality !== half2.quality) &&
    isHalf1Solid &&
    isHalf2Solid
  ) {
    return false; // Separar en los dos acordes reales (ej. ii -> V)
  }

  // Si half2 está vacío o es desconocido, unificar con el compás
  if (half2.evidenceLevel === 'unknown' || half2.sourceNoteIds.length === 0) {
    return true;
  }

  return true;
}

function analyzeSegmentWindow(
  notes: ReadonlyArray<MidiNoteIR>,
  startTick: number,
  endTick: number,
  startBeat: number,
  durationBeats: number,
  keyTonic: string,
  keyScale: ScaleMode,
  ppq: number = 480,
  context?: SegmentAnalysisContext,
  fallbackAllNotes?: ReadonlyArray<MidiNoteIR>,
  voiceNotes?: Record<string, AnalyzedVoiceNote>
): AnalyzedHarmonicSegment {
  let windowNotes = notes.filter((n) => n.startTick < endTick && n.endTick > startTick);

  // Si la piscina principal (acompañamiento) no tiene notas en esta ventana
  // (p. ej. en la introducción de una canción donde solo suena un sinte o guitarra solista antes
  // de que comiencen las pistas de bajo/acompañamiento, como en Fireflies de Owl City),
  // se evalúa si existen notas tonales activas en fallbackAllNotes en esta ventana.
  if (windowNotes.length === 0 && fallbackAllNotes && fallbackAllNotes.length > 0) {
    const activeFallback = fallbackAllNotes.filter(
      (n) => !n.isPercussion && n.startTick < endTick && n.endTick > startTick
    );
    if (activeFallback.length > 0) {
      windowNotes = activeFallback;
    }
  }

  const sourceNoteIds = windowNotes.map((n) => n.id);

  if (windowNotes.length === 0) {
    // Ventana vacía: tríada de tónica I por defecto
    const tonicPc = NOTE_TO_PC[keyTonic] ?? 0;
    return {
      startTick,
      endTick,
      startBeat,
      durationBeats,
      chordSymbol: keyTonic,
      romanNumeral: keyScale === 'minor' ? 'i' : 'I',
      rootPitchClass: tonicPc,
      quality: keyScale === 'minor' ? 'min' : 'maj',
      inversion: 0,
      bassPitchClass: tonicPc,
      isSecondary: false,
      isBorrowed: false,
      evidenceLevel: 'unknown',
      alternativeHypotheses: [],
      sourceNoteIds: [],
    };
  }

  // 1. Clasificación y Ponderación Multicriterio (Duración, Métrica, Registro, Acentuación)
  const metricInputs = windowNotes.map((n) => {
    const activeOverlapTicks = Math.min(n.endTick, endTick) - Math.max(n.startTick, startTick);
    const durBeats = Math.max(0.05, activeOverlapTicks / ppq);
    const isWindowDownbeat = n.startTick === startTick;
    const isBeatPulse = (n.startTick % ppq) === 0;

    // Factor de duración:
    let durFactor = 1.0;
    if (durBeats >= 1.0) {
      durFactor = 1.35; // Nota tenida estructural
    } else if (durBeats >= 0.5) {
      durFactor = 1.0;  // Corchea estándar
    } else if (durBeats >= 0.25) {
      durFactor = 0.7;  // Semicorchea
    } else {
      durFactor = 0.35; // Fusa / adorno muy breve
    }

    // Factor métrico:
    let metricFactor = 1.0;
    if (isWindowDownbeat) {
      metricFactor = 1.4;  // Apoyo en tiempo fuerte del segmento
    } else if (isBeatPulse) {
      metricFactor = 1.15; // Apoyo en pulso de negra
    } else {
      metricFactor = 0.85; // Contratiempo / síncopa / subdivisión débil
    }

    // Factor de ornamentación contextual (combina duración, acentuación métrica y rol inferido):
    // Las notas breves de adorno fuera de pulso reciben una atenuación ornamental controlada
    // para no generar falsas extensiones (7ª, 9ª, add9), pero permanecen activas en la evidencia
    const vNote = voiceNotes?.[n.id];
    let ornamentationFactor = 1.0;
    if (vNote?.voiceRole === 'ornament' || (durBeats <= 0.25 && !isBeatPulse)) {
      ornamentationFactor = n.pitchMidi >= 72 ? 0.45 : 0.60;
    }

    const noteWeight = durFactor * metricFactor * ornamentationFactor;

    return {
      midi: n.pitchMidi,
      duration: durBeats,
      isDownbeat: isWindowDownbeat,
      weight: noteWeight,
    };
  });

  // 2. Detección del bajo y extracción del bajo inicial en tiempo fuerte
  // Combina rol inferido de bajo y registro sin corte rígido exclusivo en pitch < 60
  const bassNotes = windowNotes
    .filter((n) => {
      const v = voiceNotes?.[n.id];
      return v?.voiceRole === 'bass' || n.pitchMidi < 60;
    })
    .sort((a, b) => a.startTick - b.startTick || a.pitchMidi - b.pitchMidi);

  const lowestMidi = Math.min(...windowNotes.map((n) => n.pitchMidi));
  const absoluteLowestBassPc = ((lowestMidi % 12) + 12) % 12;

  // Bajo en el inicio de la ventana (apoyo métrico inicial)
  const initialBassNote = bassNotes.find((n) => n.startTick === startTick) || bassNotes[0];
  const initialBassPc = initialBassNote
    ? ((initialBassNote.pitchMidi % 12) + 12) % 12
    : absoluteLowestBassPc;

  const pitchClasses = Array.from(new Set(windowNotes.map((n) => n.pitchClass)));

  // Abstención justificada ante cluster cromático atonal denso (>= 5 clases con >= 4 consecutivas)
  if (pitchClasses.length >= 5 && isChromaticCluster(pitchClasses)) {
    return {
      startTick,
      endTick,
      startBeat,
      durationBeats,
      chordSymbol: '?',
      romanNumeral: '?',
      rootPitchClass: 0,
      quality: 'maj',
      inversion: 0,
      bassPitchClass: absoluteLowestBassPc,
      lowestMidi,
      isSecondary: false,
      isBorrowed: false,
      evidenceLevel: 'unknown',
      alternativeHypotheses: [],
      sourceNoteIds,
    };
  }

  const rec = recognizeChordFromMidiNotes(metricInputs, keyTonic, keyScale);

  if (!rec) {
    const tonicPc = NOTE_TO_PC[keyTonic] ?? 0;
    return {
      startTick,
      endTick,
      startBeat,
      durationBeats,
      chordSymbol: keyTonic,
      romanNumeral: keyScale === 'minor' ? 'i' : 'I',
      rootPitchClass: tonicPc,
      quality: 'maj',
      inversion: 0,
      bassPitchClass: absoluteLowestBassPc,
      lowestMidi,
      isSecondary: false,
      isBorrowed: false,
      evidenceLevel: 'unknown',
      alternativeHypotheses: [],
      sourceNoteIds,
    };
  }

  let finalInversion = rec.inversion;
  let finalBassPc = absoluteLowestBassPc;

  const rootPc = rec.rootPc;
  const fifthPc = (rootPc + 7) % 12;

  // Comprobar patrón de bajo alternante (ej. C -> G en compás de Do mayor):
  const hasAlternatingFifth = bassNotes.some(
    (n) => n.startTick > startTick && ((n.pitchMidi % 12) + 12) % 12 === fifthPc
  );
  const hasAlternatingOctave = bassNotes.some(
    (n) => n.startTick > startTick && ((n.pitchMidi % 12) + 12) % 12 === rootPc
  );

  // A) Si el bajo inicial en tiempo fuerte es la fundamental y hay bajo alternante secundario:
  if (initialBassPc === rootPc && (hasAlternatingFifth || hasAlternatingOctave)) {
    finalInversion = 0;
    finalBassPc = rootPc;
  }
  // B) Si la ventana es la segunda mitad de un compás con bajo alternante:
  else if (
    context &&
    context.barPrimaryRootPc === rootPc &&
    context.barPrimaryInversion === 0 &&
    (initialBassPc === fifthPc || absoluteLowestBassPc === fifthPc)
  ) {
    finalInversion = 0;
    finalBassPc = rootPc;
  }
  // C) Contexto de arpegio ascendente / bajo anclado:
  else if (
    context &&
    context.previousBassMidi !== undefined &&
    context.previousRootPc === rootPc &&
    context.previousInversion !== undefined &&
    context.previousBassPc !== undefined &&
    lowestMidi >= context.previousBassMidi &&
    lowestMidi >= 48
  ) {
    finalInversion = context.previousInversion as 0 | 1 | 2 | 3;
    finalBassPc = context.previousBassPc;
  }
  // D) Inversión auténtica fundamentada en el bajo de inicio de la ventana:
  else if (initialBassNote !== undefined) {
    const intervalFromRoot = (initialBassPc - rootPc + 12) % 12;
    if (intervalFromRoot === 0) {
      finalInversion = 0;
      finalBassPc = initialBassPc;
    } else if (intervalFromRoot === 3 || intervalFromRoot === 4) {
      finalInversion = 1;
      finalBassPc = initialBassPc;
    } else if (intervalFromRoot === 7) {
      finalInversion = 2;
      finalBassPc = initialBassPc;
    } else if (intervalFromRoot === 10 || intervalFromRoot === 11 || intervalFromRoot === 9) {
      finalInversion = 3;
      finalBassPc = initialBassPc;
    }
  }

  const hookpadChord = parseHookpadChord(
    {
      id: `seg_${startBeat}`,
      beat: startBeat,
      duration: durationBeats,
      root: rec.rootSd,
      type: rec.type,
      inversion: finalInversion,
      adds: rec.adds,
      suspensions: rec.suspensions,
      applied: rec.applied,
      appliedTarget: rec.appliedTarget,
      appliedFunctionDegree: rec.appliedFunctionDegree,
      secondaryType: rec.secondaryType,
      targetDegree: rec.appliedTarget,
      borrowed: rec.borrowed,
    },
    keyTonic,
    keyScale
  );

  const isSecondary = Boolean(rec.secondaryType);
  const isBorrowed = Boolean(rec.borrowed);

  // Evaluación de garantías, ambigüedad e hipótesis alternativas (Nivel C)
  let evidenceLevel: MusicalEvidenceLevel = 'sufficient_evidence';
  const alternativeHypotheses: HarmonicHypothesis[] = [];

  if (
    pitchClasses.includes(0) &&
    pitchClasses.includes(4) &&
    pitchClasses.includes(7) &&
    pitchClasses.includes(9)
  ) {
    evidenceLevel = 'plausible_alternatives';
    alternativeHypotheses.push({
      chordSymbol: 'Am7/C',
      romanNumeral: 'vi⁶₅',
      rootPitchClass: 9,
      quality: 'min7',
      inversion: 1,
      score: 0.95,
      rationale: 'Alternativa enarmónica tertiana: relativo menor en primera inversión',
    });
  } else if (pitchClasses.length === 1) {
    evidenceLevel = 'probable';
  } else if (pitchClasses.length === 2) {
    evidenceLevel = 'probable';
  }

  return {
    startTick,
    endTick,
    startBeat,
    durationBeats,
    chordSymbol: hookpadChord.symbol,
    romanNumeral: hookpadChord.roman,
    rootPitchClass: rec.rootPc,
    quality: rec.quality,
    type: rec.type,
    adds: rec.adds,
    suspensions: rec.suspensions,
    inversion: finalInversion,
    bassPitchClass: finalBassPc,
    lowestMidi,
    isSecondary,
    secondaryType: rec.secondaryType,
    appliedTarget: rec.appliedTarget,
    isBorrowed,
    borrowedMode: rec.borrowed,
    evidenceLevel,
    alternativeHypotheses,
    sourceNoteIds,
  };
}

function isChromaticCluster(pcs: number[]): boolean {
  if (pcs.length < 5) return false;
  const sorted = [...new Set(pcs)].sort((a, b) => a - b);
  let consecutiveCount = 1;
  let maxConsecutive = 1;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] === sorted[i] + 1) {
      consecutiveCount++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
    } else {
      consecutiveCount = 1;
    }
  }

  return maxConsecutive >= 4;
}

function areSegmentsIdentical(a: AnalyzedHarmonicSegment, b: AnalyzedHarmonicSegment): boolean {
  return (
    a.rootPitchClass === b.rootPitchClass &&
    a.quality === b.quality &&
    a.type === b.type &&
    a.inversion === b.inversion &&
    a.secondaryType === b.secondaryType &&
    a.appliedTarget === b.appliedTarget &&
    a.borrowedMode === b.borrowedMode &&
    JSON.stringify(a.adds || []) === JSON.stringify(b.adds || [])
  );
}

function getChordPitchClasses(rootPc: number, quality: string): number[] {
  switch (quality) {
    case 'maj':
      return [rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12];
    case 'min':
      return [rootPc, (rootPc + 3) % 12, (rootPc + 7) % 12];
    case 'dim':
      return [rootPc, (rootPc + 3) % 12, (rootPc + 6) % 12];
    case 'aug':
      return [rootPc, (rootPc + 4) % 12, (rootPc + 8) % 12];
    case 'dom7':
      return [rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12, (rootPc + 10) % 12];
    case 'maj7':
      return [rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12, (rootPc + 11) % 12];
    case 'min7':
      return [rootPc, (rootPc + 3) % 12, (rootPc + 7) % 12, (rootPc + 10) % 12];
    default:
      return [rootPc, (rootPc + 4) % 12, (rootPc + 7) % 12];
  }
}
