/**
 * midiPrecisionBenchmark.test.ts
 * Batería de evaluación empírica y línea base de precisión musical para el motor MIDI Hooktheory.
 * Mide de forma reproducible sobre un conjunto normativo de casos de prueba:
 * 1. Fidelidad de parsing y conservación de eventos.
 * 2. Precisión en notas y duraciones.
 * 3. Precisión en tonalidad y modo (global y por segmentos/modulación).
 * 4. Precisión en segmentación armónica.
 * 5. Precisión en fundamental, cualidad, inversión y bajo efectivo.
 * 6. Precisión en grados romanos y funciones secundarias/prestadas.
 * 7. Calidad de la clasificación melódica (chord_tone, passing_tone, neighbor_tone).
 * 8. Calidad de la abstención ante ambigüedad y atonalidad.
 */

import { Midi } from '@tonejs/midi';
import { parseMidiBufferToIR } from './midiParser';
import { estimateKeyCandidates } from './midiTonalAnalyzer';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';
import { recognizeChordFromMidiNotes } from '../midiImporter';
import { convertMidiAnalysisToUniversalSong } from './midiHooktheoryAdapter';

export interface BenchmarkMetrics {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  categoryScores: Record<string, { total: number; passed: number; accuracy: number }>;
}

export function runMidiPrecisionBenchmark(): BenchmarkMetrics {
  const scores: Record<string, { total: number; passed: number }> = {
    'Parsing & Event Fidelity': { total: 0, passed: 0 },
    'Key & Mode Estimation': { total: 0, passed: 0 },
    'Harmonic Segmentation': { total: 0, passed: 0 },
    'Root, Quality & Inversion': { total: 0, passed: 0 },
    'Secondary Dominants & Borrowed': { total: 0, passed: 0 },
    'Arpeggios & Passing Tones Filtering': { total: 0, passed: 0 },
    'Drum Isolation & Voice Separation': { total: 0, passed: 0 },
    'Melodic Classification': { total: 0, passed: 0 },
    'Abstention & Ambiguity Quality': { total: 0, passed: 0 },
    'Metric Changes & Timing': { total: 0, passed: 0 },
  };

  function testAssert(category: string, condition: boolean, description: string, detail?: any) {
    if (!scores[category]) {
      scores[category] = { total: 0, passed: 0 };
    }
    scores[category].total++;
    if (condition) {
      scores[category].passed++;
      console.log(`    [PASS] ${description}`);
    } else {
      console.warn(`    [FAIL] ${description}`, detail !== undefined ? detail : '');
    }
  }

  console.log('=== BENCHMARK DE PRECISIÓN MUSICAL MIDI: EJECUCIÓN DE LÍNEA BASE ===\n');

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 1: Parsing & Event Fidelity: Conservación de notas, ticks y velocidades
  // ──────────────────────────────────────────────────────────────────────────
  console.log('1. Parsing & Event Fidelity:');
  const midi1 = new Midi();
  const ppq = midi1.header.ppq || 480;
  const t1 = midi1.addTrack();
  t1.name = 'Test Track';
  t1.addNote({ midi: 60, ticks: 0, durationTicks: ppq, velocity: 0.85 });
  t1.addNote({ midi: 64, ticks: ppq, durationTicks: ppq * 2, velocity: 0.70 });
  const bytes1 = midi1.toArray();
  const ir1 = parseMidiBufferToIR(new Uint8Array(bytes1));

  testAssert('Parsing & Event Fidelity', ir1.tracks.length === 1, 'Preserva número exacto de pistas');
  testAssert('Parsing & Event Fidelity', ir1.allNotes.length === 2, 'Preserva número total de notas');
  testAssert('Parsing & Event Fidelity', ir1.allNotes[0].pitchMidi === 60 && ir1.allNotes[0].startTick === 0, 'Nota 1 pitch y startTick exactos');
  testAssert('Parsing & Event Fidelity', ir1.allNotes[1].durationTicks === ppq * 2, 'Nota 2 durationTicks exactos');
  testAssert('Parsing & Event Fidelity', Math.abs(ir1.allNotes[0].velocity - 0.85) < 0.05, 'Velocidad normalizada preservada');

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 2: Tonalidad y Modo: Diatónico Mayor, Menor, y Tonalidades con Armadura
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2. Key & Mode Estimation:');
  // Progresión en Re mayor: D (D-F#-A), G (G-B-D), A (A-C#-E), D
  const midiKeyD = new Midi();
  const tkD = midiKeyD.addTrack();
  tkD.name = 'Chords D major';
  // D
  tkD.addNote({ midi: 50, ticks: 0, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 54, ticks: 0, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 57, ticks: 0, durationTicks: ppq * 4 });
  // G
  tkD.addNote({ midi: 43, ticks: ppq * 4, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 47, ticks: ppq * 4, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 50, ticks: ppq * 4, durationTicks: ppq * 4 });
  // A
  tkD.addNote({ midi: 45, ticks: ppq * 8, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 49, ticks: ppq * 8, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 52, ticks: ppq * 8, durationTicks: ppq * 4 });
  // D
  tkD.addNote({ midi: 50, ticks: ppq * 12, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 54, ticks: ppq * 12, durationTicks: ppq * 4 });
  tkD.addNote({ midi: 57, ticks: ppq * 12, durationTicks: ppq * 4 });

  const irKeyD = parseMidiBufferToIR(new Uint8Array(midiKeyD.toArray()));
  const estKeyD = estimateKeyCandidates(irKeyD);
  testAssert('Key & Mode Estimation', estKeyD.primaryKey.tonic === 'D' && estKeyD.primaryKey.scale === 'major',
    `Estima Re mayor correctamente (obtenido: ${estKeyD.primaryKey.tonic} ${estKeyD.primaryKey.scale})`);

  // Progresión en Mi menor: Em (E-G-B), Am (A-C-E), B7 (B-D#-F#-A), Em
  const midiKeyEm = new Midi();
  const tkEm = midiKeyEm.addTrack();
  tkEm.name = 'Chords E minor';
  tkEm.addNote({ midi: 40, ticks: 0, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 43, ticks: 0, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 47, ticks: 0, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 45, ticks: ppq * 4, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 48, ticks: ppq * 4, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 52, ticks: ppq * 4, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 47, ticks: ppq * 8, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 51, ticks: ppq * 8, durationTicks: ppq * 4 }); // D# sensible
  tkEm.addNote({ midi: 54, ticks: ppq * 8, durationTicks: ppq * 4 });
  tkEm.addNote({ midi: 57, ticks: ppq * 8, durationTicks: ppq * 4 });

  const irKeyEm = parseMidiBufferToIR(new Uint8Array(midiKeyEm.toArray()));
  const estKeyEm = estimateKeyCandidates(irKeyEm);
  testAssert('Key & Mode Estimation', estKeyEm.primaryKey.tonic === 'E' && estKeyEm.primaryKey.scale === 'minor',
    `Estima Mi menor correctamente (obtenido: ${estKeyEm.primaryKey.tonic} ${estKeyEm.primaryKey.scale})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 2b: Segmentación Armónica Dinámica (Consolidación y División por Compás)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2b. Harmonic Segmentation:');
  const midiSeg = new Midi();
  const trkSeg = midiSeg.addTrack();
  // Compás 1: 2 acordes de 2 beats cada uno (C y G)
  trkSeg.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 2 });
  trkSeg.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 2 });
  trkSeg.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 2 });

  trkSeg.addNote({ midi: 43, ticks: ppq * 2, durationTicks: ppq * 2 });
  trkSeg.addNote({ midi: 47, ticks: ppq * 2, durationTicks: ppq * 2 });
  trkSeg.addNote({ midi: 50, ticks: ppq * 2, durationTicks: ppq * 2 });

  // Compás 2: 1 acorde mantenido todo el compás (Am, 4 beats)
  trkSeg.addNote({ midi: 45, ticks: ppq * 4, durationTicks: ppq * 4 });
  trkSeg.addNote({ midi: 48, ticks: ppq * 4, durationTicks: ppq * 4 });
  trkSeg.addNote({ midi: 52, ticks: ppq * 4, durationTicks: ppq * 4 });

  const irSeg = parseMidiBufferToIR(new Uint8Array(midiSeg.toArray()));
  const fullSeg = analyzeMidiMusicalIR(irSeg, { harmonyResolutionBeats: 2 });
  testAssert('Harmonic Segmentation', fullSeg.harmonicSegments.length === 3,
    `Segmentación armónica genera 3 acordes (2 en compás 1 + 1 consolidado en compás 2) (obtenido: ${fullSeg.harmonicSegments.length})`);
  testAssert('Harmonic Segmentation', fullSeg.harmonicSegments[0]?.durationBeats === 2 && fullSeg.harmonicSegments[2]?.durationBeats === 4,
    `Duraciones de acordes correctas: acorde 1 = 2 beats, acorde 3 = 4 beats (obtenido: ${fullSeg.harmonicSegments[0]?.durationBeats}, ${fullSeg.harmonicSegments[2]?.durationBeats})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 3: Fundamental, Inversión, Bajo Efectivo y Slash Chords
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n3. Root, Quality & Inversion:');
  // C mayor fundamental: [C3, E3, G3]
  const recC = recognizeChordFromMidiNotes([48, 52, 55], 'C', 'major');
  testAssert('Root, Quality & Inversion', recC?.rootPc === 0 && recC?.quality === 'maj' && recC?.inversion === 0, 'C posición fundamental (inversión 0)');

  // C/E (1ª inversión): [E2, G3, C4]
  const recCE = recognizeChordFromMidiNotes([40, 55, 60], 'C', 'major');
  testAssert('Root, Quality & Inversion', recCE?.rootPc === 0 && recCE?.quality === 'maj' && recCE?.inversion === 1,
    `C/E primera inversión: fundamental C, bajo E (obtenido: rootPc ${recCE?.rootPc}, inv ${recCE?.inversion})`);

  // C/G (2ª inversión): [G2, E3, C4]
  const recCG = recognizeChordFromMidiNotes([43, 52, 60], 'C', 'major');
  testAssert('Root, Quality & Inversion', recCG?.rootPc === 0 && recCG?.quality === 'maj' && recCG?.inversion === 2,
    `C/G segunda inversión: fundamental C, bajo G (obtenido: rootPc ${recCG?.rootPc}, inv ${recCG?.inversion})`);

  // Am/C frente a C6: [C3, A3, E4] -> Bajo C, notas A, C, E.
  // En armonía clásica y Hooktheory, si el bajo es C y las notas son A-C-E, es Am en primera inversión (Am/C, vi⁶).
  const recAmC = recognizeChordFromMidiNotes([48, 57, 64], 'C', 'major');
  testAssert('Root, Quality & Inversion', recAmC?.rootPc === 9 && recAmC?.quality === 'min' && recAmC?.inversion === 1,
    `Am/C detectado como A menor en primera inversión (obtenido: rootPc ${recAmC?.rootPc}, qual ${recAmC?.quality}, inv ${recAmC?.inversion})`);

  // F/C frente a Csus4: [C3, F3, A3, C4] -> Tríada F mayor con bajo C (F/C, IV⁶₄).
  const recFC = recognizeChordFromMidiNotes([48, 53, 57, 60], 'C', 'major');
  testAssert('Root, Quality & Inversion', recFC?.rootPc === 5 && recFC?.quality === 'maj' && recFC?.inversion === 2,
    `F/C detectado como F mayor en 2ª inversión (obtenido: rootPc ${recFC?.rootPc}, qual ${recFC?.quality}, inv ${recFC?.inversion})`);

  // F/G (Slash chord / bajo pedal de dominante): [G2, F3, A3, C4] -> Fundamental F, bajo G (IV/5 o G9sus4)
  const recFG = recognizeChordFromMidiNotes([43, 53, 57, 60], 'C', 'major');
  testAssert('Root, Quality & Inversion', Boolean((recFG?.rootPc === 5 && recFG?.quality === 'maj') || (recFG?.rootPc === 7 && recFG?.suspensions?.includes(4))),
    `F/G reconocido coherentemente como F mayor o Gsus (obtenido: rootPc ${recFG?.rootPc}, qual ${recFG?.quality})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 4: Dominantes Secundarias y Préstamos Modales
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4. Secondary Dominants & Borrowed:');
  // V/ii: A mayor en C [A2, C#3, E3, G3]
  const recVii = recognizeChordFromMidiNotes([45, 49, 52, 55], 'C', 'major');
  testAssert('Secondary Dominants & Borrowed', recVii?.secondaryType === 'V' && recVii?.appliedTarget === 2,
    `A7 en Do es V7/ii (obtenido sec: ${recVii?.secondaryType}, target: ${recVii?.appliedTarget})`);

  // V/V: D mayor en C [D3, F#3, A3, C4]
  const recVV = recognizeChordFromMidiNotes([50, 54, 57, 60], 'C', 'major');
  testAssert('Secondary Dominants & Borrowed', recVV?.secondaryType === 'V' && recVV?.appliedTarget === 5,
    `D7 en Do es V7/V (obtenido sec: ${recVV?.secondaryType}, target: ${recVV?.appliedTarget})`);

  // Préstamo modal: Ab mayor en C (bVI) [Ab2, C3, Eb3]
  const recAb = recognizeChordFromMidiNotes([44, 48, 51], 'C', 'major');
  testAssert('Secondary Dominants & Borrowed', recAb?.rootPc === 8 && recAb?.borrowed === 'minor',
    `Ab mayor en C es bVI prestado de minor (obtenido root: ${recAb?.rootPc}, borrowed: ${recAb?.borrowed})`);

  // Préstamo modal: Bb mayor en C (bVII) [Bb2, D3, F3]
  const recBb = recognizeChordFromMidiNotes([46, 50, 53], 'C', 'major');
  testAssert('Secondary Dominants & Borrowed', recBb?.rootPc === 10 && (recBb?.borrowed === 'mixolydian' || recBb?.borrowed === 'minor'),
    `Bb mayor en C es bVII prestado (obtenido root: ${recBb?.rootPc}, borrowed: ${recBb?.borrowed})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 5: Arpegios y Filtrado de Notas de Paso
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5. Arpeggios & Passing Tones Filtering:');
  // Arpegio de C mayor con nota de paso D en beat débil:
  // C3 (peso 1.0), E3 (peso 1.0), G3 (peso 1.0), D4 (nota de paso rápida peso 0.2)
  const arpNotes = [
    { midi: 48, weight: 1.0, duration: 1.0, isDownbeat: true },
    { midi: 52, weight: 1.0, duration: 1.0, isDownbeat: false },
    { midi: 55, weight: 1.0, duration: 1.0, isDownbeat: false },
    { midi: 62, weight: 0.2, duration: 0.25, isDownbeat: false }, // D4 rápido
  ];
  const recArpNotes = recognizeChordFromMidiNotes(arpNotes, 'C', 'major');
  testAssert('Arpeggios & Passing Tones Filtering', recArpNotes?.rootPc === 0 && recArpNotes?.quality === 'maj' && !recArpNotes?.adds,
    `Arpegio C mayor con nota de paso D4 no se convierte en add9 falso (obtenido root: ${recArpNotes?.rootPc}, adds: ${recArpNotes?.adds})`);

  // Acorde add9 real intencional: D4 tiene peso estructural prolongado (duración 1.5 en tiempo semifuerte)
  const realAdd9Notes = [
    { midi: 48, weight: 1.0, duration: 2.0, isDownbeat: true },
    { midi: 52, weight: 1.0, duration: 2.0, isDownbeat: false },
    { midi: 55, weight: 1.0, duration: 2.0, isDownbeat: false },
    { midi: 62, weight: 0.8, duration: 1.5, isDownbeat: false }, // D4 estructural
  ];
  const recRealAdd9 = recognizeChordFromMidiNotes(realAdd9Notes, 'C', 'major');
  testAssert('Arpeggios & Passing Tones Filtering', recRealAdd9?.rootPc === 0 && Boolean(recRealAdd9?.adds?.includes(9)),
    `D4 estructural prolongado sí reconoce add9 (obtenido adds: ${recRealAdd9?.adds})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 4b: Acordes con 5ª omitida (Voicings estándar pop/jazz: R + 3ª + 7ª)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4b. Voicings con 5ª omitida (G7no5, Cmaj7no5):');
  // G7 sin 5ª: G2 (43), B3 (59), F4 (65)
  const recG7no5 = recognizeChordFromMidiNotes([43, 59, 65], 'C', 'major');
  testAssert('Root, Quality & Inversion', recG7no5?.rootPc === 7 && recG7no5?.quality === 'dom7',
    `G7 con 5ª omitida reconocido como dom7 (obtenido root: ${recG7no5?.rootPc}, qual: ${recG7no5?.quality})`);

  // Cmaj7 sin 5ª: C3 (48), E3 (52), B3 (59)
  const recCmaj7no5 = recognizeChordFromMidiNotes([48, 52, 59], 'C', 'major');
  testAssert('Root, Quality & Inversion', recCmaj7no5?.rootPc === 0 && recCmaj7no5?.quality === 'maj7',
    `Cmaj7 con 5ª omitida reconocido como maj7 (obtenido root: ${recCmaj7no5?.rootPc}, qual: ${recCmaj7no5?.quality})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 5b: Suspensiones y Resoluciones armónicas (Csus4 -> C)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5b. Suspensions & Resolutions (Csus4 -> C):');
  // Mitad 1: Csus4 [C3, F3, G3]
  const recSus4 = recognizeChordFromMidiNotes([48, 53, 55], 'C', 'major');
  testAssert('Secondary Dominants & Borrowed', recSus4?.rootPc === 0 && Boolean(recSus4?.suspensions?.includes(4)),
    `Csus4 reconocido con suspensión 4 (obtenido root: ${recSus4?.rootPc}, susp: ${recSus4?.suspensions})`);

  // Mitad 2: C mayor tríada [C3, E3, G3]
  const recResol = recognizeChordFromMidiNotes([48, 52, 55], 'C', 'major');
  testAssert('Secondary Dominants & Borrowed', recResol?.rootPc === 0 && recResol?.quality === 'maj' && !recResol?.suspensions,
    `Resolución a C mayor tríada limpia sin suspensión residual`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 8b: Colección atonal densa (Cluster cromático)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n8b. Atonal chromatic cluster abstention:');
  // Cluster cromático de semitonos: C4, C#4, D4, D#4
  const recCluster = recognizeChordFromMidiNotes([60, 61, 62, 63], 'C', 'major');
  // Ante un cluster atonal, el sistema debe producir una abstención o fallback defensivo
  testAssert('Abstention & Ambiguity Quality', recCluster !== null,
    'Cluster cromático produce respuesta estructurada segura sin excepciones');

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 9b: Pedal de bajo prolongado a través de cambios armónicos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n9b. Sustained Bass Pedal (C pedal con F/C):');
  // Compás con bajo C2 (36) sostenido y voces superiores F3 (53), A3 (57), C4 (60)
  const recPedal = recognizeChordFromMidiNotes([36, 53, 57, 60], 'C', 'major');
  testAssert('Root, Quality & Inversion', recPedal?.rootPc === 5 && recPedal?.inversion === 2,
    `Pedal de bajo C con notas F-A-C reconocido como F/C (inversión 2) (obtenido root: ${recPedal?.rootPc}, inv: ${recPedal?.inversion})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 6: Aislamiento de Percusión / Batería fuera de canal 10
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n6. Drum Isolation & Voice Separation:');
  // Crear archivo con pista "Drums" en canal 1 (no canal 10 / canal 9 en 0-index)
  const midiDrumTest = new Midi();
  const trkDrum = midiDrumTest.addTrack();
  trkDrum.name = 'Drums / Batería';
  trkDrum.channel = 0; // Canal 1 estándar
  // Añadir golpes densos de percusión (Kick=36/C, Snare=38/D, Hi-Hat=42/F#, Tom=45/A)
  for (let i = 0; i < 32; i++) {
    trkDrum.addNote({ midi: 36, ticks: i * (ppq / 2), durationTicks: ppq / 4 }); // C2 (kick)
    trkDrum.addNote({ midi: 38, ticks: (i + 0.25) * (ppq / 2), durationTicks: ppq / 4 }); // D2 (snare)
    trkDrum.addNote({ midi: 42, ticks: i * (ppq / 2), durationTicks: ppq / 4 }); // F#2 (hihat)
    trkDrum.addNote({ midi: 45, ticks: (i + 0.5) * (ppq / 2), durationTicks: ppq / 4 }); // A2 (tom)
  }

  // Pista armónica en Ab mayor: Ab (44, 48, 51), Db (49, 53, 56), Eb (51, 55, 58), Ab
  const trkMusic = midiDrumTest.addTrack();
  trkMusic.name = 'Keyboard Harmony';
  trkMusic.channel = 1;
  // Ab
  trkMusic.addNote({ midi: 44, ticks: 0, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 51, ticks: 0, durationTicks: ppq * 4 });
  // Db
  trkMusic.addNote({ midi: 49, ticks: ppq * 4, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 53, ticks: ppq * 4, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 56, ticks: ppq * 4, durationTicks: ppq * 4 });
  // Eb
  trkMusic.addNote({ midi: 51, ticks: ppq * 8, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 55, ticks: ppq * 8, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 58, ticks: ppq * 8, durationTicks: ppq * 4 });
  // Ab
  trkMusic.addNote({ midi: 44, ticks: ppq * 12, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 48, ticks: ppq * 12, durationTicks: ppq * 4 });
  trkMusic.addNote({ midi: 51, ticks: ppq * 12, durationTicks: ppq * 4 });

  const irDrumTest = parseMidiBufferToIR(new Uint8Array(midiDrumTest.toArray()));
  testAssert('Drum Isolation & Voice Separation', irDrumTest.tracks[0].isPercussion === true,
    `Detecta pista con nombre "Drums / Batería" como percusión aunque no esté en canal 10 (obtenido: ${irDrumTest.tracks[0].isPercussion})`);

  const estKeyWithDrums = estimateKeyCandidates(irDrumTest);
  testAssert('Drum Isolation & Voice Separation', estKeyWithDrums.primaryKey.tonic === 'Ab' && estKeyWithDrums.primaryKey.scale === 'major',
    `La percusión densa no distorsiona la tonalidad de Ab mayor (obtenido: ${estKeyWithDrums.primaryKey.tonic} ${estKeyWithDrums.primaryKey.scale})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 7: Clasificación Melódica Contextual
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n7. Melodic Classification:');
  const midiMel = new Midi();
  const trkMel = midiMel.addTrack();
  trkMel.name = 'Lead Vocals';
  // Melodía: C5 (chord tone) -> D5 (passing tone) -> E5 (chord tone) sobre acorde C
  trkMel.addNote({ midi: 72, ticks: 0, durationTicks: ppq }); // C5
  trkMel.addNote({ midi: 74, ticks: ppq, durationTicks: ppq }); // D5
  trkMel.addNote({ midi: 76, ticks: ppq * 2, durationTicks: ppq * 2 }); // E5

  const trkAcc = midiMel.addTrack();
  trkAcc.name = 'Accompaniment';
  trkAcc.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 });
  trkAcc.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 4 });
  trkAcc.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 });

  const irMel = parseMidiBufferToIR(new Uint8Array(midiMel.toArray()));
  const fullMel = analyzeMidiMusicalIR(irMel, { melodyTrackIndex: 0 });

  testAssert('Melodic Classification', fullMel.melodyNotes[0]?.melodicRole === 'chord_tone', 'C5 clasificado como chord_tone');
  testAssert('Melodic Classification', fullMel.melodyNotes[1]?.melodicRole === 'passing_tone', 'D5 clasificado como passing_tone');
  testAssert('Melodic Classification', fullMel.melodyNotes[2]?.melodicRole === 'chord_tone', 'E5 clasificado como chord_tone');

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 8: Abstención ante Ambigüedad y Atonalidad
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n8. Abstention & Ambiguity Quality:');
  // Compás vacío o sin notas reconocibles
  const midiEmpty = new Midi();
  midiEmpty.addTrack();
  const irEmpty = parseMidiBufferToIR(new Uint8Array(midiEmpty.toArray()));
  const fullEmpty = analyzeMidiMusicalIR(irEmpty);

  testAssert('Abstention & Ambiguity Quality', fullEmpty.harmonicSegments[0]?.evidenceLevel === 'unknown',
    'Compás vacío genera evidenceLevel = "unknown"');
  const songEmpty = convertMidiAnalysisToUniversalSong(fullEmpty, irEmpty);
  testAssert('Abstention & Ambiguity Quality', songEmpty.sections[0]?.chords[0]?.roman === '?',
    'Acorde desconocido se traduce a símbolo "?" en Hooktheory');

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 9: Métricas Dinámicas / Alternancias de Compás (4/4 y 3/4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n9. Metric Changes & Timing:');
  const midiMeter = new Midi();
  midiMeter.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midiMeter.header.timeSignatures.push({ ticks: ppq * 4, timeSignature: [3, 4] }); // Compás 2 es 3/4
  midiMeter.header.timeSignatures.push({ ticks: ppq * 7, timeSignature: [4, 4] }); // Compás 3 es 4/4 (ticks 4*ppq + 3*ppq = 7*ppq)

  const trkMeter = midiMeter.addTrack();
  // Compás 1 (4 beats, ticks 0..1920)
  trkMeter.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 });
  trkMeter.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 4 });
  trkMeter.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 });
  // Compás 2 (3 beats, ticks 1920..3360)
  trkMeter.addNote({ midi: 53, ticks: ppq * 4, durationTicks: ppq * 3 });
  trkMeter.addNote({ midi: 57, ticks: ppq * 4, durationTicks: ppq * 3 });
  trkMeter.addNote({ midi: 60, ticks: ppq * 4, durationTicks: ppq * 3 });
  // Compás 3 (4 beats, ticks 3360..5280)
  trkMeter.addNote({ midi: 55, ticks: ppq * 7, durationTicks: ppq * 4 });
  trkMeter.addNote({ midi: 59, ticks: ppq * 7, durationTicks: ppq * 4 });
  trkMeter.addNote({ midi: 62, ticks: ppq * 7, durationTicks: ppq * 4 });

  const irMeter = parseMidiBufferToIR(new Uint8Array(midiMeter.toArray()));
  const fullMeter = analyzeMidiMusicalIR(irMeter);

  testAssert('Metric Changes & Timing', irMeter.header.timeSignatures.length >= 2, 'Lee múltiples cambios de métrica');
  // Comprobar si el segmento del compás 2 dura exactamente 3 beats y empieza en el tick 1920
  const seg2 = fullMeter.harmonicSegments.find((s) => s.startTick === ppq * 4);
  testAssert('Metric Changes & Timing', seg2 !== undefined && seg2.durationBeats === 3,
    `Segmento 2 respeta duración de 3 beats de compás 3/4 (obtenido beats: ${seg2?.durationBeats})`);

  // ──────────────────────────────────────────────────────────────────────────
  // CASO 10: Modulación intra-sección (C major -> G major)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n10. Modulación intra-sección:');
  const midiMod = new Midi();
  const trkMod = midiMod.addTrack();
  // 4 compases en C major: C - F - G - C
  trkMod.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 });

  trkMod.addNote({ midi: 53, ticks: ppq * 4, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 57, ticks: ppq * 4, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 60, ticks: ppq * 4, durationTicks: ppq * 4 });

  trkMod.addNote({ midi: 55, ticks: ppq * 8, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 59, ticks: ppq * 8, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 62, ticks: ppq * 8, durationTicks: ppq * 4 });

  trkMod.addNote({ midi: 48, ticks: ppq * 12, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 52, ticks: ppq * 12, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 55, ticks: ppq * 12, durationTicks: ppq * 4 });

  // 4 compases claramente en G major con F# estructural: G - C - D - G
  trkMod.addNote({ midi: 55, ticks: ppq * 16, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 59, ticks: ppq * 16, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 62, ticks: ppq * 16, durationTicks: ppq * 4 });

  trkMod.addNote({ midi: 48, ticks: ppq * 20, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 52, ticks: ppq * 20, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 55, ticks: ppq * 20, durationTicks: ppq * 4 });

  trkMod.addNote({ midi: 50, ticks: ppq * 24, durationTicks: ppq * 4 }); // D
  trkMod.addNote({ midi: 54, ticks: ppq * 24, durationTicks: ppq * 4 }); // F#
  trkMod.addNote({ midi: 57, ticks: ppq * 24, durationTicks: ppq * 4 }); // A

  trkMod.addNote({ midi: 55, ticks: ppq * 28, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 59, ticks: ppq * 28, durationTicks: ppq * 4 });
  trkMod.addNote({ midi: 62, ticks: ppq * 28, durationTicks: ppq * 4 });

  const irMod = parseMidiBufferToIR(new Uint8Array(midiMod.toArray()));
  const fullMod = analyzeMidiMusicalIR(irMod);

  // Comprobar si el pasaje modulado en compás 7 (D-F#-A) se reconoce como V de G o V/V de C
  const chordBar7 = fullMod.harmonicSegments.find((s) => s.startTick === ppq * 24);
  testAssert('Key & Mode Estimation', chordBar7?.rootPitchClass === 2 && chordBar7?.quality === 'maj',
    `Reconoce acorde D mayor en el compás 7 (obtenido root: ${chordBar7?.rootPitchClass}, quality: ${chordBar7?.quality})`);

  // ──────────────────────────────────────────────────────────────────────────
  // RESUMEN GENERAL DE MÉTRICAS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('RESUMEN DE MÉTRICAS DE LÍNEA BASE:');
  console.log('========================================');

  let totalTests = 0;
  let passedCount = 0;
  const categoryScores: Record<string, { total: number; passed: number; accuracy: number }> = {};

  for (const [cat, data] of Object.entries(scores)) {
    const acc = data.total > 0 ? Math.round((data.passed / data.total) * 1000) / 10 : 0;
    categoryScores[cat] = { total: data.total, passed: data.passed, accuracy: acc };
    totalTests += data.total;
    passedCount += data.passed;
    console.log(`- ${cat.padEnd(35)}: ${data.passed}/${data.total} (${acc}%)`);
  }

  const overallAccuracy = totalTests > 0 ? Math.round((passedCount / totalTests) * 1000) / 10 : 0;
  console.log(`\nTOTAL GENERAL: ${passedCount}/${totalTests} pruebas pasadas (${overallAccuracy}% de precisión)`);
  console.log('========================================\n');

  return {
    totalTests,
    passedCount,
    failedCount: totalTests - passedCount,
    categoryScores,
  };
}

runMidiPrecisionBenchmark();
