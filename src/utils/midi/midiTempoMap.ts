/**
 * midiTempoMap.ts
 * Motor normativo y determinista para el Mapa de Tempo (Secciones 12.2 y 12.3).
 * Implementa las políticas de MIDI_INTERPRETER_SPECIFICATION_v2.1:
 * - Modo Estricto: aplica reglas normativas SMF Format 1 (sólo Pista 0), diagnosticando ubicaciones no conformes.
 * - Modo Compatibilidad: política determinista multi-pista con trazabilidad y diagnóstico de conflictos.
 * - Tratamiento riguroso de eventos simultáneos de tempo sin pérdida de eventos originales.
 * - Validación explícita de Set Tempo = 0 y tiempos no disponibles por ambigüedad o invalidez.
 */

import type {
  MidiFormat,
  TempoEventReference,
  TempoSegment,
  TempoMapIR,
  TempoDiagnostic,
  TemporalConversionResult,
} from '../../types/midiIR';

const DEFAULT_MPQN = 500000; // 120 BPM = 500,000 microsegundos por negra

/**
 * Construye el mapa de tempo en Modo Estricto o Modo de Compatibilidad.
 */
export function buildTempoMap(
  rawTempoEvents: ReadonlyArray<TempoEventReference>,
  format: MidiFormat,
  mode: 'strict' | 'compatibility',
  ppq: number
): TempoMapIR {
  const diagnostics: TempoDiagnostic[] = [];
  const safePPQ = ppq > 0 ? ppq : 480;

  // 1. Diagnóstico de conformidad inicial sobre todos los eventos
  for (const ev of rawTempoEvents) {
    if (format === 1 && ev.trackIndex > 0) {
      diagnostics.push({
        code: 'TEMPO_OUTSIDE_TRACK_0',
        message: `Evento de tempo encontrado en pista ${ev.trackIndex} (fuera de la pista 0 de sincronización global en SMF Formato 1)`,
        severity: mode === 'strict' ? 'error' : 'warning',
        trackIndex: ev.trackIndex,
        tick: ev.absoluteTick,
        eventId: ev.eventId,
      });
    }

    if (ev.isZeroOrInvalid) {
      diagnostics.push({
        code: 'TEMPO_ZERO_OR_NEGATIVE',
        message: `Evento Set Tempo inválido con ${ev.microsecondsPerQuarter} µs/quarter (valor nulo o negativo no admitido por SMF)`,
        severity: 'error',
        trackIndex: ev.trackIndex,
        tick: ev.absoluteTick,
        eventId: ev.eventId,
      });
    }
  }

  // 2. Selección de eventos candidatos según el modo
  let candidateEvents: TempoEventReference[] = [];
  let policyName = '';

  if (mode === 'strict') {
    policyName =
      format === 1
        ? 'smf_format_1_strict_track_0_only'
        : 'smf_format_0_strict_single_track';

    if (format === 1) {
      // En modo estricto Formato 1, sólo se admiten eventos de la pista 0
      candidateEvents = rawTempoEvents.filter((ev) => ev.trackIndex === 0);
    } else {
      candidateEvents = [...rawTempoEvents];
    }
  } else {
    // Modo Compatibilidad: admite eventos de todas las pistas con prioridad determinista
    policyName = 'compatibility_deterministic_multi_track_priority';
    candidateEvents = [...rawTempoEvents];
  }

  // Si existen eventos inválidos (MPQN <= 0) entre los candidatos efectivos
  const hasInvalidCandidate = candidateEvents.some((ev) => ev.isZeroOrInvalid);
  if (hasInvalidCandidate) {
    return {
      mode,
      isValid: false,
      segments: [],
      rawEvents: rawTempoEvents,
      diagnostics,
      policy: `${policyName} (INVALID: Set Tempo cero o negativo detectado)`,
    };
  }

  // Si no hay ningún evento de tempo declarado
  if (candidateEvents.length === 0) {
    const defaultEvent: TempoEventReference = {
      eventId: 'tempo_default_initial',
      trackIndex: 0,
      absoluteTick: 0,
      orderInTrack: 0,
      microsecondsPerQuarter: DEFAULT_MPQN,
      bpm: 120,
      isConforming: true,
      isZeroOrInvalid: false,
    };

    diagnostics.push({
      code: 'TEMPO_NO_EVENTS_DEFAULT_APPLIED',
      message: 'No se encontraron eventos de tempo; se aplica el estándar normativo de 120 BPM (500.000 µs/negra)',
      severity: 'info',
      trackIndex: 0,
      tick: 0,
    });

    const defaultSegment: TempoSegment = {
      startTick: 0,
      endTick: undefined,
      microsecondsPerQuarter: DEFAULT_MPQN,
      bpm: 120,
      startTimeSeconds: 0,
      endTimeSeconds: undefined,
      sourceEvents: [defaultEvent],
      winningEvent: defaultEvent,
      resolutionMode: mode,
      hasConflict: false,
    };

    return {
      mode,
      isValid: true,
      segments: [defaultSegment],
      rawEvents: rawTempoEvents,
      diagnostics,
      policy: `${policyName} (default_applied)`,
    };
  }

  // 3. Agrupación por tick y resolución determinista de eventos simultáneos
  const tickGroups = new Map<number, TempoEventReference[]>();
  for (const ev of candidateEvents) {
    const list = tickGroups.get(ev.absoluteTick) || [];
    list.push(ev);
    tickGroups.set(ev.absoluteTick, list);
  }

  const sortedTicks = Array.from(tickGroups.keys()).sort((a, b) => a - b);
  const segments: TempoSegment[] = [];

  // Garantizar que siempre haya un punto de inicio en tick 0
  let effectiveFirstMPQN = DEFAULT_MPQN;
  if (sortedTicks[0] === 0) {
    const group0 = tickGroups.get(0)!;
    effectiveFirstMPQN = pickWinningTempoEvent(group0, mode).microsecondsPerQuarter;
  }

  let accumulatedTimeSeconds = 0;
  let prevTick = 0;
  let activeMPQN = effectiveFirstMPQN;

  for (let i = 0; i < sortedTicks.length; i++) {
    const tick = sortedTicks[i];
    const group = tickGroups.get(tick)!;
    const hasConflict = group.length > 1;

    if (hasConflict) {
      diagnostics.push({
        code: 'TEMPO_SIMULTANEOUS_CONFLICT',
        message: `${group.length} eventos de tempo simultáneos en tick ${tick}. Se aplicó resolución determinista sin descartar eventos originales.`,
        severity: 'warning',
        trackIndex: group[0].trackIndex,
        tick,
      });
    }

    const winner = pickWinningTempoEvent(group, mode);

    if (tick > prevTick) {
      // Cerrar segmento anterior
      const deltaTicks = tick - prevTick;
      const durationSeconds = (deltaTicks * activeMPQN) / (safePPQ * 1000000);
      const endTimeSeconds = accumulatedTimeSeconds + durationSeconds;

      if (segments.length > 0) {
        const lastIdx = segments.length - 1;
        const prevSeg = segments[lastIdx];
        segments[lastIdx] = {
          ...prevSeg,
          endTick: tick,
          endTimeSeconds,
        };
      }

      accumulatedTimeSeconds = endTimeSeconds;
      prevTick = tick;
    }

    activeMPQN = winner.microsecondsPerQuarter;

    // Iniciar nuevo segmento
    segments.push({
      startTick: tick,
      endTick: undefined,
      microsecondsPerQuarter: activeMPQN,
      bpm: winner.bpm,
      startTimeSeconds: accumulatedTimeSeconds,
      endTimeSeconds: undefined,
      sourceEvents: [...group],
      winningEvent: winner,
      resolutionMode: mode,
      hasConflict,
    });
  }

  // Si el primer evento no ocurrió en tick 0, anteponer segmento inicial [0, sortedTicks[0])
  if (sortedTicks[0] > 0) {
    const firstTick = sortedTicks[0];
    const durationSeconds = (firstTick * DEFAULT_MPQN) / (safePPQ * 1000000);
    const initialSeg: TempoSegment = {
      startTick: 0,
      endTick: firstTick,
      microsecondsPerQuarter: DEFAULT_MPQN,
      bpm: 120,
      startTimeSeconds: 0,
      endTimeSeconds: durationSeconds,
      sourceEvents: [],
      winningEvent: {
        eventId: 'tempo_implicit_initial',
        trackIndex: 0,
        absoluteTick: 0,
        orderInTrack: -1,
        microsecondsPerQuarter: DEFAULT_MPQN,
        bpm: 120,
        isConforming: true,
        isZeroOrInvalid: false,
      },
      resolutionMode: mode,
      hasConflict: false,
    };

    // Desplazar tiempos acumulados de los segmentos posteriores
    const adjusted = segments.map((s) => ({
      ...s,
      startTimeSeconds: s.startTimeSeconds + durationSeconds,
      endTimeSeconds: s.endTimeSeconds !== undefined ? s.endTimeSeconds + durationSeconds : undefined,
    }));

    return {
      mode,
      isValid: true,
      segments: [initialSeg, ...adjusted],
      rawEvents: rawTempoEvents,
      diagnostics,
      policy: policyName,
    };
  }

  return {
    mode,
    isValid: true,
    segments,
    rawEvents: rawTempoEvents,
    diagnostics,
    policy: policyName,
  };
}

