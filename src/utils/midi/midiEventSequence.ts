/**
 * midiEventSequence.ts
 * Semántica, orden y reconstrucción determinista de eventos simultáneos (Sección 13.2).
 * Implementa las reglas de MIDI_INTERPRETER_SPECIFICATION_v2.1:
 * - Preservación estricta del orden original dentro de cada pista (orderInTrack).
 * - Identidad estable para cada evento y trazabilidad completa de procedencia.
 * - Política determinista para eventos simultáneos (Program Change, Bank Select, Note Off vs Note On).
 * - Reconstrucción de notas mediante emparejamiento FIFO por combinación (trackIndex, channel, pitch).
 * - Aislamiento estricto entre pistas: nunca empareja eventos de pistas distintas.
 */

import type {
  MidiRawEventIR,
  MidiNoteIR,
  SimultaneousEventPolicy,
  TempoMapIR,
} from '../../types/midiIR';
import { convertTicksToSeconds } from './midiTempoMap';

export const DEFAULT_SIMULTANEOUS_POLICY: SimultaneousEventPolicy = {
  preferProgramChangeBeforeNoteOn: true,
  preferNoteOffBeforeNoteOnSamePitch: true,
  interTrackTieBreaker: 'trackIndex',
};

/**
 * Ordena eventos para presentación o procesamiento global aplicando la política determinista
 * declarada, sin alterar la procedencia ni la semántica local de cada pista.
 */
export function sortEventsDeterministically(
  events: ReadonlyArray<MidiRawEventIR>,
  policy: SimultaneousEventPolicy = DEFAULT_SIMULTANEOUS_POLICY
): MidiRawEventIR[] {
  return [...events].sort((a, b) => {
    // 1. Criterio temporal principal: tick absoluto
    if (a.absoluteTick !== b.absoluteTick) {
      return a.absoluteTick - b.absoluteTick;
    }

    // 2. Misma pista: RESPETO ABSOLUTO al orden original en la pista
    if (a.trackIndex === b.trackIndex) {
      return a.orderInTrack - b.orderInTrack;
    }

    // 3. Pistas distintas en el mismo tick: aplicar política declarada
    if (policy.preferNoteOffBeforeNoteOnSamePitch) {
      if (a.type === 'note_off' && b.type === 'note_on') return -1;
      if (b.type === 'note_off' && a.type === 'note_on') return 1;
    }

    if (policy.preferProgramChangeBeforeNoteOn) {
      if (a.type === 'program_change' && b.type === 'note_on') return -1;
      if (b.type === 'program_change' && a.type === 'note_on') return 1;
      if (a.type === 'control_change' && b.type === 'program_change') {
        // Bank select (CC 0 / 32) antes de Program Change
        const ccNumA = a.data[0];
        if (ccNumA === 0 || ccNumA === 32) return -1;
      }
      if (b.type === 'control_change' && a.type === 'program_change') {
        const ccNumB = b.data[0];
        if (ccNumB === 0 || ccNumB === 32) return 1;
      }
    }

    // Desempate inter-pista determinista
    return a.trackIndex - b.trackIndex;
  });
}

/**
 * Reconstruye notas MIDI poli/monofónicas a partir de la secuencia de eventos crudos,
 * aplicando emparejamiento FIFO estricto por pista, canal y pitch.
 */
