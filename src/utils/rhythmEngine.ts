/**
 * rhythmEngine.ts
 * Capa centralizada de interpretación de duraciones musicales y temporales
 * compatible con Hooktheory / Hookpad y el motor de audio WebAudio / Tone.js.
 *
 * Contrato canónico de unidades:
 * - Unidad interna de transporte y cuadrícula: Negras (Quarter Notes, base 1 para beats musicales).
 * - Unidad de entrada del formato Hookpad: Ticks (resolución estándar: 480 ticks por negra).
 * - Unidad de eventos de audio: Segundos absolutos en el scheduler.
 */

import type {
  TimeSignature,
  MeterChange,
  CanonicalMeter,
  MetricProvenance,
  MetricAmbiguity,
  MeterType,
} from '../types/music';

export const TICKS_PER_QUARTER = 480;

export type {
  TimeSignature,
  MeterChange,
  CanonicalMeter,
  MetricProvenance,
  MetricAmbiguity,
  MeterType,
};

export interface TempoChange {
  bpm: number;
  startQuarter: number;    // en negras canónicas (0 = inicio)
  beat?: number;
  startTick?: number;
  tempoUnit?: 'quarter' | 'dotted_quarter' | 'eighth'; // unidad del BPM si no es negra
}

export interface PulseInfo {
  offsetInMeasure: number; // en negras relativas al inicio del compás
  absoluteQuarter: number; // en negras absolutas desde el inicio de la canción
  label: string;           // ej. "M1", ".2", ".3", etc.
  isPrimary: boolean;      // pulso principal del compás
  isCompound: boolean;     // si es pulso de compás compuesto (ej. negra con puntillo)
}

export interface SubdivisionInfo {
  offsetInMeasure: number;
  absoluteQuarter: number;
  isTernary: boolean;
}

export interface MeasureInfo {
  measureNumber: number;        // Base 1: 1, 2, 3...
  startQuarter: number;         // Inicio del compás en negras absolutas
  durationQuarters: number;     // Longitud del compás en negras (ej. 4.0 para 4/4, 3.0 para 3/4 o 6/8)
  endQuarter: number;           // startQuarter + durationQuarters
  numerator: number;            // 4, 3, 6, 9, 12, etc.
  denominator: number;          // 4, 8, etc.
  meterLabel: string;           // "4/4", "3/4", "6/8", etc.
  isCompound: boolean;          // true para 6/8, 9/8, 12/8
  isMeterChange: boolean;       // true si este compás introduce un cambio métrico respecto al anterior
  pulses: PulseInfo[];          // Pulsos principales del metrónomo
  subdivisions: SubdivisionInfo[]; // Subdivisiones intermedias
  canonicalMeter?: CanonicalMeter;
}

export interface PositionInMeasures {
  measureNumber: number;        // Compás actual (1, 2, 3...)
  beatInMeasure: number;        // Pulso activo dentro del compás (base 1: 1, 2, 3...)
  fractionInBeat: number;       // Fracción del pulso (0.0 a 1.0)
  totalMeasures: number;        // Total de compases de la sección
  activeMeter: { numerator: number; denominator: number };
  canonicalMeter?: CanonicalMeter;
}

/**
 * Equivalencias canónicas de figuras musicales estándar (en ticks a 480 PPQ)
 */
export const RHYTHMIC_FIGURE_TICKS = {
  WHOLE: 1920,        // Redonda (4 negras)
  HALF: 960,          // Blanca (2 negras)
  QUARTER: 480,       // Negra (1 negra)
  EIGHTH: 240,        // Corchea (0.5 negras)
  SIXTEENTH: 120,     // Semicorchea (0.25 negras)
  THIRTY_SECOND: 60,  // Fusa (0.125 negras)
  SIXTY_FOURTH: 30,   // Semifusa (0.0625 negras)
} as const;

export interface MusicalFigureInfo {
  ticks: number;
  quarters: number;
  name: string;
  nameEn: string;
  symbol: string;
  isStandard: boolean;
  isDotted: boolean;
  isDoubleDotted: boolean;
  isTriplet: boolean;
  isTuplet: boolean;
  description: string;
}

/**
 * Determina si una métrica es compuesta convencional (denominador 8 con numerador 6, 9, 12, etc.).
 * No clasifica automáticamente 3/8 como compuesto (3/8 suele funcionar como 3 corcheas simples).
 */
export function isCompoundMeter(numerator: number, denominator: number): boolean {
  return denominator === 8 && numerator >= 6 && numerator % 3 === 0;
}

/**
 * Calcula la longitud exacta de un compás en negras canónicas según su numerador y denominador.
 */
export function getMeasureDurationInQuarters(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || numerator <= 0 || !Number.isFinite(denominator) || denominator <= 0) {
    return 4.0;
  }
  return (numerator / denominator) * 4;
}

/**
 * Obtiene el compás activo en una posición dada en negras de la canción.
 */
export function getMeterAtQuarter(
  meters: (MeterChange | CanonicalMeter)[] | undefined,
  quarter: number,
  fallback: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 }
): TimeSignature {
  if (!meters || meters.length === 0) {
    return {
      numerator: fallback.numerator || 4,
      denominator: fallback.denominator || 4,
      startQuarter: 0,
      beat: 1,
      startTick: 0,
    };
  }

  const sorted = [...meters].sort((a, b) => a.startQuarter - b.startQuarter);
  let active = sorted[0];

  for (const m of sorted) {
    if (m.startQuarter <= quarter + 0.0001) {
      active = m;
    } else {
      break;
    }
  }

  return active;
}

/**
 * Crea una estructura de compás canónica y normalizada con todas las propiedades de métrica,
 * pulsos principales, subdivisiones y trazabilidad de inferencia.
 */
