/**
 * midiPhase3TonalHarmonic.test.ts
 * Batería de pruebas automatizadas para la Fase 3:
 * Capa C: Analizador Tonal, Armónico y Melódico Contextual.
 *
 * Cubre:
 * 1. Estimación de tonalidad Krumhansl-Schmuckler y ranking de candidatos.
 * 2. Integración con metadatos Key Signature y detección de ambigüedad.
 * 3. Segmentación armónica por compás y medio compás con consolidación de acordes.
 * 4. Reconocimiento de grados diatónicos, inversiones, dominantes secundarias y préstamos modales.
 * 5. Clasificación melódica contextual: notas de acorde, notas de paso y bordaduras.
 * 6. Separación de voces (melodía vs acompañamiento) por tesitura y pistas.
 * 7. Garantías de nivel C (LEVEL_C_MUSICAL_INFERENCE) y abstención justificada.
 */

import { Midi } from '@tonejs/midi';
import { parseMidiBufferToIR } from './midiParser';
import { estimateKeyCandidates } from './midiTonalAnalyzer';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';
import type { MidiMusicalIR } from '../../types/midiIR';

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

console.log('=== TEST SUITE: MIDI Fase 3 - Analizador Tonal y Armónico ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. ESTIMACIÓN TONAL (KRUMHANSL-SCHMUCKLER)
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Estimación de Tonalidad y Candidatos (midiTonalAnalyzer):');

// 1.1 Tonalidad inequívoca de Do Mayor
{
  const midi = new Midi();
  const track = midi.addTrack();
  // Do mayor: C, E, G, F, A, B, C con predominio de tónica y dominante
  const notes = [
    { midi: 60, ticks: 0, durationTicks: 480 },   // C4
    { midi: 64, ticks: 480, durationTicks: 480 }, // E4
    { midi: 67, ticks: 960, durationTicks: 480 }, // G4
    { midi: 65, ticks: 1440, durationTicks: 480 },// F4
    { midi: 69, ticks: 1920, durationTicks: 480 },// A4
    { midi: 71, ticks: 2400, durationTicks: 480 },// B4
    { midi: 72, ticks: 2880, durationTicks: 960 },// C5
    { midi: 60, ticks: 3840, durationTicks: 960 },// C4
  ];
  for (const n of notes) {
    track.addNote({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks });
  }

  const ir = parseMidiBufferToIR(midi.toArray());
  const keyRes = estimateKeyCandidates(ir);

  assert(keyRes.primaryKey.tonic === 'C', `Identifica Do Mayor (tonic=${keyRes.primaryKey.tonic})`);
  assert(keyRes.primaryKey.scale === 'major', `Modo es mayor (scale=${keyRes.primaryKey.scale})`);
  assert(keyRes.primaryKey.confidence >= 0.7, `Confianza alta (conf=${keyRes.primaryKey.confidence})`);
  assert(!keyRes.isAmbiguous, 'No es ambigua');
  assert(keyRes.candidateKeys.length <= 5, 'Retorna hasta 5 candidatos rankeados');
}

// 1.2 Tonalidad inequívoca de La Menor
{
  const midi = new Midi();
  const track = midi.addTrack();
  // A minor: A, C, E, D, F, B, G#
  const notes = [
    { midi: 57, ticks: 0, durationTicks: 480 },   // A3
    { midi: 60, ticks: 480, durationTicks: 480 }, // C4
    { midi: 64, ticks: 960, durationTicks: 480 }, // E4
    { midi: 62, ticks: 1440, durationTicks: 480 },// D4
    { midi: 65, ticks: 1920, durationTicks: 480 },// F4
    { midi: 68, ticks: 2400, durationTicks: 480 },// G#4
    { midi: 69, ticks: 2880, durationTicks: 960 },// A4
  ];
  for (const n of notes) {
    track.addNote({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks });
  }

  const ir = parseMidiBufferToIR(midi.toArray());
  const keyRes = estimateKeyCandidates(ir);

  assert(keyRes.primaryKey.tonic === 'A', `Identifica La Menor (tonic=${keyRes.primaryKey.tonic})`);
  assert(keyRes.primaryKey.scale === 'minor', `Modo es menor (scale=${keyRes.primaryKey.scale})`);
  assert(keyRes.primaryKey.confidence >= 0.65, `Confianza adecuada para La menor (conf=${keyRes.primaryKey.confidence})`);
}

// 1.3 Tonalidad de Sol Mayor con F#
{
  const midi = new Midi();
  const track = midi.addTrack();
  // G major: G, B, D, F#, C, E
  const notes = [
    { midi: 55, ticks: 0, durationTicks: 480 },   // G3
    { midi: 59, ticks: 480, durationTicks: 480 }, // B3
    { midi: 62, ticks: 960, durationTicks: 480 }, // D4
    { midi: 66, ticks: 1440, durationTicks: 480 },// F#4
    { midi: 67, ticks: 1920, durationTicks: 960 },// G4
  ];
  for (const n of notes) {
    track.addNote({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks });
  }

  const ir = parseMidiBufferToIR(midi.toArray());
  const keyRes = estimateKeyCandidates(ir);

  assert(keyRes.primaryKey.tonic === 'G', `Identifica Sol Mayor (tonic=${keyRes.primaryKey.tonic})`);
  assert(keyRes.primaryKey.scale === 'major', 'Modo es mayor');
}

// 1.4 Integración con metadato Key Signature explícito
{
  const midi = new Midi();
  midi.header.keySignatures.push({
    key: 'F',
    scale: 'major',
    ticks: 0,
  });
  const track = midi.addTrack();
  // Notas de F major
  const notes = [
    { midi: 53, ticks: 0, durationTicks: 480 },   // F3
    { midi: 57, ticks: 480, durationTicks: 480 }, // A3
    { midi: 60, ticks: 960, durationTicks: 480 }, // C4
    { midi: 65, ticks: 1440, durationTicks: 480 },// F4
  ];
  for (const n of notes) {
    track.addNote({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks });
  }

  const ir = parseMidiBufferToIR(midi.toArray());
  const keyRes = estimateKeyCandidates(ir);

  assert(keyRes.primaryKey.tonic === 'F', 'Identifica F mayor');
  assert(keyRes.primaryKey.isExplicitMeta === true, 'Marca isExplicitMeta = true');
}

// 1.5 Ambigüedad tonal o colección cromática plana
{
  const midi = new Midi();
  const track = midi.addTrack();
  // Cluster cromático de 12 semitonos idénticos
  for (let i = 0; i < 12; i++) {
    track.addNote({ midi: 60 + i, ticks: i * 480, durationTicks: 480 });
  }

  const ir = parseMidiBufferToIR(midi.toArray());
  const keyRes = estimateKeyCandidates(ir);

  assert(keyRes.isAmbiguous === true, 'Detecta ambigüedad tonal ante cluster cromático uniforme');
}

// 1.6 Archivo sin notas melódicas (vacío)
{
  const mockIR: MidiMusicalIR = {
    header: {
      format: 1,
      ppq: 480,
      durationTicks: 0,
      durationSeconds: 0,
      tempos: [{ ticks: 0, bpm: 120, timeSeconds: 0 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      keySignatures: [],
    },
    tracks: [],
    allNotes: [],
    provenance: {
      source: 'midi_file',
      format: 1,
      rawByteLength: 0,
      totalTracksOriginal: 0,
    },
  };

  const keyRes = estimateKeyCandidates(mockIR);
  assert(keyRes.isAmbiguous === true, 'Colección sin notas se marca como ambigua');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. SEGMENTACIÓN ARMÓNICA Y RECONOCIMIENTO DIATÓNICO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Segmentación Armónica y Progresiones Diatónicas (midiHarmonicAnalyzer):');

// 2.1 Progresión diatónica clásica I - IV - V - I (C - F - G - C) en 4 compases
{
  const midi = new Midi();
  const ppq = 480;
  const barTicks = ppq * 4;

  const trackBass = midi.addTrack();
  const trackHarmony = midi.addTrack();

  // Compás 1: C major (C3 + E4, G4)
  trackBass.addNote({ midi: 48, ticks: 0, durationTicks: barTicks }); // C3
  trackHarmony.addNote({ midi: 64, ticks: 0, durationTicks: barTicks }); // E4
  trackHarmony.addNote({ midi: 67, ticks: 0, durationTicks: barTicks }); // G4

  // Compás 2: F major (F3 + A4, C5)
  trackBass.addNote({ midi: 53, ticks: barTicks, durationTicks: barTicks }); // F3
  trackHarmony.addNote({ midi: 69, ticks: barTicks, durationTicks: barTicks }); // A4
  trackHarmony.addNote({ midi: 72, ticks: barTicks, durationTicks: barTicks }); // C5

  // Compás 3: G major (G3 + B4, D5)
  trackBass.addNote({ midi: 55, ticks: barTicks * 2, durationTicks: barTicks }); // G3
  trackHarmony.addNote({ midi: 71, ticks: barTicks * 2, durationTicks: barTicks }); // B4
  trackHarmony.addNote({ midi: 74, ticks: barTicks * 2, durationTicks: barTicks }); // D5

  // Compás 4: C major (C3 + E4, G4)
  trackBass.addNote({ midi: 48, ticks: barTicks * 3, durationTicks: barTicks }); // C3
  trackHarmony.addNote({ midi: 64, ticks: barTicks * 3, durationTicks: barTicks }); // E4
  trackHarmony.addNote({ midi: 67, ticks: barTicks * 3, durationTicks: barTicks }); // G4

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, {
    referenceKeyTonic: 'C',
    referenceKeyScale: 'major',
  });

  assert(analysis.guaranteeLevel === 'LEVEL_C_MUSICAL_INFERENCE', 'Nivel de garantía es LEVEL_C_MUSICAL_INFERENCE');
  assert(analysis.totalBars === 4, `Detecta 4 compases (totalBars=${analysis.totalBars})`);

  // Verificamos los 4 segmentos consolidados
  assert(analysis.harmonicSegments.length === 4, `Consolida en 4 segmentos armónicos de 4 beats (obtenido: ${analysis.harmonicSegments.length})`);

  const [seg1, seg2, seg3, seg4] = analysis.harmonicSegments;

  assert(seg1.romanNumeral === 'I' && seg1.rootPitchClass === 0, `Compás 1: I (C maj) (obtenido: ${seg1.romanNumeral})`);
  assert(seg1.durationBeats === 4, 'Compás 1 dura 4 beats');
  assert(seg2.romanNumeral === 'IV' && seg2.rootPitchClass === 5, `Compás 2: IV (F maj) (obtenido: ${seg2.romanNumeral})`);
  assert(seg3.romanNumeral === 'V' && seg3.rootPitchClass === 7, `Compás 3: V (G maj) (obtenido: ${seg3.romanNumeral})`);
  assert(seg4.romanNumeral === 'I' && seg4.rootPitchClass === 0, `Compás 4: I (C maj) (obtenido: ${seg4.romanNumeral})`);
}

// 2.2 Cambio armónico a mitad de compás (2 acordes por compás: I - V en bar 1)
{
  const midi = new Midi();
  const track = midi.addTrack();

  // Beat 1-2 (ticks 0..960): C maj (C3, E3, G3)
  track.addNote({ midi: 48, ticks: 0, durationTicks: 960 });
  track.addNote({ midi: 52, ticks: 0, durationTicks: 960 });
  track.addNote({ midi: 55, ticks: 0, durationTicks: 960 });

  // Beat 3-4 (ticks 960..1920): G maj (G2, B2, D3)
  track.addNote({ midi: 43, ticks: 960, durationTicks: 960 });
  track.addNote({ midi: 47, ticks: 960, durationTicks: 960 });
  track.addNote({ midi: 50, ticks: 960, durationTicks: 960 });

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, {
    referenceKeyTonic: 'C',
    referenceKeyScale: 'major',
    harmonyResolutionBeats: 2,
  });

  assert(analysis.harmonicSegments.length === 2, `Mantiene 2 segmentos de 2 beats cada uno (obtenido: ${analysis.harmonicSegments.length})`);
  assert(analysis.harmonicSegments[0].romanNumeral === 'I', 'Primer medio compás es I');
  assert(analysis.harmonicSegments[0].durationBeats === 2, 'Duración es 2 beats');
  assert(analysis.harmonicSegments[1].romanNumeral === 'V', 'Segundo medio compás es V');
  assert(analysis.harmonicSegments[1].durationBeats === 2, 'Duración es 2 beats');
}

// ────────────────────────────────────────────────────────────────────────────
// 3. RECONOCIMIENTO DE INVERSIONES
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Reconocimiento de Inversiones:');

// 3.1 Acorde de Do mayor en primera inversión (I6) con Mi en el bajo
{
  const midi = new Midi();
  const track = midi.addTrack();

  // Bajo: E3 (midi 52), voces superiores C4 (60), G4 (67)
  track.addNote({ midi: 52, ticks: 0, durationTicks: 1920 }); // E3 (bajo)
  track.addNote({ midi: 60, ticks: 0, durationTicks: 1920 }); // C4
  track.addNote({ midi: 67, ticks: 0, durationTicks: 1920 }); // G4

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const seg = analysis.harmonicSegments[0];
  assert(seg.rootPitchClass === 0, 'Fundamental sigue siendo Do (PC 0)');
  assert(seg.bassPitchClass === 4, 'Bajo efectivo es Mi (PC 4)');
  assert(seg.inversion === 1, `Inversión reconocida como 1 (primera inversión) (obtenido: ${seg.inversion})`);
}

// 3.2 Acorde de Sol mayor en primera inversión (V6) con Si en el bajo
{
  const midi = new Midi();
  const track = midi.addTrack();

  // Bajo: B2 (midi 47), voces superiores G3 (55), D4 (62)
  track.addNote({ midi: 47, ticks: 0, durationTicks: 1920 }); // B2 (bajo)
  track.addNote({ midi: 55, ticks: 0, durationTicks: 1920 }); // G3
  track.addNote({ midi: 62, ticks: 0, durationTicks: 1920 }); // D4

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const seg = analysis.harmonicSegments[0];
  assert(seg.rootPitchClass === 7, 'Fundamental es Sol (PC 7)');
  assert(seg.bassPitchClass === 11, 'Bajo efectivo es Si (PC 11)');
  assert(seg.inversion === 1, 'Inversión es 1 (primera inversión)');
}

// ────────────────────────────────────────────────────────────────────────────
// 4. FUNCIONES SECUNDARIAS (DOMINANTES APLICADAS) Y PRÉSTAMOS MODALES
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Dominantes Secundarias y Préstamos Modales:');

// 4.1 Dominante secundaria V/ii (A mayor en C mayor: A-C#-E)
{
  const midi = new Midi();
  const track = midi.addTrack();

  // A mayor: A2 (45), C#4 (61), E4 (64)
  track.addNote({ midi: 45, ticks: 0, durationTicks: 1920 }); // A2
  track.addNote({ midi: 61, ticks: 0, durationTicks: 1920 }); // C#4
  track.addNote({ midi: 64, ticks: 0, durationTicks: 1920 }); // E4

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const seg = analysis.harmonicSegments[0];
  assert(seg.isSecondary === true, 'Identificado como dominante secundaria');
  assert(seg.secondaryType === 'V', `Tipo secundario es V (obtenido: ${seg.secondaryType})`);
  assert(seg.appliedTarget === 2, `Objetivo armónico es grado 2 (ii) (obtenido: ${seg.appliedTarget})`);
  assert(seg.romanNumeral === 'V/ii', `Cifrado romano normalizado es V/ii (obtenido: ${seg.romanNumeral})`);
}

// 4.2 Dominante secundaria V/V (D mayor en C mayor: D-F#-A)
{
  const midi = new Midi();
  const track = midi.addTrack();

  // D mayor: D3 (50), F#4 (66), A4 (69)
  track.addNote({ midi: 50, ticks: 0, durationTicks: 1920 });
  track.addNote({ midi: 66, ticks: 0, durationTicks: 1920 });
  track.addNote({ midi: 69, ticks: 0, durationTicks: 1920 });

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const seg = analysis.harmonicSegments[0];
  assert(seg.isSecondary === true, 'Identificado como dominante secundaria');
  assert(seg.appliedTarget === 5, `Objetivo armónico es grado 5 (V) (obtenido: ${seg.appliedTarget})`);
  assert(seg.romanNumeral === 'V/V', `Cifrado es V/V (obtenido: ${seg.romanNumeral})`);
}

// 4.3 Préstamo modal: iv menor en tonalidad mayor (F menor en C mayor: F-Ab-C)
{
  const midi = new Midi();
  const track = midi.addTrack();

  // F menor: F3 (53), Ab4 (68), C5 (72)
  track.addNote({ midi: 53, ticks: 0, durationTicks: 1920 });
  track.addNote({ midi: 68, ticks: 0, durationTicks: 1920 });
  track.addNote({ midi: 72, ticks: 0, durationTicks: 1920 });

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const seg = analysis.harmonicSegments[0];
  assert(seg.isBorrowed === true, 'Identificado como acorde prestado (modal mixture)');
  assert(seg.quality === 'min', 'Cualidad es menor');
}

// ────────────────────────────────────────────────────────────────────────────
// 5. ANÁLISIS MELÓDICO CONTEXTUAL: NOTAS DE ACORDE, PASO Y BORDADURAS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Análisis Melódico Contextual (Notas de acorde vs No armónicas):');

{
  const midi = new Midi();

  // Pista 0: Acompañamiento (Do Mayor durante todo el compás)
  const trackAcc = midi.addTrack();
  trackAcc.addNote({ midi: 48, ticks: 0, durationTicks: 1920 }); // C3
  trackAcc.addNote({ midi: 52, ticks: 0, durationTicks: 1920 }); // E3
  trackAcc.addNote({ midi: 55, ticks: 0, durationTicks: 1920 }); // G3

  // Pista 1: Melodía con notas de acorde, paso y bordadura
  const trackMel = midi.addTrack();
  // Beat 1: C5 (72) -> Nota de acorde
  trackMel.addNote({ midi: 72, ticks: 0, durationTicks: 480 });
  // Beat 2: D5 (74) -> Nota de paso entre C5 y E5
  trackMel.addNote({ midi: 74, ticks: 480, durationTicks: 480 });
  // Beat 3: E5 (76) -> Nota de acorde
  trackMel.addNote({ midi: 76, ticks: 960, durationTicks: 480 });
  // Beat 4: D5 (74) -> Bordadura o retorno
  trackMel.addNote({ midi: 74, ticks: 1440, durationTicks: 480 });

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, {
    referenceKeyTonic: 'C',
    referenceKeyScale: 'major',
    melodyTrackIndex: 1, // Especificamos explícitamente la pista de melodía
  });

  assert(analysis.melodyNotes.length === 4, `Analiza 4 notas melódicas (obtenido: ${analysis.melodyNotes.length})`);

  const [n1, n2, n3, n4] = analysis.melodyNotes;

  // Nota 1: C5
  assert(n1.isChordTone === true, 'C5 es nota de acorde');
  assert(n1.melodicRole === 'chord_tone', 'Rol de C5 es chord_tone');
  assert(n1.scaleDegree === '1', `Grado de C5 es 1 (obtenido: ${n1.scaleDegree})`);

  // Nota 2: D5
  assert(n2.isChordTone === false, 'D5 NO es nota del acorde de Do Mayor');
  assert(n2.melodicRole === 'passing_tone', `Rol de D5 entre C y E es passing_tone (obtenido: ${n2.melodicRole})`);
  assert(n2.scaleDegree === '2', `Grado de D5 es 2 (obtenido: ${n2.scaleDegree})`);

  // Nota 3: E5
  assert(n3.isChordTone === true, 'E5 es nota de acorde (tercera)');
  assert(n3.melodicRole === 'chord_tone', 'Rol de E5 es chord_tone');
  assert(n3.scaleDegree === '3', `Grado de E5 es 3 (obtenido: ${n3.scaleDegree})`);

  // Verificamos cálculo de beats
  assert(n1.startBeat === 1, 'n1 empieza en beat 1');
  assert(n2.startBeat === 2, 'n2 empieza en beat 2');
  assert(n3.startBeat === 3, 'n3 empieza en beat 3');
  assert(n4.startBeat === 4, 'n4 empieza en beat 4');
}

// 5.2 Bordadura melódica C -> D -> C
{
  const midi = new Midi();
  const trackAcc = midi.addTrack();
  trackAcc.addNote({ midi: 48, ticks: 0, durationTicks: 1920 }); // C3

  const trackMel = midi.addTrack();
  // C5 (72) -> D5 (74) -> C5 (72)
  trackMel.addNote({ midi: 72, ticks: 0, durationTicks: 480 });
  trackMel.addNote({ midi: 74, ticks: 480, durationTicks: 480 });
  trackMel.addNote({ midi: 72, ticks: 960, durationTicks: 480 });

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, {
    referenceKeyTonic: 'C',
    referenceKeyScale: 'major',
    melodyTrackIndex: 1,
  });

  const [c1, d1, c2] = analysis.melodyNotes;
  assert(c1.melodicRole === 'chord_tone', 'C1 es chord_tone');
  assert(d1.melodicRole === 'neighbor_tone', `D1 entre C1 y C2 es reconocido como neighbor_tone (obtenido: ${d1.melodicRole})`);
  assert(c2.melodicRole === 'chord_tone', 'C2 es chord_tone');
}

