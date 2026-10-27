/**
 * midiImporter.ts
 * Utilidad de importación y conversión inteligente de archivos .mid / .midi
 * a la estructura UniversalSong con notación relativa, separación por tesitura
 * y cuantización armónica consolidada por compás / medio compás.
 */

import { Midi } from '@tonejs/midi';
import type { UniversalSong, UniversalMelodyNote, UniversalChord, ScaleMode } from '../types/music';
import { NOTE_TO_PC, parseHookpadChord } from './theoryEngine';
import { parseMidiBufferToIR } from './midi/midiParser';
import { estimateKeyCandidates } from './midi/midiTonalAnalyzer';
import { analyzeMidiMusicalIR, type HarmonicAnalysisOptions } from './midi/midiHarmonicAnalyzer';
import { convertMidiAnalysisToUniversalSong } from './midi/midiHooktheoryAdapter';
import type { KeyCandidate, AnalyzedHarmonicSegment, MidiMusicalIR, MidiFullAnalysisResult } from '../types/midiIR';

export interface MidiTrackInfo {
  index: number;
  name: string;
  notesCount: number;
  channel: number;
  avgPitch: number;
}

export interface MidiParseOptions {
  keyTonic?: string;
  keyScale?: ScaleMode;
  melodyTrackIndex?: number;  // -1 para auto (separación por punto de corte C4)
  harmonyTrackIndex?: number; // -1 para auto (separación por punto de corte C4)
  splitPointMidi?: number;    // 60 = C4
  chordResolution?: 2 | 4;    // 2 beats (medio compás) o 4 beats (compás completo)
}