/**
 * Resuelve determinísticamente cuál evento de tempo prevalece entre varios simultáneos.
 * - Si están en la misma pista: el último en el orden original de la pista prevalece.
 * - Si están en pistas distintas: la Pista 0 tiene prioridad normativa; entre otras pistas, menor índice de pista.
 */
function pickWinningTempoEvent(
  events: TempoEventReference[],
  mode: 'strict' | 'compatibility'
): TempoEventReference {
  if (events.length === 1) return events[0];

  const sorted = [...events].sort((a, b) => {
    // 1. Pista 0 siempre tiene máxima precedencia
    if (a.trackIndex === 0 && b.trackIndex !== 0) return -1;
    if (b.trackIndex === 0 && a.trackIndex !== 0) return 1;

    // 2. Misma pista: último evento según orden original en la pista (stream causality)
    if (a.trackIndex === b.trackIndex) {
      return b.orderInTrack - a.orderInTrack;
    }

    // 3. Pistas distintas (sólo en compatibilidad): menor trackIndex primero
    return a.trackIndex - b.trackIndex;
  });

  return sorted[0];
}

/**
 * Convierte un tick absoluto a segundos reales utilizando el mapa de tempo declarado.
 * Distingue explícitamente entre tiempo calculado con mapa estricto, de compatibilidad,
 * o tiempo no disponible por mapa inválido.
 */
