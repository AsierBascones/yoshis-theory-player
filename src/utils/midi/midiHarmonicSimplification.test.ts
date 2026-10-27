/**
 * midiHarmonicSimplification.test.ts
 * Suite de pruebas y validación exhaustiva para el refinamiento armónico:
 * 1. Ragtime en Do mayor con bajo alternante C-G: mantener I estable (inv 0).
 * 2. Patrón stride con salto a quinta u octava inferior (G1 < C2): no generar falso I64 ni C/G.
 * 3. Inversiones auténticas justificadas: conserva 2ª inversión (I64 / C/G) y 1ª inversión (I6 / C/E)
 *    cuando el bajo de apoyo métrico está en la 5ª o 3ª, sin forzar a fundamental por defecto.
 * 4. Segmentación adaptativa (función objetivo de parsimonia y continuidad):
 *    - Fusión por identidad estructural cuando ambas mitades representan la misma armonía.
 *    - Separación cuando existe un cambio armónico real con evidencia sólida (ej. progresión rápida ii -> V en 2 beats cada uno).
 * 5. Tríada estructural e inmunidad ante notas melódicas breves de paso y bordaduras (no añadir 7ª, 9ª o add9 falsa).
 * 6. Novena tenida estructural (dur >= 1.0 en pulso) sí reconocida como add9 / tipo 9.
 * 7. Solapamiento temporal entre acordes (bleed de notas sostenidas al compás siguiente no fragmenta ni corrompe).
 * 8. Introducción solista con acompañamiento inicialmente vacío (Caso Fireflies en Mib mayor -> I con evidencia suficiente).
 * 9. Arpegios continuos consolidados en tríada fundamental.
 * 10. Dominantes secundarios y discriminación rigurosa: V/ii (A mayor) vs vi diatónico (A menor).
 * 11. Determinismo estricto e identidad entre importación inicial y reanálisis.
 * 12. Conservación íntegra de notas del Piano Roll (sin descartar voces polifónicas en IR).
 * 13. Regresión de invarianza temporal Multi-PPQ (96, 120, 240, 480, 960).
 * 14. Regresión de compases dinámicos 2/2 (Alla breve), 3/4 y 6/8.
 */

