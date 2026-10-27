/**
 * midiTimingAndHarmonicAudit.test.ts
 * Suite de pruebas y validación exhaustiva para:
 * 1. Invarianza temporal Multi-PPQ (96, 120, 240, 480, 960 ticks/negra).
 * 2. Métrica 2/2 (Alla breve / Yoshi's Island Athletic Theme) sin aceleración a doble velocidad.
 * 3. Alineación exacta de límites de compás (b1, b5, b9 -> M1, M2, M3) sin desfase M2 .2.
 * 4. Métrica compuesta 6/8 con duración canónica en negras.
 * 5. Caso Fireflies: reconocimiento de acordes de tónica en intro solista (Eb mayor) sin caer en '?'.
 * 6. Determinismo estricto e inmunidad ante melodías rápidas.
 */

import { Midi } from '@tonejs/midi';
import { parseMidiBufferToIR } from './midiParser';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';
import { convertMidiAnalysisToUniversalSong } from './midiHooktheoryAdapter';
import { inspectMidiTracks, parseMidiToUniversalSong } from '../midiImporter';
import { calculateMeasuresTimeline } from '../rhythmEngine';

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

console.log('=== TEST SUITE: MIDI Timing, Tempo & Harmonic Precision Audit ===\n');

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

// ────────────────────────────────────────────────────────────────────────────
// 1. INVARIANZA TEMPORAL MULTI-PPQ (96, 120, 240, 480, 960)
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Invarianza Temporal Multi-PPQ (96, 120, 240, 480, 960):');

// Frase musical idéntica:
// - Nota 0: Negra en tiempo 1 (beat 1.0, duración 1.0)
// - Nota 1: Corchea en tiempo 2 (beat 2.0, duración 0.5)
// - Nota 2: Corchea en tiempo 2.5 (beat 2.5, duración 0.5)
// - Nota 3: Blanca en tiempo 3 (beat 3.0, duración 2.0)
const testPPQs = [96, 120, 240, 480, 960];

