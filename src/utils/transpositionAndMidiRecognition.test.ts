/**
 * transpositionAndMidiRecognition.test.ts
 * Suite de regresión integral para la Fase 2.5:
 * 1. Transpositor Dinámico: coherencia visual, audio y ausencia de deriva (+2, -2 semitonos, inversiones, bajo).
 * 2. Reconocimiento Armónico MIDI: tertian template matching, bajo vs fundamental, inversiones y funciones secundarias (V/ii, V/V, etc.).
 */

import {
  parseHookpadChord,
  getTransposedChordSymbol,
} from './theoryEngine';
import {
  getOptimalTransposeInterval,
  transposeChordSymbol,
} from './musicTheory';
import {
  recognizeChordFromMidiNotes,
  estimateKeyFromPitchHistogram,
  parseMidiToUniversalSong,
} from './midiImporter';
import { usePlayerStore } from '../store/usePlayerStore';
import { Midi } from '@tonejs/midi';

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

console.log('=== TEST SUITE: Transposition & MIDI Chord Recognition (Fase 2.5) ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. TRANSPOSITOR DINÁMICO E INVARIANZA ARMÓNICA
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Intervalo óptimo de transposición (getOptimalTransposeInterval) sin deriva ni saltos:');

assert(getOptimalTransposeInterval('C', 'D') === 2, 'C -> D es +2 semitonos');
assert(getOptimalTransposeInterval('D', 'C') === -2, 'D -> C es -2 semitonos');
assert(getOptimalTransposeInterval('C', 'G') === -5, 'C -> G es -5 semitonos (distancia mínima)');
assert(getOptimalTransposeInterval('G', 'C') === 5, 'G -> C es +5 semitonos (distancia mínima)');
assert(getOptimalTransposeInterval('B', 'C') === 1, 'B -> C es +1 semitono (resuelve bug de módulo negativo en JS)');
assert(getOptimalTransposeInterval('C', 'B') === -1, 'C -> B es -1 semitono');

const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
let all144InRange = true;
for (const k1 of keys) {
  for (const k2 of keys) {
    const interval = getOptimalTransposeInterval(k1, k2);
    if (interval < -6 || interval > 5) {
      all144InRange = false;
      break;
    }
  }
}
assert(all144InRange, 'Los 144 pares de transposición de tonalidad se acotan estrictamente a [-6, +5]');

console.log('\n2. Transposición de símbolos de acordes simples y con inversión (transposeChordSymbol):');
assert(transposeChordSymbol('C', 2, 'D') === 'D', 'C transpuesto +2 a D es D');
assert(transposeChordSymbol('G', 2, 'D') === 'A', 'G transpuesto +2 a D es A');
assert(transposeChordSymbol('Am', 2, 'D') === 'Bm', 'Am transpuesto +2 a D es Bm');
assert(transposeChordSymbol('F', 2, 'D') === 'G', 'F transpuesto +2 a D es G');
assert(transposeChordSymbol('C/E', 2, 'D') === 'D/F#', 'Inversión C/E transpuesta +2 a D es D/F#');
assert(transposeChordSymbol('C/G', 2, 'D') === 'D/A', 'Inversión C/G transpuesta +2 a D es D/A');
assert(transposeChordSymbol('Dm7/F', 2, 'D') === 'Em7/G', 'Inversión Dm7/F transpuesta +2 a D es Em7/G');
assert(transposeChordSymbol('C', -2, 'Bb') === 'Bb', 'C transpuesto -2 a Bb es Bb');
assert(transposeChordSymbol('C/E', -2, 'Bb') === 'Bb/D', 'Inversión C/E transpuesta -2 a Bb es Bb/D');
assert(transposeChordSymbol('G', -2, 'Bb') === 'F', 'G transpuesto -2 a Bb es F');
assert(transposeChordSymbol('Am', -2, 'Bb') === 'Gm', 'Am transpuesto -2 a Bb es Gm');

console.log('\n3. getTransposedChordSymbol no se queda congelado en la tonalidad original:');
const c1 = parseHookpadChord({ root: 1, type: 5 }, 'C', 'major');
assert(c1.symbol === 'C', 'Acorde I en C es C');
assert(getTransposedChordSymbol(c1, { tonic: 'D', scale: 'major' }) === 'D', 'Acorde I en D es D');
assert(getTransposedChordSymbol(c1, { tonic: 'Bb', scale: 'major' }) === 'Bb', 'Acorde I en Bb es Bb');

const cOverE = parseHookpadChord({ root: 1, type: 5, inversion: 1 }, 'C', 'major');
assert(cOverE.symbol === 'C/E', 'Acorde I⁶ en C es C/E');
assert(getTransposedChordSymbol(cOverE, { tonic: 'D', scale: 'major' }) === 'D/F#', 'Acorde I⁶ en D es D/F#');

const cOverG = parseHookpadChord({ root: 1, type: 5, inversion: 2 }, 'C', 'major');
assert(cOverG.symbol === 'C/G', 'Acorde I⁶₄ en C es C/G');
assert(getTransposedChordSymbol(cOverG, { tonic: 'D', scale: 'major' }) === 'D/A', 'Acorde I⁶₄ en D es D/A');

console.log('\n4. Ciclo completo de transposición (C -> D -> E -> C) conserva la invarianza sin deriva:');
const store = usePlayerStore.getState();
assert(store.song.chords[0].symbol === 'G/B', 'Primer acorde de Snow Mountain es V⁶ (G/B)');

store.setKey('D', 'major');
const stateD = usePlayerStore.getState();
assert(stateD.currentKey === 'D', 'currentKey es D');
assert(stateD.song.keys[0].tonic === 'D', 'song.keys[0].tonic es D');
assert(stateD.song.chords[0].symbol === 'A/C#', 'V⁶ (G/B) en D (+2) se renderiza como A/C#');

store.setKey('E', 'major');
const stateE = usePlayerStore.getState();
assert(stateE.currentKey === 'E', 'currentKey es E');
assert(stateE.song.keys[0].tonic === 'E', 'song.keys[0].tonic es E');
assert(stateE.song.chords[0].symbol === 'B/D#', 'V⁶ (G/B) en E (+4) se renderiza como B/D#');

store.setKey('C', 'major');
const stateC = usePlayerStore.getState();
assert(stateC.currentKey === 'C', 'currentKey regresa a C');
assert(stateC.song.keys[0].tonic === 'C', 'song.keys[0].tonic regresa a C');
assert(stateC.song.chords[0].symbol === 'G/B', 'V⁶ regresa idénticamente a G/B');
assert(stateC.semitoneOffset === 0, 'semitoneOffset regresa exactamente a 0');

// ────────────────────────────────────────────────────────────────────────────
// 2. RECONOCIMIENTO ARMÓNICO MIDI (Tertian Matching, Inversiones y Secundarias)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Reconocimiento de tríadas e inversiones desde alturas MIDI:');

// C fundamental: [C3, E3, G3]
const recC = recognizeChordFromMidiNotes([48, 52, 55], 'C', 'major');
assert(recC !== null && recC.rootPc === 0 && recC.quality === 'maj' && recC.inversion === 0, 'Reconoce C mayor fundamental (inv 0)');
const chordC = parseHookpadChord({
  root: recC?.rootSd,
  quality: recC?.quality,
  type: recC?.type,
  inversion: recC?.inversion,
}, 'C', 'major');
assert(chordC.symbol === 'C', 'Símbolo generado es C');
assert(chordC.roman === 'I', 'Romano generado es I');

// C/E primera inversión: [E3, G3, C4]
const recCE = recognizeChordFromMidiNotes([52, 55, 60], 'C', 'major');
assert(recCE !== null && recCE.rootPc === 0 && recCE.quality === 'maj' && recCE.inversion === 1, 'Reconoce C mayor en 1ª inversión (inv 1, bajo E)');
const chordCE = parseHookpadChord({
  root: recCE?.rootSd,
  quality: recCE?.quality,
  type: recCE?.type,
  inversion: recCE?.inversion,
}, 'C', 'major');
assert(chordCE.symbol === 'C/E', 'Símbolo generado es C/E');
assert(chordCE.roman === 'I⁶', 'Romano generado es I⁶');

// C/G segunda inversión: [G2, C3, E3]
const recCG = recognizeChordFromMidiNotes([43, 48, 52], 'C', 'major');
assert(recCG !== null && recCG.rootPc === 0 && recCG.quality === 'maj' && recCG.inversion === 2, 'Reconoce C mayor en 2ª inversión (inv 2, bajo G)');
const chordCG = parseHookpadChord({
  root: recCG?.rootSd,
  quality: recCG?.quality,
  type: recCG?.type,
  inversion: recCG?.inversion,
}, 'C', 'major');
assert(chordCG.symbol === 'C/G', 'Símbolo generado es C/G');
assert(chordCG.roman === 'I⁶₄', 'Romano generado es I⁶₄');

console.log('\n6. Reconocimiento de funciones secundarias (V/ii, V7/ii, V6/ii, V/V):');

// V/ii: A mayor en C [A2, C#3, E3]
const recA = recognizeChordFromMidiNotes([45, 49, 52], 'C', 'major');
assert(recA !== null && recA.rootPc === 9 && recA.quality === 'maj' && recA.secondaryType === 'V' && recA.appliedTarget === 2, 'Detecta A mayor como Dominante Secundaria V/ii');
const chordA = parseHookpadChord({
  root: recA?.rootSd,
  quality: recA?.quality,
  type: recA?.type,
  inversion: recA?.inversion,
  secondaryType: recA?.secondaryType,
  applied: recA?.applied,
  appliedTarget: recA?.appliedTarget,
  appliedFunctionDegree: recA?.appliedFunctionDegree,
  targetDegree: recA?.appliedTarget,
}, 'C', 'major');
assert(chordA.symbol === 'A', 'Símbolo de V/ii es A');
assert(chordA.roman === 'V/ii', 'Romano de V/ii es V/ii');

// V7/ii: A7 en C [A2, C#3, E3, G3]
const recA7 = recognizeChordFromMidiNotes([45, 49, 52, 55], 'C', 'major');
assert(recA7 !== null && recA7.rootPc === 9 && recA7.quality === 'dom7' && recA7.type === 7 && recA7.secondaryType === 'V' && recA7.appliedTarget === 2, 'Detecta A7 como V7/ii');
const chordA7 = parseHookpadChord({
  root: recA7?.rootSd,
  quality: recA7?.quality,
  type: recA7?.type,
  inversion: recA7?.inversion,
  secondaryType: recA7?.secondaryType,
  applied: recA7?.applied,
  appliedTarget: recA7?.appliedTarget,
  appliedFunctionDegree: recA7?.appliedFunctionDegree,
  targetDegree: recA7?.appliedTarget,
}, 'C', 'major');
assert(chordA7.symbol === 'A7', 'Símbolo de V7/ii es A7');
assert(chordA7.roman === 'V⁷/ii', 'Romano de V7/ii es V⁷/ii');

// V6/ii: A/C# en C [C#3, E3, A3]
const recACsharp = recognizeChordFromMidiNotes([49, 52, 57], 'C', 'major');
assert(recACsharp !== null && recACsharp.rootPc === 9 && recACsharp.inversion === 1 && recACsharp.secondaryType === 'V' && recACsharp.appliedTarget === 2, 'Detecta A/C# como V6/ii');
const chordACsharp = parseHookpadChord({
  root: recACsharp?.rootSd,
  quality: recACsharp?.quality,
  type: recACsharp?.type,
  inversion: recACsharp?.inversion,
  secondaryType: recACsharp?.secondaryType,
  applied: recACsharp?.applied,
  appliedTarget: recACsharp?.appliedTarget,
  appliedFunctionDegree: recACsharp?.appliedFunctionDegree,
  targetDegree: recACsharp?.appliedTarget,
}, 'C', 'major');
assert(chordACsharp.symbol === 'A/C#', 'Símbolo de V6/ii es A/C#');
assert(chordACsharp.roman === 'V⁶/ii', 'Romano de V6/ii es V⁶/ii');

// V/V: D mayor en C [D3, F#3, A3]
const recD = recognizeChordFromMidiNotes([50, 54, 57], 'C', 'major');
assert(recD !== null && recD.rootPc === 2 && recD.quality === 'maj' && recD.secondaryType === 'V' && recD.appliedTarget === 5, 'Detecta D mayor como V/V');
const chordD = parseHookpadChord({
  root: recD?.rootSd,
  quality: recD?.quality,
  type: recD?.type,
  inversion: recD?.inversion,
  secondaryType: recD?.secondaryType,
  applied: recD?.applied,
  appliedTarget: recD?.appliedTarget,
  appliedFunctionDegree: recD?.appliedFunctionDegree,
  targetDegree: recD?.appliedTarget,
}, 'C', 'major');
assert(chordD.symbol === 'D', 'Símbolo de V/V es D');
assert(chordD.roman === 'V/V', 'Romano de V/V es V/V');

console.log('\n7. Reconocimiento de mezclas modales y arpegios consolidados:');

// bIII: Eb mayor en C [Eb3, G3, Bb3]
const recEb = recognizeChordFromMidiNotes([51, 55, 58], 'C', 'major');
assert(recEb !== null && recEb.rootPc === 3 && recEb.quality === 'maj' && recEb.borrowed === 'minor', 'Detecta Eb mayor como acorde prestado bIII (minor)');
const chordEb = parseHookpadChord({
  root: recEb?.rootSd,
  quality: recEb?.quality,
  type: recEb?.type,
  inversion: recEb?.inversion,
  borrowed: recEb?.borrowed,
}, 'C', 'major');
assert(chordEb.symbol === 'Eb', 'Símbolo de bIII es Eb');
assert(chordEb.roman === '♭III(min)', 'Romano de bIII es ♭III(min)');

// Arpegio bajo Alberti: [C3, G3, E3, G3]
const recArp = recognizeChordFromMidiNotes([48, 55, 52, 55], 'C', 'major');
assert(recArp !== null && recArp.rootPc === 0 && recArp.quality === 'maj' && recArp.inversion === 0, 'Arpegio Alberti consolidado en tríada C mayor fundamental');

console.log('\n8. Tétradas vs add9 vs díadas / acordes incompletos:');

// Tétrada dom7: [C3, E3, G3, Bb3]
const recC7 = recognizeChordFromMidiNotes([48, 52, 55, 58], 'C', 'major');
assert(recC7 !== null && recC7.rootPc === 0 && recC7.quality === 'dom7' && recC7.type === 7, 'Reconoce C7 como dom7 tétrada');
const chordC7 = parseHookpadChord({
  root: recC7?.rootSd,
  quality: recC7?.quality,
  type: recC7?.type,
  inversion: recC7?.inversion,
  secondaryType: recC7?.secondaryType,
  applied: recC7?.applied,
  appliedTarget: recC7?.appliedTarget,
  appliedFunctionDegree: recC7?.appliedFunctionDegree,
  targetDegree: recC7?.appliedTarget,
}, 'C', 'major');
assert(chordC7.symbol === 'C7', 'Símbolo de C7 es C7');
assert(chordC7.roman === 'V⁷/IV', 'Romano de C7 en Do mayor es V⁷/IV');

// Acorde add9: [C3, E3, G3, D4] (sin 7ª)
const recCadd9 = recognizeChordFromMidiNotes([48, 52, 55, 62], 'C', 'major');
assert(recCadd9 !== null && recCadd9.rootPc === 0 && recCadd9.quality === 'maj' && recCadd9.type === 5 && Boolean(recCadd9.adds?.includes(9)), 'Reconoce C⁽add9⁾ como tríada con 9ª añadida');
const chordCadd9 = parseHookpadChord({
  root: recCadd9?.rootSd,
  quality: recCadd9?.quality,
  type: recCadd9?.type,
  adds: recCadd9?.adds,
  inversion: recCadd9?.inversion,
}, 'C', 'major');
assert(chordCadd9.symbol === 'C⁽add9⁾', 'Símbolo de C⁽add9⁾ es C⁽add9⁾');
assert(chordCadd9.roman === 'I⁽ᵃᵈᵈ⁹⁾', 'Romano de C⁽add9⁾ es I⁽ᵃᵈᵈ⁹⁾');

// Tétrada con 5ª omitida (voicing habitual: Fundamental, 3ª, 7ª): [C3, E3, Bb3]
const recC7No5 = recognizeChordFromMidiNotes([48, 52, 58], 'C', 'major');
assert(recC7No5 !== null && recC7No5.rootPc === 0 && recC7No5.quality === 'dom7' && recC7No5.type === 7, 'Reconoce tétrada C7 con 5ª omitida (root + 3rd + 7th)');

// Díada / acorde incompleto (Fundamental + 5ª): [C3, G3]
const recPower = recognizeChordFromMidiNotes([48, 55], 'C', 'major');
assert(recPower !== null && recPower.rootPc === 0 && recPower.quality === 'maj', 'Díada C+G en Do mayor deduce tríada de tónica I');

console.log('\n9. Ponderación métrica e inmunidad ante notas de paso melódicas y de acompañamiento:');
// Tríada mayor en tiempo fuerte (duración 2.0) + nota de paso cromática ligera (duración 0.25 en tiempo débil)
const notesWithPassing = [
  { midi: 48, duration: 2.0, isDownbeat: true }, // C3 fundamental
  { midi: 52, duration: 2.0 },                   // E3 tercera
  { midi: 55, duration: 2.0 },                   // G3 quinta
  { midi: 50, duration: 0.25, isDownbeat: false }, // D3 nota de paso rápida
];
const recPassing = recognizeChordFromMidiNotes(notesWithPassing, 'C', 'major');
assert(recPassing !== null && recPassing.rootPc === 0 && recPassing.quality === 'maj' && !recPassing.adds, 'Nota de paso rápida de corchea/semicorchea no altera la tríada C');

console.log('\n10. Discriminación precisa de función secundaria vs diatónica (V/ii vs vi, V/V vs ii):');
// A mayor (con C#): V/ii
const recAMaj = recognizeChordFromMidiNotes([45, 49, 52], 'C', 'major');
assert(recAMaj !== null && recAMaj.secondaryType === 'V' && recAMaj.appliedTarget === 2, 'A mayor en C es V/ii');

// A menor (con C natural): diatónico vi (Am)
const recAMin = recognizeChordFromMidiNotes([45, 48, 52], 'C', 'major');
assert(recAMin !== null && recAMin.rootPc === 9 && recAMin.quality === 'min' && recAMin.secondaryType === undefined, 'A menor en C es diatónico vi (Am), NO secundario');

// D mayor (con F#): V/V
const recDMaj = recognizeChordFromMidiNotes([50, 54, 57], 'C', 'major');
assert(recDMaj !== null && recDMaj.secondaryType === 'V' && recDMaj.appliedTarget === 5, 'D mayor en C es V/V');

// D menor (con F natural): diatónico ii (Dm)
const recDMin = recognizeChordFromMidiNotes([50, 53, 57], 'C', 'major');
assert(recDMin !== null && recDMin.rootPc === 2 && recDMin.quality === 'min' && recDMin.secondaryType === undefined, 'D menor en C es diatónico ii (Dm), NO secundario');

console.log('\n11. Estimación tonal Krumhansl-Schmuckler (estimateKeyFromPitchHistogram):');
// Histograma de Do mayor
const histC = [10, 0, 4, 0, 7, 5, 0, 8, 0, 4, 0, 3];
const estC = estimateKeyFromPitchHistogram(histC);
assert(estC.tonic === 'C' && estC.scale === 'major', `Estima C major correctamente (obtenido: ${estC.tonic} ${estC.scale})`);

// Histograma de Sol mayor
const histG = [4, 0, 7, 0, 4, 0, 3, 10, 0, 4, 0, 7];
const estG = estimateKeyFromPitchHistogram(histG);
assert(estG.tonic === 'G' && estG.scale === 'major', `Estima G major correctamente (obtenido: ${estG.tonic} ${estG.scale})`);

// Histograma de La menor
const histAm = [5, 0, 4, 0, 7, 5, 0, 4, 0, 10, 0, 3];
const estAm = estimateKeyFromPitchHistogram(histAm);
assert(estAm.tonic === 'A' && estAm.scale === 'minor', `Estima A minor correctamente (obtenido: ${estAm.tonic} ${estAm.scale})`);

console.log('\n12. Ritmo armónico dinámico, multitrack y respeto de compás (parseMidiToUniversalSong):');

// Helper para crear un File simulado desde Uint8Array
function createSyntheticMidiFile(midi: Midi, fileName: string): File {
  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'audio/midi' });
  return new File([blob], fileName);
}