const DEGREE_MAP_MAJOR: Record<number, string> = {
  0: '1', 1: '#1', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_MAP_MINOR: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function correlation(x: number[], y: number[]): number {
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  return denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
}

/**
 * Algoritmo Krumhansl-Schmuckler para estimar la tonalidad y modo a partir de un histograma de alturas
 */
export function estimateKeyFromPitchHistogram(histogram: number[]): { tonic: string; scale: ScaleMode; confidence: number } {
  let bestTonic = 'C';
  let bestScale: ScaleMode = 'major';
  let bestScore = -1;

  for (let root = 0; root < 12; root++) {
    const rotated = new Array(12);
    for (let i = 0; i < 12; i++) {
      rotated[i] = histogram[(root + i) % 12] || 0;
    }
    const scoreMaj = correlation(rotated, MAJOR_PROFILE);
    if (scoreMaj > bestScore) {
      bestScore = scoreMaj;
      bestTonic = PC_NAMES[root];
      bestScale = 'major';
    }
    const scoreMin = correlation(rotated, MINOR_PROFILE);
    if (scoreMin > bestScore) {
      bestScore = scoreMin;
      bestTonic = PC_NAMES[root];
      bestScale = 'minor';
    }
  }

  return { tonic: bestTonic, scale: bestScale, confidence: Math.max(0, bestScore) };
}

/**
 * Inspecciona un archivo MIDI para extraer metadatos de pistas, tempo, métrica,
 * candidatos de tonalidad con confianza y previsualización armónica.
 */
export async function inspectMidiTracks(
  file: File,
  options?: HarmonicAnalysisOptions
): Promise<{
  tracks: MidiTrackInfo[];
  bpm: number;
  timeSignature: [number, number];
  estimatedKey: { tonic: string; scale: ScaleMode; confidence?: number; isAmbiguous?: boolean };
  candidateKeys?: ReadonlyArray<KeyCandidate>;
  previewChords?: ReadonlyArray<AnalyzedHarmonicSegment>;
  melodyNotesCount?: number;
  harmonyNotesCount?: number;
  autoSelectedMelodyTrackIndex?: number;
  ir?: MidiMusicalIR;
  analysis?: MidiFullAnalysisResult;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  const ir = parseMidiBufferToIR(uint8);

  const keyResult = estimateKeyCandidates(ir);
  const primaryKey = keyResult.primaryKey;
  const estimatedKey = {
    tonic: primaryKey.tonic,
    scale: (primaryKey.scale === 'minor' ? 'minor' : 'major') as ScaleMode,
    confidence: primaryKey.confidence,
    isAmbiguous: keyResult.isAmbiguous,
  };

  const bpm = ir.tempoMapStrict?.segments[0]?.bpm
    || ir.header.tempos[0]?.bpm
    || 120;

  const firstTs = ir.header.timeSignatures[0];
  const timeSignature: [number, number] = firstTs
    ? [firstTs.numerator, firstTs.denominator]
    : [4, 4];

  const tracks: MidiTrackInfo[] = ir.tracks.map((t) => {
    const avgPitch = t.notes.length > 0
      ? Math.round(t.notes.reduce((sum, n) => sum + n.pitchMidi, 0) / t.notes.length)
      : 0;
    return {
      index: t.index,
      name: t.name ? t.name : (t.channel === 9 || t.isPercussion ? 'Percusión' : `Pista ${t.index + 1}`),
      notesCount: t.notes.length,
      channel: t.channel,
      avgPitch,
    };
  });

  // Autoselección defensiva de la pista melódica si no fue provista explícitamente
  let effectiveMelodyTrackIndex = options?.melodyTrackIndex;
  if (effectiveMelodyTrackIndex === undefined || effectiveMelodyTrackIndex < 0) {
    const playableTracks = tracks.filter((t) => t.notesCount > 0 && t.channel !== 9);
    if (playableTracks.length >= 2) {
      const sorted = [...playableTracks].sort((a, b) => b.avgPitch - a.avgPitch);
      effectiveMelodyTrackIndex = sorted[0].index;
    }
  }

  const analysis = analyzeMidiMusicalIR(ir, {
    referenceKeyTonic: options?.referenceKeyTonic || estimatedKey.tonic,
    referenceKeyScale: options?.referenceKeyScale || estimatedKey.scale,
    melodyTrackIndex: effectiveMelodyTrackIndex,
    harmonyResolutionBeats: options?.harmonyResolutionBeats || 2,
  });

  return {
    tracks,
    bpm: Math.round(bpm),
    timeSignature,
    estimatedKey,
    candidateKeys: keyResult.candidateKeys,
    previewChords: analysis.harmonicSegments,
    melodyNotesCount: analysis.melodyNotes.length,
    harmonyNotesCount: Math.max(0, ir.allNotes.length - analysis.melodyNotes.length),
    autoSelectedMelodyTrackIndex: effectiveMelodyTrackIndex,
    ir,
    analysis,
  };
}

export interface NoteMetricInput {
  midi: number;
  duration?: number;
  isDownbeat?: boolean;
  weight?: number;
}

interface ChordTemplate {
  quality: UniversalChord['quality'];
  intervals: number[];
  type: 5 | 7 | 9;
  adds?: (number | string)[];
  suspensions?: (number | string)[];
  minMatches: number;
  alias?: string;
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  // Tríadas estándar
  { quality: 'maj', intervals: [0, 4, 7], type: 5, minMatches: 2 },
  { quality: 'min', intervals: [0, 3, 7], type: 5, minMatches: 2 },
  { quality: 'dim', intervals: [0, 3, 6], type: 5, minMatches: 2 },
  { quality: 'aug', intervals: [0, 4, 8], type: 5, minMatches: 2 },
  { quality: 'maj', intervals: [0, 5, 7], type: 5, suspensions: [4], minMatches: 2, alias: 'sus4' },
  { quality: 'maj', intervals: [0, 2, 7], type: 5, suspensions: [2], minMatches: 2, alias: 'sus2' },

  // Tétradas (7ªs completas)
  { quality: 'dom7', intervals: [0, 4, 7, 10], type: 7, minMatches: 3 },
  { quality: 'maj7', intervals: [0, 4, 7, 11], type: 7, minMatches: 3 },
  { quality: 'min7', intervals: [0, 3, 7, 10], type: 7, minMatches: 3 },
  { quality: 'halfdim7', intervals: [0, 3, 6, 10], type: 7, minMatches: 3 },
  { quality: 'dim7', intervals: [0, 3, 6, 9], type: 7, minMatches: 3 },

  // Tétradas con 5ª omitida (voicing instrumental habitual)
  { quality: 'dom7', intervals: [0, 4, 10], type: 7, minMatches: 3, alias: 'dom7_no5' },
  { quality: 'maj7', intervals: [0, 4, 11], type: 7, minMatches: 3, alias: 'maj7_no5' },
  { quality: 'min7', intervals: [0, 3, 10], type: 7, minMatches: 3, alias: 'min7_no5' },

  // Acordes de 9ª estructurales (tétrada con 7ª + 9ª)
  { quality: 'maj7', intervals: [0, 4, 7, 11, 2], type: 9, minMatches: 4, alias: 'maj9' },
  { quality: 'dom7', intervals: [0, 4, 7, 10, 2], type: 9, minMatches: 4, alias: 'dom9' },
  { quality: 'min7', intervals: [0, 3, 7, 10, 2], type: 9, minMatches: 4, alias: 'min9' },

  // Acordes add9 (tríada + 9ª añadida, sin 7ª)
  { quality: 'maj', intervals: [0, 2, 4, 7], type: 5, adds: [9], minMatches: 3, alias: 'add9' },
  { quality: 'min', intervals: [0, 2, 3, 7], type: 5, adds: [9], minMatches: 3, alias: 'min_add9' },
];

export interface RecognizedChordResult {
  rootPc: number;
  rootSd: string;
  quality: UniversalChord['quality'];
  type: 5 | 7 | 9;
  inversion: 0 | 1 | 2 | 3;
  adds?: (number | string)[];
  suspensions?: (number | string)[];
  secondaryType?: 'V' | 'IV' | 'vii°' | 'ii';
  appliedTarget?: number;
  appliedFunctionDegree?: number;
  applied?: string;
  borrowed?: string;
  confidence?: number;
}

/**
 * Reconoce de forma armónica, contextual y ponderada métricamente el acorde a partir de
 * alturas MIDI o notas con métrica (NoteMetricInput).
 * Distingue bajo de fundamental, resuelve inversiones, funciones secundarias, mezclas modales,
 * acordes add9, tétradas con 5ª omitida e inmunidad a notas de paso ligeras.
 */
export function recognizeChordFromMidiNotes(
  midiNotes: (number | NoteMetricInput)[],
  keyTonic = 'C',
  keyScale: ScaleMode = 'major'
): RecognizedChordResult | null {
  if (!midiNotes || midiNotes.length === 0) return null;

  // Normalizar a lista estructurada con ponderaciones métricas
  const normalizedNotes: { midi: number; pc: number; weight: number; isDownbeat: boolean }[] = [];
  for (const item of midiNotes) {
    if (typeof item === 'number') {
      normalizedNotes.push({
        midi: item,
        pc: ((item % 12) + 12) % 12,
        weight: 1.0,
        isDownbeat: false,
      });
    } else if (item && typeof item.midi === 'number') {
      const dur = item.duration ?? 1.0;
      const w = (item.weight ?? 1.0) * Math.max(0.2, Math.min(4.0, dur)) * (item.isDownbeat ? 1.5 : 1.0);
      normalizedNotes.push({
        midi: item.midi,
        pc: ((item.midi % 12) + 12) % 12,
        weight: w,
        isDownbeat: Boolean(item.isDownbeat),
      });
    }
  }

  if (normalizedNotes.length === 0) return null;

  // Detección de la nota más grave del registro (bajo efectivo)
  const lowestMidi = Math.min(...normalizedNotes.map((n) => n.midi));
  const bassPc = ((lowestMidi % 12) + 12) % 12;

  // Histograma de saliencias ponderadas por duración y apoyo métrico
  const pcWeights = new Float64Array(12);
  let totalWeight = 0;
  for (const n of normalizedNotes) {
    pcWeights[n.pc] += n.weight;
    totalWeight += n.weight;
  }
  totalWeight = Math.max(0.0001, totalWeight);

  const tonicPc = NOTE_TO_PC[keyTonic] ?? 0;
  const degreeMap = keyScale === 'minor' ? DEGREE_MAP_MINOR : DEGREE_MAP_MAJOR;

  let bestCandidate: {
    rootPc: number;
    quality: UniversalChord['quality'];
    type: 5 | 7 | 9;
    adds?: (number | string)[];
    suspensions?: (number | string)[];
    inversion: 0 | 1 | 2 | 3;
    score: number;
  } | null = null;

  for (let r = 0; r < 12; r++) {
    const semitonesFromTonic = (r - tonicPc + 12) % 12;

    for (const tmpl of CHORD_TEMPLATES) {
      // Filtros auxiliares de plausibilidad mínima para evitar ruido subcuantizado
      const add9Ratio = pcWeights[(r + 2) % 12] / totalWeight;
      if (tmpl.alias === 'add9' && add9Ratio < 0.06) continue;
      if (tmpl.alias === 'min_add9' && add9Ratio < 0.06) continue;
      if (tmpl.alias === 'add9' && (pcWeights[(r + 10) % 12] > 0 || pcWeights[(r + 11) % 12] > 0)) continue;
      if (tmpl.suspensions?.includes(4) && (pcWeights[(r + 5) % 12] / totalWeight < 0.06)) continue;
      if (tmpl.suspensions?.includes(2) && (pcWeights[(r + 2) % 12] / totalWeight < 0.06)) continue;
      if (tmpl.quality === 'dom7' && (pcWeights[(r + 10) % 12] / totalWeight < 0.05)) continue;
      if (tmpl.quality === 'maj7' && (pcWeights[(r + 11) % 12] / totalWeight < 0.05)) continue;
      if (tmpl.quality === 'min7' && (pcWeights[(r + 10) % 12] / totalWeight < 0.05)) continue;
      if (tmpl.quality === 'halfdim7' && ((pcWeights[(r + 6) % 12] / totalWeight < 0.05) || (pcWeights[(r + 10) % 12] / totalWeight < 0.05))) continue;
      if (tmpl.quality === 'dim7' && ((pcWeights[(r + 6) % 12] / totalWeight < 0.05) || (pcWeights[(r + 9) % 12] / totalWeight < 0.05))) continue;

      const tmplPcs = tmpl.intervals.map((i) => (r + i) % 12);
      let matchCount = 0;
      let matchedWeight = 0;
      for (const p of tmplPcs) {
        if (pcWeights[p] > 0) {
          matchCount++;
          matchedWeight += pcWeights[p];
        }
      }
      if (matchCount < tmpl.minMatches) continue;

      // Cálculo de masa no perteneciente a la plantilla (penalización para notas de paso sostenidas)
      let extraneousWeight = 0;
      for (let pc = 0; pc < 12; pc++) {
        if (!tmplPcs.includes(pc)) {
          extraneousWeight += pcWeights[pc];
        }
      }

      const matchRatio = matchedWeight / totalWeight;
      const extraneousRatio = extraneousWeight / totalWeight;

      // Puntuación base ponderada
      let score = matchRatio * 12.0 - extraneousRatio * 9.0;

      // Bonificación por presencia de fundamental y tercera
      if (pcWeights[r] > 0) score += 2.0;
      if (tmpl.intervals.length > 1 && pcWeights[(r + tmpl.intervals[1]) % 12] > 0) score += 1.5;

      // Coincidencia o pertenencia del bajo
      if (bassPc === r) {
        score += 3.0; // Fundamental en el bajo
      } else if (tmplPcs.includes(bassPc)) {
        score += 1.4; // Inversión legítima
      } else {
        score -= 4.0; // Bajo ajeno al acorde
      }

      // Contexto modal y tonal relativo
      if (keyScale === 'major') {
        if ([0, 5, 7].includes(semitonesFromTonic) && tmpl.quality === 'maj') score += 1.0;
        if ([2, 4, 9].includes(semitonesFromTonic) && tmpl.quality === 'min') score += 1.0;
        if (semitonesFromTonic === 11 && (tmpl.quality === 'dim' || tmpl.quality === 'dim7' || tmpl.quality === 'halfdim7')) score += 0.8;
        // Bonificaciones para dominantes secundarias comunes
        if (semitonesFromTonic === 9 && (tmpl.quality === 'maj' || tmpl.quality === 'dom7')) score += 0.8; // V/ii
        if (semitonesFromTonic === 2 && (tmpl.quality === 'maj' || tmpl.quality === 'dom7')) score += 0.8; // V/V
        if (semitonesFromTonic === 4 && (tmpl.quality === 'maj' || tmpl.quality === 'dom7')) score += 0.8; // V/vi
        if (semitonesFromTonic === 0 && tmpl.quality === 'dom7') score += 0.8; // V7/IV
        // Bonificaciones para préstamos modales
        if ([3, 8, 10].includes(semitonesFromTonic) && tmpl.quality === 'maj') score += 0.7; // bIII, bVI, bVII
        if (semitonesFromTonic === 5 && tmpl.quality === 'min') score += 0.7; // iv
        if (semitonesFromTonic === 1 && tmpl.quality === 'maj') score += 0.7; // bII
      } else {
        if ([0, 5].includes(semitonesFromTonic) && tmpl.quality === 'min') score += 1.0;
        if ([3, 8, 10].includes(semitonesFromTonic) && tmpl.quality === 'maj') score += 1.0;
        if (semitonesFromTonic === 7 && (tmpl.quality === 'maj' || tmpl.quality === 'dom7' || tmpl.quality === 'min')) score += 1.0;
      }

      // Evaluación de soporte estructural para extensiones y tensiones
      const hasStructuralNote = (pc: number): boolean => {
        return normalizedNotes.some(
          (n) => n.pc === pc && (n.isDownbeat || n.weight >= 1.2 || n.midi < 68)
        );
      };

      // Parsimonia armónica y coste de complejidad relativo (Navaja de Ockham musical):
      if (tmpl.type === 5 && !tmpl.adds && !tmpl.suspensions) {
        // Tríada estándar maj/min/dim: explicación más parsimoniosa
        score += 1.5;
      } else if (tmpl.alias === 'add9' || tmpl.alias === 'min_add9') {
        const ninthPc = (r + 2) % 12;
        const is9thStructural = hasStructuralNote(ninthPc);
        if (is9thStructural) {
          score -= 0.5; // Coste mínimo si la 9ª está respaldada estructuralmente
        } else {
          score -= 2.2; // Penalización si es nota de paso melódica breve
        }
      } else if (tmpl.quality === 'dom7') {
        // Dominante 7ª en función dominante (V7 o secundaria): funcionalmente primaria, sin coste
        const isFunctionalDominant =
          (keyScale === 'major' && [7, 9, 2, 4, 0].includes(semitonesFromTonic)) ||
          (keyScale === 'minor' && [7, 0, 2, 5].includes(semitonesFromTonic));
        if (isFunctionalDominant) {
          score += 0.8;
        } else {
          score -= 0.6;
        }
      } else if (tmpl.quality === 'maj7' || tmpl.quality === 'min7') {
        const seventhPc = (r + (tmpl.quality === 'maj7' ? 11 : 10)) % 12;
        const is7thInBass = bassPc === seventhPc;
        const is7thStructural = is7thInBass || hasStructuralNote(seventhPc);
        if (is7thStructural) {
          score -= 0.4;
        } else {
          score -= 1.6; // Evita que una nota de paso convierta C en Cmaj7
        }
      } else if (tmpl.type === 9) {
        const ninthPc = (r + 2) % 12;
        const is9thStructural = hasStructuralNote(ninthPc);
        if (is9thStructural) {
          score -= 1.0;
        } else {
          score -= 2.5;
        }
      } else if (tmpl.suspensions?.length) {
        const susPc = (r + (tmpl.suspensions.includes(4) ? 5 : 2)) % 12;
        const isSusStructural = hasStructuralNote(susPc);
        if (isSusStructural) {
          score -= 0.5;
        } else {
          score -= 1.8;
        }
      }

      if (!bestCandidate || score > bestCandidate.score) {
        let inversion: 0 | 1 | 2 | 3 = 0;
        const bassInterval = (bassPc - r + 12) % 12;
        if (bassInterval === 0) {
          inversion = 0;
        } else if (bassInterval === 3 || bassInterval === 4) {
          inversion = 1;
        } else if (bassInterval === 6 || bassInterval === 7 || bassInterval === 8) {
          inversion = 2;
        } else if (bassInterval >= 9 && bassInterval <= 11) {
          inversion = 3;
        }

        bestCandidate = {
          rootPc: r,
          quality: tmpl.quality,
          type: tmpl.type,
          adds: tmpl.adds,
          suspensions: tmpl.suspensions,
          inversion,
          score,
        };
      }
    }
  }

  if (!bestCandidate) {
    const semitones = (bassPc - tonicPc + 12) % 12;
    const rootSd = degreeMap[semitones] || '1';
    return {
      rootPc: bassPc,
      rootSd,
      quality: 'maj',
      type: 5,
      inversion: 0,
    };
  }

  const rootPc = bestCandidate.rootPc;
  const semitonesFromTonic = (rootPc - tonicPc + 12) % 12;
  let rootSd = degreeMap[semitonesFromTonic] || '1';

  let secondaryType: UniversalChord['secondaryType'] | undefined;
  let appliedTarget: number | undefined;
  let appliedFunctionDegree: number | undefined;
  let applied: string | undefined;
  let borrowed: string | undefined;

  if (keyScale === 'major') {
    if (semitonesFromTonic === 9 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'dom7')) {
      secondaryType = 'V';
      appliedTarget = 2;
      appliedFunctionDegree = 5;
      applied = '2';
    } else if (semitonesFromTonic === 2 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'dom7')) {
      secondaryType = 'V';
      appliedTarget = 5;
      appliedFunctionDegree = 5;
      applied = '5';
    } else if (semitonesFromTonic === 4 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'dom7')) {
      secondaryType = 'V';
      appliedTarget = 6;
      appliedFunctionDegree = 5;
      applied = '6';
    } else if (semitonesFromTonic === 11 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'dom7')) {
      secondaryType = 'V';
      appliedTarget = 3;
      appliedFunctionDegree = 5;
      applied = '3';
    } else if (semitonesFromTonic === 0 && bestCandidate.quality === 'dom7') {
      secondaryType = 'V';
      appliedTarget = 4;
      appliedFunctionDegree = 5;
      applied = '4';
    } else if (semitonesFromTonic === 1 && (bestCandidate.quality === 'dim' || bestCandidate.quality === 'dim7')) {
      secondaryType = 'vii°';
      appliedTarget = 2;
      appliedFunctionDegree = 7;
      applied = '7';
      rootSd = '#1';
    } else if (semitonesFromTonic === 6 && (bestCandidate.quality === 'dim' || bestCandidate.quality === 'dim7')) {
      secondaryType = 'vii°';
      appliedTarget = 5;
      appliedFunctionDegree = 7;
      applied = '7';
      rootSd = '#4';
    } else if (semitonesFromTonic === 8 && (bestCandidate.quality === 'dim' || bestCandidate.quality === 'dim7')) {
      secondaryType = 'vii°';
      appliedTarget = 6;
      appliedFunctionDegree = 7;
      applied = '7';
      rootSd = '#5';
    } else if (semitonesFromTonic === 3 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'maj7')) {
      borrowed = 'minor';
      rootSd = 'b3';
    } else if (semitonesFromTonic === 8 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'maj7')) {
      borrowed = 'minor';
      rootSd = 'b6';
    } else if (semitonesFromTonic === 10 && (bestCandidate.quality === 'maj' || bestCandidate.quality === 'dom7')) {
      borrowed = 'mixolydian';
      rootSd = 'b7';
    } else if (semitonesFromTonic === 5 && (bestCandidate.quality === 'min' || bestCandidate.quality === 'min7')) {
      borrowed = 'minor';
      rootSd = '4';
    } else if (semitonesFromTonic === 1 && bestCandidate.quality === 'maj') {
      borrowed = 'phrygian';
      rootSd = 'b2';
    } else if (semitonesFromTonic === 11 && (bestCandidate.quality === 'dim' || bestCandidate.quality === 'dim7')) {
      if (bestCandidate.quality === 'dim7') {
        secondaryType = 'vii°';
        appliedTarget = 1;
        appliedFunctionDegree = 7;
        applied = '7';
        rootSd = '7';
      }
    }
  } else {
    if (semitonesFromTonic === 0 && bestCandidate.quality === 'dom7') {
      secondaryType = 'V';
      appliedTarget = 4;
      appliedFunctionDegree = 5;
      applied = '4';
    } else if (semitonesFromTonic === 4 && bestCandidate.quality === 'maj') {
      borrowed = 'major';
    }
  }

  return {
    rootPc,
    rootSd,
    quality: bestCandidate.quality,
    type: bestCandidate.type,
    adds: bestCandidate.adds,
    suspensions: bestCandidate.suspensions,
    inversion: bestCandidate.inversion,
    secondaryType,
    appliedTarget,
    appliedFunctionDegree,
    applied,
    borrowed,
  };
}

