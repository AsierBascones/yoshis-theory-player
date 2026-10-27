/**
 * midiBinaryScanner.ts
 * Scanner binario defensivo de bajo nivel para Standard MIDI Files (SMF 0 y 1).
 * Implementa las garantías de lectura de la Sección 11.1 y 13.2 de MIDI_INTERPRETER_SPECIFICATION_v2.1:
 * - Preserva byte offsets exactos de origen para cada evento.
 * - Extrae eventos SysEx F0 y F7 con su longitud VLQ original y payload íntegro sin alterar terminadores.
 * - Registra la procedencia inmutable (trackIndex, orderInTrack, absoluteTick, deltaTime).
 * - Extrae todos los meta-eventos de tempo Set Tempo con MPQN exacto para validación de conformidad.
 */

import type {
  MidiFormat,
  MidiRawEventIR,
  MidiEventType,
  MidiSysExEventIR,
  TempoEventReference,
} from '../../types/midiIR';
import { MidiParseError } from '../../types/midiIR';

export interface BinaryScanResult {
  readonly format: MidiFormat;
  readonly numTracks: number;
  readonly ppq: number;
  readonly headerLength: number;
  readonly rawEvents: MidiRawEventIR[];
  readonly sysExEvents: MidiSysExEventIR[];
  readonly rawTempoEvents: TempoEventReference[];
  readonly scanDiagnostics: string[];
}

/**
 * Lee un valor Variable-Length Quantity (VLQ) estándar MIDI (1 a 4 bytes).
 */
export function readVLQ(
  bytes: Uint8Array,
  offset: number
): { value: number; bytesRead: number; isMalformed: boolean } {
  let value = 0;
  let bytesRead = 0;

  while (offset + bytesRead < bytes.length) {
    const b = bytes[offset + bytesRead];
    bytesRead++;
    value = (value << 7) | (b & 0x7f);

    if ((b & 0x80) === 0) {
      return { value, bytesRead, isMalformed: false };
    }

    if (bytesRead >= 4) {
      // Máximo permitido por SMF spec son 4 bytes (28 bits)
      return { value, bytesRead, isMalformed: true };
    }
  }

  return { value, bytesRead, isMalformed: true }; // Truncado
}

/**
 * Escanea de forma determinista y defensiva los bytes binarios de un archivo MIDI.
 */