export function reconstructNotesFromRawEvents(
  rawEvents: ReadonlyArray<MidiRawEventIR>,
  tempoMap: TempoMapIR,
  ppq: number
): {
  readonly notes: MidiNoteIR[];
  readonly orphanNotes: MidiNoteIR[];
  readonly orphanNoteOffs: MidiRawEventIR[];
} {
  const notes: MidiNoteIR[] = [];
  const orphanNotes: MidiNoteIR[] = [];
  const orphanNoteOffs: MidiRawEventIR[] = [];

  // Agrupar eventos por pista para garantizar aislamiento total
  const trackMap = new Map<number, MidiRawEventIR[]>();
  for (const ev of rawEvents) {
    const list = trackMap.get(ev.trackIndex) || [];
    list.push(ev);
    trackMap.set(ev.trackIndex, list);
  }

  for (const [trackIndex, trackEvents] of trackMap.entries()) {
    // Ordenar estrictamente por orden local original en la pista
    const sorted = [...trackEvents].sort((a, b) => a.orderInTrack - b.orderInTrack);

    // Colas FIFO por clave (channel, pitch)
    const activeNoteOns = new Map<string, MidiRawEventIR[]>();
    let noteCounter = 0;

    for (const ev of sorted) {
      if (ev.type === 'note_on') {
        const pitch = ev.data[0];
        const vel = ev.data[1];

        if (vel === 0) {
          // Note On con velocity 0 equivale normativamente a Note Off
          handleNoteOff(ev, pitch, 0);
        } else {
          // Note On activo
          const key = `${ev.channel ?? 0}_${pitch}`;
          const queue = activeNoteOns.get(key) || [];
          queue.push(ev);
          activeNoteOns.set(key, queue);
        }
      } else if (ev.type === 'note_off') {
        const pitch = ev.data[0];
        const vel = ev.data[1] || 0;
        handleNoteOff(ev, pitch, vel);
      }
    }

    function handleNoteOff(offEv: MidiRawEventIR, pitch: number, _releaseVel: number) {
      const channel = offEv.channel ?? 0;
      const key = `${channel}_${pitch}`;
      const queue = activeNoteOns.get(key);

      if (queue && queue.length > 0) {
        // Emparejamiento FIFO: tomar el primer Note On activo de la cola
        const onEv = queue.shift()!;
        const startTick = onEv.absoluteTick;
        const durationTicks = Math.max(1, offEv.absoluteTick - startTick);
        const endTick = startTick + durationTicks;

        const startSec = convertTicksToSeconds(startTick, tempoMap, ppq).seconds;
        const endSec = convertTicksToSeconds(endTick, tempoMap, ppq).seconds;
        const durationSec = Math.max(0.01, Math.round((endSec - startSec) * 1000) / 1000);

        const velocity = Math.max(0, Math.min(1, Math.round((onEv.data[1] / 127) * 1000) / 1000));
        const pitchClass = ((pitch % 12) + 12) % 12;
        const octave = Math.floor(pitch / 12) - 1;

        notes.push({
          id: `m_${trackIndex}_${noteCounter++}_${startTick}_${pitch}`,
          pitchMidi: pitch,
          pitchClass,
          octave,
          startTick,
          durationTicks,
          endTick,
          startSeconds: Math.max(0, startSec),
          durationSeconds: durationSec,
          velocity,
          trackIndex,
          channel,
          startEventId: onEv.id,
          endEventId: offEv.id,
          isOrphanNote: false,
        });
      } else {
        // Note Off huérfano (sin Note On previo en esta pista/canal/pitch)
        orphanNoteOffs.push(offEv);
      }
    }

    // Al finalizar la pista, gestionar Note Ons huérfanos sin Note Off
    for (const [, queue] of activeNoteOns.entries()) {
      while (queue.length > 0) {
        const onEv = queue.shift()!;
        const pitch = onEv.data[0];
        const channel = onEv.channel ?? 0;
        const startTick = onEv.absoluteTick;
        // Duración sintética de 1 negra si quedó huérfano al final de la pista
        const durationTicks = Math.max(1, ppq);
        const endTick = startTick + durationTicks;

        const startSec = convertTicksToSeconds(startTick, tempoMap, ppq).seconds;
        const endSec = convertTicksToSeconds(endTick, tempoMap, ppq).seconds;
        const durationSec = Math.max(0.01, Math.round((endSec - startSec) * 1000) / 1000);

        const velocity = Math.max(0, Math.min(1, Math.round((onEv.data[1] / 127) * 1000) / 1000));
        const pitchClass = ((pitch % 12) + 12) % 12;
        const octave = Math.floor(pitch / 12) - 1;

        const orphan: MidiNoteIR = {
          id: `m_orphan_${trackIndex}_${noteCounter++}_${startTick}_${pitch}`,
          pitchMidi: pitch,
          pitchClass,
          octave,
          startTick,
          durationTicks,
          endTick,
          startSeconds: Math.max(0, startSec),
          durationSeconds: durationSec,
          velocity,
          trackIndex,
          channel,
          startEventId: onEv.id,
          endEventId: undefined, // Sin evento de cierre
          isOrphanNote: true,
        };
        orphanNotes.push(orphan);
        notes.push(orphan);
      }
    }
  }

  // Ordenación cronológica unificada de las notas reconstruidas
  notes.sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    return a.pitchMidi - b.pitchMidi;
  });

  return { notes, orphanNotes, orphanNoteOffs };
}