// 12.1 Ritmo armónico dinámico (2 acordes por compás vs 1 acorde por compás)
const dynamicMidi = new Midi();
const ppq = dynamicMidi.header.ppq || 480;

// Pista 0: Melodía
const tMelody = dynamicMidi.addTrack();
tMelody.name = 'Lead Melody';
tMelody.addNote({ midi: 72, ticks: 0, durationTicks: ppq * 2 }); // C5
tMelody.addNote({ midi: 76, ticks: ppq * 2, durationTicks: ppq * 2 }); // E5
tMelody.addNote({ midi: 74, ticks: ppq * 4, durationTicks: ppq * 2 }); // D5
tMelody.addNote({ midi: 71, ticks: ppq * 6, durationTicks: ppq * 2 }); // B4

// Pista 1: Acordes
const tChords = dynamicMidi.addTrack();
tChords.name = 'Piano Chords';
// Compás 1: C mayor todo el compás (beats 1..4)
tChords.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4 });
tChords.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 });
tChords.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 });
// Compás 2: Dm en medio compás (beats 1..2 = ticks 4*ppq .. 6*ppq)
tChords.addNote({ midi: 62, ticks: ppq * 4, durationTicks: ppq * 2 });
tChords.addNote({ midi: 65, ticks: ppq * 4, durationTicks: ppq * 2 });
tChords.addNote({ midi: 69, ticks: ppq * 4, durationTicks: ppq * 2 });
// Compás 2: G7 en medio compás (beats 3..4 = ticks 6*ppq .. 8*ppq)
tChords.addNote({ midi: 65, ticks: ppq * 6, durationTicks: ppq * 2 }); // F4 (7ª)
tChords.addNote({ midi: 67, ticks: ppq * 6, durationTicks: ppq * 2 }); // G4
tChords.addNote({ midi: 71, ticks: ppq * 6, durationTicks: ppq * 2 }); // B4

