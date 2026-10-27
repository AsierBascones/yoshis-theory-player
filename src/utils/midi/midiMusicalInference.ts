/**
 * midiMusicalInference.ts
 * Capa de interpretación armónica, garantías y abstención justificada (Secciones 16 y 23).
 * Implementa las reglas de MIDI_INTERPRETER_SPECIFICATION_v2.1:
 * - Distingue explícitamente tres niveles de garantía: Nivel A (Parsing), Nivel B (Temporal), Nivel C (Inferencia).
 * - Modela ambigüedad armónica: representa múltiples hipótesis plausibles sin forzar un único resultado.
 * - Soporta abstención musical justificada ('unknown') ante evidencia insuficiente o colecciones atonales.
 * - Registra la procedencia (inferred vs manual vs metadata) y las notas de origen sin mutar el archivo MIDI.
 */

import type {
  MidiNoteIR,
  MusicalAnalysisResultIR,
  HarmonicHypothesis,
  MusicalEvidenceLevel,
} from '../../types/midiIR';
import { recognizeChordFromMidiNotes } from '../midiImporter';

export const ALGORITHM_VERSION = 'hooktheory_ir_v2.1';

/**
 * Analiza armónicamente una ventana temporal de notas MIDI, produciendo un resultado
 * explícitamente etiquetado como Nivel C (Inferencia musical).
 */
export function analyzeWindowHarmonics(
  notesInWindow: ReadonlyArray<MidiNoteIR>,
  startTick: number,
  endTick: number,
  referenceKey: { tonic: string; scale: 'major' | 'minor' } = { tonic: 'C', scale: 'major' }
): MusicalAnalysisResultIR {
  const sourceNoteIds = notesInWindow.map((n) => n.id);

  // 1. Caso de Abstención por Ausencia de Notas
  if (notesInWindow.length === 0) {
    return {
      guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE',
      evidenceLevel: 'unknown',
      candidateHypotheses: [],
      provenance: 'inferred',
      sourceNoteIds: [],
      startTick,
      endTick,
      referenceKey,
      algorithmVersion: ALGORITHM_VERSION,
      explanation: 'Abstención justificada: no hay notas presentes en el intervalo analizado.',
    };
  }

  // 2. Extracción de clases de altura y ponderación por duración
  const pitchClasses = Array.from(
    new Set(notesInWindow.map((n) => ((n.pitchMidi % 12) + 12) % 12))
  );

  // 3. Caso de Abstención por Colección Atonal / Cluster Cromático
  // Si hay más de 5 clases de altura cromáticas adyacentes sin consonancia triádica
  if (pitchClasses.length >= 5 && isChromaticCluster(pitchClasses)) {
    return {
      guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE',
      evidenceLevel: 'unknown',
      candidateHypotheses: [],
      provenance: 'inferred',
      sourceNoteIds,
      startTick,
      endTick,
      referenceKey,
      algorithmVersion: ALGORITHM_VERSION,
      explanation:
        'Abstención justificada: colección cromática densa o atonal sin centro tonal discernible.',
    };
  }

  // 4. Reconocimiento armónico ponderado mediante el motor existente
  const metricInputs = notesInWindow.map((n) => ({
    midi: n.pitchMidi,
    duration: n.durationTicks,
    isDownbeat: n.startTick === startTick,
    weight: 1.0,
  }));

  const primaryRec = recognizeChordFromMidiNotes(
    metricInputs,
    referenceKey.tonic,
    referenceKey.scale
  );

  if (!primaryRec) {
    return {
      guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE',
      evidenceLevel: 'unknown',
      candidateHypotheses: [],
      provenance: 'inferred',
      sourceNoteIds,
      startTick,
      endTick,
      referenceKey,
      algorithmVersion: ALGORITHM_VERSION,
      explanation: 'Abstención justificada: no se identificó ninguna plantilla armónica coincidente.',
    };
  }

  // 5. Evaluación del nivel de evidencia y generación de hipótesis alternativas
  let evidenceLevel: MusicalEvidenceLevel = 'sufficient_evidence';
  let primaryRationale = 'Hipótesis primaria basada en coincidencia de plantilla tertiana y bajo efectivo';

  if (pitchClasses.length === 1) {
    // Nota aislada / unísono: evidencia débil
    evidenceLevel = 'probable';
    primaryRationale = 'Evidencia parcial: nota pedal o unísono melódico aislado';
  } else if (pitchClasses.length === 2) {
    // Díada: ambigüedad inherente (puede interpretarse como fundamental+5ª, 3ª sin fundamental, etc.)
    evidenceLevel = 'probable';
    primaryRationale = 'Díada incompleta: deducida en base a la tónica y el modo de referencia';
  } else if (pitchClasses.length >= 4) {
    if (
      pitchClasses.includes(0) &&
      pitchClasses.includes(4) &&
      pitchClasses.includes(7) &&
      pitchClasses.includes(9)
    ) {
      evidenceLevel = 'plausible_alternatives';
    }
  }

  const primaryHypothesis: HarmonicHypothesis = {
    chordSymbol: primaryRec.rootSd,
    romanNumeral: primaryRec.secondaryType
      ? `${primaryRec.secondaryType}/${primaryRec.appliedTarget}`
      : primaryRec.rootSd,
    rootPitchClass: primaryRec.rootPc,
    quality: primaryRec.quality,
    inversion: primaryRec.inversion,
    score: 1.0,
    rationale: primaryRationale,
  };

  const candidates: HarmonicHypothesis[] = [primaryHypothesis];

  if (pitchClasses.length === 2) {
    const [pc1, pc2] = pitchClasses;
    const interval = (pc2 - pc1 + 12) % 12;
    if (interval === 7 || interval === 5) {
      // Quinta o cuarta justa: posible acorde de potencia o inversión
      candidates.push({
        chordSymbol: `${primaryRec.rootSd}5`,
        romanNumeral: `${primaryRec.rootSd}⁵`,
        rootPitchClass: primaryRec.rootPc,
        quality: 'maj',
        inversion: 0,
        score: 0.8,
        rationale: 'Hipótesis alternativa: díada de quinta justa (power chord)',
      });
    }
  } else if (pitchClasses.length >= 4) {
    // Colecciones ricas con ambigüedad de inversión o función (ej. C6 vs Am7)
    // Notas: C, E, G, A -> C6 o Am7/C
    if (
      pitchClasses.includes(0) &&
      pitchClasses.includes(4) &&
      pitchClasses.includes(7) &&
      pitchClasses.includes(9)
    ) {
      candidates.push({
        chordSymbol: 'Am7/C',
        romanNumeral: 'vi⁶₅',
        rootPitchClass: 9,
        quality: 'min7',
        inversion: 1,
        score: 0.95,
        rationale: 'Alternativa enarmónica tertiana: relativo menor en primera inversión',
      });
    }
  }

  return {
    guaranteeLevel: 'LEVEL_C_MUSICAL_INFERENCE',
    evidenceLevel,
    preferredHypothesis: primaryHypothesis,
    candidateHypotheses: candidates,
    provenance: 'inferred',
    sourceNoteIds,
    startTick,
    endTick,
    referenceKey,
    algorithmVersion: ALGORITHM_VERSION,
    explanation: `Análisis armónico inferido con ${candidates.length} hipótesis evaluada(s).`,
  };
}

/**
 * Detecta si un conjunto de clases de altura conforma un cluster cromático atonal denso.
 */
function isChromaticCluster(pcs: number[]): boolean {
  if (pcs.length < 5) return false;
  const sorted = [...pcs].sort((a, b) => a - b);
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
