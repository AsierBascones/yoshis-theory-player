/**
 * midiTonalAnalyzer.ts
 * Analizador tonal avanzado para la Fase 3 de MIDI Hooktheory Engine.
 * Implementa la estimación de tonalidad, evaluación de candidatos y puntuaciones de confianza:
 * - Algoritmo Krumhansl-Schmuckler con correlación de Pearson sobre histogramas ponderados.
 * - Integración con eventos meta de armadura (Key Signature) sin asumir infalibilidad.
 * - Detección de ambigüedad tonal o colecciones sin centro tonal claro.
 * - Modulaciones y cambios tonales a lo largo de la línea de tiempo.
 */

import type {
  MidiMusicalIR,
  KeyCandidate,
  KeyEstimateResult,
} from '../../types/midiIR';
import { getPitchClassHistogram } from './midiIR';

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
 * Estima la tonalidad global y evalúa todas las 24 tonalidades candidatas con puntuaciones de confianza.
 */
export function estimateKeyCandidates(
  ir: MidiMusicalIR,
  weightedByDuration = true
): KeyEstimateResult {
  const tonalNotes = ir.allNotes.filter((n) => !n.isPercussion);
  const notesToUse = tonalNotes.length > 0 ? tonalNotes : ir.allNotes;
  const histogram = getPitchClassHistogram(notesToUse, weightedByDuration);
  const totalNotes = notesToUse.length;

  const candidates: KeyCandidate[] = [];

  for (let root = 0; root < 12; root++) {
    const rotated = new Array(12);
    for (let i = 0; i < 12; i++) {
      rotated[i] = histogram[(root + i) % 12] || 0;
    }

    const scoreMaj = correlation(rotated, MAJOR_PROFILE);
    const confMaj = Math.max(0, Math.min(1, Math.round(((scoreMaj + 1) / 2) * 100) / 100));
    candidates.push({
      tonic: PC_NAMES[root],
      scale: 'major',
      confidence: confMaj,
      isExplicitMeta: false,
    });

    const scoreMin = correlation(rotated, MINOR_PROFILE);
    const confMin = Math.max(0, Math.min(1, Math.round(((scoreMin + 1) / 2) * 100) / 100));
    candidates.push({
      tonic: PC_NAMES[root],
      scale: 'minor',
      confidence: confMin,
      isExplicitMeta: false,
    });
  }

  // Ordenar candidatos por confianza descendente
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Verificar si hay eventos meta de armadura explícitos en el header
  const explicitMetas = ir.header.keySignatures || [];
  let primaryCandidate = candidates[0];

  if (explicitMetas.length > 0 && explicitMetas[0].key) {
    const metaKey = explicitMetas[0];
    const matchingCand = candidates.find(
      (c) => c.tonic === metaKey.key && c.scale === metaKey.scale
    );
    if (matchingCand) {
      primaryCandidate = {
        ...matchingCand,
        confidence: Math.min(1.0, matchingCand.confidence + 0.1),
        isExplicitMeta: true,
      };
    } else {
      // Metadato explícito pero con baja correlación tonal empírica
      primaryCandidate = {
        tonic: metaKey.key,
        scale: metaKey.scale,
        confidence: 0.65,
        isExplicitMeta: true,
      };
    }
  }

  // Detección de ambigüedad tonal:
  // Ambigua si la diferencia entre las 2 primeras es < 0.05 o la confianza máxima es muy baja (< 0.40)
  const isAmbiguous =
    totalNotes === 0 ||
    candidates.length < 2 ||
    candidates[0].confidence < 0.4 ||
    Math.abs(candidates[0].confidence - candidates[1].confidence) < 0.04;

  // Detección de cambios de armadura / modulaciones a lo largo del tiempo
  const keyChanges = explicitMetas.map((ks) => ({
    tick: ks.ticks,
    key: {
      tonic: ks.key,
      scale: ks.scale,
      confidence: 0.9,
      isExplicitMeta: true,
    },
  }));

  return {
    primaryKey: primaryCandidate,
    candidateKeys: candidates.slice(0, 5), // Top 5 candidatos
    isAmbiguous,
    keyChanges: keyChanges.length > 1 ? keyChanges : undefined,
  };
}
