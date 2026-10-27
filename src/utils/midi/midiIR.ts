/**
 * midiIR.ts
 * Utilidades, constructores y validadores para la Representación Musical Intermedia (MidiMusicalIR).
 * Proporciona acceso inmutable y consultas temporales exactas en ticks y beats canónicos.
 */

import type {
  MidiMusicalIR,
  MidiNoteIR,
  MidiTempoIR,
  MidiTimeSignatureIR,
} from '../../types/midiIR';

/**
 * Valida los invariantes estructurales de un objeto MidiMusicalIR.
 * Lanza un error descriptivo si se detecta cualquier inconsistencia en los datos.
 */
export function validateMidiMusicalIR(ir: MidiMusicalIR): void {
  if (!ir) {
    throw new Error('MidiMusicalIR no puede ser null o undefined');
  }

  if (!ir.header) {
    throw new Error('MidiMusicalIR debe contener una cabecera header');
  }

  if (ir.header.format !== 0 && ir.header.format !== 1) {
    throw new Error(`Formato MIDI inválido en header: ${ir.header.format} (sólo se admiten 0 y 1)`);
  }

  if (typeof ir.header.ppq !== 'number' || ir.header.ppq <= 0) {
    throw new Error(`PPQ inválido en header: ${ir.header.ppq} (debe ser un número estrictamente positivo)`);
  }

  if (!Array.isArray(ir.tracks)) {
    throw new Error('MidiMusicalIR.tracks debe ser un array');
  }

  if (!Array.isArray(ir.allNotes)) {
    throw new Error('MidiMusicalIR.allNotes debe ser un array');
  }

  // Validar notas
  let prevStartTick = -1;
  for (let i = 0; i < ir.allNotes.length; i++) {
    const n = ir.allNotes[i];
    if (typeof n.pitchMidi !== 'number' || n.pitchMidi < 0 || n.pitchMidi > 127) {
      throw new Error(`Nota ${i} tiene un pitchMidi fuera de rango (0..127): ${n.pitchMidi}`);
    }
    if (typeof n.startTick !== 'number' || n.startTick < 0) {
      throw new Error(`Nota ${i} tiene un startTick negativo o no numérico: ${n.startTick}`);
    }
    if (typeof n.durationTicks !== 'number' || n.durationTicks < 0) {
      throw new Error(`Nota ${i} tiene un durationTicks negativo o no numérico: ${n.durationTicks}`);
    }
    // Debe estar ordenado cronológicamente por startTick
    if (n.startTick < prevStartTick) {
      throw new Error(`allNotes no está ordenado cronológicamente en el índice ${i}: ${n.startTick} < ${prevStartTick}`);
    }
    prevStartTick = n.startTick;
  }
}

/**
 * Convierte ticks absolutos a beat canónico en base 1.
 * beat = 1 + (ticks / ppq)
 */
export function ticksToCanonicalBeats(ticks: number, ppq: number): number {
  if (ppq <= 0) return 1;
  return 1 + ticks / ppq;
}

/**
 * Convierte un beat canónico (base 1) a ticks absolutos.
 * ticks = Math.max(0, Math.round((beat - 1) * ppq))
 */
export function canonicalBeatsToTicks(beat: number, ppq: number): number {
  if (ppq <= 0) return 0;
  return Math.max(0, Math.round((beat - 1) * ppq));
}

/**
 * Obtiene el tempo activo en un tick específico.
 * Si no hay eventos de tempo, devuelve el tempo estándar de 120 BPM.
 */
export function getTempoAtTick(
  tempos: ReadonlyArray<MidiTempoIR>,
  tick: number
): MidiTempoIR {
  if (!tempos || tempos.length === 0) {
    return { ticks: 0, bpm: 120, timeSeconds: 0 };
  }

  // Buscar el último tempo cuyo tick sea <= al tick buscado
  let active = tempos[0];
  for (let i = 0; i < tempos.length; i++) {
    if (tempos[i].ticks <= tick) {
      active = tempos[i];
    } else {
      break;
    }
  }
  return active;
}

/**
 * Obtiene el compás (Time Signature) activo en un tick específico.
 * Si no hay eventos de compás, devuelve 4/4 por defecto.
 */
export function getTimeSignatureAtTick(
  timeSignatures: ReadonlyArray<MidiTimeSignatureIR>,
  tick: number
): MidiTimeSignatureIR {
  if (!timeSignatures || timeSignatures.length === 0) {
    return { ticks: 0, numerator: 4, denominator: 4, measures: 0 };
  }

  let active = timeSignatures[0];
  for (let i = 0; i < timeSignatures.length; i++) {
    if (timeSignatures[i].ticks <= tick) {
      active = timeSignatures[i];
    } else {
      break;
    }
  }
  return active;
}

/**
 * Filtra las notas que están activas o comienzan dentro de un intervalo temporal en ticks.
 * [startTick, endTick)
 */
export function getNotesInTickRange(
  notes: ReadonlyArray<MidiNoteIR>,
  startTick: number,
  endTick: number
): MidiNoteIR[] {
  return notes.filter((n) => n.startTick < endTick && n.endTick > startTick);
}

/**
 * Obtiene las notas de una pista específica identificada por su índice.
 */
export function getNotesByTrack(
  ir: MidiMusicalIR,
  trackIndex: number
): ReadonlyArray<MidiNoteIR> {
  const track = ir.tracks.find((t) => t.index === trackIndex);
  return track ? track.notes : [];
}

/**
 * Calcula el histograma de clases de altura (0..11) a partir de un conjunto de notas.
 * Permite ponderación por duración acumulada en ticks o recuento simple de notas.
 */
export function getPitchClassHistogram(
  notes: ReadonlyArray<MidiNoteIR>,
  weightedByDuration = true
): number[] {
  const histogram = new Array(12).fill(0);
  for (const n of notes) {
    const pc = ((n.pitchMidi % 12) + 12) % 12;
    const weight = weightedByDuration ? Math.max(1, n.durationTicks) : 1;
    histogram[pc] += weight;
  }
  return histogram;
}

/**
 * Congela profundamente (deep freeze) un objeto para garantizar inmutabilidad estricta.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // ArrayBuffer y TypedArrays (Uint8Array, etc.) no admiten Object.freeze en V8
  if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) {
    return obj;
  }

  Object.freeze(obj);

  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }

  return obj;
}