export function createCanonicalMeter(params: {
  numerator: number;
  denominator: number;
  startQuarter?: number;
  provenance?: MetricProvenance;
  ambiguity?: MetricAmbiguity;
  confidence?: number;
  rationale?: string;
  pulseGrouping?: number[];
  resolution?: number;
}): CanonicalMeter {
  const num = Math.max(1, Math.round(params.numerator || 4));
  const den = Math.max(1, Math.round(params.denominator || 4));
  const startQuarter = Math.max(0, params.startQuarter || 0);
  const resolution = params.resolution || TICKS_PER_QUARTER;

  const durationQuarters = getMeasureDurationInQuarters(num, den);
  const compound = isCompoundMeter(num, den);

  let type: MeterType = 'simple';
  let pulsesPerMeasure = num;
  let pulseDurationQuarters = 4 / den;
  let subdivisionsPerMeasure = num * 2;

  if (compound) {
    type = 'compound';
    pulsesPerMeasure = num / 3;
    pulseDurationQuarters = 1.5;
    subdivisionsPerMeasure = num;
  } else if ((num === 5 || num === 7 || num === 11 || num === 13) && den === 4) {
    type = 'irregular';
    pulsesPerMeasure = num;
    pulseDurationQuarters = 1.0;
    subdivisionsPerMeasure = num * 2;
  } else if (den === 8 && !compound) {
    type = 'additive';
    pulsesPerMeasure = num;
    pulseDurationQuarters = 0.5;
    subdivisionsPerMeasure = num;
  }

  return {
    numerator: num,
    denominator: den,
    durationQuarters,
    pulsesPerMeasure,
    pulseDurationQuarters,
    subdivisionsPerMeasure,
    type,
    pulseGrouping: params.pulseGrouping,
    startQuarter,
    beat: startQuarter + 1,
    startTick: Math.round(startQuarter * resolution),
    label: `${num}/${den}`,
    provenance: params.provenance || 'explicit',
    ambiguity: params.ambiguity || 'none',
    confidence: params.confidence !== undefined ? params.confidence : 1.0,
    inferenceRationale: params.rationale,
  };
}

/**
 * Normaliza un cambio métrico de cualquier formato (Hookpad, MIDI, objeto, string o array).
 */
export function normalizeMeterChange(
  raw: any,
  resolution = TICKS_PER_QUARTER
): MeterChange {
  let numerator = 4;
  let denominator = 4;
  let startQuarter = 0;

  if (typeof raw === 'string') {
    const match = raw.trim().match(/^(\d+)\s*[/:]\s*(\d+)$/);
    if (match) {
      numerator = parseInt(match[1], 10);
      denominator = parseInt(match[2], 10);
    }
  } else if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    numerator = raw;
    denominator = 4;
  } else if (raw && typeof raw === 'object') {
    const strCandidate = typeof raw.meter === 'string' ? raw.meter
      : typeof raw.timeSignature === 'string' ? raw.timeSignature
      : '';
    if (strCandidate) {
      const match = strCandidate.trim().match(/^(\d+)\s*[/:]\s*(\d+)$/);
      if (match) {
        numerator = parseInt(match[1], 10);
        denominator = parseInt(match[2], 10);
      }
    } else if (typeof raw.numBeats === 'number' && raw.numBeats > 0) {
      numerator = raw.numBeats;
      denominator = raw.beatUnit || 4;
    } else if (typeof raw.beats === 'number' && raw.beats > 0) {
      numerator = raw.beats;
      denominator = raw.beatUnit || 4;
    } else if (Array.isArray(raw.meter) && raw.meter.length >= 2) {
      numerator = raw.meter[0] || 4;
      denominator = raw.meter[1] || 4;
    } else if (Array.isArray(raw.timeSignature) && raw.timeSignature.length >= 2) {
      numerator = raw.timeSignature[0] || 4;
      denominator = raw.timeSignature[1] || 4;
    } else if (raw.meter && typeof raw.meter === 'object' && !Array.isArray(raw.meter)) {
      numerator = raw.meter.numBeats || raw.meter.numerator || raw.meter.beats || 4;
      denominator = raw.meter.beatUnit || raw.meter.denominator || 4;
    } else if (raw.timeSignature && typeof raw.timeSignature === 'object' && !Array.isArray(raw.timeSignature)) {
      numerator = raw.timeSignature.numerator || raw.timeSignature.numBeats || 4;
      denominator = raw.timeSignature.denominator || raw.timeSignature.beatUnit || 4;
    } else if (typeof raw.numerator === 'number' && raw.numerator > 0) {
      numerator = raw.numerator;
      denominator = raw.denominator || 4;
    } else if (Array.isArray(raw) && raw.length >= 2) {
      numerator = raw[0] || 4;
      denominator = raw[1] || 4;
    }

    if (typeof raw.startTick === 'number' && Number.isFinite(raw.startTick)) {
      startQuarter = raw.startTick / resolution;
    } else if (typeof raw.startQuarter === 'number' && Number.isFinite(raw.startQuarter)) {
      startQuarter = raw.startQuarter;
    } else if (typeof raw.beat === 'number' && Number.isFinite(raw.beat)) {
      startQuarter = raw.beat >= 240 ? raw.beat / resolution : Math.max(0, raw.beat - 1);
    }
  }

  return {
    numerator,
    denominator,
    startQuarter,
    beat: startQuarter + 1,
    startTick: Math.round(startQuarter * resolution),
  };
}

/**
 * Extrae metadatos métricos explícitos de cualquier estructura de Hookpad / Hooktheory.
 * Explora raíz, modern.payload, payload, project, score y definiciones individuales o de sección.
 */