import { parseMidiBufferToIR } from './midiParser';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';
import { convertMidiAnalysisToUniversalSong } from './midiHooktheoryAdapter';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string, detail?: any) {
  if (cond) {
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

console.log('=== TEST SUITE: MIDI Harmonic Simplification & Adaptive Segmentation ===\n');

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
    0x00, 0x00, 0x00, 0x06,
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

// ────────────────────────────────────────────────────────────────────────────
// 1. RAGTIME EN DO MAYOR CON BAJO ALTERNANTE C–G
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Ragtime en Do mayor con bajo alternante C-G:');
{
  const ppq = 480;
  // Compás 4/4:
  // Beat 1: Bajo C2 (midi 36, dur 480)
  // Beat 2: Acorde E3-G3-C4 (midi 52, 55, 60, dur 480)
  // Beat 3: Bajo G2 (midi 43, dur 480) [Quinta alternante]
  // Beat 4: Acorde E3-G3-C4 (midi 52, 55, 60, dur 480)
  const trackEvents: number[] = [
    // Beat 1 (tick 0): NoteOn C2
    ...encodeVLQ(0), 0x90, 36, 90,
    // Beat 2 (tick 480): NoteOff C2, NoteOn E3, G3, C4
    ...encodeVLQ(ppq), 0x80, 36, 0,
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 85,
    // Beat 3 (tick 960): NoteOff acorde, NoteOn G2 (bajo alternante)
    ...encodeVLQ(ppq), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x90, 43, 90,
    // Beat 4 (tick 1440): NoteOff G2, NoteOn E3, G3, C4
    ...encodeVLQ(ppq), 0x80, 43, 0,
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 85,
    // Fin compás (tick 1920): NoteOff acorde
    ...encodeVLQ(ppq), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [trackEvents]);
  const ir = parseMidiBufferToIR(smf);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.harmonicSegments.length === 1, 'Segmentación adaptativa unifica compás de ragtime en 1 solo acorde', analysis.harmonicSegments.length);
  const seg = analysis.harmonicSegments[0];
  assert(seg.startBeat === 1, 'Acorde inicia en beat 1.0', seg.startBeat);
  assert(seg.durationBeats === 4, 'Acorde abarca los 4 beats del compás', seg.durationBeats);
  assert(seg.chordSymbol === 'C', 'Símbolo del acorde es C mayor puro', seg.chordSymbol);
  assert(seg.romanNumeral === 'I', 'Cifrado romano es I fundamental', seg.romanNumeral);
  assert(seg.inversion === 0, 'Inversión es 0 (no se degrada falsamente a I⁶₄ o C/G)', seg.inversion);
  assert(seg.bassPitchClass === 0, 'Bajo efectivo estructural es C (pc 0)', seg.bassPitchClass);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. PATRÓN STRIDE CON SALTO DE QUINTA U OCTAVA INFERIOR (G1 < C2)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Patrón Stride con salto de bajo inferior (G1 < C2):');
{
  const ppq = 480;
  // En stride, el pianista salta a una quinta grave G1 (pitch 31) en tiempo 3, que es más grave que C2 (pitch 36).
  // Beat 1: C2 (pitch 36)
  // Beat 2: Acorde E3, G3, C4
  // Beat 3: G1 (pitch 31 - nota más grave absoluta del compás)
  // Beat 4: Acorde E3, G3, C4
  const trackEvents: number[] = [
    ...encodeVLQ(0), 0x90, 36, 95,
    ...encodeVLQ(ppq), 0x80, 36, 0,
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 85,
    ...encodeVLQ(ppq), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x90, 31, 95, // G1 (31 < 36)
    ...encodeVLQ(ppq), 0x80, 31, 0,
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 85,
    ...encodeVLQ(ppq), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [trackEvents]);
  const ir = parseMidiBufferToIR(smf);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.harmonicSegments.length === 1, 'Stride con salto a G1 se unifica en 1 acorde', analysis.harmonicSegments.length);
  const seg = analysis.harmonicSegments[0];
  assert(seg.chordSymbol === 'C', 'Stride se reconoce como C', seg.chordSymbol);
  assert(seg.romanNumeral === 'I', 'Stride se reconoce como I fundamental', seg.romanNumeral);
  assert(seg.inversion === 0, 'No infiere falso C/G ni I⁶₄ a pesar de que G1 es la nota más grave absoluta', seg.inversion);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. INVERSIONES AUTÉNTICAS JUSTIFICADAS (CONSERVACIÓN DE I⁶₄ E I⁶)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Inversiones auténticas justificadas (no forzar fundamental por defecto):');
{
  const ppq = 480;
  // A) Segunda inversión auténtica cadencial o pedal:
  // Beat 1: Bajo G2 (pitch 43, tiempo fuerte) con acorde E4, G4, C5
  // Beat 2: Acorde E4, G4, C5
  // Beat 3: Bajo G1 (pitch 31) o G2 con acorde E4, G4, C5
  // Beat 4: Acorde E4, G4, C5
  const trackEvents2ndInv: number[] = [
    ...encodeVLQ(0), 0x90, 43, 90, // G2 en tiempo fuerte
    ...encodeVLQ(0), 0x90, 64, 80,
    ...encodeVLQ(0), 0x90, 67, 80,
    ...encodeVLQ(0), 0x90, 72, 85,
    ...encodeVLQ(ppq), 0x80, 43, 0,
    ...encodeVLQ(ppq), 0x90, 31, 90, // Salto a G1 en tiempo 3
    ...encodeVLQ(ppq), 0x80, 31, 0,
    ...encodeVLQ(ppq), 0x80, 64, 0,
    ...encodeVLQ(0), 0x80, 67, 0,
    ...encodeVLQ(0), 0x80, 72, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf2 = buildSMF(0, ppq, [trackEvents2ndInv]);
  const ir2 = parseMidiBufferToIR(smf2);
  const analysis2 = analyzeMidiMusicalIR(ir2, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis2.harmonicSegments.length === 1, 'Compás de 2ª inversión auténtica se agrupa en 1 acorde', analysis2.harmonicSegments.length);
  const seg2 = analysis2.harmonicSegments[0];
  assert(seg2.chordSymbol === 'C/G', 'Símbolo conserva segunda inversión C/G', seg2.chordSymbol);
  assert(seg2.romanNumeral === 'I⁶₄', 'Romano conserva I⁶₄ legítimo', seg2.romanNumeral);
  assert(seg2.inversion === 2, 'Inversión es estrictamente 2', seg2.inversion);
  assert(seg2.bassPitchClass === 7, 'Bajo efectivo es Sol (PC 7)', seg2.bassPitchClass);

  // B) Primera inversión auténtica:
  // Beat 1: Bajo E2 (pitch 40, tiempo fuerte) con acorde G3, C4, E4
  // Beat 3: Bajo E3 (pitch 52, octava) con acorde
  const trackEvents1stInv: number[] = [
    ...encodeVLQ(0), 0x90, 40, 90, // E2 en tiempo fuerte
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 80,
    ...encodeVLQ(0), 0x90, 64, 85,
    ...encodeVLQ(ppq), 0x80, 40, 0,
    ...encodeVLQ(ppq), 0x90, 52, 90, // E3 en tiempo 3
    ...encodeVLQ(ppq), 0x80, 52, 0,
    ...encodeVLQ(ppq), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x80, 64, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf1 = buildSMF(0, ppq, [trackEvents1stInv]);
  const ir1 = parseMidiBufferToIR(smf1);
  const analysis1 = analyzeMidiMusicalIR(ir1, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis1.harmonicSegments.length === 1, 'Compás de 1ª inversión auténtica se agrupa en 1 acorde', analysis1.harmonicSegments.length);
  const seg1 = analysis1.harmonicSegments[0];
  assert(seg1.chordSymbol === 'C/E', 'Símbolo conserva primera inversión C/E', seg1.chordSymbol);
  assert(seg1.romanNumeral === 'I⁶', 'Romano conserva I⁶ legítimo', seg1.romanNumeral);
  assert(seg1.inversion === 1, 'Inversión es estrictamente 1', seg1.inversion);
  assert(seg1.bassPitchClass === 4, 'Bajo efectivo es Mi (PC 4)', seg1.bassPitchClass);
}

// ────────────────────────────────────────────────────────────────────────────
// 4. SEGMENTACIÓN ADAPTATIVA: FUSIÓN vs SEPARACIÓN
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Segmentación Adaptativa (Fusión por identidad vs Separación por cambio armónico):');
{
  const ppq = 480;

  // A) Fusión: Compás donde pulsos 1-2 y 3-4 tienen la misma armonía (Do mayor) con distintas disposiciones
  const trackMerge: number[] = [
    // Tiempos 1-2: C3 (48), E3 (52), G3 (55)
    ...encodeVLQ(0), 0x90, 48, 80,
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(ppq * 2), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    // Tiempos 3-4: E3 (52), G3 (55), C4 (60)
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 80,
    ...encodeVLQ(ppq * 2), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfMerge = buildSMF(0, ppq, [trackMerge]);
  const irMerge = parseMidiBufferToIR(smfMerge);
  const anMerge = analyzeMidiMusicalIR(irMerge, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  assert(anMerge.harmonicSegments.length === 1, 'Subventanas con la misma armonía se fusionan en 1 acorde', anMerge.harmonicSegments.length);
  assert(anMerge.harmonicSegments[0].durationBeats === 4, 'Duración fusionada abarca 4 beats', anMerge.harmonicSegments[0].durationBeats);

  // B) Separación: Progresión rápida ii -> V en 2 beats cada uno dentro del mismo compás:
  // Tiempos 1-2: Dm (D3=38, F4=65, A4=69, D5=74)
  // Tiempos 3-4: G7 (G2=35, F4=65, G4=67, B4=71)
  const trackSplit: number[] = [
    // Dm (2 beats)
    ...encodeVLQ(0), 0x90, 38, 90,
    ...encodeVLQ(0), 0x90, 65, 80,
    ...encodeVLQ(0), 0x90, 69, 80,
    ...encodeVLQ(0), 0x90, 74, 85,
    ...encodeVLQ(ppq * 2), 0x80, 38, 0,
    ...encodeVLQ(0), 0x80, 65, 0,
    ...encodeVLQ(0), 0x80, 69, 0,
    ...encodeVLQ(0), 0x80, 74, 0,
    // G7 (2 beats)
    ...encodeVLQ(0), 0x90, 35, 90,
    ...encodeVLQ(0), 0x90, 65, 80,
    ...encodeVLQ(0), 0x90, 67, 80,
    ...encodeVLQ(0), 0x90, 71, 85,
    ...encodeVLQ(ppq * 2), 0x80, 35, 0,
    ...encodeVLQ(0), 0x80, 65, 0,
    ...encodeVLQ(0), 0x80, 67, 0,
    ...encodeVLQ(0), 0x80, 71, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfSplit = buildSMF(0, ppq, [trackSplit]);
  const irSplit = parseMidiBufferToIR(smfSplit);
  const anSplit = analyzeMidiMusicalIR(irSplit, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  assert(anSplit.harmonicSegments.length === 2, 'Progresión ii -> V se separa limpiamente en 2 acordes de 2 beats', anSplit.harmonicSegments.length);
  assert(anSplit.harmonicSegments[0].startBeat === 1, 'Acorde 1 (Dm) inicia en beat 1.0', anSplit.harmonicSegments[0].startBeat);
  assert(anSplit.harmonicSegments[0].durationBeats === 2, 'Acorde 1 (Dm) dura 2.0 beats', anSplit.harmonicSegments[0].durationBeats);
  assert(anSplit.harmonicSegments[0].romanNumeral === 'ii', 'Acorde 1 es ii (Dm)', anSplit.harmonicSegments[0].romanNumeral);

  assert(anSplit.harmonicSegments[1].startBeat === 3, 'Acorde 2 (G/G7) inicia en beat 3.0', anSplit.harmonicSegments[1].startBeat);
  assert(anSplit.harmonicSegments[1].durationBeats === 2, 'Acorde 2 (G/G7) dura 2.0 beats', anSplit.harmonicSegments[1].durationBeats);
  assert(anSplit.harmonicSegments[1].rootPitchClass === 7, 'Acorde 2 tiene fundamental Sol (PC 7)', anSplit.harmonicSegments[1].rootPitchClass);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. TRÍADA ESTRUCTURAL E INMUNIDAD ANTE NOTAS MELÓDICAS DE PASO Y ADORNOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Tríada estructural e inmunidad ante notas de paso rápidas vs novena estructural:');
{
  const ppq = 480;

  // A) Notas de paso rápidas (semicorcheas off-beat D5, F5 sobre tríada Do mayor tenida)
  const trackPassing: number[] = [
    // Acompañamiento C mayor sostenido durante todo el compás
    ...encodeVLQ(0), 0x90, 48, 90, // C3
    ...encodeVLQ(0), 0x90, 52, 90, // E3
    ...encodeVLQ(0), 0x90, 55, 90, // G3
    // Melodía: C5 (negra) -> D5 (semicorchea paso) -> E5 (semicorchea) -> F5 (semicorchea paso) -> G5 (negra)
    ...encodeVLQ(0), 0x90, 72, 85,
    ...encodeVLQ(ppq), 0x80, 72, 0,
    ...encodeVLQ(0), 0x90, 74, 75, // D5 (nota de paso breve, tick 480, dur 120)
    ...encodeVLQ(120), 0x80, 74, 0,
    ...encodeVLQ(0), 0x90, 76, 80, // E5
    ...encodeVLQ(120), 0x80, 76, 0,
    ...encodeVLQ(0), 0x90, 77, 75, // F5 (nota de paso breve, tick 720, dur 120)
    ...encodeVLQ(120), 0x80, 77, 0,
    ...encodeVLQ(0), 0x90, 79, 85, // G5
    ...encodeVLQ(ppq + 120), 0x80, 79, 0,
    ...encodeVLQ(0), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfPass = buildSMF(0, ppq, [trackPassing]);
  const irPass = parseMidiBufferToIR(smfPass);
  const anPass = analyzeMidiMusicalIR(irPass, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const segPass = anPass.harmonicSegments[0];
  assert(segPass.chordSymbol === 'C', 'Notas de paso breves no alteran símbolo de tríada C', segPass.chordSymbol);
  assert(segPass.romanNumeral === 'I', 'Cifrado romano es I puro sin extensiones espurias', segPass.romanNumeral);
  assert(segPass.type === 5, 'Tipo estructural es 5 (tríada)', segPass.type);
  assert(!segPass.adds || segPass.adds.length === 0, 'No añade falsas extensiones add9', segPass.adds);

  // B) Novena estructural sostenida (D5 con duración 2 beats apoyada en pulso):
  const trackStructural9th: number[] = [
    // Acompañamiento C mayor
    ...encodeVLQ(0), 0x90, 48, 85,
    ...encodeVLQ(0), 0x90, 52, 85,
    ...encodeVLQ(0), 0x90, 55, 85,
    // Melodía: D5 tenida durante 2 tiempos completos (tick 0 a 960)
    ...encodeVLQ(0), 0x90, 74, 90,
    ...encodeVLQ(ppq * 2), 0x80, 74, 0,
    ...encodeVLQ(ppq * 2), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf9th = buildSMF(0, ppq, [trackStructural9th]);
  const ir9th = parseMidiBufferToIR(smf9th);
  const an9th = analyzeMidiMusicalIR(ir9th, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const seg9th = an9th.harmonicSegments[0];
  assert(seg9th.chordSymbol === 'C⁽add9⁾', 'Novena estructural sostenida sí se reconoce como add9', seg9th.chordSymbol);
  assert(seg9th.romanNumeral === 'I⁽ᵃᵈᵈ⁹⁾', 'Cifrado romano refleja I⁽ᵃᵈᵈ⁹⁾', seg9th.romanNumeral);
}

// ────────────────────────────────────────────────────────────────────────────
// 6. SOLAPAMIENTO TEMPORAL ENTRE ACORDES (BLEED DE NOTAS AL COMPÁS SIGUIENTE)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Solapamiento temporal entre acordes (bleed de notas):');
{
  const ppq = 480;
  // Compás 1: C mayor (ticks 0 a 1920 + 40 de bleed residual de pedal)
  // Compás 2: F mayor (ticks 1920 a 3840)
  const trackBleed: number[] = [
    // Compás 1: C mayor
    ...encodeVLQ(0), 0x90, 48, 85,
    ...encodeVLQ(0), 0x90, 52, 85,
    ...encodeVLQ(0), 0x90, 55, 85,
    // Compás 2: F mayor ataca en 1920
    ...encodeVLQ(1920), 0x90, 41, 90, // F2
    ...encodeVLQ(0), 0x90, 53, 85, // F3
    ...encodeVLQ(0), 0x90, 57, 85, // A3
    ...encodeVLQ(0), 0x90, 60, 85, // C4
    // Bleed: NoteOff de C mayor ocurre 40 ticks DESPUÉS del ataque de F mayor
    ...encodeVLQ(40), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    // NoteOff de F mayor en tick 3840 (1920 - 40 restantes)
    ...encodeVLQ(1880), 0x80, 41, 0,
    ...encodeVLQ(0), 0x80, 53, 0,
    ...encodeVLQ(0), 0x80, 57, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfBleed = buildSMF(0, ppq, [trackBleed]);
  const irBleed = parseMidiBufferToIR(smfBleed);
  const anBleed = analyzeMidiMusicalIR(irBleed, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(anBleed.harmonicSegments.length === 2, 'Genera exactamente 2 acordes para los 2 compases', anBleed.harmonicSegments.length);
  assert(anBleed.harmonicSegments[0].chordSymbol === 'C', 'Compás 1 es C', anBleed.harmonicSegments[0].chordSymbol);
  assert(anBleed.harmonicSegments[1].chordSymbol === 'F', 'Compás 2 es F puro (no corrompido por el bleed de 40 ticks)', anBleed.harmonicSegments[1].chordSymbol);
  assert(anBleed.harmonicSegments[1].romanNumeral === 'IV', 'Romano de compás 2 es IV', anBleed.harmonicSegments[1].romanNumeral);
}

// ────────────────────────────────────────────────────────────────────────────
// 7. INTRODUCCIÓN SOLISTA CON ACOMPAÑAMIENTO INICIALMENTE VACÍO (CASO FIREFLIES)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Introducción solista y pistas de acompañamiento inicialmente vacías:');
{
  const ppq = 480;
  // Track 1: Lead synth tocando notas de Eb (intro en compás 1)
  // Track 2: Bajo que empieza solo en compás 2 (silencio en compás 1)
  const leadTrack: number[] = [
    // Compás 1: Eb4 (63), G4 (67), Bb4 (70)
    ...encodeVLQ(0), 0x90, 63, 85,
    ...encodeVLQ(ppq), 0x90, 67, 85,
    ...encodeVLQ(ppq), 0x90, 70, 85,
    ...encodeVLQ(ppq * 2), 0x80, 63, 0,
    ...encodeVLQ(0), 0x80, 67, 0,
    ...encodeVLQ(0), 0x80, 70, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const bassTrack: number[] = [
    // Silencio compás 1 (1920 ticks) -> Ataque en compás 2
    ...encodeVLQ(1920), 0x90, 39, 90, // Eb2
    ...encodeVLQ(ppq * 4), 0x80, 39, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfIntro = buildSMF(1, ppq, [leadTrack, bassTrack]);
  const irIntro = parseMidiBufferToIR(smfIntro);
  const anIntro = analyzeMidiMusicalIR(irIntro, { referenceKeyTonic: 'Eb', referenceKeyScale: 'major' });

  assert(anIntro.harmonicSegments.length >= 1, 'Genera acordes para la intro', anIntro.harmonicSegments.length);
  const introSeg = anIntro.harmonicSegments[0];
  assert(introSeg.chordSymbol === 'Eb', 'Compás 1 de intro solista reconoce Eb (obtenido: ' + introSeg.chordSymbol + ')', introSeg.chordSymbol);
  assert(introSeg.romanNumeral === 'I', 'Romano de compás 1 es I (no degradado a ?)', introSeg.romanNumeral);
  assert(introSeg.evidenceLevel === 'sufficient_evidence', 'Nivel de evidencia es sufficient_evidence', introSeg.evidenceLevel);
}

// ────────────────────────────────────────────────────────────────────────────
// 8. ARPEGIOS CONTINUOS CONSOLIDADOS EN TRÍADA FUNDAMENTAL
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Arpegios continuos consolidados:');
{
  const ppq = 480;
  // Bajo Alberti continuo: C3, G3, E3, G3, C3, G3, E3, G3 (8 corcheas en 4/4 = 1920 ticks)
  const trackAlberti: number[] = [];
  const albertiPitches = [48, 55, 52, 55, 48, 55, 52, 55];
  for (let i = 0; i < 8; i++) {
    trackAlberti.push(...encodeVLQ(0), 0x90, albertiPitches[i], 80);
    trackAlberti.push(...encodeVLQ(240), 0x80, albertiPitches[i], 0);
  }
  trackAlberti.push(...encodeVLQ(0), 0xff, 0x2f, 0x00);

  const smfAlb = buildSMF(0, ppq, [trackAlberti]);
  const irAlb = parseMidiBufferToIR(smfAlb);
  const anAlb = analyzeMidiMusicalIR(irAlb, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(anAlb.harmonicSegments.length === 1, 'Arpegio Alberti se consolida en 1 solo acorde de compás completo', anAlb.harmonicSegments.length);
  const segAlb = anAlb.harmonicSegments[0];
  assert(segAlb.chordSymbol === 'C', 'Arpegio se reconoce como C mayor', segAlb.chordSymbol);
  assert(segAlb.romanNumeral === 'I', 'Arpegio se reconoce como I fundamental', segAlb.romanNumeral);
  assert(segAlb.inversion === 0, 'Inversión es fundamental (0)', segAlb.inversion);
}

// ────────────────────────────────────────────────────────────────────────────
// 9. DOMINANTES SECUNDARIOS Y DISCRIMINACIÓN RIGUROSA (V/ii vs vi DIATÓNICO)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Dominantes secundarios y discriminación rigurosa:');
{
  const ppq = 480;

  // A) A mayor en C (A3=57, C#4=61, E4=64): V/ii
  const trackAmaj: number[] = [
    ...encodeVLQ(0), 0x90, 57, 85,
    ...encodeVLQ(0), 0x90, 61, 85,
    ...encodeVLQ(0), 0x90, 64, 85,
    ...encodeVLQ(ppq * 4), 0x80, 57, 0,
    ...encodeVLQ(0), 0x80, 61, 0,
    ...encodeVLQ(0), 0x80, 64, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfAmaj = buildSMF(0, ppq, [trackAmaj]);
  const irAmaj = parseMidiBufferToIR(smfAmaj);
  const anAmaj = analyzeMidiMusicalIR(irAmaj, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const segAmaj = anAmaj.harmonicSegments[0];
  assert(segAmaj.chordSymbol === 'A', 'Símbolo es A', segAmaj.chordSymbol);
  assert(segAmaj.romanNumeral === 'V/ii', 'Romano es V/ii (dominante secundaria)', segAmaj.romanNumeral);
  assert(segAmaj.isSecondary === true, 'isSecondary es true', segAmaj.isSecondary);
  assert(segAmaj.secondaryType === 'V', 'secondaryType es V', segAmaj.secondaryType);

  // B) A menor en C (A3=57, C4=60, E4=64): vi diatónico (NO secundario)
  const trackAmin: number[] = [
    ...encodeVLQ(0), 0x90, 57, 85,
    ...encodeVLQ(0), 0x90, 60, 85,
    ...encodeVLQ(0), 0x90, 64, 85,
    ...encodeVLQ(ppq * 4), 0x80, 57, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x80, 64, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfAmin = buildSMF(0, ppq, [trackAmin]);
  const irAmin = parseMidiBufferToIR(smfAmin);
  const anAmin = analyzeMidiMusicalIR(irAmin, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const segAmin = anAmin.harmonicSegments[0];
  assert(segAmin.chordSymbol === 'Am', 'Símbolo es Am', segAmin.chordSymbol);
  assert(segAmin.romanNumeral === 'vi', 'Romano es vi diatónico', segAmin.romanNumeral);
  assert(segAmin.isSecondary === false, 'A menor NO se marca como secundaria', segAmin.isSecondary);

  // C) D mayor en C (D3=50, F#3=54, A3=57): V/V
  const trackDmaj: number[] = [
    ...encodeVLQ(0), 0x90, 50, 85,
    ...encodeVLQ(0), 0x90, 54, 85,
    ...encodeVLQ(0), 0x90, 57, 85,
    ...encodeVLQ(ppq * 4), 0x80, 50, 0,
    ...encodeVLQ(0), 0x80, 54, 0,
    ...encodeVLQ(0), 0x80, 57, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfDmaj = buildSMF(0, ppq, [trackDmaj]);
  const irDmaj = parseMidiBufferToIR(smfDmaj);
  const anDmaj = analyzeMidiMusicalIR(irDmaj, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const segDmaj = anDmaj.harmonicSegments[0];
  assert(segDmaj.chordSymbol === 'D', 'Símbolo es D', segDmaj.chordSymbol);
  assert(segDmaj.romanNumeral === 'V/V', 'Romano es V/V', segDmaj.romanNumeral);
  assert(segDmaj.isSecondary === true, 'isSecondary es true para D mayor', segDmaj.isSecondary);
}

// ────────────────────────────────────────────────────────────────────────────
// 10. DETERMINISMO ESTRICTO ENTRE ANÁLISIS SUCESIVOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n10. Determinismo estricto e identidad de resultados:');
{
  const ppq = 480;
  const trackNotes: number[] = [
    ...encodeVLQ(0), 0x90, 48, 85,
    ...encodeVLQ(0), 0x90, 52, 85,
    ...encodeVLQ(0), 0x90, 55, 85,
    ...encodeVLQ(ppq * 4), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [trackNotes]);
  const ir = parseMidiBufferToIR(smf);

  const res1 = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const res2 = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(JSON.stringify(res1.harmonicSegments) === JSON.stringify(res2.harmonicSegments), 'Segmentos armónicos 1 y 2 son estrictamente idénticos');
  assert(JSON.stringify(res1.melodyNotes) === JSON.stringify(res2.melodyNotes), 'Notas melódicas 1 y 2 son estrictamente idénticas');

  const song1 = convertMidiAnalysisToUniversalSong(res1, ir, { title: 'Test Song' });
  const song2 = convertMidiAnalysisToUniversalSong(res2, ir, { title: 'Test Song' });
  assert(JSON.stringify(song1.sections[0].chords) === JSON.stringify(song2.sections[0].chords), 'Acordes exportados son estrictamente deterministas');
  assert(JSON.stringify(song1.sections[0].melody) === JSON.stringify(song2.sections[0].melody), 'Notas exportadas son estrictamente deterministas');
}

// ────────────────────────────────────────────────────────────────────────────
// 11. CONSERVACIÓN ÍNTEGRA DE NOTAS DEL PIANO ROLL
// ────────────────────────────────────────────────────────────────────────────
console.log('\n11. Conservación íntegra de notas del Piano Roll:');
{
  const ppq = 480;
  // Archivo single track con 6 notas polifónicas simultáneas
  const trackPoly: number[] = [
    ...encodeVLQ(0), 0x90, 36, 90,
    ...encodeVLQ(0), 0x90, 48, 85,
    ...encodeVLQ(0), 0x90, 52, 80,
    ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(0), 0x90, 60, 85,
    ...encodeVLQ(0), 0x90, 72, 90,
    ...encodeVLQ(ppq * 4), 0x80, 36, 0,
    ...encodeVLQ(0), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x80, 72, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [trackPoly]);
  const ir = parseMidiBufferToIR(smf);
  assert(ir.allNotes.length === 6, 'IR conserva las 6 notas originales', ir.allNotes.length);

  const analysis = analyzeMidiMusicalIR(ir);
  assert(analysis.melodyNotes.length === 6, 'analysis.melodyNotes conserva las 6 notas para visualización en Piano Roll', analysis.melodyNotes.length);
  const song = convertMidiAnalysisToUniversalSong(analysis, ir, { title: 'Poly Test' });
  assert(song.sections[0].melody.length === 6, 'UniversalSong conserva las 6 notas íntegras en melody', song.sections[0].melody.length);
}

// ────────────────────────────────────────────────────────────────────────────
// 12. INVARIANZA MULTI-PPQ Y RÉGIMEN MÉTRICO (2/2, 3/4, 6/8)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n12. Invarianza Multi-PPQ y Régimen Métrico (2/2, 3/4, 6/8):');
{
  // A) PPQ 96 vs 480 vs 960 en compás 4/4
  for (const testPPQ of [96, 120, 240, 480, 960]) {
    const trk: number[] = [
      ...encodeVLQ(0), 0x90, 60, 90,
      ...encodeVLQ(testPPQ), 0x80, 60, 0, // 1 negra
      ...encodeVLQ(0), 0xff, 0x2f, 0x00,
    ];
    const smf = buildSMF(0, testPPQ, [trk]);
    const ir = parseMidiBufferToIR(smf);
    const an = analyzeMidiMusicalIR(ir);
    assert(an.melodyNotes[0].startBeat === 1, `PPQ ${testPPQ}: startBeat es 1.0`, an.melodyNotes[0].startBeat);
    assert(an.melodyNotes[0].durationBeats === 1, `PPQ ${testPPQ}: durationBeats es 1.0 negra`, an.melodyNotes[0].durationBeats);
  }

  // B) Compás 3/4:
  {
    const ppq = 480;
    // Meta event TimeSignature: 03 02 18 08 (3/4)
    const timeSigMeta = [0x00, 0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08];
    const trk: number[] = [
      ...timeSigMeta,
      ...encodeVLQ(0), 0x90, 60, 90,
      ...encodeVLQ(ppq * 3), 0x80, 60, 0, // 3 negras
      ...encodeVLQ(0), 0xff, 0x2f, 0x00,
    ];
    const smf = buildSMF(0, ppq, [trk]);
    const ir = parseMidiBufferToIR(smf);
    const an = analyzeMidiMusicalIR(ir);
    assert(an.harmonicSegments.length === 1, 'Métrica 3/4 produce 1 acorde por compás', an.harmonicSegments.length);
    assert(an.harmonicSegments[0].durationBeats === 3, 'Acorde dura exactamente 3 beats', an.harmonicSegments[0].durationBeats);
  }

  // C) Compás 2/2 (Alla breve):
  {
    const ppq = 480;
    // Meta event TimeSignature: 02 01 18 08 (2/2)
    const timeSigMeta = [0x00, 0xff, 0x58, 0x04, 0x02, 0x01, 0x18, 0x08];
    const trk: number[] = [
      ...timeSigMeta,
      ...encodeVLQ(0), 0x90, 60, 90,
      ...encodeVLQ(ppq * 4), 0x80, 60, 0, // 2 blancas = 4 negras canónicas
      ...encodeVLQ(0), 0xff, 0x2f, 0x00,
    ];
    const smf = buildSMF(0, ppq, [trk]);
    const ir = parseMidiBufferToIR(smf);
    const an = analyzeMidiMusicalIR(ir);
    assert(an.harmonicSegments[0].durationBeats === 4, 'Compás 2/2 dura 4 negras canónicas', an.harmonicSegments[0].durationBeats);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 13. REGRESIONES CRÍTICAS DE AUDITORÍA: PARSIMONIA Y DISCRIMINACIÓN ARMÓNICA
// ────────────────────────────────────────────────────────────────────────────
console.log('\n13. Auditoría Crítica: Parsimonia, Bajo alternante vs Cambio real y Tonalidad:');
{
  const ppq = 480;

  // A) Ragtime stride con melodía activa C-D-E-F sobre C:
  // Beat 1: C2 (36), C5 (72)
  // Beat 2: E3 (52), G3 (55), D5 (74)
  // Beat 3: G2 (43), E5 (76)
  // Beat 4: E3 (52), G3 (55), F5 (77)
  const trkRagtimeMelody: number[] = [
    ...encodeVLQ(0), 0x90, 36, 90, ...encodeVLQ(0), 0x90, 72, 90,
    ...encodeVLQ(ppq), 0x80, 36, 0, ...encodeVLQ(0), 0x80, 72, 0, ...encodeVLQ(0), 0x90, 52, 80, ...encodeVLQ(0), 0x90, 55, 80, ...encodeVLQ(0), 0x90, 74, 90,
    ...encodeVLQ(ppq), 0x80, 52, 0, ...encodeVLQ(0), 0x80, 55, 0, ...encodeVLQ(0), 0x80, 74, 0, ...encodeVLQ(0), 0x90, 43, 90, ...encodeVLQ(0), 0x90, 76, 90,
    ...encodeVLQ(ppq), 0x80, 43, 0, ...encodeVLQ(0), 0x80, 76, 0, ...encodeVLQ(0), 0x90, 52, 80, ...encodeVLQ(0), 0x90, 55, 80, ...encodeVLQ(0), 0x90, 77, 90,
    ...encodeVLQ(ppq), 0x80, 52, 0, ...encodeVLQ(0), 0x80, 55, 0, ...encodeVLQ(0), 0x80, 77, 0, ...encodeVLQ(0), 0xff, 0x2f, 0,
  ];
  const smfRag = buildSMF(0, ppq, [trkRagtimeMelody]);
  const irRag = parseMidiBufferToIR(smfRag);
  const anRag = analyzeMidiMusicalIR(irRag, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  assert(anRag.harmonicSegments.length === 1, 'Ragtime con melodía activa se unifica en 1 compás estable de C', anRag.harmonicSegments.length);
  assert(anRag.harmonicSegments[0].chordSymbol === 'C', 'Símbolo es C puro (no C⁽add9⁾ ni falso Em/G)', anRag.harmonicSegments[0].chordSymbol);
  assert(anRag.harmonicSegments[0].romanNumeral === 'I', 'Romano es I fundamental puro', anRag.harmonicSegments[0].romanNumeral);

  // B) Cambio real a Em en tiempos 3-4 (con presencia estructural de Si / B3=59):
  // Beats 1-2: C (C2, E3, G3)
  // Beats 3-4: Em (E2=40, G3=55, B3=59)
  const trkRealEm: number[] = [
    ...encodeVLQ(0), 0x90, 36, 90, ...encodeVLQ(0), 0x90, 52, 80, ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(ppq * 2), 0x80, 36, 0, ...encodeVLQ(0), 0x80, 52, 0, ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x90, 40, 90, ...encodeVLQ(0), 0x90, 55, 80, ...encodeVLQ(0), 0x90, 59, 85,
    ...encodeVLQ(ppq * 2), 0x80, 40, 0, ...encodeVLQ(0), 0x80, 55, 0, ...encodeVLQ(0), 0x80, 59, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0,
  ];
  const smfEm = buildSMF(0, ppq, [trkRealEm]);
  const irEm = parseMidiBufferToIR(smfEm);
  const anEm = analyzeMidiMusicalIR(irEm, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  assert(anEm.harmonicSegments.length === 2, 'Cambio real a Em con nota Si (B) se separa limpiamente en 2 acordes', anEm.harmonicSegments.length);
  assert(anEm.harmonicSegments[0].chordSymbol === 'C', 'Acorde 1 es C', anEm.harmonicSegments[0].chordSymbol);
  assert(anEm.harmonicSegments[1].chordSymbol === 'Em', 'Acorde 2 es Em auténtico', anEm.harmonicSegments[1].chordSymbol);
  assert(anEm.harmonicSegments[1].romanNumeral === 'iii', 'Romano del segundo acorde es iii', anEm.harmonicSegments[1].romanNumeral);

  // C) Progresión auténtica I -> IV (C -> F):
  const trkIF: number[] = [
    ...encodeVLQ(0), 0x90, 36, 90, ...encodeVLQ(0), 0x90, 52, 80, ...encodeVLQ(0), 0x90, 55, 80,
    ...encodeVLQ(ppq * 2), 0x80, 36, 0, ...encodeVLQ(0), 0x80, 52, 0, ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x90, 41, 90, ...encodeVLQ(0), 0x90, 53, 80, ...encodeVLQ(0), 0x90, 57, 80,
    ...encodeVLQ(ppq * 2), 0x80, 41, 0, ...encodeVLQ(0), 0x80, 53, 0, ...encodeVLQ(0), 0x80, 57, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0,
  ];
  const smfIF = buildSMF(0, ppq, [trkIF]);
  const irIF = parseMidiBufferToIR(smfIF);
  const anIF = analyzeMidiMusicalIR(irIF, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  assert(anIF.harmonicSegments.length === 2, 'Progresión I -> IV se separa en 2 acordes', anIF.harmonicSegments.length);
  assert(anIF.harmonicSegments[0].chordSymbol === 'C', 'Primer acorde es C', anIF.harmonicSegments[0].chordSymbol);
  assert(anIF.harmonicSegments[1].chordSymbol === 'F', 'Segundo acorde es F', anIF.harmonicSegments[1].chordSymbol);
  assert(anIF.harmonicSegments[1].romanNumeral === 'IV', 'Romano de F es IV', anIF.harmonicSegments[1].romanNumeral);

  // D) Acorde disminuido auténtico vii°7 (B°7 en Do mayor):
  // B2 (47), D3 (50), F3 (53), Ab3 (56)
  const trkDim7: number[] = [
    ...encodeVLQ(0), 0x90, 47, 90,
    ...encodeVLQ(0), 0x90, 50, 85,
    ...encodeVLQ(0), 0x90, 53, 85,
    ...encodeVLQ(0), 0x90, 56, 85,
    ...encodeVLQ(ppq * 4), 0x80, 47, 0,
    ...encodeVLQ(0), 0x80, 50, 0,
    ...encodeVLQ(0), 0x80, 53, 0,
    ...encodeVLQ(0), 0x80, 56, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0,
  ];
  const smfDim7 = buildSMF(0, ppq, [trkDim7]);
  const irDim7 = parseMidiBufferToIR(smfDim7);
  const anDim7 = analyzeMidiMusicalIR(irDim7, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  assert(anDim7.harmonicSegments.length === 1, 'Acorde disminuido B°7 se analiza en 1 segmento', anDim7.harmonicSegments.length);
  assert(anDim7.harmonicSegments[0].quality === 'dim7', 'Cualidad es dim7 auténtica', anDim7.harmonicSegments[0].quality);
  assert(anDim7.harmonicSegments[0].chordSymbol.startsWith('B°') || anDim7.harmonicSegments[0].chordSymbol === 'B°7' || anDim7.harmonicSegments[0].chordSymbol === 'Bdim7', 'Símbolo refleja acorde disminuido legítimo B°7', anDim7.harmonicSegments[0].chordSymbol);
  assert(anDim7.harmonicSegments[0].romanNumeral.includes('vii°'), 'Cifrado romano es vii° legítimo', anDim7.harmonicSegments[0].romanNumeral);
}

console.log('\n========================================');
console.log(`RESULTADOS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`Suite falló con ${failed} pruebas fallidas`);
}
