/**
 * midiEngine.test.ts
 * Batería de pruebas automatizadas para la Capa A (MIDI Parser) y Capa B (MidiMusicalIR).
 * Cubre:
 * 1. Lectura de MIDI Format 0 y Format 1.
 * 2. Rechazo controlado de Format 2 y formatos desconocidos.
 * 3. Detección defensiva de archivos vacíos, truncados o corruptos.
 * 4. Conservación exacta de PPQ, ticks, duraciones y velocidades.
 * 5. Múltiples pistas, canales, programas y detección de percusión (canal 9).
 * 6. Mapas de tempo dinámicos y cambios de compás en posiciones arbitrarias.
 * 7. Notas simultáneas (acordes), repetidas y ordenación cronológica.
 * 8. Inmutabilidad estricta de la estructura MidiMusicalIR (deepFreeze).
 * 9. Validación de invariantes temporales y utilidades de consulta de la IR.
 * 10. Comprobación empírica del comportamiento de @tonejs/midi ante notas huérfanas sin Note Off.
 */

import { Midi } from '@tonejs/midi';
import {
  parseMidiBufferToIR,
  parseMidiBinaryHeader,
} from './midiParser';
import {
  validateMidiMusicalIR,
  ticksToCanonicalBeats,
  canonicalBeatsToTicks,
  getTempoAtTick,
  getTimeSignatureAtTick,
  getNotesInTickRange,
  getNotesByTrack,
  getPitchClassHistogram,
} from './midiIR';
import { MidiParseError } from '../../types/midiIR';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

console.log('=== TEST SUITE: MIDI Parser & Musical IR (Capa A & B) ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. VALIDACIÓN BINARIA DE CABECERA Y CONTROL DE FORMATOS
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Validación de Cabecera Binaria y Formatos:');

// 1.1 Archivo vacío (0 bytes) lanza EMPTY_FILE
try {
  parseMidiBufferToIR(new Uint8Array(0));
  assert(false, 'Archivo vacío de 0 bytes debió lanzar error');
} catch (e: any) {
  assert(e instanceof MidiParseError, 'Lanza instancia de MidiParseError');
  assert(e.code === 'EMPTY_FILE', `Código de error es EMPTY_FILE (obtenido: ${e.code})`);
}

// 1.2 Archivo truncado (< 14 bytes) lanza TRUNCATED_HEADER
try {
  parseMidiBufferToIR(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00]));
  assert(false, 'Archivo de 6 bytes debió lanzar TRUNCATED_HEADER');
} catch (e: any) {
  assert(e instanceof MidiParseError && e.code === 'TRUNCATED_HEADER', 'Detecta archivo truncado (< 14 bytes)');
}

// 1.3 Archivo con identificador mágico no válido lanza INVALID_MAGIC_HEADER
try {
  const badMagic = new Uint8Array(16);
  badMagic[0] = 0x52; badMagic[1] = 0x49; badMagic[2] = 0x46; badMagic[3] = 0x46; // "RIFF"
  parseMidiBufferToIR(badMagic);
  assert(false, 'Cabecera no-MThd debió lanzar INVALID_MAGIC_HEADER');
} catch (e: any) {
  assert(e instanceof MidiParseError && e.code === 'INVALID_MAGIC_HEADER', 'Detecta cabecera no-MThd');
}

// 1.3b Inspección directa de parseMidiBinaryHeader en buffer válido
const validHeaderInfo = parseMidiBinaryHeader(new Uint8Array([
  0x4d, 0x54, 0x68, 0x64, // "MThd"
  0x00, 0x00, 0x00, 0x06, // length 6
  0x00, 0x01,             // format 1
  0x00, 0x04,             // 4 tracks
  0x01, 0xe0              // 480 PPQ
]));
assert(validHeaderInfo.format === 1, 'parseMidiBinaryHeader extrae format 1');
assert(validHeaderInfo.numTracks === 4, 'parseMidiBinaryHeader extrae 4 tracks');
assert(validHeaderInfo.ppq === 480, 'parseMidiBinaryHeader extrae PPQ 480');

// 1.4 MIDI Format 2 es rechazado con UNSUPPORTED_FORMAT y mensaje explicativo
const midiF2 = new Midi();
const bytesF2 = midiF2.toArray();
bytesF2[9] = 2; // Forzar formato 2 en cabecera binaria
try {
  parseMidiBufferToIR(bytesF2);
  assert(false, 'Format 2 debió ser rechazado');
} catch (e: any) {
  assert(e instanceof MidiParseError, 'Format 2 lanza MidiParseError');
  assert(e.code === 'UNSUPPORTED_FORMAT', 'Código es UNSUPPORTED_FORMAT');
  assert(e.message.includes('Format 2 no está soportado'), 'Mensaje explica incompatibilidad con línea de tiempo única');
}