export function extractExplicitMeters(
  raw: any,
  resolution = TICKS_PER_QUARTER
): CanonicalMeter[] {
  if (!raw || typeof raw !== 'object') return [];

  const metersArrayCandidates = [
    raw.meters,
    raw.modern?.payload?.meters,
    raw.payload?.meters,
    raw.project?.meters,
    raw.score?.meters,
    raw.sections?.[0]?.meters,
  ];

  for (const arr of metersArrayCandidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      const normalized = arr
        .map((m) => normalizeMeterChange(m, resolution))
        .filter((m) => m.numerator > 0 && m.denominator > 0)
        .sort((a, b) => a.startQuarter - b.startQuarter);

      if (normalized.length > 0) {
        return normalized.map((m) =>
          createCanonicalMeter({
            numerator: m.numerator,
            denominator: m.denominator,
            startQuarter: m.startQuarter,
            provenance: 'explicit',
            ambiguity: 'none',
            confidence: 1.0,
            resolution,
          })
        );
      }
    }
  }

  const singleCandidates = [
    raw.meter,
    raw.timeSignature,
    raw.modern?.payload?.meter,
    raw.modern?.payload?.timeSignature,
    raw.payload?.meter,
    raw.payload?.timeSignature,
    raw.sections?.[0]?.meter,
    raw.sections?.[0]?.timeSignature,
  ];

  for (const item of singleCandidates) {
    if (item !== undefined && item !== null && item !== '') {
      const m = normalizeMeterChange(item, resolution);
      if (m.numerator > 0 && m.denominator > 0) {
        return [
          createCanonicalMeter({
            numerator: m.numerator,
            denominator: m.denominator,
            startQuarter: 0,
            provenance: 'explicit',
            ambiguity: 'none',
            confidence: 1.0,
            resolution,
          }),
        ];
      }
    }
  }

  const bpb = raw.beatsPerBar || raw.beats_per_bar || raw.modern?.payload?.beatsPerBar || raw.payload?.beatsPerBar;
  const bu = raw.beatUnit || raw.beat_unit || raw.modern?.payload?.beatUnit || raw.payload?.beatUnit || 4;
  if (typeof bpb === 'number' && bpb > 0) {
    return [
      createCanonicalMeter({
        numerator: bpb,
        denominator: bu,
        startQuarter: 0,
        provenance: 'explicit',
        ambiguity: 'none',
        confidence: 1.0,
        resolution,
      }),
    ];
  }

  return [];
}

/**
 * Infiere de forma determinista la métrica cuando no existen metadatos explícitos,
 * analizando el ritmo armónico, inicio y duración de acordes y agrupaciones de la melodía.
 */