// Pista 2: Bajo
const tBass = dynamicMidi.addTrack();
tBass.name = 'Electric Bass';
tBass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4 }); // C2 en compás 1
tBass.addNote({ midi: 38, ticks: ppq * 4, durationTicks: ppq * 2 }); // D2 en compás 2 (primera mitad)
tBass.addNote({ midi: 43, ticks: ppq * 6, durationTicks: ppq * 2 }); // G2 en compás 2 (segunda mitad)

const synthFile = createSyntheticMidiFile(dynamicMidi, 'dynamic_harmony_test.mid');
const parsedSong = await parseMidiToUniversalSong(synthFile, { keyTonic: 'C', keyScale: 'major', chordResolution: 2 });

assert(parsedSong.sections[0].chords.length === 3, `Genera 3 acordes en total (1 consolidado en compás 1 + 2 en compás 2) (obtenido: ${parsedSong.sections[0].chords.length})`);
assert(parsedSong.sections[0].chords[0].beat === 1 && parsedSong.sections[0].chords[0].duration === 4 && parsedSong.sections[0].chords[0].symbol === 'C', 'Compás 1 se consolida en 1 acorde C de 4 beats');
assert(parsedSong.sections[0].chords[1].beat === 5 && parsedSong.sections[0].chords[1].duration === 2 && parsedSong.sections[0].chords[1].symbol === 'Dm', 'Compás 2 mitad 1 es Dm con duración 2 beats en beat 5');
assert(parsedSong.sections[0].chords[2].beat === 7 && parsedSong.sections[0].chords[2].duration === 2 && parsedSong.sections[0].chords[2].symbol === 'G7', 'Compás 2 mitad 2 es G7 con duración 2 beats en beat 7');
assert(parsedSong.sections[0].chords[2].roman === 'V⁷', 'Romano de G7 es V⁷');