// ────────────────────────────────────────────────────────────────────────────
// 6. SEPARACIÓN AUTOMÁTICA Y ROBUSTEZ ANTE CASOS LÍMITE
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Separación Automática de Pistas y Robustez:');

// 6.1 Separación automática de 2 pistas por tesitura media
{
  const midi = new Midi();
  const trackLow = midi.addTrack();
  const trackHigh = midi.addTrack();

  // Pista aguda (media ~74): melodía
  trackHigh.addNote({ midi: 72, ticks: 0, durationTicks: 480 });
  trackHigh.addNote({ midi: 76, ticks: 480, durationTicks: 480 });

  // Pista grave (media ~48): acompañamiento
  trackLow.addNote({ midi: 48, ticks: 0, durationTicks: 1920 });
  trackLow.addNote({ midi: 55, ticks: 0, durationTicks: 1920 });

  const ir = parseMidiBufferToIR(midi.toArray());
  // Sin pasar melodyTrackIndex: deduce automáticamente que trackHigh es melodía
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.melodyNotes.length === 2, `Identifica automáticamente 2 notas en la melodía (obtenido: ${analysis.melodyNotes.length})`);
  assert(analysis.melodyNotes[0].pitchMidi === 72, 'Primera nota melódica es C5 (72)');
}