export function inferMeterFromMusicalData(
  chords: any[] = [],
  notes: any[] = [],
  totalQuarters?: number
): CanonicalMeter {
  const normalizedChords = (chords || [])
    .filter((c) => c && !c.isRest && !c.rest && c.type !== 'rest' && c.root !== 'rest' && c.root !== 0 && c.root !== '0')
    .map((c) => {
      let startQ = 0;
      let durQ = 4;
      if (typeof c.startTick === 'number') {
        startQ = c.startTick / TICKS_PER_QUARTER;
      } else if (typeof c.startQuarter === 'number') {
        startQ = c.startQuarter;
      } else if (typeof c.beat === 'number') {
        startQ = c.beat >= 240 ? c.beat / TICKS_PER_QUARTER : Math.max(0, c.beat - 1);
      }
      if (typeof c.durationTicks === 'number') {
        durQ = c.durationTicks / TICKS_PER_QUARTER;
      } else if (typeof c.durationQuarter === 'number') {
        durQ = c.durationQuarter;
      } else if (typeof c.duration === 'number') {
        durQ = c.duration >= 240 ? c.duration / TICKS_PER_QUARTER : Math.max(0.25, c.duration);
      }
      return { startQ, durQ };
    })
    .sort((a, b) => a.startQ - b.startQ);

  const normalizedNotes = (notes || [])
    .filter((n) => n && !n.isRest && !n.rest)
    .map((n) => {
      let startQ = 0;
      let durQ = 1;
      if (typeof n.startTick === 'number') {
        startQ = n.startTick / TICKS_PER_QUARTER;
      } else if (typeof n.startQuarter === 'number') {
        startQ = n.startQuarter;
      } else if (typeof n.beat === 'number') {
        startQ = n.beat >= 240 ? n.beat / TICKS_PER_QUARTER : Math.max(0, n.beat - 1);
      }
      if (typeof n.durationTicks === 'number') {
        durQ = n.durationTicks / TICKS_PER_QUARTER;
      } else if (typeof n.durationQuarter === 'number') {
        durQ = n.durationQuarter;
      } else if (typeof n.duration === 'number') {
        durQ = n.duration >= 240 ? n.duration / TICKS_PER_QUARTER : Math.max(0.125, n.duration);
      }
      return { startQ, durQ };
    })
    .sort((a, b) => a.startQ - b.startQ);

  if (normalizedChords.length === 0 && normalizedNotes.length === 0) {
    return createCanonicalMeter({
      numerator: 4,
      denominator: 4,
      provenance: 'fallback',
      ambiguity: 'ambiguous',
      confidence: 0.25,
      rationale: 'Sin eventos armónicos ni melódicos; se aplicó la política predeterminada de 4/4',
    });
  }

  // Candidatos de duración de compás en negras canónicas
  // 3.0 (3/4 o 6/8), 4.0 (4/4), 2.0 (2/4), 5.0 (5/4), 6.0 (6/4 o 12/8), 7.0 (7/4), 4.5 (9/8), 2.5 (5/8), 3.5 (7/8)
  const candidateDurations = [3.0, 4.0, 2.0, 5.0, 6.0, 7.0, 4.5, 2.5, 3.5];
  const candidateScores: { B: number; score: number }[] = [];

  for (const B of candidateDurations) {
    let boundaryHits = 0;
    let durHits = 0;
    let deltaHits = 0;

    if (normalizedChords.length > 0) {
      for (const c of normalizedChords) {
        const mod = ((c.startQ % B) + B) % B;
        const distToBoundary = Math.min(mod, B - mod);
        if (distToBoundary < 0.08) {
          boundaryHits += 1.0;
        } else if (Math.abs(distToBoundary - B / 2) < 0.08) {
          boundaryHits += 0.5;
        }

        const isExact = Math.abs(c.durQ - B) < 0.08;
        const isDouble = Math.abs(c.durQ - 2 * B) < 0.08;
        const isHalf = Math.abs(c.durQ - B / 2) < 0.08;
        const durRatio = c.durQ / B;
        const isIntMultiple = Math.abs(durRatio - Math.round(durRatio)) < 0.08 && Math.round(durRatio) >= 1;

        if (isExact) {
          durHits += 1.0;
        } else if (isDouble) {
          durHits += 0.85;
        } else if (isHalf) {
          durHits += 0.80;
        } else if (isIntMultiple) {
          durHits += 0.70;
        }
      }

      for (let i = 0; i < normalizedChords.length - 1; i++) {
        const delta = normalizedChords[i + 1].startQ - normalizedChords[i].startQ;
        if (delta > 0) {
          const isExactDelta = Math.abs(delta - B) < 0.08;
          const isDoubleDelta = Math.abs(delta - 2 * B) < 0.08;
          const isHalfDelta = Math.abs(delta - B / 2) < 0.08;
          const deltaRatio = delta / B;
          const isIntDelta = Math.abs(deltaRatio - Math.round(deltaRatio)) < 0.08 && Math.round(deltaRatio) >= 1;

          if (isExactDelta) {
            deltaHits += 1.0;
          } else if (isDoubleDelta) {
            deltaHits += 0.85;
          } else if (isHalfDelta) {
            deltaHits += 0.80;
          } else if (isIntDelta) {
            deltaHits += 0.70;
          }
        }
      }

      const boundaryScore = boundaryHits / normalizedChords.length;
      const durScore = durHits / normalizedChords.length;
      const deltaScore = normalizedChords.length > 1 ? deltaHits / (normalizedChords.length - 1) : boundaryScore;

      let lengthScore = 0.5;
      if (typeof totalQuarters === 'number' && totalQuarters > 0) {
        const modL = ((totalQuarters % B) + B) % B;
        if (Math.min(modL, B - modL) < 0.1) {
          lengthScore = 1.0;
        }
      }

      const totalScore = 0.40 * boundaryScore + 0.35 * durScore + 0.15 * deltaScore + 0.10 * lengthScore;
      candidateScores.push({ B, score: totalScore });
    } else {
      // Si solo hay melodía
      for (const n of normalizedNotes) {
        const mod = ((n.startQ % B) + B) % B;
        if (Math.min(mod, B - mod) < 0.08) boundaryHits += 1.0;
      }
      const score = boundaryHits / normalizedNotes.length;
      candidateScores.push({ B, score });
    }
  }

  candidateScores.sort((a, b) => b.score - a.score);
  const best = candidateScores[0];
  const runnerUp = candidateScores[1];

  if (!best || best.score < 0.38) {
    return createCanonicalMeter({
      numerator: 4,
      denominator: 4,
      provenance: 'fallback',
      ambiguity: 'ambiguous',
      confidence: 0.25,
      rationale: 'Evidencia armónica y melódica insuficiente o contradictoria; se aplica compás predeterminado 4/4',
    });
  }

  const Bbest = best.B;
  let numerator = 4;
  let denominator = 4;

  if (Math.abs(Bbest - 3.0) < 0.01) {
    // Discernir 3/4 vs 6/8 según las subdivisiones melódicas y acentuaciones
    let ternaryCount = 0;
    for (const n of normalizedNotes) {
      const offsetInBar = ((n.startQ % 3.0) + 3.0) % 3.0;
      if (Math.abs(offsetInBar - 1.5) < 0.08) ternaryCount += 1.0;
      if (Math.abs(n.durQ - 1.5) < 0.08) ternaryCount += 0.8;
    }
    const ternaryRatio = normalizedNotes.length > 0 ? ternaryCount / normalizedNotes.length : 0;
    if (ternaryRatio >= 0.35) {
      numerator = 6;
      denominator = 8;
    } else {
      numerator = 3;
      denominator = 4;
    }
  } else if (Math.abs(Bbest - 4.0) < 0.01) {
    numerator = 4;
    denominator = 4;
  } else if (Math.abs(Bbest - 2.0) < 0.01) {
    numerator = 2;
    denominator = 4;
  } else if (Math.abs(Bbest - 5.0) < 0.01) {
    numerator = 5;
    denominator = 4;
  } else if (Math.abs(Bbest - 6.0) < 0.01) {
    let ternaryCount = 0;
    for (const n of normalizedNotes) {
      const offsetInBar = ((n.startQ % 6.0) + 6.0) % 6.0;
      if (
        Math.abs(offsetInBar - 1.5) < 0.08 ||
        Math.abs(offsetInBar - 3.0) < 0.08 ||
        Math.abs(offsetInBar - 4.5) < 0.08 ||
        Math.abs(n.durQ - 1.5) < 0.08
      ) {
        ternaryCount += 1.0;
      }
    }
    const ternaryRatio = normalizedNotes.length > 0 ? ternaryCount / normalizedNotes.length : 0;
    if (ternaryRatio >= 0.25) {
      numerator = 12;
      denominator = 8;
    } else {
      numerator = 6;
      denominator = 4;
    }
  } else if (Math.abs(Bbest - 7.0) < 0.01) {
    numerator = 7;
    denominator = 4;
  } else if (Math.abs(Bbest - 4.5) < 0.01) {
    numerator = 9;
    denominator = 8;
  } else if (Math.abs(Bbest - 2.5) < 0.01) {
    numerator = 5;
    denominator = 8;
  } else if (Math.abs(Bbest - 3.5) < 0.01) {
    numerator = 7;
    denominator = 8;
  }

  const margin = runnerUp ? best.score - runnerUp.score : 1.0;
  const isSingleEventOrTied = (normalizedChords.length <= 1 && normalizedNotes.length <= 1) || margin < 0.08;
  const ambiguity: MetricAmbiguity = isSingleEventOrTied
    ? 'ambiguous'
    : (margin >= 0.25 ? 'none' : (margin >= 0.12 ? 'low' : 'medium'));
  const confidence = isSingleEventOrTied
    ? 0.35
    : Math.min(1.0, Math.max(0.4, Number(best.score.toFixed(2))));

  return createCanonicalMeter({
    numerator,
    denominator,
    provenance: 'inferred',
    ambiguity,
    confidence,
    rationale: `Compás ${numerator}/${denominator} inferido a partir del ritmo armónico y duraciones (puntuación: ${(best.score * 100).toFixed(0)}%, margen: ${(margin * 100).toFixed(0)}%)`,
  });
}

/**
 * Resuelve de forma universal la métrica de cualquier entrada:
 * 1. Prevalece la métrica explícita válida si existe.
 * 2. Si no existe o está vacía, infiere a partir de acordes y melodía.
 * 3. Si la evidencia es insuficiente, aplica la política documentada de fallback.
 */