console.log('\n13. Respeto estricto de compás en métrica 3/4 (sin cruce de barras):');
const midi34 = new Midi();
midi34.header.setTempo(100);
midi34.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
const ppq34 = midi34.header.ppq || 480;

const t34 = midi34.addTrack();
t34.name = 'Piano 3/4';
// Compás 1 (3 beats = ticks 0 .. 3*ppq): C mayor
t34.addNote({ midi: 48, ticks: 0, durationTicks: ppq34 * 3 });
t34.addNote({ midi: 52, ticks: 0, durationTicks: ppq34 * 3 });
t34.addNote({ midi: 55, ticks: 0, durationTicks: ppq34 * 3 });
// Compás 2 (3 beats = ticks 3*ppq .. 6*ppq): G mayor
t34.addNote({ midi: 43, ticks: ppq34 * 3, durationTicks: ppq34 * 3 });
t34.addNote({ midi: 47, ticks: ppq34 * 3, durationTicks: ppq34 * 3 });
t34.addNote({ midi: 50, ticks: ppq34 * 3, durationTicks: ppq34 * 3 });

const file34 = createSyntheticMidiFile(midi34, 'waltz_3_4.mid');
const parsed34 = await parseMidiToUniversalSong(file34, { keyTonic: 'C', keyScale: 'major', chordResolution: 2 });
assert(parsed34.sections[0].beatsPerBar === 3, 'beatsPerBar es 3');
assert(parsed34.sections[0].chords.length === 2, 'Genera exactamente 2 acordes para los 2 compases en 3/4');
assert(parsed34.sections[0].chords[0].duration === 3 && parsed34.sections[0].chords[0].symbol === 'C', 'Acorde 1 dura exactamente 3 beats y es C');
assert(parsed34.sections[0].chords[1].beat === 4 && parsed34.sections[0].chords[1].duration === 3 && parsed34.sections[0].chords[1].symbol === 'G', 'Acorde 2 empieza en beat 4, dura 3 beats y es G');

