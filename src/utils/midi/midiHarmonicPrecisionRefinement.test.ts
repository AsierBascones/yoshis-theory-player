/**
 * midiHarmonicPrecisionRefinement.test.ts
 * Suite de pruebas para investigar y corregir:
 * 1. Prioridad A: Discrepancia entre importación inicial y refresco/reanálisis.
 * 2. Prioridad B: Sobreinterpretación armónica ante melodías rápidas, arpegios y notas de paso.
 * 3. Prioridad C: Parsimonia armónica (preferencia por tríadas limpias vs falsos add9/7ªs/9ªs).
 * 4. Prioridad D: Preservación de add9 y 9ªs estructurales reales con evidencia musical.
 */

import { Midi } from '@tonejs/midi';
import { parseMidiBufferToIR } from './midiParser';
import { inspectMidiTracks, recognizeChordFromMidiNotes } from '../midiImporter';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';

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

console.log('=== TEST SUITE: MIDI Harmonic Precision Refinement ===\n');

// Helper para crear un File simulado desde Midi
function createSyntheticMidiFile(midi: Midi, fileName: string): File {
  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'audio/midi' });
  return new File([blob], fileName);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PRIORIDAD A: Determinismo e Identidad entre Carga Inicial y Refresco
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Prioridad A: Determinismo entre Carga Inicial y Refresco:');

// Creamos un archivo MIDI en Sol Mayor (G - C - D - G) con 2 pistas (Lead + Chords)
const midiG = new Midi();
const ppq = 480;

const trkLead = midiG.addTrack();
trkLead.name = 'Vocal Melody';
// Melodía en registro agudo (avgPitch ~ 74)
trkLead.addNote({ midi: 74, ticks: 0, durationTicks: ppq * 2 }); // D5
trkLead.addNote({ midi: 76, ticks: ppq * 2, durationTicks: ppq * 2 }); // E5
trkLead.addNote({ midi: 74, ticks: ppq * 4, durationTicks: ppq * 4 }); // D5

const trkPiano = midiG.addTrack();
trkPiano.name = 'Piano Chords';
// G mayor (G3, B3, D4)
trkPiano.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 });
trkPiano.addNote({ midi: 59, ticks: 0, durationTicks: ppq * 4 });
trkPiano.addNote({ midi: 62, ticks: 0, durationTicks: ppq * 4 });
// C mayor (C3, E3, G3)
trkPiano.addNote({ midi: 48, ticks: ppq * 4, durationTicks: ppq * 4 });
trkPiano.addNote({ midi: 52, ticks: ppq * 4, durationTicks: ppq * 4 });
trkPiano.addNote({ midi: 55, ticks: ppq * 4, durationTicks: ppq * 4 });

const fileG = createSyntheticMidiFile(midiG, 'song_in_g.mid');

// A) Primera pasada (carga inicial tal como se ejecuta al soltar el archivo sin opciones previas)
const initialInspection = await inspectMidiTracks(fileG);

// B) Segunda pasada (reanálisis con las opciones auto-detectadas)
const reanalysisInspection = await inspectMidiTracks(fileG, {
  referenceKeyTonic: initialInspection.estimatedKey.tonic,
  referenceKeyScale: initialInspection.estimatedKey.scale,
  melodyTrackIndex: 0,
});

assert(initialInspection.estimatedKey.tonic === 'G', `Tonalidad estimada inicial es Sol (obtenido: ${initialInspection.estimatedKey.tonic})`);

const initFirstChord = initialInspection.previewChords?.[0];
const reanalFirstChord = reanalysisInspection.previewChords?.[0];

assert(initFirstChord !== undefined && reanalFirstChord !== undefined, 'Ambas pasadas generan acordes de previsualización');
assert(initFirstChord?.chordSymbol === 'G', `Primer acorde en la primera pasada es G (obtenido: ${initFirstChord?.chordSymbol})`);
assert(initFirstChord?.romanNumeral === 'I', `Romano en la primera pasada es I (obtenido: ${initFirstChord?.romanNumeral})`);
assert(initFirstChord?.chordSymbol === reanalFirstChord?.chordSymbol,
  `El acorde inicial (${initFirstChord?.chordSymbol}) coincide exactamente con el reanalizado (${reanalFirstChord?.chordSymbol})`);