export function resolveUniversalMeter(
  jsonOrSection: any,
  chords?: any[],
  notes?: any[],
  totalQuarters?: number,
  resolution = TICKS_PER_QUARTER
): { primaryMeter: CanonicalMeter; meters: CanonicalMeter[] } {
  const explicit = extractExplicitMeters(jsonOrSection, resolution);
  if (explicit.length > 0) {
    return {
      primaryMeter: explicit[0],
      meters: explicit,
    };
  }

  const musicChords = chords || jsonOrSection?.chords || jsonOrSection?.modern?.payload?.chords || jsonOrSection?.payload?.chords || [];
  const musicNotes = notes || jsonOrSection?.notes || jsonOrSection?.melody || jsonOrSection?.modern?.payload?.notes || jsonOrSection?.payload?.notes || [];

  const inferred = inferMeterFromMusicalData(musicChords, musicNotes, totalQuarters);
  return {
    primaryMeter: inferred,
    meters: [inferred],
  };
}

/**
 * Construye la línea temporal completa de compases (MeasureInfo[]) a partir de los cambios métricos.
 * Genera de forma determinista límites de compás, pulsos de metrónomo y subdivisiones.
 */
export function calculateMeasuresTimeline(
  totalQuarters: number,
  meters: (MeterChange | CanonicalMeter)[] | undefined,
  fallbackMeter: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 }
): MeasureInfo[] {
  const safeTotalQuarters = Math.max(1, totalQuarters);
  const measures: MeasureInfo[] = [];

  let currentQuarter = 0;
  let measureNumber = 1;
  let prevNumerator = -1;
  let prevDenominator = -1;

  while (currentQuarter < safeTotalQuarters || measures.length === 0) {
    const activeMeter = getMeterAtQuarter(meters, currentQuarter, fallbackMeter);
    const num = activeMeter.numerator || 4;
    const den = activeMeter.denominator || 4;
    const durationQuarters = getMeasureDurationInQuarters(num, den);
    const compound = isCompoundMeter(num, den);

    const isMeterChange = (measureNumber === 1 && meters && meters.length > 0)
      || (measureNumber > 1 && (num !== prevNumerator || den !== prevDenominator));

    prevNumerator = num;
    prevDenominator = den;

    const pulses: PulseInfo[] = [];
    const subdivisions: SubdivisionInfo[] = [];

    if (compound) {
      // Compás compuesto: agrupa corcheas de 3 en 3 (pulsos principales = num / 3)
      const numPulses = num / 3;
      const pulseDuration = 1.5; // Negra con puntillo = 1.5 negras

      for (let p = 0; p < numPulses; p++) {
        const offsetInMeasure = p * pulseDuration;
        pulses.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          label: p === 0 ? `M${measureNumber}` : `.${p + 1}`,
          isPrimary: true,
          isCompound: true,
        });
      }

      // Subdivisiones de corchea (cada 0.5 negras = 240 ticks)
      const eighthDuration = 0.5;
      for (let s = 0; s < num; s++) {
        const offsetInMeasure = s * eighthDuration;
        subdivisions.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          isTernary: true,
        });
      }
    } else {
      // Compás simple (denominador 4, o asimétrico/simple)
      const pulseDuration = 4 / den; // 1.0 negra para /4, 0.5 para /8
      for (let p = 0; p < num; p++) {
        const offsetInMeasure = p * pulseDuration;
        pulses.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          label: p === 0 ? `M${measureNumber}` : `.${p + 1}`,
          isPrimary: true,
          isCompound: false,
        });
      }

      // Subdivisiones binarias (a la mitad del pulso principal)
      const subDuration = pulseDuration / 2;
      for (let s = 0; s < num * 2; s++) {
        const offsetInMeasure = s * subDuration;
        subdivisions.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          isTernary: false,
        });
      }
    }

    const canonMeter = (activeMeter as any).provenance
      ? (activeMeter as CanonicalMeter)
      : createCanonicalMeter({ numerator: num, denominator: den, startQuarter: currentQuarter });

    measures.push({
      measureNumber,
      startQuarter: currentQuarter,
      durationQuarters,
      endQuarter: currentQuarter + durationQuarters,
      numerator: num,
      denominator: den,
      meterLabel: `${num}/${den}`,
      isCompound: compound,
      isMeterChange,
      pulses,
      subdivisions,
      canonicalMeter: canonMeter,
    });

    currentQuarter += durationQuarters;
    measureNumber++;

    // Límite de seguridad
    if (measureNumber > 10000) break;
  }

  return measures;
}

/**
 * Construye una cantidad fija de compases respetando los cambios métricos activos.
 */
export function calculateMeasuresForBarCount(
  barCount: number,
  meters: (MeterChange | CanonicalMeter)[] | undefined,
  fallbackMeter: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 }
): MeasureInfo[] {
  const safeBarCount = Math.max(1, barCount);
  const measures: MeasureInfo[] = [];

  let currentQuarter = 0;
  let measureNumber = 1;
  let prevNumerator = -1;
  let prevDenominator = -1;

  while (measureNumber <= safeBarCount) {
    const activeMeter = getMeterAtQuarter(meters, currentQuarter, fallbackMeter);
    const num = activeMeter.numerator || 4;
    const den = activeMeter.denominator || 4;
    const durationQuarters = getMeasureDurationInQuarters(num, den);
    const compound = isCompoundMeter(num, den);

    const isMeterChange = (measureNumber === 1 && meters && meters.length > 0)
      || (measureNumber > 1 && (num !== prevNumerator || den !== prevDenominator));

    prevNumerator = num;
    prevDenominator = den;

    const pulses: PulseInfo[] = [];
    const subdivisions: SubdivisionInfo[] = [];

    if (compound) {
      const numPulses = num / 3;
      const pulseDuration = 1.5;

      for (let p = 0; p < numPulses; p++) {
        const offsetInMeasure = p * pulseDuration;
        pulses.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          label: p === 0 ? `M${measureNumber}` : `.${p + 1}`,
          isPrimary: true,
          isCompound: true,
        });
      }

      const eighthDuration = 0.5;
      for (let s = 0; s < num; s++) {
        const offsetInMeasure = s * eighthDuration;
        subdivisions.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          isTernary: true,
        });
      }
    } else {
      const pulseDuration = 4 / den;
      for (let p = 0; p < num; p++) {
        const offsetInMeasure = p * pulseDuration;
        pulses.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          label: p === 0 ? `M${measureNumber}` : `.${p + 1}`,
          isPrimary: true,
          isCompound: false,
        });
      }

      const subDuration = pulseDuration / 2;
      for (let s = 0; s < num * 2; s++) {
        const offsetInMeasure = s * subDuration;
        subdivisions.push({
          offsetInMeasure,
          absoluteQuarter: currentQuarter + offsetInMeasure,
          isTernary: false,
        });
      }
    }

    const canonMeter = (activeMeter as any).provenance
      ? (activeMeter as CanonicalMeter)
      : createCanonicalMeter({ numerator: num, denominator: den, startQuarter: currentQuarter });

    measures.push({
      measureNumber,
      startQuarter: currentQuarter,
      durationQuarters,
      endQuarter: currentQuarter + durationQuarters,
      numerator: num,
      denominator: den,
      meterLabel: `${num}/${den}`,
      isCompound: compound,
      isMeterChange,
      pulses,
      subdivisions,
      canonicalMeter: canonMeter,
    });

    currentQuarter += durationQuarters;
    measureNumber++;
  }

  return measures;
}