for (const ppq of testPPQs) {
  const eighth = Math.round(ppq / 2);
  const half = ppq * 2;

  const trackEvents: number[] = [
    // Nota 0: C4 (60), start 0, dur ppq (negra)
    ...encodeVLQ(0), 0x90, 60, 64,
    ...encodeVLQ(ppq), 0x80, 60, 0,

    // Nota 1: E4 (64), start ppq, dur eighth (corchea)
    ...encodeVLQ(0), 0x90, 64, 64,
    ...encodeVLQ(eighth), 0x80, 64, 0,

    // Nota 2: G4 (67), start ppq + eighth, dur eighth (corchea)
    ...encodeVLQ(0), 0x90, 67, 64,
    ...encodeVLQ(eighth), 0x80, 67, 0,

    // Nota 3: C5 (72), start 2*ppq, dur half (blanca)
    ...encodeVLQ(0), 0x90, 72, 64,
    ...encodeVLQ(half), 0x80, 72, 0,

    // End of Track
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfBytes = buildSMF(0, ppq, [trackEvents]);
  const ir = parseMidiBufferToIR(smfBytes);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.ppq === ppq, `PPQ ${ppq} detectado correctamente en análisis`);
  assert(analysis.melodyNotes.length === 4, `PPQ ${ppq}: extrae las 4 notas melódicas`);

  const n0 = analysis.melodyNotes[0];
  const n1 = analysis.melodyNotes[1];
  const n2 = analysis.melodyNotes[2];
  const n3 = analysis.melodyNotes[3];

  assert(Math.abs(n0.startBeat - 1.0) < 0.001, `PPQ ${ppq}: Nota 0 inicia en beat 1.0 (obtenido: ${n0.startBeat})`);
  assert(Math.abs(n0.durationBeats - 1.0) < 0.001, `PPQ ${ppq}: Nota 0 dura 1.0 negra (obtenido: ${n0.durationBeats})`);

  assert(Math.abs(n1.startBeat - 2.0) < 0.001, `PPQ ${ppq}: Nota 1 inicia en beat 2.0 (obtenido: ${n1.startBeat})`);
  assert(Math.abs(n1.durationBeats - 0.5) < 0.001, `PPQ ${ppq}: Nota 1 dura 0.5 negra (obtenido: ${n1.durationBeats})`);

  assert(Math.abs(n2.startBeat - 2.5) < 0.001, `PPQ ${ppq}: Nota 2 inicia en beat 2.5 (obtenido: ${n2.startBeat})`);
  assert(Math.abs(n2.durationBeats - 0.5) < 0.001, `PPQ ${ppq}: Nota 2 dura 0.5 negra (obtenido: ${n2.durationBeats})`);

  assert(Math.abs(n3.startBeat - 3.0) < 0.001, `PPQ ${ppq}: Nota 3 inicia en beat 3.0 (obtenido: ${n3.startBeat})`);
  assert(Math.abs(n3.durationBeats - 2.0) < 0.001, `PPQ ${ppq}: Nota 3 dura 2.0 negras (obtenido: ${n3.durationBeats})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. MÉTRICA 2/2 (ALLA BREVE / YOSHI'S ISLAND ATHLETIC THEME)
// ────────────────────────────────────────────────────────────────────────────
console.log("\n2. Métrica 2/2 (Alla breve - Athletic Theme): No reproduce al doble de velocidad:");

const ppq480 = 480;
const midi22 = new Midi();
midi22.header.setTempo(130);
midi22.header.timeSignatures.push({
  ticks: 0,
  timeSignature: [2, 2],
  measures: 0,
});

// Pista 1: Melodía en negras en compás 2/2
// En 2/2: cada compás tiene 2 blancas = 4 negras = 1920 ticks
// Compás 1: 4 negras en ticks 0, 480, 960, 1440
// Compás 2: 4 negras en ticks 1920, 2400, 2880, 3360
const trkMel22 = midi22.addTrack();
trkMel22.name = 'Athletic Melody';
trkMel22.addNote({ midi: 72, ticks: 0, durationTicks: 480 });      // Negra 1 (beat 1)
trkMel22.addNote({ midi: 74, ticks: 480, durationTicks: 480 });    // Negra 2 (beat 2)
trkMel22.addNote({ midi: 76, ticks: 960, durationTicks: 480 });    // Negra 3 (beat 3)
trkMel22.addNote({ midi: 79, ticks: 1440, durationTicks: 480 });   // Negra 4 (beat 4)
trkMel22.addNote({ midi: 72, ticks: 1920, durationTicks: 480 });   // Compás 2, Negra 1 (beat 5)

// Pista 2: Acompañamiento armónico (1 acorde C por compás)
const trkChd22 = midi22.addTrack();
trkChd22.name = 'Chords';
trkChd22.addNote({ midi: 48, ticks: 0, durationTicks: 1920 });    // Compás 1: C3 (4 negras = 1 compás de 2/2)
trkChd22.addNote({ midi: 52, ticks: 0, durationTicks: 1920 });
trkChd22.addNote({ midi: 55, ticks: 0, durationTicks: 1920 });
trkChd22.addNote({ midi: 48, ticks: 1920, durationTicks: 1920 }); // Compás 2: C3
trkChd22.addNote({ midi: 52, ticks: 1920, durationTicks: 1920 });
trkChd22.addNote({ midi: 55, ticks: 1920, durationTicks: 1920 });

const ir22 = parseMidiBufferToIR(midi22.toArray());
const analysis22 = analyzeMidiMusicalIR(ir22, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const song22 = convertMidiAnalysisToUniversalSong(analysis22, ir22);

// Verificación de duración de notas melódicas en negras reales
assert(analysis22.melodyNotes[0].durationBeats === 1.0,
  `Negra en 2/2 tiene duración 1.0 beat (obtenido: ${analysis22.melodyNotes[0].durationBeats})`);
assert(analysis22.melodyNotes[0].startBeat === 1.0,
  `Negra 1 en 2/2 inicia en beat 1.0 (obtenido: ${analysis22.melodyNotes[0].startBeat})`);
assert(analysis22.melodyNotes[1].startBeat === 2.0,
  `Negra 2 en 2/2 inicia en beat 2.0 (obtenido: ${analysis22.melodyNotes[1].startBeat})`);
assert(analysis22.melodyNotes[4].startBeat === 5.0,
  `Compás 2 inicia en beat 5.0 (obtenido: ${analysis22.melodyNotes[4].startBeat})`);

// Verificación de preservación de métrica 2/2 en UniversalSong
assert(song22.timeSignature?.[0] === 2 && song22.timeSignature?.[1] === 2,
  `timeSignature preserva [2, 2] exacto (obtenido: ${JSON.stringify(song22.timeSignature)})`);
assert(song22.sections[0].meters?.[0]?.numerator === 2 && song22.sections[0].meters?.[0]?.denominator === 2,
  `section.meters preserva 2/2 (obtenido: ${song22.sections[0].meters?.[0]?.numerator}/${song22.sections[0].meters?.[0]?.denominator})`);

// Verificación de alineación de compases en calculateMeasuresTimeline
const measures22 = calculateMeasuresTimeline(
  song22.sections[0].chords.reduce((max, c) => Math.max(max, c.beat + c.duration - 1), 8),
  song22.sections[0].meters,
  { numerator: 2, denominator: 2 }
);

assert(measures22[0].durationQuarters === 4,
  `Compás 1 de 2/2 dura 4 negras (obtenido: ${measures22[0].durationQuarters})`);
assert(measures22[1].startQuarter === 4,
  `Compás 2 de 2/2 inicia en quarter 4 / beat 5 (obtenido: ${measures22[1].startQuarter})`);

// Acorde 1 inicia en beat 1 (M1), Acorde 2 inicia en beat 5 (M2)
assert(song22.sections[0].chords[0].beat === 1,
  `Primer acorde inicia en beat 1 / M1 (obtenido: ${song22.sections[0].chords[0].beat})`);
assert(song22.sections[0].chords[1].beat === 5,
  `Segundo acorde inicia en beat 5 / M2 (obtenido: ${song22.sections[0].chords[1].beat})`);

// ────────────────────────────────────────────────────────────────────────────
// 3. MÉTRICA COMPUESTA 6/8
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Métrica Compuesta 6/8: Duración y compases en negras canónicas:');

const midi68 = new Midi();
midi68.header.timeSignatures.push({
  ticks: 0,
  timeSignature: [6, 8],
  measures: 0,
});

// En 6/8: cada compás tiene 6 corcheas = 3 negras = 1440 ticks
const trk68 = midi68.addTrack();
trk68.name = '6/8 Melody';
trk68.addNote({ midi: 60, ticks: 0, durationTicks: 240 }); // Corchea (0.5 negra)
trk68.addNote({ midi: 64, ticks: 240, durationTicks: 720 }); // Negra con puntillo (1.5 negras)

const ir68 = parseMidiBufferToIR(midi68.toArray());
const analysis68 = analyzeMidiMusicalIR(ir68, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const song68 = convertMidiAnalysisToUniversalSong(analysis68, ir68);

assert(analysis68.melodyNotes[0].durationBeats === 0.5,
  `Corchea en 6/8 dura 0.5 negra (obtenido: ${analysis68.melodyNotes[0].durationBeats})`);
assert(analysis68.melodyNotes[1].durationBeats === 1.5,
  `Negra con puntillo dura 1.5 negras (obtenido: ${analysis68.melodyNotes[1].durationBeats})`);
assert(song68.timeSignature?.[0] === 6 && song68.timeSignature?.[1] === 8,
  `Métrica 6/8 preservada como [6, 8] (obtenido: ${JSON.stringify(song68.timeSignature)})`);

// ────────────────────────────────────────────────────────────────────────────
// 4. CASO FIREFLIES: INTRO SOLISTA EN MI BEMOL MAYOR SIN '?'
// ────────────────────────────────────────────────────────────────────────────
console.log("\n4. Caso Fireflies: Intro solista en Mi bemol mayor no se degrada a '?':");

// Simulación fiel de la estructura de Fireflies:
// - Pista 1 (Lead Synth Arpeggio): Arpegio agudo Eb4-G4-Bb4 activo desde el compás 1
// - Pistas de acompañamiento (Pad/Piano/Bajo): Silencio en compases 1 a 4, entran en compás 5
const midiFireflies = new Midi();
midiFireflies.header.setTempo(90);

// Armadura Eb Mayor (3 bemoles)
midiFireflies.header.keySignatures.push({
  ticks: 0,
  key: 'Eb',
  scale: 'major',
});

// Pista 1: Synth Lead (Arpegio en Eb mayor en compás 1 y 2)
const trkLeadFF = midiFireflies.addTrack();
trkLeadFF.name = 'Synth Bleeps Lead';
// Compás 1: notas Eb4 (63), G4 (67), Bb4 (70), Eb5 (75)
trkLeadFF.addNote({ midi: 63, ticks: 0, durationTicks: ppq480 });
trkLeadFF.addNote({ midi: 67, ticks: ppq480, durationTicks: ppq480 });
trkLeadFF.addNote({ midi: 70, ticks: ppq480 * 2, durationTicks: ppq480 });
trkLeadFF.addNote({ midi: 75, ticks: ppq480 * 3, durationTicks: ppq480 });
// Compás 2:
trkLeadFF.addNote({ midi: 63, ticks: ppq480 * 4, durationTicks: ppq480 });
trkLeadFF.addNote({ midi: 67, ticks: ppq480 * 5, durationTicks: ppq480 });
trkLeadFF.addNote({ midi: 70, ticks: ppq480 * 6, durationTicks: ppq480 });
trkLeadFF.addNote({ midi: 75, ticks: ppq480 * 7, durationTicks: ppq480 });

// Pista 2: Pad / Piano (acompañamiento que entra en el compás 5 = tick 1920 * 4 = 7680)
const trkPadFF = midiFireflies.addTrack();
trkPadFF.name = 'Piano / Pad Chords';
trkPadFF.addNote({ midi: 51, ticks: ppq480 * 16, durationTicks: ppq480 * 4 }); // Eb3
trkPadFF.addNote({ midi: 55, ticks: ppq480 * 16, durationTicks: ppq480 * 4 }); // G3
trkPadFF.addNote({ midi: 58, ticks: ppq480 * 16, durationTicks: ppq480 * 4 }); // Bb3

// Pista 3: Bass que entra en compás 5
const trkBassFF = midiFireflies.addTrack();
trkBassFF.name = 'Bass Guitar';
trkBassFF.addNote({ midi: 39, ticks: ppq480 * 16, durationTicks: ppq480 * 4 }); // Eb2

const irFF = parseMidiBufferToIR(midiFireflies.toArray());
const analysisFF = analyzeMidiMusicalIR(irFF, {
  referenceKeyTonic: 'Eb',
  referenceKeyScale: 'major',
  melodyTrackIndex: 0, // Pista 0 es Lead
});
const songFF = convertMidiAnalysisToUniversalSong(analysisFF, irFF, {
  referenceKeyTonic: 'Eb',
  referenceKeyScale: 'major',
});

// Comprobar primer acorde (compás 1, donde solo suena el sinte solista):
const firstChord = songFF.sections[0].chords[0];
assert(firstChord !== undefined, 'Existe primer acorde para el compás 1');
assert(firstChord?.symbol === 'Eb',
  `Símbolo del acorde inicial es Eb (obtenido: ${firstChord?.symbol})`);
assert(firstChord?.roman === 'I',
  `Cifrado romano del acorde inicial es I (obtenido: ${firstChord?.roman})`);
assert(firstChord?.roman !== '?',
  `El acorde inicial NO es degradado a '?' (obtenido: ${firstChord?.roman})`);
assert((firstChord as any).evidenceLevel === 'sufficient_evidence',
  `Nivel de evidencia es sufficient_evidence (obtenido: ${(firstChord as any).evidenceLevel})`);

// ────────────────────────────────────────────────────────────────────────────
// 5. DETERMINISMO ENTRE CARGA INICIAL Y REANÁLISIS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Determinismo e Identidad entre Carga Inicial y Reanálisis:');

const blobFF = new Blob([new Uint8Array(midiFireflies.toArray()).buffer as ArrayBuffer], { type: 'audio/midi' });
const fileFF = new File([blobFF], 'fireflies_synth.mid');

const inspectionInitial = await inspectMidiTracks(fileFF);
const inspectionReanalysis = await inspectMidiTracks(fileFF, {
  referenceKeyTonic: inspectionInitial.estimatedKey.tonic,
  referenceKeyScale: inspectionInitial.estimatedKey.scale,
  melodyTrackIndex: inspectionInitial.autoSelectedMelodyTrackIndex,
});

assert(inspectionInitial.previewChords?.[0]?.chordSymbol === inspectionReanalysis.previewChords?.[0]?.chordSymbol,
  `Símbolo inicial (${inspectionInitial.previewChords?.[0]?.chordSymbol}) idéntico al reanálisis (${inspectionReanalysis.previewChords?.[0]?.chordSymbol})`);
assert(inspectionInitial.previewChords?.[0]?.romanNumeral === inspectionReanalysis.previewChords?.[0]?.romanNumeral,
  `Romano inicial (${inspectionInitial.previewChords?.[0]?.romanNumeral}) idéntico al reanálisis (${inspectionReanalysis.previewChords?.[0]?.romanNumeral})`);
assert(inspectionInitial.previewChords?.[0]?.romanNumeral === 'I',
  `Primer acorde en la previsualización es I (obtenido: ${inspectionInitial.previewChords?.[0]?.romanNumeral})`);

// ────────────────────────────────────────────────────────────────────────────
// 6. VALIDACIÓN DE MÉTRICAS 4/4 Y 3/4
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Validación de Métricas 4/4 y 3/4 (Compás simple y ternario):');

// 6.1 Métrica 4/4
const midi44 = new Midi();
midi44.header.setTempo(120);
midi44.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });
const trk44 = midi44.addTrack();
trk44.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
trk44.addNote({ midi: 62, ticks: 480, durationTicks: 480 });
trk44.addNote({ midi: 64, ticks: 960, durationTicks: 480 });
trk44.addNote({ midi: 65, ticks: 1440, durationTicks: 480 });
trk44.addNote({ midi: 67, ticks: 1920, durationTicks: 480 }); // Inicio compás 2
const ir44 = parseMidiBufferToIR(midi44.toArray());
const analysis44 = analyzeMidiMusicalIR(ir44, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const song44 = convertMidiAnalysisToUniversalSong(analysis44, ir44);

assert(analysis44.melodyNotes[0].startBeat === 1.0, '4/4: Nota 0 inicia en beat 1.0');
assert(analysis44.melodyNotes[4].startBeat === 5.0, '4/4: Compás 2 inicia exactamente en beat 5.0');
const measures44 = calculateMeasuresTimeline(8, song44.sections[0].meters, { numerator: 4, denominator: 4 });
assert(measures44[0].durationQuarters === 4, '4/4: Compás 1 dura 4 negras canónicas');
assert(measures44[1].startQuarter === 4, '4/4: Compás 2 inicia en quarter 4');

// 6.2 Métrica 3/4 (Vals / Ternario)
const midi34 = new Midi();
midi34.header.setTempo(120);
midi34.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4], measures: 0 });
const trk34 = midi34.addTrack();
trk34.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
trk34.addNote({ midi: 64, ticks: 480, durationTicks: 480 });
trk34.addNote({ midi: 67, ticks: 960, durationTicks: 480 });
trk34.addNote({ midi: 72, ticks: 1440, durationTicks: 480 }); // Inicio compás 2 (3 negras = 1440 ticks)
const ir34 = parseMidiBufferToIR(midi34.toArray());
const analysis34 = analyzeMidiMusicalIR(ir34, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const song34 = convertMidiAnalysisToUniversalSong(analysis34, ir34);

assert(song34.timeSignature?.[0] === 3 && song34.timeSignature?.[1] === 4, '3/4: timeSignature preserva [3, 4]');
assert(analysis34.melodyNotes[3].startBeat === 4.0, '3/4: Inicio de compás 2 está en beat 4.0 (1 + 3)');
const measures34 = calculateMeasuresTimeline(6, song34.sections[0].meters, { numerator: 3, denominator: 4 });
assert(measures34[0].durationQuarters === 3, '3/4: Compás 1 dura 3 negras canónicas');
assert(measures34[1].startQuarter === 3, '3/4: Compás 2 inicia en quarter 3');

// ────────────────────────────────────────────────────────────────────────────
// 7. MICRO-TEMPORALIDAD: SÍNCOPAS, TRESILLOS, NOTAS BREVES, SILENCIOS Y SOLAPAMIENTOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Micro-temporalidad: Síncopas, Tresillos, Notas Breves, Silencios y Solapamientos:');

const midiMicro = new Midi();
midiMicro.header.setTempo(120);
const trkMicro = midiMicro.addTrack();
trkMicro.name = 'Micro-timing Showcase';

// Síncopa: nota en contratiempo (beat 1.5 = tick 240, duración 1.5 negras = 720 ticks)
trkMicro.addNote({ midi: 60, ticks: 240, durationTicks: 720 });

// Tresillo de corcheas en beat 3: 3 notas de 160 ticks cada una (160 * 3 = 480 ticks)
// Inician en tick 960 (beat 3.0), tick 1120 (beat 3.3333), tick 1280 (beat 3.6667)
trkMicro.addNote({ midi: 64, ticks: 960, durationTicks: 160 });
trkMicro.addNote({ midi: 65, ticks: 1120, durationTicks: 160 });
trkMicro.addNote({ midi: 67, ticks: 1280, durationTicks: 160 });

// Nota muy breve (fusa / 32nd note, 60 ticks = 0.125 negras) en tick 1440 (beat 4.0)
trkMicro.addNote({ midi: 72, ticks: 1440, durationTicks: 60 });

// Silencio voluntario: entre tick 1500 y tick 1920 no hay notas
// Nota solapada / polifónica en compás 2: tick 1920 (beat 5.0) dos notas simultáneas
trkMicro.addNote({ midi: 60, ticks: 1920, durationTicks: 480 });
trkMicro.addNote({ midi: 67, ticks: 1920, durationTicks: 960 }); // nota tenida más larga

const irMicro = parseMidiBufferToIR(midiMicro.toArray());
const analysisMicro = analyzeMidiMusicalIR(irMicro, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

// Síncopa
const syncNote = analysisMicro.melodyNotes[0];
assert(Math.abs(syncNote.startBeat - 1.5) < 0.001, `Síncopa inicia en beat 1.5 (obtenido: ${syncNote.startBeat})`);
assert(Math.abs(syncNote.durationBeats - 1.5) < 0.001, `Síncopa dura 1.5 negras (obtenido: ${syncNote.durationBeats})`);

// Tresillos sin cuantización destructiva
const trip0 = analysisMicro.melodyNotes[1];
const trip1 = analysisMicro.melodyNotes[2];
const trip2 = analysisMicro.melodyNotes[3];
assert(Math.abs(trip0.startBeat - 3.0) < 0.001, `Tresillo 1 inicia en beat 3.0 (obtenido: ${trip0.startBeat})`);
assert(Math.abs(trip1.startBeat - (1 + 1120 / 480)) < 0.001, `Tresillo 2 inicia en beat ~3.3333 (obtenido: ${trip1.startBeat})`);
assert(Math.abs(trip2.startBeat - (1 + 1280 / 480)) < 0.001, `Tresillo 3 inicia en beat ~3.6667 (obtenido: ${trip2.startBeat})`);
assert(Math.abs(trip0.durationBeats - (160 / 480)) < 0.001, `Duración del tresillo preservada sin redondear a 0.25 (obtenido: ${trip0.durationBeats})`);

// Nota muy breve (fusa)
const fusaNote = analysisMicro.melodyNotes[4];
assert(Math.abs(fusaNote.durationBeats - 0.125) < 0.001, `Nota muy breve preserva 0.125 beats (obtenido: ${fusaNote.durationBeats})`);

// Notas solapadas / polifonía
const poly1 = analysisMicro.melodyNotes[5];
const poly2 = analysisMicro.melodyNotes[6];
assert(poly1.startBeat === 5.0 && poly2.startBeat === 5.0, 'Notas simultáneas inician en el mismo beat 5.0');
assert(poly1.durationBeats === 1.0 && poly2.durationBeats === 2.0, 'Notas simultáneas preservan sus duraciones independientes');

// ────────────────────────────────────────────────────────────────────────────
// 8. TRAZABILIDAD: IR -> PIANO ROLL -> PROGRAMACIÓN DEL REPRODUCTOR
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Trazabilidad: IR -> Piano Roll -> Programación del Reproductor:');

// Canción a 120 BPM: 1 beat = 0.5 segundos físicos
const midiTrace = new Midi();
midiTrace.header.setTempo(120);
const trkTrace = midiTrace.addTrack();
// Nota en tick 480 (beat 2.0), duración 480 ticks (1 negra)
trkTrace.addNote({ midi: 60, ticks: 480, durationTicks: 480 });

const irTrace = parseMidiBufferToIR(midiTrace.toArray());
const analysisTrace = analyzeMidiMusicalIR(irTrace, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const songTrace = convertMidiAnalysisToUniversalSong(analysisTrace, irTrace);

const irNote = irTrace.tracks[0].notes[0];
const melodyNote = songTrace.sections[0].melody[0];

// Tiempo en segundos registrado en IR
assert(Math.abs(irNote.startSeconds - 0.5) < 0.001, `IR: startSeconds es 0.5 s (obtenido: ${irNote.startSeconds})`);

// Posición en negras canónicas para Piano Roll: beat - 1
const pianoRollQuarter = melodyNote.beat - 1;
assert(Math.abs(pianoRollQuarter - 1.0) < 0.001, `Piano Roll: posición es quarter 1.0 (obtenido: ${pianoRollQuarter})`);

// Tiempo de disparo programado en el reproductor (audioEngine.ts: line 197): (note.beat - 1) * (60 / bpm)
const playerScheduledSeconds = (melodyNote.beat - 1) * (60 / songTrace.bpm);
assert(Math.abs(playerScheduledSeconds - irNote.startSeconds) < 0.001,
  `Reproductor y IR coinciden exactamente: ${playerScheduledSeconds} s vs ${irNote.startSeconds} s`);

// ────────────────────────────────────────────────────────────────────────────
// 9. AISLAMIENTO ARMÓNICO, PREVENCIÓN DE FUGAS DE FUTURO Y ACORDES AMBIGUOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Aislamiento Armónico, Prevención de Fugas de Futuro y Acordes Ambiguos:');

// 9.1 Prevención de fugas de notas futuras:
// Silencio en compás 1. Acorde de E mayor en compás 5.
const midiFuture = new Midi();
midiFuture.header.setTempo(120);
const trkFuture = midiFuture.addTrack();
// Compás 5 inicia en tick 1920 * 4 = 7680
trkFuture.addNote({ midi: 64, ticks: 7680, durationTicks: 1920 }); // E4
trkFuture.addNote({ midi: 68, ticks: 7680, durationTicks: 1920 }); // G#4
trkFuture.addNote({ midi: 71, ticks: 7680, durationTicks: 1920 }); // B4

const irFuture = parseMidiBufferToIR(midiFuture.toArray());
const analysisFuture = analyzeMidiMusicalIR(irFuture, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const songFuture = convertMidiAnalysisToUniversalSong(analysisFuture, irFuture);

// El compás 1 está vacío: NO debe inventar un acorde de E mayor con notas de compás 5
const chordBar1 = songFuture.sections[0].chords[0];
assert(chordBar1.symbol === '?', `Compás vacío en intro produce abstención '?' (obtenido: ${chordBar1.symbol})`);
assert(chordBar1.roman === '?', `Compás vacío produce romano '?' (obtenido: ${chordBar1.roman})`);
assert((chordBar1 as any).evidenceLevel === 'unknown', 'Compás vacío tiene evidenceLevel = unknown');

// 9.2 Parsimonia armónica: Melodía rápida con notas de paso ligeras (duración 0.25 beat)
const midiFastOrn = new Midi();
midiFastOrn.header.setTempo(120);
const trkAccFast = midiFastOrn.addTrack();
trkAccFast.name = 'Chords';
trkAccFast.addNote({ midi: 48, ticks: 0, durationTicks: 1920 }); // C3
trkAccFast.addNote({ midi: 52, ticks: 0, durationTicks: 1920 }); // E3
trkAccFast.addNote({ midi: 55, ticks: 0, durationTicks: 1920 }); // G3

const trkMelFast = midiFastOrn.addTrack();
trkMelFast.name = 'Fast Lead';
// Melodía rápida con notas de paso D5 (74) y F5 (77) de duración 120 ticks (0.25 beat) en tiempos débiles
trkMelFast.addNote({ midi: 72, ticks: 0, durationTicks: 360 });   // C5 tiempo fuerte
trkMelFast.addNote({ midi: 74, ticks: 360, durationTicks: 120 }); // D5 nota de paso rápida
trkMelFast.addNote({ midi: 76, ticks: 480, durationTicks: 360 }); // E5
trkMelFast.addNote({ midi: 77, ticks: 840, durationTicks: 120 }); // F5 nota de paso rápida

const irFastOrn = parseMidiBufferToIR(midiFastOrn.toArray());
const analysisFastOrn = analyzeMidiMusicalIR(irFastOrn, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const chordFast = analysisFastOrn.harmonicSegments[0];

assert(chordFast.chordSymbol === 'C', `Tríada C mayor con notas de paso rápidas se mantiene como C (obtenido: ${chordFast.chordSymbol})`);
assert(chordFast.romanNumeral === 'I', `Romano se mantiene como I puro (obtenido: ${chordFast.romanNumeral})`);
assert(chordFast.adds === undefined, 'No añade tensión add9 por nota de paso rápida');

// 9.3 Tensión estructural real: Novena tenida con peso estructural
const midiStructural9 = new Midi();
midiStructural9.header.setTempo(120);
const trkStr9 = midiStructural9.addTrack();
trkStr9.addNote({ midi: 48, ticks: 0, durationTicks: 1920 }); // C3
trkStr9.addNote({ midi: 52, ticks: 0, durationTicks: 1920 }); // E3
trkStr9.addNote({ midi: 55, ticks: 0, durationTicks: 1920 }); // G3
trkStr9.addNote({ midi: 62, ticks: 0, durationTicks: 1920 }); // D4 (9ª tenida durante todo el compás)

const irStr9 = parseMidiBufferToIR(midiStructural9.toArray());
const analysisStr9 = analyzeMidiMusicalIR(irStr9, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const chordStr9 = analysisStr9.harmonicSegments[0];

assert(chordStr9.adds?.[0] === 9, `9ª tenida estructural sí se reconoce como add9 (obtenido: ${chordStr9.adds})`);
assert(chordStr9.chordSymbol.includes('add9'), `Símbolo refleja add9 (obtenido: ${chordStr9.chordSymbol})`);

// 9.4 Abstención justificada ante cluster cromático atonal
const midiCluster = new Midi();
midiCluster.header.setTempo(120);
const trkCluster = midiCluster.addTrack();
trkCluster.addNote({ midi: 60, ticks: 0, durationTicks: 1920 }); // C4
trkCluster.addNote({ midi: 61, ticks: 0, durationTicks: 1920 }); // C#4
trkCluster.addNote({ midi: 62, ticks: 0, durationTicks: 1920 }); // D4
trkCluster.addNote({ midi: 63, ticks: 0, durationTicks: 1920 }); // D#4
trkCluster.addNote({ midi: 64, ticks: 0, durationTicks: 1920 }); // E4

const irCluster = parseMidiBufferToIR(midiCluster.toArray());
const analysisCluster = analyzeMidiMusicalIR(irCluster, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const segCluster = analysisCluster.harmonicSegments[0];

assert(segCluster.evidenceLevel === 'unknown', 'Cluster cromático atonal produce evidenceLevel = unknown');
assert(segCluster.romanNumeral === '?', `Cluster atonal produce romano '?' (obtenido: ${segCluster.romanNumeral})`);
assert(segCluster.chordSymbol === '?', `Cluster atonal produce símbolo '?' (obtenido: ${segCluster.chordSymbol})`);

// 9.5 Ambigüedad armónica y alternativas plausibles: Colección C, E, G, A (C6 vs Am7/C)
const midiAmbig = new Midi();
midiAmbig.header.setTempo(120);
const trkAmbig = midiAmbig.addTrack();
trkAmbig.addNote({ midi: 48, ticks: 0, durationTicks: 1920 }); // C3 (bajo)
trkAmbig.addNote({ midi: 52, ticks: 0, durationTicks: 1920 }); // E3
trkAmbig.addNote({ midi: 55, ticks: 0, durationTicks: 1920 }); // G3
trkAmbig.addNote({ midi: 57, ticks: 0, durationTicks: 1920 }); // A3

const irAmbig = parseMidiBufferToIR(midiAmbig.toArray());
const analysisAmbig = analyzeMidiMusicalIR(irAmbig, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
const segAmbig = analysisAmbig.harmonicSegments[0];

assert(segAmbig.evidenceLevel === 'plausible_alternatives',
  `Colección rica C-E-G-A señaliza plausible_alternatives (obtenido: ${segAmbig.evidenceLevel})`);
assert(segAmbig.alternativeHypotheses.length > 0, 'Conserva al menos una hipótesis alternativa');
assert(segAmbig.alternativeHypotheses.some((h) => h.chordSymbol.includes('Am7')),
  'Conserva alternativa enarmónica Am7/C');

console.log('\n========================================');
console.log(`RESULTADOS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`Suite falló con ${failed} pruebas fallidas`);
}