// 6.2 Compás vacío: genera segmento armónico por defecto con evidenceLevel unknown
{
  const mockIR: MidiMusicalIR = {
    header: {
      format: 1,
      ppq: 480,
      durationTicks: 1920,
      durationSeconds: 1.0,
      tempos: [{ ticks: 0, bpm: 120, timeSeconds: 0 }],
      timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
      keySignatures: [],
    },
    tracks: [
      {
        index: 0,
        name: 'Empty Track',
        channel: 0,
        programNumber: 0,
        instrumentName: 'piano',
        isPercussion: false,
        notes: [],
        durationTicks: 1920,
        durationSeconds: 1.0,
      },
    ],
    allNotes: [],
    provenance: {
      source: 'midi_file',
      format: 1,
      rawByteLength: 0,
      totalTracksOriginal: 0,
    },
  };

  const analysis = analyzeMidiMusicalIR(mockIR, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.harmonicSegments.length === 1, 'Genera 1 segmento para el compás vacío');
  assert(analysis.harmonicSegments[0].evidenceLevel === 'unknown', 'Nivel de evidencia es unknown ante compás vacío');
  assert(analysis.harmonicSegments[0].sourceNoteIds.length === 0, 'sourceNoteIds está vacío');
  assert(analysis.melodyNotes.length === 0, 'No hay notas melódicas');
}

// ────────────────────────────────────────────────────────────────────────────
// RESUMEN
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Tests Fase 3 Completados: ${passed} pasados, ${failed} fallados.`);
console.log(`========================================\n`);

if (failed > 0) {
  throw new Error(`PHASE 3 TESTS FAILED: ${failed} assertion(s) failed`);
}