export function scanMidiBinary(bytes: Uint8Array): BinaryScanResult {
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
      `Cabecera MIDI inválida: se esperaba 'MThd', pero se encontró '${magic}'`
    );
  }

  const headerLength = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  if (headerLength < 6) {
    throw new MidiParseError(
      'CORRUPT_DATA',
      `Longitud de cabecera MThd inválida: ${headerLength} (mínimo 6 bytes)`
    );
  }

  const formatRaw = (bytes[8] << 8) | bytes[9];
  if (formatRaw === 2) {
    throw new MidiParseError(
      'UNSUPPORTED_FORMAT',
      'MIDI Format 2 no está soportado: contiene secuencias de patrones asíncronos independientes'
    );
  }

  if (formatRaw !== 0 && formatRaw !== 1) {
    throw new MidiParseError(
      'UNSUPPORTED_FORMAT',
      `Formato MIDI ${formatRaw} no admitido (sólo se admiten Format 0 y Format 1)`
    );
  }

  const format: MidiFormat = formatRaw as MidiFormat;
  const numTracks = (bytes[10] << 8) | bytes[11];
  const timeDivision = (bytes[12] << 8) | bytes[13];

  let ppq = 480;
  if ((timeDivision & 0x8000) === 0) {
    ppq = timeDivision > 0 ? timeDivision : 480;
  } else {
    const fpsRaw = (timeDivision >> 8) & 0x7f;
    const ticksPerFrame = timeDivision & 0xff;
    ppq = fpsRaw > 0 && ticksPerFrame > 0 ? fpsRaw * ticksPerFrame : 480;
  }

  const rawEvents: MidiRawEventIR[] = [];
  const sysExEvents: MidiSysExEventIR[] = [];
  const rawTempoEvents: TempoEventReference[] = [];
  const scanDiagnostics: string[] = [];

  let cursor = 8 + headerLength;
  let trackIndex = 0;

  while (cursor < bytes.length && trackIndex < numTracks) {
    // Buscar cabecera MTrk (0x4D, 0x54, 0x72, 0x6B)
    if (cursor + 8 > bytes.length) break;

    const trkMagic = String.fromCharCode(
      bytes[cursor],
      bytes[cursor + 1],
      bytes[cursor + 2],
      bytes[cursor + 3]
    );

    if (trkMagic !== 'MTrk') {
      // Chunk no reconocido o salto de alineación
      scanDiagnostics.push(`Chunk inesperado en offset ${cursor}: '${trkMagic}'`);
      cursor++;
      continue;
    }

    const chunkLength =
      (bytes[cursor + 4] << 24) |
      (bytes[cursor + 5] << 16) |
      (bytes[cursor + 6] << 8) |
      bytes[cursor + 7];

    cursor += 8;
    const trackEndOffset = Math.min(bytes.length, cursor + chunkLength);

    let absoluteTick = 0;
    let orderInTrack = 0;
    let runningStatus = 0;

    while (cursor < trackEndOffset) {
      const eventByteOffset = cursor;

      // 1. Delta-time VLQ
      const dtVlq = readVLQ(bytes, cursor);
      if (dtVlq.isMalformed) {
        scanDiagnostics.push(
          `Delta-time VLQ truncado o malformado en pista ${trackIndex}, offset ${cursor}`
        );
      }
      cursor += dtVlq.bytesRead;
      const deltaTime = dtVlq.value;
      absoluteTick += deltaTime;

      if (cursor >= trackEndOffset) break;

      let statusByte = bytes[cursor];
      let hasRunningStatus = false;

      if ((statusByte & 0x80) === 0) {
        // Evento con running status activo
        if (runningStatus === 0) {
          scanDiagnostics.push(
            `Running status ausente o inválido en pista ${trackIndex}, offset ${cursor}`
          );
          cursor++;
          continue;
        }
        statusByte = runningStatus;
        hasRunningStatus = true;
      } else {
        cursor++;
        if (statusByte < 0xf0) {
          runningStatus = statusByte;
        } else {
          runningStatus = 0; // SysEx y Meta cancelan el running status
        }
      }

      const eventId = `evt_t${trackIndex}_o${orderInTrack}_k${absoluteTick}`;

      // 2. Clasificación de eventos
      if (statusByte === 0xf0 || statusByte === 0xf7) {
        // ── Evento SysEx (Sección 11.1) ──
        const sysExType: 'F0' | 'F7' = statusByte === 0xf0 ? 'F0' : 'F7';
        const lenVlq = readVLQ(bytes, cursor);
        cursor += lenVlq.bytesRead;

        const declaredLength = lenVlq.value;
        const availableBytes = Math.max(0, Math.min(declaredLength, trackEndOffset - cursor));
        const payload = bytes.slice(cursor, cursor + availableBytes);
        cursor += availableBytes;

        const endsWithF7 = payload.length > 0 && payload[payload.length - 1] === 0xf7;

        const sysExEvent: MidiSysExEventIR = {
          id: `sysex_t${trackIndex}_o${orderInTrack}_k${absoluteTick}`,
          trackIndex,
          orderInTrack,
          absoluteTick,
          eventType: sysExType,
          vlqLengthBytes: lenVlq.bytesRead,
          declaredLength,
          payload,
          byteOffset: eventByteOffset,
          endsWithF7,
        };
        sysExEvents.push(sysExEvent);

        rawEvents.push({
          id: eventId,
          trackIndex,
          orderInTrack,
          absoluteTick,
          deltaTime,
          byteOffset: eventByteOffset,
          type: sysExType === 'F0' ? 'sysex_f0' : 'sysex_f7',
          statusByte,
          data: payload,
        });
      } else if (statusByte === 0xff) {
        // ── Meta Evento ──
        if (cursor >= trackEndOffset) break;
        const metaType = bytes[cursor++];
        const lenVlq = readVLQ(bytes, cursor);
        cursor += lenVlq.bytesRead;

        const metaLen = lenVlq.value;
        const metaData = bytes.slice(cursor, cursor + metaLen);
        cursor += metaLen;

        let eventType: MidiEventType = 'meta_other';
        if (metaType === 0x51) {
          eventType = 'meta_tempo';
          if (metaData.length >= 3) {
            const mpqn = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
            const bpm = mpqn > 0 ? Math.round((60000000 / mpqn) * 100) / 100 : 0;
            const isConforming = format === 0 || trackIndex === 0;
            const isZeroOrInvalid = mpqn <= 0;

            rawTempoEvents.push({
              eventId: `tempo_t${trackIndex}_o${orderInTrack}_k${absoluteTick}`,
              trackIndex,
              absoluteTick,
              orderInTrack,
              microsecondsPerQuarter: mpqn,
              bpm,
              isConforming,
              isZeroOrInvalid,
              byteOffset: eventByteOffset,
            });
          }
        } else if (metaType === 0x58) {
          eventType = 'meta_time_sig';
        } else if (metaType === 0x59) {
          eventType = 'meta_key_sig';
        } else if (metaType === 0x03) {
          eventType = 'meta_track_name';
        } else if (metaType === 0x2f) {
          eventType = 'meta_end_of_track';
        }

        rawEvents.push({
          id: eventId,
          trackIndex,
          orderInTrack,
          absoluteTick,
          deltaTime,
          byteOffset: eventByteOffset,
          type: eventType,
          statusByte,
          data: metaData,
        });
      } else {
        // ── Evento de Canal (0x80 .. 0xEF) ──
        const command = statusByte & 0xf0;
        const channel = statusByte & 0x0f;

        let numDataBytes = 2;
        if (command === 0xc0 || command === 0xd0) {
          numDataBytes = 1;
        }

        const dataBytes: number[] = [];
        for (let i = 0; i < numDataBytes; i++) {
          if (cursor < trackEndOffset) {
            dataBytes.push(bytes[cursor++]);
          }
        }

        let eventType: MidiEventType = 'meta_other';
        switch (command) {
          case 0x80:
            eventType = 'note_off';
            break;
          case 0x90:
            eventType = dataBytes[1] === 0 ? 'note_off' : 'note_on';
            break;
          case 0xa0:
            eventType = 'poly_pressure';
            break;
          case 0xb0:
            eventType = 'control_change';
            break;
          case 0xc0:
            eventType = 'program_change';
            break;
          case 0xd0:
            eventType = 'channel_pressure';
            break;
          case 0xe0:
            eventType = 'pitch_bend';
            break;
        }

        rawEvents.push({
          id: eventId,
          trackIndex,
          orderInTrack,
          absoluteTick,
          deltaTime,
          byteOffset: eventByteOffset,
          type: eventType,
          statusByte,
          channel,
          data: new Uint8Array(dataBytes),
        });
      }

      orderInTrack++;
    }

    trackIndex++;
    cursor = trackEndOffset;
  }

  return {
    format,
    numTracks,
    ppq,
    headerLength,
    rawEvents,
    sysExEvents,
    rawTempoEvents,
    scanDiagnostics,
  };
}