/**
 * Calcula la posición métrica (compás, pulso en compás y fracción) a partir de una posición en negras.
 */
export function getPositionInMeasures(
  quarter: number,
  totalQuarters: number,
  meters: (MeterChange | CanonicalMeter)[] | undefined,
  fallbackMeter: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 }
): PositionInMeasures {
  const measures = calculateMeasuresTimeline(totalQuarters, meters, fallbackMeter);
  if (measures.length === 0) {
    return {
      measureNumber: 1,
      beatInMeasure: 1,
      fractionInBeat: 0,
      totalMeasures: 1,
      activeMeter: { numerator: fallbackMeter.numerator || 4, denominator: fallbackMeter.denominator || 4 },
      canonicalMeter: createCanonicalMeter({ numerator: fallbackMeter.numerator || 4, denominator: fallbackMeter.denominator || 4 }),
    };
  }

  const safeQuarter = Math.max(0, quarter);
  let activeMeasure = measures[measures.length - 1];

  for (const m of measures) {
    if (safeQuarter >= m.startQuarter - 0.0001 && safeQuarter < m.endQuarter - 0.0001) {
      activeMeasure = m;
      break;
    }
  }

  const offsetInMeasure = Math.max(0, safeQuarter - activeMeasure.startQuarter);
  const pulseDuration = activeMeasure.isCompound ? 1.5 : (4 / activeMeasure.denominator);
  const beatIndex = Math.floor(offsetInMeasure / pulseDuration + 0.0001);
  const beatInMeasure = Math.min(
    activeMeasure.pulses.length,
    Math.max(1, beatIndex + 1)
  );
  const fractionInBeat = Math.max(0, Math.min(1, (offsetInMeasure % pulseDuration) / pulseDuration));

  return {
    measureNumber: activeMeasure.measureNumber,
    beatInMeasure,
    fractionInBeat,
    totalMeasures: measures.length,
    activeMeter: {
      numerator: activeMeasure.numerator,
      denominator: activeMeasure.denominator,
    },
    canonicalMeter: activeMeasure.canonicalMeter,
  };
}

/**
 * Segmento de tempo por tramos continuos en la línea de tiempo.
 */
interface PiecewiseTempoSegment {
  startQuarter: number;
  endQuarter: number; // Puede ser Infinity para el último segmento
  bpm: number;
}

function getTempoSegments(baseBpm: number, tempos?: TempoChange[]): PiecewiseTempoSegment[] {
  const safeBaseBpm = Number.isFinite(baseBpm) && baseBpm > 0 ? baseBpm : 120;
  if (!tempos || tempos.length === 0) {
    return [{ startQuarter: 0, endQuarter: Infinity, bpm: safeBaseBpm }];
  }

  const sorted = [...tempos].sort((a, b) => a.startQuarter - b.startQuarter);
  const segments: PiecewiseTempoSegment[] = [];

  let curQ = 0;
  let curBpm = safeBaseBpm;

  if (sorted[0].startQuarter <= 0) {
    curBpm = sorted[0].bpm;
  }

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.startQuarter <= 0) {
      curBpm = t.bpm;
      continue;
    }
    if (t.startQuarter > curQ) {
      segments.push({
        startQuarter: curQ,
        endQuarter: t.startQuarter,
        bpm: curBpm,
      });
      curQ = t.startQuarter;
      curBpm = t.bpm;
    } else {
      curBpm = t.bpm;
    }
  }

  segments.push({
    startQuarter: curQ,
    endQuarter: Infinity,
    bpm: curBpm,
  });

  return segments;
}

/**
 * Convierte negras canónicas a segundos exactos integrando cambios de tempo (BPM) en la línea de tiempo.
 */
export function quartersToSecondsWithTempo(
  quarters: number,
  baseBpm: number,
  tempos?: TempoChange[]
): number {
  if (!Number.isFinite(quarters) || quarters <= 0) return 0;
  const segments = getTempoSegments(baseBpm, tempos);
  let totalSeconds = 0;

  for (const seg of segments) {
    if (quarters <= seg.startQuarter) break;
    const endQ = Math.min(quarters, seg.endQuarter);
    const durationQ = endQ - seg.startQuarter;
    totalSeconds += quartersToSeconds(durationQ, seg.bpm);
  }

  return totalSeconds;
}

/**
 * Convierte segundos exactos a negras canónicas integrando cambios de tempo en la línea de tiempo.
 */
export function secondsToQuartersWithTempo(
  seconds: number,
  baseBpm: number,
  tempos?: TempoChange[]
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const segments = getTempoSegments(baseBpm, tempos);
  let remainingSeconds = seconds;
  let currentQuarter = 0;

  for (const seg of segments) {
    if (!Number.isFinite(seg.endQuarter)) {
      // Último segmento extendido hacia el infinito
      currentQuarter += secondsToQuarters(remainingSeconds, seg.bpm);
      return currentQuarter;
    }

    const segDurationQ = seg.endQuarter - seg.startQuarter;
    const segDurationSec = quartersToSeconds(segDurationQ, seg.bpm);

    if (remainingSeconds <= segDurationSec) {
      currentQuarter += secondsToQuarters(remainingSeconds, seg.bpm);
      return currentQuarter;
    }

    remainingSeconds -= segDurationSec;
    currentQuarter = seg.endQuarter;
  }

  return currentQuarter;
}