export function convertTicksToSeconds(
  tick: number,
  tempoMap: TempoMapIR,
  ppq: number
): TemporalConversionResult {
  const safeTick = Math.max(0, tick);
  const safePPQ = ppq > 0 ? ppq : 480;

  if (!tempoMap.isValid || tempoMap.segments.length === 0) {
    return {
      seconds: -1,
      resolutionMode: tempoMap.mode,
      isExact: false,
      segmentIndex: -1,
      diagnostic: {
        code: 'TEMPO_STRICT_UNAVAILABLE',
        message: 'Tiempo no disponible: el mapa de tempo declarado es inválido o no conforme',
        severity: 'error',
        trackIndex: 0,
        tick: safeTick,
      },
    };
  }

  // Localizar el segmento correspondiente
  let segmentIndex = 0;
  for (let i = 0; i < tempoMap.segments.length; i++) {
    const seg = tempoMap.segments[i];
    if (seg.startTick <= safeTick) {
      segmentIndex = i;
    } else {
      break;
    }
  }

  const activeSegment = tempoMap.segments[segmentIndex];
  const ticksIntoSegment = safeTick - activeSegment.startTick;
  const elapsedSegmentSeconds =
    (ticksIntoSegment * activeSegment.microsecondsPerQuarter) / (safePPQ * 1000000);
  const totalSeconds = activeSegment.startTimeSeconds + elapsedSegmentSeconds;

  return {
    seconds: Math.round(totalSeconds * 1000000) / 1000000,
    resolutionMode: tempoMap.mode,
    isExact: tempoMap.mode === 'strict' && !activeSegment.hasConflict,
    segmentIndex,
  };
}
