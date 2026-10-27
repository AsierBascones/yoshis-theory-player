/**
 * midiInterpreterSpecV21.test.ts
 * Suite de pruebas normativas para MIDI_INTERPRETER_SPECIFICATION_v2.1.
 * Cubre exhaustivamente las cuatro áreas prioritarias:
 * 1. Prioridad A: Fidelidad y reconstrucción de eventos SysEx (Sección 11.1).
 * 2. Prioridad B: Política normativa del Mapa de Tempo (Modo estricto vs compatibilidad, Set Tempo 0, simultáneos) (Secciones 12.2 y 12.3).
 * 3. Prioridad C: Identidad, procedencia y orden de eventos simultáneos (Sección 13.2).
 * 4. Prioridad D: Garantías de análisis musical (Niveles A, B, C), hipótesis múltiples y abstención justificada (Secciones 16 y 23).
 */

import { parseMidiBufferToIR } from './midiParser';
import { scanMidiBinary, readVLQ } from './midiBinaryScanner';
import { reconstructSysExSequences } from './midiSysEx';
import { buildTempoMap, convertTicksToSeconds } from './midiTempoMap';
import {
  sortEventsDeterministically,
  reconstructNotesFromRawEvents,
  DEFAULT_SIMULTANEOUS_POLICY,
} from './midiEventSequence';
import { analyzeWindowHarmonics } from './midiMusicalInference';
import type { MidiNoteIR } from '../../types/midiIR';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, detail?: any) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
    if (detail !== undefined) {
      console.error('    Detail:', detail);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// UTILIDADES BINARIAS PARA CONSTRUIR FIXTURES SMF SINTÉTICOS EXACTOS
// ────────────────────────────────────────────────────────────────────────────

function encodeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  if (value === 0) return [0];
  const bytes: number[] = [];
  let temp = value;
  while (temp > 0) {
    bytes.push(temp & 0x7f);
    temp >>= 7;
  }
  bytes.reverse();
  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 0x80;
  }
  return bytes;
}

function buildMTrk(eventsBytes: number[]): number[] {
  // Asegurar metaevento End of Track (FF 2F 00) si no está presente
  const len = eventsBytes.length;
  return [
    0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...eventsBytes,
  ];
}

function buildSMF(format: 0 | 1, ppq: number, tracks: number[][]): Uint8Array {
  const numTracks = tracks.length;
  const mthd = [
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06, // length 6
    (format >> 8) & 0xff, format & 0xff,
    (numTracks >> 8) & 0xff, numTracks & 0xff,
    (ppq >> 8) & 0xff, ppq & 0xff,
  ];
  const allBytes = [...mthd];
  for (const t of tracks) {
    allBytes.push(...buildMTrk(t));
  }
  return new Uint8Array(allBytes);
}

console.log('=== TEST SUITE: MIDI Interpreter Specification v2.1 ===\n');

// ────────────────────────────────────────────────────────────────────────────
// PRIORIDAD A: EVENTOS SYSEX Y FIDELIDAD SMF (SECCIÓN 11.1)
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Prioridad A: Fidelidad y Reconstrucción de Eventos SysEx (11.1):');

// 1.1 Evento F0 con payload válido completo (termina en F7)
const sysexF0Payload = [0x7e, 0x7f, 0x09, 0x01, 0xf7]; // GM Reset
const trkF0 = [
  ...encodeVLQ(0), 0xf0, ...encodeVLQ(sysexF0Payload.length), ...sysexF0Payload,
  ...encodeVLQ(0), 0xff, 0x2f, 0x00, // End of Track
];
const smfF0 = buildSMF(0, 480, [trkF0]);
const irF0 = parseMidiBufferToIR(smfF0);

assert(irF0.sysExEvents !== undefined && irF0.sysExEvents.length === 1, 'Detecta exactamente 1 evento SysEx en el archivo');
assert(irF0.sysExEvents![0].eventType === 'F0', 'Tipo de evento conservado como F0');
assert(irF0.sysExEvents![0].declaredLength === 5, 'Longitud declarada conservada como 5');
assert(irF0.sysExEvents![0].endsWithF7 === true, 'endsWithF7 es true');
assert(irF0.sysExInterpretations !== undefined && irF0.sysExInterpretations.length === 1, 'Genera interpretación SysEx');
assert(irF0.sysExInterpretations![0].type === 'complete', 'Interpretación clasificada como complete');
assert(irF0.sysExInterpretations![0].isTransmittable === true, 'isTransmittable es true');
assert(irF0.sysExInterpretations![0].reconstructedBytes![0] === 0xf0, 'Bytes reconstruidos inician con 0xF0');
assert(irF0.sysExInterpretations![0].reconstructedBytes![irF0.sysExInterpretations![0].reconstructedBytes!.length - 1] === 0xf7, 'Bytes reconstruidos finalizan con 0xF7');