/**
 * Convierte ticks a negras (quarter notes).
 */
export function ticksToQuarters(ticks: number, resolution = TICKS_PER_QUARTER): number {
  if (!Number.isFinite(ticks)) return 0;
  return ticks / resolution;
}

/**
 * Convierte negras a ticks.
 */
export function quartersToTicks(quarters: number, resolution = TICKS_PER_QUARTER): number {
  if (!Number.isFinite(quarters)) return 0;
  return Math.round(quarters * resolution);
}

/**
 * Convierte negras a segundos exactos según el tempo (BPM en negras por minuto).
 */
export function quartersToSeconds(quarters: number, bpm: number): number {
  if (!Number.isFinite(quarters) || !Number.isFinite(bpm) || bpm <= 0) return 0;
  const secondsPerQuarter = 60 / bpm;
  return quarters * secondsPerQuarter;
}

/**
 * Convierte segundos a negras exactas según el tempo (BPM en negras por minuto).
 */
export function secondsToQuarters(seconds: number, bpm: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(bpm) || bpm <= 0) return 0;
  return seconds * (bpm / 60);
}

/**
 * Convierte ticks a segundos exactos según el tempo y la resolución.
 */
export function ticksToSeconds(ticks: number, bpm: number, resolution = TICKS_PER_QUARTER): number {
  return quartersToSeconds(ticksToQuarters(ticks, resolution), bpm);
}

/**
 * Convierte segundos a ticks según el tempo y la resolución.
 */
export function secondsToTicks(seconds: number, bpm: number, resolution = TICKS_PER_QUARTER): number {
  return quartersToTicks(secondsToQuarters(seconds, bpm), resolution);
}

/**
 * Convierte una posición en negras a coordenadas horizontales (píxeles).
 */
export function quartersToPixels(quarters: number, pixelsPerQuarter: number): number {
  if (!Number.isFinite(quarters) || !Number.isFinite(pixelsPerQuarter)) return 0;
  return quarters * pixelsPerQuarter;
}

/**
 * Convierte píxeles horizontales a posición en negras.
 */
export function pixelsToQuarters(pixels: number, pixelsPerQuarter: number): number {
  if (!Number.isFinite(pixels) || !Number.isFinite(pixelsPerQuarter) || pixelsPerQuarter <= 0) return 0;
  return pixels / pixelsPerQuarter;
}

/**
 * Identifica la figura musical canónica más representativa sin modificar el valor numérico exacto.
 * Soporta figuras naturales, con puntillo, doble puntillo, tresillos y valores fraccionarios arbitrarios.
 */