assert(initFirstChord?.romanNumeral === reanalFirstChord?.romanNumeral,
  `El romano inicial (${initFirstChord?.romanNumeral}) coincide exactamente con el reanalizado (${reanalFirstChord?.romanNumeral})`);

// ────────────────────────────────────────────────────────────────────────────
// 2. PRIORIDAD B: Inmunidad ante Melodías Rápidas y Notas de Paso
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Prioridad B: Melodías rápidas con notas de paso no generan acordes falsos:');

// Progresión de Do Mayor: C [C3, E3, G3] sostenida durante 4 beats
// Con melodía rápida de semicorcheas: D4, F4, D4, B3 (notas de paso y bordaduras)
const midiRapidMelody = new Midi();
const tChordsRapid = midiRapidMelody.addTrack();
tChordsRapid.name = 'Piano Harmony';
// Tríada sostenida C mayor en tiempo fuerte (duración 4 beats)
tChordsRapid.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 }); // C3
tChordsRapid.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 4 }); // E3
tChordsRapid.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 }); // G3

const tMelodyRapid = midiRapidMelody.addTrack();
tMelodyRapid.name = 'Fast Lead';
// Notas rápidas de paso en semicorcheas (duración ppq/4 = 120 ticks)
tMelodyRapid.addNote({ midi: 62, ticks: 0, durationTicks: ppq / 4 }); // D4 (9ª rápida)
tMelodyRapid.addNote({ midi: 65, ticks: ppq / 4, durationTicks: ppq / 4 }); // F4 (11ª/4ª rápida)
tMelodyRapid.addNote({ midi: 62, ticks: ppq / 2, durationTicks: ppq / 4 }); // D4 (9ª rápida)
tMelodyRapid.addNote({ midi: 59, ticks: (3 * ppq) / 4, durationTicks: ppq / 4 }); // B3 (7ª rápida)

const irRapid = parseMidiBufferToIR(midiRapidMelody.toArray());
const analysisRapid = analyzeMidiMusicalIR(irRapid, {
  referenceKeyTonic: 'C',
  referenceKeyScale: 'major',
  melodyTrackIndex: 1, // Pista 1 es Lead
});

const chordRapid = analysisRapid.harmonicSegments[0];
assert(chordRapid.chordSymbol === 'C', `Tríada C mayor se mantiene limpia como C (obtenido: ${chordRapid.chordSymbol})`);
assert(chordRapid.romanNumeral === 'I', `Cifrado romano es I diatónico puro (obtenido: ${chordRapid.romanNumeral})`);
assert(!chordRapid.adds || chordRapid.adds.length === 0, `No añade falsamente novena añadida add9 (adds: ${chordRapid.adds})`);
assert(chordRapid.quality === 'maj', `Cualidad es tríada maj, no tétrada compleja (obtenido: ${chordRapid.quality})`);

// ────────────────────────────────────────────────────────────────────────────
// 3. PRIORIDAD C: Parsimonia Armónica en recognizeChordFromMidiNotes
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Prioridad C: Parsimonia ante notas de adorno (tríada vs add9 / dom7):');

// Acorde de C mayor con notas de acompañamiento y una nota de paso D breve en tiempo débil:
// C3 (duración 2.0 beats), E3 (duración 2.0 beats), G3 (duración 2.0 beats), D4 (duración 0.25 beats off-beat)
const metricInputsPassing = [
  { midi: 48, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 52, duration: 2.0, isDownbeat: false, weight: 1.0 },
  { midi: 55, duration: 2.0, isDownbeat: false, weight: 1.0 },
  { midi: 62, duration: 0.25, isDownbeat: false, weight: 1.0 }, // D4 pasajero
];