// 1.2 Evento F0 con payload vacío (0 bytes declarados)
const trkEmptySysEx = [
  ...encodeVLQ(0), 0xf0, ...encodeVLQ(0), // F0 con longitud 0
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfEmptySysEx = buildSMF(0, 480, [trkEmptySysEx]);
const irEmptySysEx = parseMidiBufferToIR(smfEmptySysEx);
assert(irEmptySysEx.sysExEvents![0].payload.length === 0, 'Payload vacío conservado como Uint8Array de longitud 0');
assert(irEmptySysEx.sysExInterpretations![0].diagnostics.some(d => d.code === 'SYSEX_EMPTY_PAYLOAD'), 'Emite diagnóstico SYSEX_EMPTY_PAYLOAD');

// 1.3 Evento F7 como Escape Sequence independiente
const escapePayload = [0xf8]; // Timing Clock escapado
const trkEscape = [
  ...encodeVLQ(100), 0xf7, ...encodeVLQ(escapePayload.length), ...escapePayload,
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfEscape = buildSMF(0, 480, [trkEscape]);
const irEscape = parseMidiBufferToIR(smfEscape);
assert(irEscape.sysExEvents![0].eventType === 'F7', 'Tipo de evento de escape conservado como F7');
assert(irEscape.sysExInterpretations![0].type === 'escape', 'Interpretación clasificada como escape');
assert(irEscape.sysExInterpretations![0].reconstructedBytes![0] === 0xf8, 'Escape transmite payload directamente sin prefijo F7');

// 1.4 Secuencia SysEx fragmentada (F0 sin F7 continuado por F7 con F7)
const part1 = [0x41, 0x10, 0x42]; // Roland packet part 1 (sin F7)
const part2 = [0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7]; // Roland packet part 2 (con F7)
const trkFrag = [
  ...encodeVLQ(0), 0xf0, ...encodeVLQ(part1.length), ...part1,
  ...encodeVLQ(240), 0xf7, ...encodeVLQ(part2.length), ...part2,
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfFrag = buildSMF(0, 480, [trkFrag]);
const irFrag = parseMidiBufferToIR(smfFrag);
assert(irFrag.sysExEvents!.length === 2, 'Conserva los 2 eventos SysEx originales por separado');
assert(irFrag.sysExEvents![0].eventType === 'F0' && !irFrag.sysExEvents![0].endsWithF7, 'Evento 1 es F0 sin F7');
assert(irFrag.sysExEvents![1].eventType === 'F7' && irFrag.sysExEvents![1].endsWithF7, 'Evento 2 es F7 con terminador F7');
assert(irFrag.sysExInterpretations!.length === 1, 'Reconstruye en 1 único mensaje lógico complete');
assert(irFrag.sysExInterpretations![0].type === 'complete', 'Mensaje fragmentado cerrado con éxito como complete');
assert(irFrag.sysExInterpretations![0].sourceEvents.length === 2, 'Conserva la referencia a los 2 eventos fuente');
assert(irFrag.sysExInterpretations![0].reconstructedBytes!.length === 1 + part1.length + part2.length, 'Longitud reconstruida exacta sin pérdida');

// 1.5 Secuencia incompleta al final de la pista (F0 sin F7 y termina la pista)
const trkIncomplete = [
  ...encodeVLQ(0), 0xf0, ...encodeVLQ(part1.length), ...part1,
  ...encodeVLQ(0), 0xff, 0x2f, 0x00, // EOT sin F7
];
const smfIncomplete = buildSMF(0, 480, [trkIncomplete]);
const irIncomplete = parseMidiBufferToIR(smfIncomplete);
assert(irIncomplete.sysExInterpretations![0].type === 'incomplete', 'Clasificado como incomplete al llegar a EOT');
assert(irIncomplete.sysExInterpretations![0].isTransmittable === false, 'Secuencia incompleta no es transmisible');
assert(irIncomplete.sysExInterpretations![0].diagnostics.some(d => d.code === 'SYSEX_UNTERMINATED_AT_EOT'), 'Emite diagnóstico SYSEX_UNTERMINATED_AT_EOT');

// 1.6 Preservación exacta sin mutar terminadores F7
assert(irF0.sysExEvents![0].payload[irF0.sysExEvents![0].payload.length - 1] === 0xf7, 'Payload original conservó byte F7 final');
assert(irFrag.sysExEvents![0].payload[irFrag.sysExEvents![0].payload.length - 1] !== 0xf7, 'Payload fragmentado 1 NO fue mutado para añadir F7');

// ────────────────────────────────────────────────────────────────────────────
// PRIORIDAD B: MAPA DE TEMPO Y CONFORMIDAD SMF (SECCIONES 12.2 Y 12.3)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Prioridad B: Política Normativa del Mapa de Tempo (12.2 y 12.3):');

// 2.1 SMF Formato 1: Tempo conforme en Pista 0
const trk0Conforming = [
  ...encodeVLQ(0), 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 500,000 µs = 120 BPM
  ...encodeVLQ(960), 0xff, 0x51, 0x03, 0x06, 0x1a, 0x80, // 400,000 µs = 150 BPM
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const trk1Notes = [
  ...encodeVLQ(0), 0x90, 60, 100, // Note On
  ...encodeVLQ(480), 0x80, 60, 0, // Note Off
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfF1Conforming = buildSMF(1, 480, [trk0Conforming, trk1Notes]);
const irF1 = parseMidiBufferToIR(smfF1Conforming);

assert(irF1.tempoMapStrict !== undefined && irF1.tempoMapStrict.isValid === true, 'Mapa estricto en Formato 1 conforme es válido');
assert(irF1.tempoMapStrict!.segments.length === 2, 'Mapa estricto tiene 2 segmentos');
assert(irF1.tempoMapStrict!.segments[0].bpm === 120, 'Segmento 1 es 120 BPM');
assert(irF1.tempoMapStrict!.segments[1].bpm === 150, 'Segmento 2 es 150 BPM');
assert(irF1.tempoMapStrict!.segments[1].startTick === 960, 'Segmento 2 inicia en tick 960');

// 2.2 Evento de tempo fuera de la Pista 0 en Formato 1
const trk0Empty = [...encodeVLQ(0), 0xff, 0x2f, 0x00];
const trk1NonConforming = [
  ...encodeVLQ(0), 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // Tempo en Pista 1 (no conforme)
  ...encodeVLQ(480), 0xff, 0x51, 0x03, 0x06, 0x1a, 0x80,
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfNonConforming = buildSMF(1, 480, [trk0Empty, trk1NonConforming]);
const irNonConforming = parseMidiBufferToIR(smfNonConforming);

assert(
  irNonConforming.tempoMapStrict!.diagnostics.some(d => d.code === 'TEMPO_OUTSIDE_TRACK_0'),
  'Modo estricto genera diagnóstico TEMPO_OUTSIDE_TRACK_0 para eventos fuera de pista 0'
);
assert(
  irNonConforming.tempoMapStrict!.segments[0].winningEvent.eventId === 'tempo_default_initial',
  'Modo estricto no atribuye prioridad a eventos no conformes y aplica tempo estándar'
);
assert(
  irNonConforming.tempoMapCompatibility!.isValid === true,
  'Modo compatibilidad recoge los eventos de otras pistas'
);
assert(
  irNonConforming.tempoMapCompatibility!.segments.length >= 2,
  'Modo compatibilidad construye el mapa efectivo a partir de la pista 1'
);

// 2.3 Set Tempo = 0 (Inválido según SMF spec)
const trkZeroTempo = [
  ...encodeVLQ(0), 0xff, 0x51, 0x03, 0x00, 0x00, 0x00, // MPQN = 0
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfZeroTempo = buildSMF(0, 480, [trkZeroTempo]);
const irZeroTempo = parseMidiBufferToIR(smfZeroTempo);

assert(irZeroTempo.tempoMapStrict!.isValid === false, 'Set Tempo = 0 invalida el mapa de tempo estricto');
assert(irZeroTempo.tempoMapStrict!.diagnostics.some(d => d.code === 'TEMPO_ZERO_OR_NEGATIVE'), 'Emite diagnóstico TEMPO_ZERO_OR_NEGATIVE');
const convZero = convertTicksToSeconds(480, irZeroTempo.tempoMapStrict!, 480);
assert(convZero.isExact === false && convZero.seconds === -1, 'Conversión temporal informa que el tiempo no está disponible (isExact: false)');

// 2.4 Varios cambios de tempo en el mismo tick (Simultaneidad y política determinista)
const trkMultiTempoTick0 = [
  ...encodeVLQ(0), 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 120 BPM
  ...encodeVLQ(0), 0xff, 0x51, 0x03, 0x05, 0xb8, 0xd8, // 160 BPM (mismo tick 0)
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfMultiTempo = buildSMF(0, 480, [trkMultiTempoTick0]);
const irMultiTempo = parseMidiBufferToIR(smfMultiTempo);

assert(irMultiTempo.tempoMapStrict!.segments[0].sourceEvents.length === 2, 'Conserva los 2 eventos de tempo candidatos en sourceEvents');
assert(irMultiTempo.tempoMapStrict!.segments[0].bpm === 160, 'El último evento en orden original prevalece determinísticamente (160 BPM)');
assert(irMultiTempo.tempoMapStrict!.segments[0].hasConflict === true, 'Señaliza conflicto de simultaneidad (hasConflict: true)');
assert(irMultiTempo.tempoMapStrict!.diagnostics.some(d => d.code === 'TEMPO_SIMULTANEOUS_CONFLICT'), 'Emite diagnóstico TEMPO_SIMULTANEOUS_CONFLICT');

// 2.5 Precisión de conversión temporal de ticks a segundos
const conv1 = convertTicksToSeconds(0, irF1.tempoMapStrict!, 480);
assert(conv1.seconds === 0, 'Tick 0 equivale exactamente a 0.0 segundos');
const conv2 = convertTicksToSeconds(480, irF1.tempoMapStrict!, 480);
assert(Math.abs(conv2.seconds - 0.5) < 0.001, 'Tick 480 a 120 BPM equivale a 0.5 segundos');
const conv3 = convertTicksToSeconds(960, irF1.tempoMapStrict!, 480);
assert(Math.abs(conv3.seconds - 1.0) < 0.001, 'Tick 960 a 120 BPM equivale a 1.0 segundos');
const conv4 = convertTicksToSeconds(1440, irF1.tempoMapStrict!, 480);
// 1.0 s + (480 * 400,000 / (480 * 1,000,000)) = 1.0 + 0.4 = 1.4 s
assert(Math.abs(conv4.seconds - 1.4) < 0.001, 'Tick 1440 con cambio a 150 BPM equivale exactamente a 1.4 segundos');

// ────────────────────────────────────────────────────────────────────────────
// PRIORIDAD C: IDENTIDAD Y ORDEN DE EVENTOS SIMULTÁNEOS (SECCIÓN 13.2)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Prioridad C: Identidad y Orden de Eventos Simultáneos (13.2):');

// 3.1 Identidad estable y procedencia inmutable de cada evento
assert(irF1.rawEvents !== undefined && irF1.rawEvents.length > 0, 'Genera rawEvents con procedencia inmutable');
const firstEv = irF1.rawEvents![0];
assert(firstEv.id.startsWith('evt_t0_o0_k0'), `ID estable generado conforme: ${firstEv.id}`);
assert(typeof firstEv.orderInTrack === 'number', 'Conserva orderInTrack');
assert(typeof firstEv.byteOffset === 'number', 'Conserva byteOffset original');

// 3.2 Program Change y Note On en la misma pista: preserva orden original
const trkPCOn = [
  ...encodeVLQ(0), 0xc0, 24,       // Program Change: 24 (Acoustic Guitar)
  ...encodeVLQ(0), 0x90, 60, 100,  // Note On C4
  ...encodeVLQ(480), 0x80, 60, 0,
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfPCOn = buildSMF(0, 480, [trkPCOn]);
const irPCOn = parseMidiBufferToIR(smfPCOn);
const pcEv = irPCOn.rawEvents!.find(e => e.type === 'program_change')!;
const noteOnEv = irPCOn.rawEvents!.find(e => e.type === 'note_on')!;
assert(pcEv.orderInTrack < noteOnEv.orderInTrack, 'Program Change precede a Note On según orden original en la pista');

// 3.3 Note Off y Note On del mismo pitch en el mismo tick dentro de la misma pista
const trkSameTickNoteOffOn = [
  ...encodeVLQ(0), 0x90, 60, 100, // Note On 1
  ...encodeVLQ(480), 0x80, 60, 0, // Note Off 1 en tick 480
  ...encodeVLQ(0), 0x90, 60, 90,  // Note On 2 en tick 480
  ...encodeVLQ(480), 0x80, 60, 0, // Note Off 2 en tick 960
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfSameTick = buildSMF(0, 480, [trkSameTickNoteOffOn]);
const irSameTick = parseMidiBufferToIR(smfSameTick);
assert(irSameTick.tracks[0].notes.length === 2, 'Reconstruye 2 notas independientes sin colapsarlas');
assert(irSameTick.tracks[0].notes[0].startTick === 0 && irSameTick.tracks[0].notes[0].endTick === 480, 'Nota 1 cubre ticks [0, 480)');
assert(irSameTick.tracks[0].notes[1].startTick === 480 && irSameTick.tracks[0].notes[1].endTick === 960, 'Nota 2 cubre ticks [480, 960)');

// 3.4 Emparejamiento FIFO estricto de notas repetidas y solapadas
const trkOverlappingNotes = [
  ...encodeVLQ(0), 0x90, 60, 100,  // Note On 1 (tick 0)
  ...encodeVLQ(240), 0x90, 60, 110, // Note On 2 (tick 240)
  ...encodeVLQ(240), 0x80, 60, 0,   // Note Off 1 (tick 480)
  ...encodeVLQ(240), 0x80, 60, 0,   // Note Off 2 (tick 720)
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfOverlapping = buildSMF(0, 480, [trkOverlappingNotes]);
const scanOverlapping = scanMidiBinary(smfOverlapping);
const tMap = buildTempoMap(scanOverlapping.rawTempoEvents, 0, 'strict', 480);
const fifoResult = reconstructNotesFromRawEvents(scanOverlapping.rawEvents, tMap, 480);
assert(fifoResult.notes.length === 2, 'Emparejamiento FIFO reconstruye 2 notas');
assert(fifoResult.notes[0].startTick === 0 && fifoResult.notes[0].endTick === 480, 'Nota 1 emparejada FIFO: [0, 480)');
assert(fifoResult.notes[1].startTick === 240 && fifoResult.notes[1].endTick === 720, 'Nota 2 emparejada FIFO: [240, 720)');

// 3.5 Aislamiento entre pistas: NUNCA emparejar notas entre pistas distintas
const trkTrack0Notes = [
  ...encodeVLQ(0), 0x90, 64, 100, // Note On E4 en pista 0
  ...encodeVLQ(0), 0xff, 0x2f, 0x00, // Sin Note Off
];
const trkTrack1Notes = [
  ...encodeVLQ(480), 0x80, 64, 0, // Note Off E4 en pista 1
  ...encodeVLQ(0), 0xff, 0x2f, 0x00,
];
const smfCrossTrack = buildSMF(1, 480, [trkTrack0Notes, trkTrack1Notes]);
const scanCross = scanMidiBinary(smfCrossTrack);
const tMapCross = buildTempoMap(scanCross.rawTempoEvents, 1, 'strict', 480);
const crossResult = reconstructNotesFromRawEvents(scanCross.rawEvents, tMapCross, 480);

assert(crossResult.orphanNotes.length === 1, 'Note On en pista 0 queda huérfano sin emparejarse con pista 1');
assert(crossResult.orphanNoteOffs.length === 1, 'Note Off en pista 1 queda huérfano sin emparejarse con pista 0');

// 3.6 Conservación de pitch absoluto (0..127) sin colapsar octavas
assert(crossResult.orphanNotes[0].pitchMidi === 64, 'Pitch absoluto conservado como 64');
assert(crossResult.orphanNotes[0].pitchClass === 4, 'Pitch class calculado correctamente como 4');
assert(crossResult.orphanNotes[0].octave === 4, 'Octava calculada correctamente como 4');

// ────────────────────────────────────────────────────────────────────────────
// PRIORIDAD D: GARANTÍAS DEL ANÁLISIS MUSICAL Y ABSTENCIÓN (SECCIONES 16 Y 23)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Prioridad D: Garantías de Análisis Musical y Abstención Justificada (16 y 23):');

// 4.1 Tres niveles de garantía explícitos
const mockNotesCmaj: MidiNoteIR[] = [
  { id: 'n1', pitchMidi: 48, pitchClass: 0, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
  { id: 'n2', pitchMidi: 52, pitchClass: 4, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
  { id: 'n3', pitchMidi: 55, pitchClass: 7, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
];
const analysisC = analyzeWindowHarmonics(mockNotesCmaj, 0, 480, { tonic: 'C', scale: 'major' });

assert(analysisC.guaranteeLevel === 'LEVEL_C_MUSICAL_INFERENCE', 'Etiqueta explícita de Nivel C (Inferencia musical, no parsing)');
assert(analysisC.evidenceLevel === 'sufficient_evidence', 'Tríada C mayor tiene sufficient_evidence');
assert(analysisC.preferredHypothesis !== undefined && analysisC.preferredHypothesis.rootPitchClass === 0, 'Identifica C como fundamental');
assert(analysisC.sourceNoteIds.length === 3, 'Conserva la referencia exacta a las notas fuente (n1, n2, n3)');
assert(analysisC.provenance === 'inferred', 'Procedencia marcada como inferred');

// 4.2 Ambigüedad armónica y múltiples hipótesis (C6 vs Am7/C: C, E, G, A)
const mockNotesAm7C: MidiNoteIR[] = [
  { id: 'n1', pitchMidi: 48, pitchClass: 0, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 }, // C3 (bajo)
  { id: 'n2', pitchMidi: 52, pitchClass: 4, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 }, // E3
  { id: 'n3', pitchMidi: 55, pitchClass: 7, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 }, // G3
  { id: 'n4', pitchMidi: 57, pitchClass: 9, octave: 3, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 }, // A3
];
const analysisAm7C = analyzeWindowHarmonics(mockNotesAm7C, 0, 480, { tonic: 'C', scale: 'major' });
assert(analysisAm7C.evidenceLevel === 'plausible_alternatives', 'Colección ambigua (C6/Am7) señaliza plausible_alternatives');
assert(analysisAm7C.candidateHypotheses.length >= 2, 'Conserva al menos 2 hipótesis alternativas plausibles');
assert(analysisAm7C.candidateHypotheses.some(h => h.chordSymbol.includes('Am7')), 'Incluye alternativa relativa Am7/C');

// 4.3 Abstención justificada ante ausencia de notas (ventana vacía)
const analysisEmpty = analyzeWindowHarmonics([], 0, 480, { tonic: 'C', scale: 'major' });
assert(analysisEmpty.evidenceLevel === 'unknown', 'Ventana vacía produce abstención justificada (unknown)');
assert(analysisEmpty.candidateHypotheses.length === 0, 'No inventa ningún acorde artificial');
assert(Boolean(analysisEmpty.explanation?.includes('Abstención justificada')), 'Proporciona explicación explícita de abstención');

// 4.4 Abstención justificada ante cluster cromático atonal denso (C, C#, D, D#, E)
const mockNotesCluster: MidiNoteIR[] = [
  { id: 'c1', pitchMidi: 60, pitchClass: 0, octave: 4, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
  { id: 'c2', pitchMidi: 61, pitchClass: 1, octave: 4, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
  { id: 'c3', pitchMidi: 62, pitchClass: 2, octave: 4, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
  { id: 'c4', pitchMidi: 63, pitchClass: 3, octave: 4, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
  { id: 'c5', pitchMidi: 64, pitchClass: 4, octave: 4, startTick: 0, durationTicks: 480, endTick: 480, startSeconds: 0, durationSeconds: 0.5, velocity: 0.8, trackIndex: 0, channel: 0 },
];
const analysisCluster = analyzeWindowHarmonics(mockNotesCluster, 0, 480, { tonic: 'C', scale: 'major' });
assert(analysisCluster.evidenceLevel === 'unknown', 'Cluster cromático atonal produce abstención justificada (unknown)');
assert(analysisCluster.candidateHypotheses.length === 0, 'No fuerza un acorde tonal sobre un cluster atonal');

console.log('\n========================================');
console.log(`MIDI INTERPRETER SPEC v2.1 RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`MIDI interpreter spec v2.1 tests failed: ${failed} failure(s)`);
}