export function getMusicalFigure(ticks: number, resolution = TICKS_PER_QUARTER): MusicalFigureInfo {
  const quarters = ticksToQuarters(ticks, resolution);
  const roundedTicks = Math.round(ticks);

  // Tabla determinista de figuras convencionales
  const knownFigures: {
    ticks: number;
    name: string;
    nameEn: string;
    symbol: string;
    isStandard: boolean;
    isDotted: boolean;
    isDoubleDotted: boolean;
    isTriplet: boolean;
    isTuplet: boolean;
  }[] = [
    // Dobles puntillos
    { ticks: 3360, name: "Redonda con doble puntillo", nameEn: "Double dotted whole note", symbol: "𝅝..", isStandard: false, isDotted: false, isDoubleDotted: true, isTriplet: false, isTuplet: false },
    { ticks: 1680, name: "Blanca con doble puntillo", nameEn: "Double dotted half note", symbol: "𝅗𝅥..", isStandard: false, isDotted: false, isDoubleDotted: true, isTriplet: false, isTuplet: false },
    { ticks: 840,  name: "Negra con doble puntillo", nameEn: "Double dotted quarter note", symbol: "𝅘𝅥..", isStandard: false, isDotted: false, isDoubleDotted: true, isTriplet: false, isTuplet: false },
    { ticks: 420,  name: "Corchea con doble puntillo", nameEn: "Double dotted eighth note", symbol: "𝅘𝅥𝅮..", isStandard: false, isDotted: false, isDoubleDotted: true, isTriplet: false, isTuplet: false },
    { ticks: 210,  name: "Semicorchea con doble puntillo", nameEn: "Double dotted 16th note", symbol: "𝅘𝅥𝅯..", isStandard: false, isDotted: false, isDoubleDotted: true, isTriplet: false, isTuplet: false },

    // Puntillos simples
    { ticks: 2880, name: "Redonda con puntillo", nameEn: "Dotted whole note", symbol: "𝅝.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 1440, name: "Blanca con puntillo", nameEn: "Dotted half note", symbol: "𝅗𝅥.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 720,  name: "Negra con puntillo", nameEn: "Dotted quarter note", symbol: "𝅘𝅥.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 360,  name: "Corchea con puntillo", nameEn: "Dotted eighth note", symbol: "𝅘𝅥𝅮.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 180,  name: "Semicorchea con puntillo", nameEn: "Dotted 16th note", symbol: "𝅘𝅥𝅯.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 90,   name: "Fusa con puntillo", nameEn: "Dotted 32nd note", symbol: "𝅘𝅥𝅰.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 45,   name: "Semifusa con puntillo", nameEn: "Dotted 64th note", symbol: "𝅘𝅥𝅱.", isStandard: false, isDotted: true, isDoubleDotted: false, isTriplet: false, isTuplet: false },

    // Figuras estándar
    { ticks: 1920, name: "Redonda", nameEn: "Whole note", symbol: "𝅝", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 960,  name: "Blanca", nameEn: "Half note", symbol: "𝅗𝅥", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 480,  name: "Negra", nameEn: "Quarter note", symbol: "𝅘𝅥", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 240,  name: "Corchea", nameEn: "Eighth note", symbol: "𝅘𝅥𝅮", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 120,  name: "Semicorchea", nameEn: "Sixteenth note", symbol: "𝅘𝅥𝅯", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 60,   name: "Fusa", nameEn: "Thirty-second note", symbol: "𝅘𝅥𝅰", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },
    { ticks: 30,   name: "Semifusa", nameEn: "Sixty-fourth note", symbol: "𝅘𝅥𝅱", isStandard: true, isDotted: false, isDoubleDotted: false, isTriplet: false, isTuplet: false },

    // Tresillos
    { ticks: 1280, name: "Tresillo de redonda", nameEn: "Whole note triplet", symbol: "3[𝅝]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
    { ticks: 640,  name: "Tresillo de blanca", nameEn: "Half note triplet", symbol: "3[𝅗𝅥]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
    { ticks: 320,  name: "Tresillo de negra", nameEn: "Quarter note triplet", symbol: "3[𝅘𝅥]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
    { ticks: 160,  name: "Tresillo de corchea", nameEn: "Eighth note triplet", symbol: "3[𝅘𝅥𝅮]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
    { ticks: 80,   name: "Tresillo de semicorchea", nameEn: "16th note triplet", symbol: "3[𝅘𝅥𝅯]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
    { ticks: 40,   name: "Tresillo de fusa", nameEn: "32nd note triplet", symbol: "3[𝅘𝅥𝅰]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
    { ticks: 20,   name: "Tresillo de semifusa", nameEn: "64th note triplet", symbol: "3[𝅘𝅥𝅱]", isStandard: false, isDotted: false, isDoubleDotted: false, isTriplet: true, isTuplet: true },
  ];

  // Búsqueda de coincidencia exacta con tolerancia mínima (<= 1 tick)
  const exactMatch = knownFigures.find((f) => Math.abs(f.ticks - roundedTicks) <= 1);
  if (exactMatch) {
    return {
      ticks,
      quarters,
      name: exactMatch.name,
      nameEn: exactMatch.nameEn,
      symbol: exactMatch.symbol,
      isStandard: exactMatch.isStandard,
      isDotted: exactMatch.isDotted,
      isDoubleDotted: exactMatch.isDoubleDotted,
      isTriplet: exactMatch.isTriplet,
      isTuplet: exactMatch.isTuplet,
      description: `${exactMatch.name} (${quarters} negras, ${ticks} ticks)`,
    };
  }

  // Detección genérica de tresillos o tuplet
  const isTripletCandidate = Math.abs(quarters * 3 - Math.round(quarters * 3)) < 0.01;

  return {
    ticks,
    quarters,
    name: isTripletCandidate ? `Tuplet (${quarters.toFixed(3)} negras)` : `${quarters} negras`,
    nameEn: isTripletCandidate ? `Tuplet (${quarters.toFixed(3)} quarters)` : `${quarters} quarters`,
    symbol: "𝅘𝅥",
    isStandard: false,
    isDotted: false,
    isDoubleDotted: false,
    isTriplet: isTripletCandidate,
    isTuplet: isTripletCandidate,
    description: `Duración no estándar (${quarters} negras, ${ticks} ticks)`,
  };
}

/**
 * Normaliza los parámetros temporales de un evento musical (nota, silencio o acorde)
 * asegurando coherencia entre ticks, negras, compases y posiciones.
 */
export function normalizeEventTiming(
  raw: any,
  defaultDurationQuarters = 1,
  resolution = TICKS_PER_QUARTER
): {
  startTick: number;
  durationTicks: number;
  startQuarter: number;
  durationQuarter: number;
  beat: number; // Base 1
  duration: number; // En negras
} {
  let rawStartTick: number | null = null;
  let rawDurationTicks: number | null = null;

  // 1. Detección de ticks explícitos
  if (typeof raw.startTick === 'number' && Number.isFinite(raw.startTick)) {
    rawStartTick = raw.startTick;
  } else if (typeof raw.start_tick === 'number' && Number.isFinite(raw.start_tick)) {
    rawStartTick = raw.start_tick;
  } else if (typeof raw.tick === 'number' && Number.isFinite(raw.tick)) {
    rawStartTick = raw.tick;
  }

  if (typeof raw.durationTicks === 'number' && Number.isFinite(raw.durationTicks)) {
    rawDurationTicks = raw.durationTicks;
  } else if (typeof raw.duration_ticks === 'number' && Number.isFinite(raw.duration_ticks)) {
    rawDurationTicks = raw.duration_ticks;
  } else if (typeof raw.ticks === 'number' && Number.isFinite(raw.ticks)) {
    rawDurationTicks = raw.ticks;
  }

  let startTick = 0;
  let startQuarter = 0;

  // 2. Si no hay ticks explícitos, inspeccionar beats y duration
  if (rawStartTick !== null) {
    startTick = rawStartTick;
    startQuarter = startTick / resolution;
  } else if (typeof raw.beat === 'number' && Number.isFinite(raw.beat)) {
    if (raw.beat >= 240 && Number.isInteger(raw.beat)) {
      startTick = raw.beat;
      startQuarter = startTick / resolution;
    } else {
      startQuarter = Math.max(0, raw.beat - 1);
      startTick = Math.round(startQuarter * resolution);
    }
  } else {
    startQuarter = 0;
    startTick = 0;
  }

  let durationTickCount = Math.round(defaultDurationQuarters * resolution);
  let durationQuarter = defaultDurationQuarters;

  if (rawDurationTicks !== null) {
    durationTickCount = rawDurationTicks;
    durationQuarter = durationTickCount / resolution;
  } else if (typeof raw.duration === 'number' && Number.isFinite(raw.duration)) {
    if (raw.duration >= 240 && Number.isInteger(raw.duration)) {
      durationTickCount = raw.duration;
      durationQuarter = durationTickCount / resolution;
    } else {
      durationQuarter = Math.max(0, raw.duration);
      durationTickCount = Math.round(durationQuarter * resolution);
    }
  } else {
    durationQuarter = defaultDurationQuarters;
    durationTickCount = Math.round(durationQuarter * resolution);
  }

  const beat = startQuarter + 1;
  const duration = durationQuarter;

  return {
    startTick,
    durationTicks: durationTickCount,
    startQuarter,
    durationQuarter,
    beat,
    duration,
  };
}
