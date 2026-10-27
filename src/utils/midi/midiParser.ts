/**
 * midiParser.ts
 * Parser defensivo de archivos MIDI estándar (Format 0 y Format 1).
 * Implementa la Capa A de docs/MIDI_HOOKTHEORY_IMPLEMENTATION_SPEC.md.
 * Valida cabeceras binarias MThd, detecta y rechaza Format 2 de forma controlada,
 * extrae mapas de tempo, compás y armadura, y construye la estructura inmutable MidiMusicalIR.
 */

import { Midi } from '@tonejs/midi';
import type {
  MidiMusicalIR,
  MidiNoteIR,
  MidiTrackIR,
  MidiHeaderIR,
  MidiTempoIR,
  MidiTimeSignatureIR,
  MidiKeySignatureIR,
  MidiFormat,
} from '../../types/midiIR';
import { MidiParseError } from '../../types/midiIR';
import { deepFreeze } from './midiIR';
import { scanMidiBinary } from './midiBinaryScanner';
import { reconstructSysExSequences } from './midiSysEx';
import { buildTempoMap } from './midiTempoMap';

const KEY_SIGNATURE_SHARPS_MAP: Record<number, string> = {
  '-7': 'Cb',
  '-6': 'Gb',
  '-5': 'Db',
  '-4': 'Ab',
  '-3': 'Eb',
  '-2': 'Bb',
  '-1': 'F',
  '0': 'C',
  '1': 'G',
  '2': 'D',
  '3': 'A',
  '4': 'E',
  '5': 'B',
  '6': 'F#',
  '7': 'C#',
};

/**
 * Inspecciona y valida los primeros 14 bytes de la cabecera binaria MThd de un archivo MIDI.
 * Lanza un error tipado MidiParseError si el archivo está truncado, corrupto o es Format 2.
 */
export function parseMidiBinaryHeader(bytes: Uint8Array): {
  format: MidiFormat;
  numTracks: number;
  ppq: number;
  headerLength: number;
} {
  if (!bytes || bytes.length === 0) {
    throw new MidiParseError('EMPTY_FILE', 'El archivo MIDI está vacío (0 bytes)');
  }

  if (bytes.length < 14) {
    throw new MidiParseError(
      'TRUNCATED_HEADER',
      `Archivo MIDI truncado: tamaño (${bytes.length} bytes) inferior a los 14 bytes mínimos de la cabecera MThd`
    );
  }

  // Comprobar número mágico MThd (0x4D, 0x54, 0x68, 0x64)
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'MThd') {
    throw new MidiParseError(
      'INVALID_MAGIC_HEADER',
      `Cabecera MIDI inválida: se esperaba el identificador 'MThd', pero se encontró '${magic}'`
    );
  }

  const headerLength = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  if (headerLength < 6) {
    throw new MidiParseError(
      'CORRUPT_DATA',
      `Longitud de cabecera MThd inválida: ${headerLength} (debe ser al menos 6 bytes)`
    );
  }

  const formatRaw = (bytes[8] << 8) | bytes[9];
  if (formatRaw === 2) {
    throw new MidiParseError(
      'UNSUPPORTED_FORMAT',
      'MIDI Format 2 no está soportado: contiene secuencias de patrones asíncronos independientes incompatibles con la línea de tiempo única de Hooktheory'
    );
  }

  if (formatRaw !== 0 && formatRaw !== 1) {
    throw new MidiParseError(
      'UNSUPPORTED_FORMAT',
      `Formato MIDI ${formatRaw} desconocido o no admitido (sólo se admiten Format 0 y Format 1)`
    );
  }

  const format: MidiFormat = formatRaw as MidiFormat;
  const numTracks = (bytes[10] << 8) | bytes[11];
  const timeDivision = (bytes[12] << 8) | bytes[13];

  let ppq = 480;
  // Si el bit más significativo es 0, es ticks por negra (metrical time)
  if ((timeDivision & 0x8000) === 0) {
    ppq = timeDivision > 0 ? timeDivision : 480;
  } else {
    // SMPTE time code division (bit 15 = 1)
    const fpsRaw = (timeDivision >> 8) & 0x7f;
    const ticksPerFrame = timeDivision & 0xff;
    ppq = (fpsRaw > 0 && ticksPerFrame > 0) ? fpsRaw * ticksPerFrame : 480;
  }

  return { format, numTracks, ppq, headerLength };
}

/**
 * Escanea el buffer binario en busca de eventos meta de armadura (Key Signature: FF 59 02 sf mi).
 * Permite recuperar armaduras cuando la serialización de @tonejs/midi omita o desfase el campo.
 */