const recPassing = recognizeChordFromMidiNotes(metricInputsPassing, 'C', 'major');
assert(recPassing?.quality === 'maj' && !recPassing?.adds,
  `Nota de paso de 0.25 beats no convierte tríada mayor en add9 (obtenido qual: ${recPassing?.quality}, adds: ${recPassing?.adds})`);

// ────────────────────────────────────────────────────────────────────────────
// 4. PRIORIDAD D: Preservación de add9 y dom9 Reales Estructurales
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Prioridad D: Preservación de add9 y dom9 estructurales reales:');

// Caso A: add9 real sostenido: D4 dura 2.0 beats enteros junto a C3, E3, G3
const metricInputsRealAdd9 = [
  { midi: 48, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 52, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 55, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 62, duration: 2.0, isDownbeat: true, weight: 1.0 }, // D4 estructural
];
const recRealAdd9 = recognizeChordFromMidiNotes(metricInputsRealAdd9, 'C', 'major');
assert(recRealAdd9?.quality === 'maj' && Boolean(recRealAdd9?.adds?.includes(9)),
  `add9 real con peso estructural sí se reconoce como add9 (obtenido adds: ${recRealAdd9?.adds})`);

// Caso B: dom9 real estructural: C3, E3, G3, Bb3 (7ª), D4 (9ª) sostenidos
const metricInputsRealDom9 = [
  { midi: 48, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 52, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 55, duration: 2.0, isDownbeat: true, weight: 1.0 },
  { midi: 58, duration: 2.0, isDownbeat: true, weight: 1.0 }, // Bb3 (7ª menor)
  { midi: 62, duration: 2.0, isDownbeat: true, weight: 1.0 }, // D4 (9ª mayor)
];
const recRealDom9 = recognizeChordFromMidiNotes(metricInputsRealDom9, 'C', 'major');
assert(recRealDom9?.type === 9 && recRealDom9?.quality === 'dom7',
  `dom9 real se reconoce con type 9 y quality dom7 (obtenido type: ${recRealDom9?.type}, qual: ${recRealDom9?.quality})`);

// ────────────────────────────────────────────────────────────────────────────
// 5. PRIORIDAD E: Arpegios desplegados a lo largo de un compás
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Prioridad E: Arpegio continuo no fragmenta el compás en acordes innecesarios:');

// Arpegio continuo de C mayor en negras (C3 -> E3 -> G3 -> C4)
const midiArpBar = new Midi();
const tArp = midiArpBar.addTrack();
tArp.name = 'Piano Arpeggio';
tArp.addNote({ midi: 48, ticks: 0, durationTicks: ppq });
tArp.addNote({ midi: 52, ticks: ppq, durationTicks: ppq });
tArp.addNote({ midi: 55, ticks: ppq * 2, durationTicks: ppq });
tArp.addNote({ midi: 60, ticks: ppq * 3, durationTicks: ppq });

const irArpBar = parseMidiBufferToIR(midiArpBar.toArray());
const analysisArpBar = analyzeMidiMusicalIR(irArpBar, {
  referenceKeyTonic: 'C',
  referenceKeyScale: 'major',
  harmonyResolutionBeats: 2,
});

assert(analysisArpBar.harmonicSegments.length === 1,
  `Arpegio de C mayor en 1 compás se consolida en 1 único acorde estable (obtenido: ${analysisArpBar.harmonicSegments.length})`);
assert(analysisArpBar.harmonicSegments[0]?.chordSymbol === 'C',
  `Símbolo es C mayor (obtenido: ${analysisArpBar.harmonicSegments[0]?.chordSymbol})`);
assert(analysisArpBar.harmonicSegments[0]?.durationBeats === 4,
  `Duración consolidada es 4 beats completos (obtenido: ${analysisArpBar.harmonicSegments[0]?.durationBeats})`);

console.log('\n========================================');
console.log(`RESULTADOS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`Test suite failed with ${failed} failures`);
}