console.log('\n14. Invarianza temporal y ausencia de deriva por cambios de tempo:');
const tempoChangeMidi = new Midi();
const ppqTC = tempoChangeMidi.header.ppq || 480;
// Tempo inicial 120, luego baja a 60 a la mitad
tempoChangeMidi.header.tempos.push({ ticks: 0, bpm: 120 });
tempoChangeMidi.header.tempos.push({ ticks: ppqTC * 4, bpm: 60 });

const tLead = tempoChangeMidi.addTrack();
tLead.addNote({ midi: 72, ticks: 0, durationTicks: ppqTC * 2 }); // Beat 1
tLead.addNote({ midi: 74, ticks: ppqTC * 4, durationTicks: ppqTC * 2 }); // Beat 5

const fileTC = createSyntheticMidiFile(tempoChangeMidi, 'tempo_change.mid');
const parsedTC = await parseMidiToUniversalSong(fileTC, { keyTonic: 'C', keyScale: 'major' });
assert(parsedTC.sections[0].melody[0].beat === 1, 'Nota 1 está exactamente en beat 1.0 a 120 BPM');
assert(parsedTC.sections[0].melody[1].beat === 5, 'Nota 2 está exactamente en beat 5.0 a 60 BPM (sin deriva métrica)');

console.log('\n========================================');
console.log(`TRANSPOSITION & MIDI CHORD RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`Transposition & MIDI chord recognition tests failed: ${failed} failure(s)`);
}