// 1.5 Formato desconocido (ej. Format 3) es rechazado
const bytesF3 = midiF2.toArray();
bytesF3[9] = 3;
try {
  parseMidiBufferToIR(bytesF3);
  assert(false, 'Format 3 debió ser rechazado');
} catch (e: any) {
  assert(e instanceof MidiParseError && e.code === 'UNSUPPORTED_FORMAT', 'Rechaza formato desconocido > 2');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. LECTURA DE MIDI FORMAT 0 (PISTA ÚNICA MULTICANAL)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Lectura y Conservación de MIDI Format 0:');

const midi0 = new Midi();
const track0 = midi0.addTrack();
track0.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
track0.addNote({ midi: 64, ticks: 480, durationTicks: 240, velocity: 0.7 });
track0.addNote({ midi: 67, ticks: 720, durationTicks: 240, velocity: 0.6 });
const bytes0 = midi0.toArray();
// Forzar format 0 en bytes de cabecera
bytes0[9] = 0;

const ir0 = parseMidiBufferToIR(bytes0);
assert(ir0.header.format === 0, 'Format 0 detectado y preservado en header');
assert(ir0.provenance.format === 0, 'Format 0 registrado en provenance');
assert(ir0.header.ppq === 480, 'PPQ es 480');
assert(ir0.allNotes.length === 3, 'Contiene exactamente 3 notas');
assert(ir0.allNotes[0].pitchMidi === 60, 'Nota 1 es C4 (MIDI 60)');
assert(ir0.allNotes[0].startTick === 0, 'Nota 1 startTick es 0');
assert(ir0.allNotes[0].durationTicks === 480, 'Nota 1 durationTicks es 480');
assert(ir0.allNotes[0].endTick === 480, 'Nota 1 endTick es 480');
assert(ir0.allNotes[1].pitchMidi === 64, 'Nota 2 es E4 (MIDI 64)');
assert(ir0.allNotes[1].startTick === 480, 'Nota 2 startTick es 480');
assert(ir0.allNotes[2].pitchMidi === 67, 'Nota 3 es G4 (MIDI 67)');

// ────────────────────────────────────────────────────────────────────────────
// 3. LECTURA DE MIDI FORMAT 1 (MÚLTIPLES PISTAS SINCRÓNICAS)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Lectura de MIDI Format 1, Pistas, Canales y Percusión:');

const midi1 = new Midi();
midi1.name = 'Orchestral Suite';

// Pista 1: Melodía (Piano en canal 0, programa 0)
const trkLead = midi1.addTrack();
trkLead.name = 'Lead Melody';
trkLead.channel = 0;
trkLead.instrument.number = 0; // Acoustic Grand Piano
trkLead.addNote({ midi: 72, ticks: 0, durationTicks: 480, velocity: 0.85 }); // C5
trkLead.addNote({ midi: 74, ticks: 480, durationTicks: 480, velocity: 0.9 });  // D5

// Pista 2: Bajo (Bajo acústico en canal 1, programa 32)
const trkBass = midi1.addTrack();
trkBass.name = 'Acoustic Bass';
trkBass.channel = 1;
trkBass.instrument.number = 32;
trkBass.addNote({ midi: 36, ticks: 0, durationTicks: 960, velocity: 0.95 }); // C2

// Pista 3: Percusión (Canal 9)
const trkDrums = midi1.addTrack();
trkDrums.name = 'Drums & Beat';
trkDrums.channel = 9;
trkDrums.addNote({ midi: 36, ticks: 0, durationTicks: 120, velocity: 0.9 });   // Bass Drum
trkDrums.addNote({ midi: 38, ticks: 480, durationTicks: 120, velocity: 0.85 }); // Snare

const bytes1 = midi1.toArray();
const ir1 = parseMidiBufferToIR(bytes1);

assert(ir1.header.format === 1, 'Format 1 detectado en cabecera');
assert(ir1.tracks.length === 3, 'Preserva 3 pistas distintas');
assert(ir1.tracks[0].name === 'Lead Melody', 'Pista 0 conserva nombre Lead Melody');
assert(ir1.tracks[0].channel === 0, 'Pista 0 canal es 0');
assert(!ir1.tracks[0].isPercussion, 'Pista 0 no es percusión');
assert(ir1.tracks[1].name === 'Acoustic Bass', 'Pista 1 conserva nombre Acoustic Bass');
assert(ir1.tracks[1].channel === 1, 'Pista 1 canal es 1');
assert(ir1.tracks[1].programNumber === 32, 'Pista 1 programa es 32');
assert(ir1.tracks[2].isPercussion === true, 'Pista 2 en canal 9 marcada isPercussion: true');
assert(ir1.allNotes.length === 5, 'allNotes contiene las 5 notas combinadas');
assert(ir1.header.durationTicks === 960, 'Duración total calculada es 960 ticks');

// ────────────────────────────────────────────────────────────────────────────
// 4. PRESERVACIÓN DE TEMPOS Y TIME SIGNATURES DINÁMICOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Dinámica de Tempos y Cambios de Compás:');

const midiDynamic = new Midi();
// Tempo inicial 120 BPM en tick 0, modulación a 150 BPM en tick 1920
midiDynamic.header.setTempo(120);
midiDynamic.header.tempos.push({ ticks: 1920, bpm: 150, time: 2.0 });

// Compás 4/4 en tick 0, cambio a 3/4 en tick 1920
midiDynamic.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
midiDynamic.header.timeSignatures.push({ ticks: 1920, timeSignature: [3, 4] });

const trkDyn = midiDynamic.addTrack();
trkDyn.addNote({ midi: 60, ticks: 0, durationTicks: 960 });
trkDyn.addNote({ midi: 62, ticks: 1920, durationTicks: 960 });

const irDyn = parseMidiBufferToIR(midiDynamic.toArray());

assert(irDyn.header.tempos.length >= 2, 'Contiene al menos 2 eventos de tempo');
assert(irDyn.header.tempos[0].bpm === 120, 'Tempo inicial es 120 BPM');
assert(irDyn.header.tempos.some(t => t.bpm === 150 && t.ticks === 1920), 'Segundo tempo es 150 BPM en tick 1920');

assert(irDyn.header.timeSignatures.length >= 2, 'Contiene 2 eventos de time signature');
assert(irDyn.header.timeSignatures[0].numerator === 4 && irDyn.header.timeSignatures[0].denominator === 4, 'Métrica inicial es 4/4');
assert(irDyn.header.timeSignatures[1].numerator === 3 && irDyn.header.timeSignatures[1].ticks === 1920, 'Cambio a 3/4 en tick 1920');

// Consultas dinámicas
const tempoAt500 = getTempoAtTick(irDyn.header.tempos, 500);
assert(tempoAt500.bpm === 120, 'getTempoAtTick en tick 500 recupera 120 BPM');
const tempoAt2500 = getTempoAtTick(irDyn.header.tempos, 2500);
assert(tempoAt2500.bpm === 150, 'getTempoAtTick en tick 2500 recupera 150 BPM');

const tsAt500 = getTimeSignatureAtTick(irDyn.header.timeSignatures, 500);
assert(tsAt500.numerator === 4, 'getTimeSignatureAtTick en tick 500 es 4/4');
const tsAt2500 = getTimeSignatureAtTick(irDyn.header.timeSignatures, 2500);
assert(tsAt2500.numerator === 3, 'getTimeSignatureAtTick en tick 2500 es 3/4');

// ────────────────────────────────────────────────────────────────────────────
// 5. NOTAS SIMULTÁNEAS (ACORDES), REPETIDAS Y ORDENACIÓN CRONOLÓGICA
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Notas Simultáneas, Repetidas y Ordenación:');

const midiPoly = new Midi();
const trkPoly = midiPoly.addTrack();
// Tríada simultánea de Do Mayor en tick 0: C4 (60), E4 (64), G4 (67)
trkPoly.addNote({ midi: 67, ticks: 0, durationTicks: 480 }); // Añadido desordenado intencionadamente
trkPoly.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
trkPoly.addNote({ midi: 64, ticks: 0, durationTicks: 480 });

// Notas repetidas consecutivas en la misma altura: C4 en tick 480 y C4 en tick 720
trkPoly.addNote({ midi: 60, ticks: 480, durationTicks: 240 });
trkPoly.addNote({ midi: 60, ticks: 720, durationTicks: 240 });

const irPoly = parseMidiBufferToIR(midiPoly.toArray());
assert(irPoly.allNotes.length === 5, 'Contiene 5 notas en total');
// Verificar ordenación cronológica y por altura ascendente
assert(irPoly.allNotes[0].startTick === 0 && irPoly.allNotes[0].pitchMidi === 60, 'allNotes[0] es C4 en tick 0');
assert(irPoly.allNotes[1].startTick === 0 && irPoly.allNotes[1].pitchMidi === 64, 'allNotes[1] es E4 en tick 0');
assert(irPoly.allNotes[2].startTick === 0 && irPoly.allNotes[2].pitchMidi === 67, 'allNotes[2] es G4 en tick 0');
assert(irPoly.allNotes[3].startTick === 480 && irPoly.allNotes[3].pitchMidi === 60, 'allNotes[3] es C4 en tick 480');
assert(irPoly.allNotes[4].startTick === 720 && irPoly.allNotes[4].pitchMidi === 60, 'allNotes[4] es C4 en tick 720');

// ────────────────────────────────────────────────────────────────────────────
// 6. INMUTABILIDAD ESTRICTA (DEEP FREEZE)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Garantía de Inmutabilidad Estricta:');

assert(Object.isFrozen(irPoly), 'MidiMusicalIR raíz está congelado');
assert(Object.isFrozen(irPoly.header), 'Header está congelado');
assert(Object.isFrozen(irPoly.tracks), 'Tracks array está congelado');
assert(Object.isFrozen(irPoly.allNotes), 'allNotes array está congelado');
if (irPoly.allNotes.length > 0) {
  assert(Object.isFrozen(irPoly.allNotes[0]), 'Cada objeto MidiNoteIR está congelado');
}

let mutationBlocked = false;
try {
  (irPoly as any).header.ppq = 999;
} catch {
  mutationBlocked = true;
}
assert(mutationBlocked || irPoly.header.ppq !== 999, 'Modificación directa de propiedades bloqueada');

// ────────────────────────────────────────────────────────────────────────────
// 7. UTILIDADES DE CONSULTA Y CONVERSIÓN DE TICKS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Utilidades de Consulta y Conversión Temporal:');

assert(ticksToCanonicalBeats(0, 480) === 1.0, 'Tick 0 equivale al beat 1.0');
assert(ticksToCanonicalBeats(480, 480) === 2.0, 'Tick 480 equivale al beat 2.0');
assert(ticksToCanonicalBeats(240, 480) === 1.5, 'Tick 240 equivale al beat 1.5');
assert(canonicalBeatsToTicks(1.0, 480) === 0, 'Beat 1.0 equivale al tick 0');
assert(canonicalBeatsToTicks(3.0, 480) === 960, 'Beat 3.0 equivale al tick 960');

const notesInWindow = getNotesInTickRange(irPoly.allNotes, 0, 480);
assert(notesInWindow.length === 3, 'En ventana [0, 480) hay 3 notas simultáneas');

const notesTrack0 = getNotesByTrack(irPoly, 0);
assert(notesTrack0.length === 5, 'getNotesByTrack recupera las 5 notas de la pista 0');

const pcd = getPitchClassHistogram(irPoly.allNotes, false);
assert(pcd[0] === 3, 'Histograma registra 3 apariciones de clase de altura 0 (C)');
assert(pcd[4] === 1, 'Histograma registra 1 aparición de clase de altura 4 (E)');
assert(pcd[7] === 1, 'Histograma registra 1 aparición de clase de altura 7 (G)');

// Validar invariantes
validateMidiMusicalIR(irPoly);
assert(true, 'validateMidiMusicalIR valida con éxito el IR generado');

// ────────────────────────────────────────────────────────────────────────────
// 8. COMPROBACIÓN EMPÍRICA: COMPORTAMIENTO DE NOTAS HUÉRFANAS (SIN NOTE OFF)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Comprobación Empírica del Comportamiento ante Notas Huérfanas:');

// Sintetizar flujo binario con Note On (90 3C 40) en tick 0 y End of Track (FF 2F 00) sin Note Off
const rawHeader = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0];
const rawTrackData = [0x00, 0x90, 0x3c, 0x40, 0x83, 0x60, 0xff, 0x2f, 0x00];
const rawTrackChunk = [0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, rawTrackData.length, ...rawTrackData];
const unclosedBytes = new Uint8Array([...rawHeader, ...rawTrackChunk]);

const irUnclosed = parseMidiBufferToIR(unclosedBytes);
// Se comprueba y documenta fielmente: @tonejs/midi descarta internamente los eventos Note On sin Note Off coincidente
assert(irUnclosed.tracks.length === 1, 'Pista procesada sin bloquear el hilo ni lanzar excepción no controlada');
assert(irUnclosed.allNotes.length === 0, 'Comprobado fielmente: @tonejs/midi descarta notas huérfanas sin evento Note Off');

// ────────────────────────────────────────────────────────────────────────────
// RESULTADOS FINALES
// ────────────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`MIDI ENGINE (PHASE 2) RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`MIDI ENGINE TESTS FAILED: ${failed} assertion(s) failed`);
}