export async function parseMidiToUniversalSong(
  file: File | Uint8Array | ArrayBuffer,
  options: MidiParseOptions | string = 'C',
  keyScaleParam: ScaleMode = 'major'
): Promise<UniversalSong> {
  const opts: MidiParseOptions = typeof options === 'string'
    ? { keyTonic: options, keyScale: keyScaleParam }
    : options;

  let uint8: Uint8Array;
  let fileName = 'Imported MIDI';

  if (file instanceof Uint8Array) {
    uint8 = file;
  } else if (file instanceof ArrayBuffer) {
    uint8 = new Uint8Array(file);
  } else if (file && typeof (file as any).arrayBuffer === 'function') {
    const ab = await (file as File).arrayBuffer();
    uint8 = new Uint8Array(ab);
    fileName = (file as File).name || fileName;
  } else {
    throw new Error('Formato de entrada no soportado para MIDI');
  }

  // 1. Capa A & B: Lectura binaria y construcción de la Representación Intermedia (IR)
  const ir = parseMidiBufferToIR(uint8);

  // 2. Capa C: Análisis Tonal, Armónico y Melódico Contextual
  const analysis = analyzeMidiMusicalIR(ir, {
    referenceKeyTonic: opts.keyTonic,
    referenceKeyScale: opts.keyScale,
    melodyTrackIndex: opts.melodyTrackIndex,
    harmonyResolutionBeats: opts.chordResolution || 2,
  });

  // 3. Capa D: Adaptador Hooktheory a UniversalSong y CanonicalChordIR
  const universalSong = convertMidiAnalysisToUniversalSong(analysis, ir, {
    title: fileName.replace(/\.[^/.]+$/, ''),
    artist: 'Importado (MIDI)',
    referenceKeyTonic: opts.keyTonic,
    referenceKeyScale: opts.keyScale,
  });

  return universalSong;
}