function extractRawKeySignatures(bytes: Uint8Array): MidiKeySignatureIR[] {
  const list: MidiKeySignatureIR[] = [];
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0x59 && bytes[i + 2] === 0x02) {
      let sf = bytes[i + 3];
      if (sf > 127) sf = sf - 256; // Int8 con signo
      // Manejar tanto el estándar MIDI oficial (-7..+7) como el offset (+7) introducido por @tonejs/midi
      if (sf > 7) sf = sf - 14;
      const mi = bytes[i + 4];
      const scale: 'major' | 'minor' = mi === 1 ? 'minor' : 'major';
      const keyName = KEY_SIGNATURE_SHARPS_MAP[sf] || 'C';
      list.push({ ticks: 0, key: keyName, scale });
    }
  }
  return list;
}

/**
 * Convierte un ArrayBuffer o Uint8Array binario a la estructura canónica MidiMusicalIR.
 */
export function parseMidiBufferToIR(bufferOrBytes: ArrayBuffer | Uint8Array): MidiMusicalIR {
  const bytes = bufferOrBytes instanceof Uint8Array
    ? bufferOrBytes
    : new Uint8Array(bufferOrBytes);

  // 1. Validación defensiva de cabecera binaria MThd y escaneo completo de eventos
  const headerInfo = parseMidiBinaryHeader(bytes);
  const scanResult = scanMidiBinary(bytes);

  // 2. Parseo de eventos MIDI con @tonejs/midi encapsulado defensivamente
  let parsedMidi: Midi;
  try {
    parsedMidi = new Midi(bytes);
  } catch (err: any) {
    throw new MidiParseError(
      'CORRUPT_DATA',
      `Error de decodificación en la estructura MIDI: ${err?.message || String(err)}`,
      err
    );
  }

  const ppq = headerInfo.ppq || parsedMidi.header.ppq || 480;

  // 3. Mapas de tempo normativos (Modo Estricto y Modo Compatibilidad)
  const tempoMapStrict = buildTempoMap(scanResult.rawTempoEvents, headerInfo.format, 'strict', ppq);
  const tempoMapCompatibility = buildTempoMap(scanResult.rawTempoEvents, headerInfo.format, 'compatibility', ppq);
  const sysExInterpretations = reconstructSysExSequences(scanResult.sysExEvents);

  // 3. Extracción de mapas de tempo dinámicos
  const tempos: MidiTempoIR[] = (parsedMidi.header.tempos && parsedMidi.header.tempos.length > 0)
    ? parsedMidi.header.tempos.map((t) => ({
        ticks: Math.max(0, Math.round(t.ticks)),
        bpm: Math.round(t.bpm * 100) / 100,
        timeSeconds: t.time || 0,
      }))
    : [{ ticks: 0, bpm: 120, timeSeconds: 0 }];

  // 4. Extracción de mapas de compás dinámicos
  const timeSignatures: MidiTimeSignatureIR[] = (parsedMidi.header.timeSignatures && parsedMidi.header.timeSignatures.length > 0)
    ? parsedMidi.header.timeSignatures.map((ts) => ({
        ticks: Math.max(0, Math.round(ts.ticks)),
        numerator: ts.timeSignature[0] || 4,
        denominator: ts.timeSignature[1] || 4,
        measures: ts.measures,
      }))
    : [{ ticks: 0, numerator: 4, denominator: 4, measures: 0 }];

  // 5. Extracción de armadura tonal (Key Signature)
  let keySignatures: MidiKeySignatureIR[] = [];
  if (parsedMidi.header.keySignatures && parsedMidi.header.keySignatures.length > 0) {
    keySignatures = parsedMidi.header.keySignatures
      .filter((k) => k.key)
      .map((k) => ({
        ticks: Math.max(0, Math.round(k.ticks)),
        key: k.key,
        scale: k.scale as 'major' | 'minor',
      }));
  }
  // Si @tonejs/midi no resolvió el nombre de la tonalidad, intentar recuperación directa del buffer binario
  if (keySignatures.length === 0) {
    keySignatures = extractRawKeySignatures(bytes);
  }

  // 6. Extracción y normalización de pistas y notas
  const allNotesList: MidiNoteIR[] = [];
  const tracks: MidiTrackIR[] = parsedMidi.tracks.map((t, trackIdx) => {
    const isPercussion =
      t.channel === 9 ||
      Boolean(t.instrument.percussion) ||
      Boolean(t.name && /drum|bater[ií]a|perc|kick|snare|caisse|cymb|hi-hat|tom/i.test(t.name)) ||
      Boolean(t.instrument.name && /drum|percussion|bater[ií]a/i.test(t.instrument.name)) ||
      (t.instrument.number !== undefined && t.instrument.number >= 112 && t.instrument.number <= 119);
    const instrumentName = t.instrument.name
      ? t.instrument.name
      : isPercussion
        ? 'Standard Drums'
        : 'Acoustic Grand Piano';

    const trackName = t.name
      ? t.name.trim()
      : isPercussion
        ? 'Percusión'
        : `Pista ${trackIdx + 1}`;

    const notes: MidiNoteIR[] = t.notes.map((n, noteIdx) => {
      const pitchMidi = Math.max(0, Math.min(127, Math.round(n.midi)));
      const pitchClass = ((pitchMidi % 12) + 12) % 12;
      const octave = Math.floor(pitchMidi / 12) - 1;
      const startTick = Math.max(0, Math.round(n.ticks));
      const durationTicks = Math.max(1, Math.round(n.durationTicks));
      const endTick = startTick + durationTicks;
      const startSeconds = n.time >= 0 ? n.time : 0;
      const durationSeconds = n.duration > 0 ? n.duration : 0.1;
      const rawVelocity = typeof n.velocity === 'number' ? n.velocity : 0.79;
      const velocity = Math.max(0, Math.min(1, Math.round(rawVelocity * 1000) / 1000));

      const startEv = scanResult.rawEvents.find(
        (e) =>
          e.trackIndex === trackIdx &&
          e.absoluteTick === startTick &&
          e.type === 'note_on' &&
          e.data[0] === pitchMidi
      );
      const endEv = scanResult.rawEvents.find(
        (e) =>
          e.trackIndex === trackIdx &&
          e.absoluteTick === endTick &&
          (e.type === 'note_off' || e.type === 'note_on') &&
          e.data[0] === pitchMidi
      );

      const noteIR: MidiNoteIR = {
        id: `m_${trackIdx}_${noteIdx}_${startTick}_${pitchMidi}`,
        pitchMidi,
        pitchClass,
        octave,
        startTick,
        durationTicks,
        endTick,
        startSeconds,
        durationSeconds,
        velocity,
        trackIndex: trackIdx,
        channel: t.channel,
        isPercussion,
        startEventId: startEv?.id,
        endEventId: endEv?.id,
        isOrphanNote: false,
      };

      allNotesList.push(noteIR);
      return noteIR;
    });

    const trackDurationTicks = notes.reduce((max, n) => Math.max(max, n.endTick), 0);
    const trackDurationSeconds = notes.reduce((max, n) => Math.max(max, n.startSeconds + n.durationSeconds), 0);

    return {
      index: trackIdx,
      name: trackName,
      channel: t.channel,
      programNumber: t.instrument.number || 0,
      instrumentName,
      isPercussion,
      notes,
      durationTicks: trackDurationTicks,
      durationSeconds: trackDurationSeconds,
    };
  });

  // 7. Ordenación cronológica unificada de todas las notas
  allNotesList.sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    return a.pitchMidi - b.pitchMidi;
  });

  const totalDurationTicks = allNotesList.reduce((max, n) => Math.max(max, n.endTick), 0);
  const totalDurationSeconds = allNotesList.reduce((max, n) => Math.max(max, n.startSeconds + n.durationSeconds), 0);

  const header: MidiHeaderIR = {
    format: headerInfo.format,
    ppq,
    tempos,
    timeSignatures,
    keySignatures,
    durationTicks: totalDurationTicks,
    durationSeconds: totalDurationSeconds,
    name: parsedMidi.name ? parsedMidi.name.trim() : undefined,
  };

  const ir: MidiMusicalIR = {
    header,
    tracks,
    allNotes: allNotesList,
    provenance: {
      source: 'midi_file',
      format: headerInfo.format,
      rawByteLength: bytes.length,
      totalTracksOriginal: parsedMidi.tracks.length,
    },
    rawEvents: scanResult.rawEvents,
    sysExEvents: scanResult.sysExEvents,
    sysExInterpretations,
    tempoMapStrict,
    tempoMapCompatibility,
  };

  // 8. Garantía de inmutabilidad estricta
  return deepFreeze(ir);
}

/**
 * Lee y analiza un archivo File (desde un input HTML o drag-and-drop) y produce MidiMusicalIR.
 */
export async function parseMidiFileToIR(file: File): Promise<MidiMusicalIR> {
  if (!file) {
    throw new MidiParseError('EMPTY_FILE', 'No se ha proporcionado ningún archivo para parsear');
  }
  const arrayBuffer = await file.arrayBuffer();
  return parseMidiBufferToIR(arrayBuffer);
}

/**
 * Interfaz unificada polimórfica para procesar File, ArrayBuffer o Uint8Array.
 */
export function parseMidi(input: File): Promise<MidiMusicalIR>;
export function parseMidi(input: ArrayBuffer | Uint8Array): MidiMusicalIR;
export function parseMidi(input: File | ArrayBuffer | Uint8Array): Promise<MidiMusicalIR> | MidiMusicalIR {
  if (typeof (input as any)?.arrayBuffer === 'function') {
    return parseMidiFileToIR(input as File);
  }
  return parseMidiBufferToIR(input as ArrayBuffer | Uint8Array);
}
