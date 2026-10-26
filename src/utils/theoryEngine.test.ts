/**
 * theoryEngine.test.ts
 * Batería de pruebas unitarias y combinatorias puras para el motor armónico de Hooktheory.
 * Cubre:
 * 1. Matriz de regresión obligatoria R1 a R14.
 * 2. Matriz combinatoria completa de los 7 modos x 7 grados para tríadas y tétradas (98 casos).
 * 3. Escala menor armónica y sus acordes característicos.
 * 4. Integridad del CanonicalChordIR y desacoplamiento de renderizadores.
 */

import {
  buildIntermediateChord,
  buildCanonicalChordIR,
  renderRomanNumeral,
  renderChordSymbol,
  renderSubLabels,
  parseHookpadChord,
  getChordVoiceFunctionalLabel,
} from './theoryEngine';
import type { IntermediateChordModel, CanonicalChordIR } from '../types/music';

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

console.log('=== TEST SUITE: Hooktheory Engine (theoryEngine.test.ts) ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. MATRIZ DE REGRESIÓN OBLIGATORIA (R1 - R14)
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Matriz de Regresión Obligatoria R1 a R14:');

// R1: V6/V en Do Mayor -> D/F# (inv 1, bajo F#2 MIDI 42, roman V⁶/V)
const r1 = buildIntermediateChord({ applied: 5, root: 5, type: 5, inversion: 1 }, 'C');
assert(r1.rootName === 'D', `R1: Raíz es D (obtenido: ${r1.rootName})`);
assert(r1.bassName === 'F#', `R1: Bajo es F# (obtenido: ${r1.bassName})`);
assert(r1.chordQuality === 'maj', `R1: Cualidad es maj (obtenido: ${r1.chordQuality})`);
assert(renderRomanNumeral(r1) === 'V⁶/V', `R1: Romano es V⁶/V (obtenido: ${renderRomanNumeral(r1)})`);
assert(renderChordSymbol(r1) === 'D/F#', `R1: Símbolo es D/F# (obtenido: ${renderChordSymbol(r1)})`);
assert(r1.audioVoicingMidi[0] === 42, `R1: Bajo MIDI es 42 / F#2 (obtenido: ${r1.audioVoicingMidi[0]})`);
assert(!r1.isAmbiguousInversion && r1.validatedInversion === 1, 'R1: Inversión 1 validada');

// R2: vii°7/ii en La Mayor -> A#°7 (root A#, quality dim7, roman vii°⁷/ii, pitch classes [1, 4, 7, 10])
const r2 = buildIntermediateChord({ applied: 7, root: 2, type: 7, inversion: 0 }, 'A');
assert(r2.rootName === 'A#', `R2: Raíz es A# (obtenido: ${r2.rootName})`);
assert(r2.chordQuality === 'dim7', `R2: Cualidad es dim7 (obtenido: ${r2.chordQuality})`);
assert(renderRomanNumeral(r2) === 'vii°⁷/ii', `R2: Romano es vii°⁷/ii (obtenido: ${renderRomanNumeral(r2)})`);
assert(renderChordSymbol(r2) === 'A#°7', `R2: Símbolo es A#°7 (obtenido: ${renderChordSymbol(r2)})`);
assert(JSON.stringify(r2.effectivePitches) === JSON.stringify([1, 4, 7, 10]), `R2: Clases de altura son [1, 4, 7, 10] (obtenido: ${JSON.stringify(r2.effectivePitches)})`);

// R3: vii°7/I en La Mayor -> G#°7 (root G#, quality dim7, roman vii°⁷/I, pitch classes [2, 5, 8, 11])
const r3 = buildIntermediateChord({ applied: 7, root: 1, type: 7, inversion: 0 }, 'A');
assert(r3.rootName === 'G#', `R3: Raíz es G# (obtenido: ${r3.rootName})`);
assert(r3.chordQuality === 'dim7', `R3: Cualidad es dim7 (obtenido: ${r3.chordQuality})`);
assert(renderRomanNumeral(r3) === 'vii°⁷/I', `R3: Romano es vii°⁷/I (obtenido: ${renderRomanNumeral(r3)})`);
assert(renderChordSymbol(r3) === 'G#°7', `R3: Símbolo es G#°7 (obtenido: ${renderChordSymbol(r3)})`);
assert(JSON.stringify(r3.effectivePitches) === JSON.stringify([2, 5, 8, 11]), `R3: Clases de altura son [2, 5, 8, 11] (obtenido: ${JSON.stringify(r3.effectivePitches)})`);

// R4: ii/V en Do Mayor -> Am (root A, quality min, roman ii/V)
const r4 = buildIntermediateChord({ applied: 2, root: 5, type: 5, inversion: 0 }, 'C');
assert(r4.rootName === 'A', `R4: Raíz es A (obtenido: ${r4.rootName})`);
assert(r4.chordQuality === 'min', `R4: Cualidad es min (obtenido: ${r4.chordQuality})`);
assert(renderRomanNumeral(r4) === 'ii/V', `R4: Romano es ii/V (obtenido: ${renderRomanNumeral(r4)})`);
assert(renderChordSymbol(r4) === 'Am', `R4: Símbolo es Am (obtenido: ${renderChordSymbol(r4)})`);

// R5: IV/V en Do Mayor -> C (root C, quality maj, roman IV/V)
const r5 = buildIntermediateChord({ applied: 4, root: 5, type: 5, inversion: 0 }, 'C');
assert(r5.rootName === 'C', `R5: Raíz es C (obtenido: ${r5.rootName})`);
assert(r5.chordQuality === 'maj', `R5: Cualidad es maj (obtenido: ${r5.chordQuality})`);
assert(renderRomanNumeral(r5) === 'IV/V', `R5: Romano es IV/V (obtenido: ${renderRomanNumeral(r5)})`);
assert(renderChordSymbol(r5) === 'C', `R5: Símbolo es C (obtenido: ${renderChordSymbol(r5)})`);

// R5b: IV/V tétrada diatónica -> Cmaj7
const r5b = buildIntermediateChord({ applied: 4, root: 5, type: 7, inversion: 0 }, 'C');
assert(r5b.chordQuality === 'maj7', `R5b: Cualidad tétrada es maj7 (obtenido: ${r5b.chordQuality})`);
assert(renderRomanNumeral(r5b) === 'IV^Δ⁷/V', `R5b: Romano es IV^Δ⁷/V (obtenido: ${renderRomanNumeral(r5b)})`);
assert(renderChordSymbol(r5b) === 'Cmaj7', `R5b: Símbolo es Cmaj7 (obtenido: ${renderChordSymbol(r5b)})`);

// R6: Ebmaj7 (préstamo modal de menor en C Mayor)
const r6 = buildIntermediateChord({ root: 3, type: 7, borrowed: 'minor' }, 'C');
assert(r6.rootName === 'Eb', `R6: Raíz es Eb (obtenido: ${r6.rootName})`);
assert(r6.chordQuality === 'maj7', `R6: Cualidad es maj7 (obtenido: ${r6.chordQuality})`);
assert(renderRomanNumeral(r6) === '♭III^Δ⁷(min)', `R6: Romano es ♭III^Δ⁷(min) (obtenido: ${renderRomanNumeral(r6)})`);
assert(renderChordSymbol(r6) === 'Ebmaj7', `R6: Símbolo es Ebmaj7 (obtenido: ${renderChordSymbol(r6)})`);
assert(r6.tones.some(t => t.degree === 7 && t.interval === 11), 'R6: Séptima es D natural (11 semitonos)');

// R7: Gm/Bb (préstamo modal de menor inv 1 en C Mayor)
const r7 = buildIntermediateChord({ root: 5, type: 5, inversion: 1, borrowed: 'minor' }, 'C');
assert(r7.rootName === 'G', `R7: Raíz es G (obtenido: ${r7.rootName})`);
assert(r7.bassName === 'Bb', `R7: Bajo es Bb (obtenido: ${r7.bassName})`);
assert(r7.chordQuality === 'min', `R7: Cualidad es min (obtenido: ${r7.chordQuality})`);
assert(renderRomanNumeral(r7) === 'v⁶(min)', `R7: Romano es v⁶(min) (obtenido: ${renderRomanNumeral(r7)})`);
assert(renderChordSymbol(r7) === 'Gm/Bb', `R7: Símbolo es Gm/Bb (obtenido: ${renderChordSymbol(r7)})`);
assert(r7.audioVoicingMidi[0] === 46, `R7: Bajo MIDI es 46 / Bb2 (obtenido: ${r7.audioVoicingMidi[0]})`);

// R8: F6 (add6 en C Mayor)
const r8 = buildIntermediateChord({ root: 4, type: 5, adds: [6], inversion: 0 }, 'C');
assert(r8.rootName === 'F', `R8: Raíz es F (obtenido: ${r8.rootName})`);
assert(r8.bassName === 'F', `R8: Bajo es F (obtenido: ${r8.bassName})`);
assert(renderRomanNumeral(r8) === 'IV⁶', `R8: Romano es IV⁶ (obtenido: ${renderRomanNumeral(r8)})`);
assert(renderChordSymbol(r8) === 'F6', `R8: Símbolo es F6 (obtenido: ${renderChordSymbol(r8)})`);
assert(!renderChordSymbol(r8).includes('/'), 'R8: No genera barra de bajo en inv 0');

// R9: Dm7/F (ii7 inv 1 en C Mayor)
const r9 = buildIntermediateChord({ root: 2, type: 7, inversion: 1 }, 'C');
assert(r9.rootName === 'D', `R9: Raíz es D (obtenido: ${r9.rootName})`);
assert(r9.bassName === 'F', `R9: Bajo es F (obtenido: ${r9.bassName})`);
assert(renderRomanNumeral(r9) === 'ii⁶₅', `R9: Romano es ii⁶₅ (obtenido: ${renderRomanNumeral(r9)})`);
assert(renderChordSymbol(r9) === 'Dm7/F', `R9: Símbolo es Dm7/F (obtenido: ${renderChordSymbol(r9)})`);

// R10: Cadd9 (type 5 + adds: [9])
const r10 = buildIntermediateChord({ root: 1, type: 5, adds: [9] }, 'C');
assert(r10.type === 5, `R10: Type estructural preservado como 5 (obtenido: ${r10.type})`);
assert(!r10.tones.some(t => t.degree === 7), 'R10: No contiene 7ª accidental');
assert(r10.tones.some(t => t.degree === 9 && t.interval === 14 && t.source === 'add'), 'R10: Contiene 9ª añadida (+14 st)');
assert(renderRomanNumeral(r10) === 'I⁽ᵃᵈᵈ⁹⁾', `R10: Romano es I⁽ᵃᵈᵈ⁹⁾ (obtenido: ${renderRomanNumeral(r10)})`);
assert(renderChordSymbol(r10) === 'C⁽add9⁾', `R10: Símbolo es C⁽add9⁾ (obtenido: ${renderChordSymbol(r10)})`);

// R11: Cmaj9 (type: 9)
const r11 = buildIntermediateChord({ root: 1, type: 9 }, 'C');
assert(r11.type === 9, `R11: Type estructural es 9 (obtenido: ${r11.type})`);
assert(r11.tones.some(t => t.degree === 7), 'R11: Contiene 7ª estructural');
assert(renderRomanNumeral(r11) === 'I^Δ⁹', `R11: Romano es I^Δ⁹ (obtenido: ${renderRomanNumeral(r11)})`);
assert(renderChordSymbol(r11) === 'Cmaj9', `R11: Símbolo es Cmaj9 (obtenido: ${renderChordSymbol(r11)})`);

// R12: E7(b9) dominante alterado
const r12 = buildIntermediateChord({ root: 3, type: 7, alterations: ['b9'] }, 'C');
assert(r12.chordQuality === 'dom7', `R12: Cualidad es dom7 (obtenido: ${r12.chordQuality})`);
assert(renderChordSymbol(r12) === 'E7(b9)', `R12: Símbolo es E7(b9) (obtenido: ${renderChordSymbol(r12)})`);
assert(r12.audioVoicingMidi.length === 4, `R12: Voicing a 4 voces (obtenido: ${r12.audioVoicingMidi.length})`);
assert(!r12.audioVoicingMidi.some(m => m % 12 === 11), 'R12: Omite la 5ª justa (B / PC 11) en voicing de audio');

// R13: Inversión 1 con nota del bajo omitida (omits: [3])
const r13 = buildIntermediateChord({ root: 1, type: 5, inversion: 1, omits: [3] }, 'C');
assert(r13.isAmbiguousInversion, 'R13: Detecta ambigüedad en inversión con no3');
assert(r13.validatedInversion === 0, 'R13: Inversión validada cae a 0');
assert(r13.bassName === 'C', `R13: Bajo cae a fundamental C (obtenido: ${r13.bassName})`);
assert(!renderChordSymbol(r13).includes('/'), 'R13: No emite barra de bajo falsa');

// R14: Sustitución tritonal de V/I en Do Mayor (Db7, corrección de enarmonía)
const r14 = buildIntermediateChord({ applied: 5, root: 1, type: 7, substitutions: ['tri'] }, 'C');
assert(r14.rootName === 'Db', `R14: Raíz es Db (obtenido: ${r14.rootName})`);
assert(r14.useFlats === true, 'R14: useFlats es true para sustitución tritonal');
assert(renderChordSymbol(r14) === 'Db7', `R14: Símbolo es Db7 (obtenido: ${renderChordSymbol(r14)})`);
assert(renderRomanNumeral(r14) === '♭II⁷/I (Δ-sub)', `R14: Romano es ♭II⁷/I (Δ-sub) (obtenido: ${renderRomanNumeral(r14)})`);

// ────────────────────────────────────────────────────────────────────────────
// 2. MATRIZ COMBINATORIA DE LOS 7 MODOS X 7 GRADOS (49 TRÍADAS + 49 TÉTRADAS = 98 CASOS)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Matriz Combinatoria Diatónica (7 modos x 7 grados):');

const MODAL_EXPECTATIONS: Record<string, {
  triadQualities: string[];
  tetradQualities: string[];
  triadRomans: string[];
}> = {
  major: {
    triadQualities: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
    tetradQualities: ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'halfdim7'],
    triadRomans: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
  },
  minor: {
    triadQualities: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
    tetradQualities: ['min7', 'halfdim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
    triadRomans: ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII'],
  },
  dorian: {
    triadQualities: ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
    tetradQualities: ['min7', 'min7', 'maj7', 'dom7', 'min7', 'halfdim7', 'maj7'],
    triadRomans: ['i', 'ii', '♭III', 'IV', 'v', 'vi°', '♭VII'],
  },
  phrygian: {
    triadQualities: ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
    tetradQualities: ['min7', 'maj7', 'dom7', 'min7', 'halfdim7', 'maj7', 'min7'],
    triadRomans: ['i', '♭II', '♭III', 'iv', 'v°', '♭VI', '♭vii'],
  },
  lydian: {
    triadQualities: ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
    tetradQualities: ['maj7', 'dom7', 'min7', 'halfdim7', 'maj7', 'min7', 'min7'],
    triadRomans: ['I', 'II', 'iii', '♯iv°', 'V', 'vi', 'vii'],
  },
  mixolydian: {
    triadQualities: ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
    tetradQualities: ['dom7', 'min7', 'halfdim7', 'maj7', 'min7', 'min7', 'maj7'],
    triadRomans: ['I', 'ii', 'iii°', 'IV', 'v', 'vi', '♭VII'],
  },
  locrian: {
    triadQualities: ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
    tetradQualities: ['halfdim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7'],
    triadRomans: ['i°', '♭II', '♭iii', 'iv', '♭V', '♭VI', '♭vii'],
  },
};

for (const [mode, exp] of Object.entries(MODAL_EXPECTATIONS)) {
  for (let deg = 1; deg <= 7; deg++) {
    const idx = deg - 1;

    // Tríada
    const triadModel = buildIntermediateChord({ root: deg, type: 5 }, { tonic: 'C', scale: mode as any });
    assert(
      triadModel.chordQuality === exp.triadQualities[idx],
      `[${mode}] Tríada grado ${deg}: cualidad esperada ${exp.triadQualities[idx]} (obtenido: ${triadModel.chordQuality})`
    );

    // Tétrada
    const tetradModel = buildIntermediateChord({ root: deg, type: 7 }, { tonic: 'C', scale: mode as any });
    assert(
      tetradModel.chordQuality === exp.tetradQualities[idx],
      `[${mode}] Tétrada grado ${deg}: cualidad esperada ${exp.tetradQualities[idx]} (obtenido: ${tetradModel.chordQuality})`
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. MENOR ARMÓNICA (HARMONIC MINOR)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Escala Menor Armónica:');

const harmMinTriads = ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim'];
const harmMinTetrads = ['min7', 'halfdim7', 'maj7', 'min7', 'dom7', 'maj7', 'dim7'];

for (let deg = 1; deg <= 7; deg++) {
  const idx = deg - 1;
  const triad = buildIntermediateChord({ root: deg, type: 5 }, { tonic: 'A', scale: 'harmonic_minor' });
  assert(
    triad.chordQuality === harmMinTriads[idx],
    `Menor Armónica grado ${deg}: tríada cualidad ${harmMinTriads[idx]} (obtenido: ${triad.chordQuality})`
  );

  const tetrad = buildIntermediateChord({ root: deg, type: 7 }, { tonic: 'A', scale: 'harmonic_minor' });
  assert(
    tetrad.chordQuality === harmMinTetrads[idx],
    `Menor Armónica grado ${deg}: tétrada cualidad ${harmMinTetrads[idx]} (obtenido: ${tetrad.chordQuality})`
  );
}

// Grado 7 de Menor Armónica debe ser séptima totalmente disminuida (dim7)
const harmMin7 = buildIntermediateChord({ root: 7, type: 7 }, { tonic: 'A', scale: 'harmonic_minor' });
assert(harmMin7.rootName === 'G#', `Menor Armónica grado 7 raíz es G# (obtenido: ${harmMin7.rootName})`);
assert(harmMin7.chordQuality === 'dim7', `Menor Armónica grado 7 cualidad es dim7 (obtenido: ${harmMin7.chordQuality})`);
assert(harmMin7.tones.some(t => t.degree === 7 && t.interval === 9), 'Menor Armónica grado 7 tiene 7ª disminuida (9 semitonos)');

// ────────────────────────────────────────────────────────────────────────────
// 4. INTEGRIDAD DEL CANONICAL CHORD IR Y PARSEHOOKPADCHORD
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Integridad del CanonicalChordIR y parseHookpadChord:');

const testChordRaw = {
  id: 'test_c_1',
  beat: 5,
  duration: 4,
  applied: 5,
  root: 5,
  type: 5,
  inversion: 1,
};

const parsedUniversal = parseHookpadChord(testChordRaw, 'C');
assert(parsedUniversal.id === 'test_c_1', 'parseHookpadChord preserva id');
assert(parsedUniversal.beat === 5, 'parseHookpadChord preserva beat');
assert(parsedUniversal.roman === 'V⁶/V', `parseHookpadChord calcula roman V⁶/V (obtenido: ${parsedUniversal.roman})`);
assert(parsedUniversal.symbol === 'D/F#', `parseHookpadChord calcula symbol D/F# (obtenido: ${parsedUniversal.symbol})`);
assert(parsedUniversal.bassNote === 'F#', `parseHookpadChord bajo es F# (obtenido: ${parsedUniversal.bassNote})`);
assert(parsedUniversal.ir !== undefined, 'UniversalChord contiene referencia al CanonicalChordIR (ir)');
assert(parsedUniversal.model !== undefined, 'UniversalChord contiene referencia al IntermediateChordModel (model)');

const ir = parsedUniversal.ir as CanonicalChordIR;
assert(ir.identity.rootName === 'D', `IR rootName es D (obtenido: ${ir.identity.rootName})`);
assert(ir.identity.rootPitchClass === 2, `IR rootPitchClass es 2 (obtenido: ${ir.identity.rootPitchClass})`);
assert(ir.secondary.isApplied === true, 'IR isApplied es true');
assert(ir.secondary.appliedFunctionDegree === 5, 'IR appliedFunctionDegree es 5');
assert(ir.secondary.targetDegree === 5, 'IR targetDegree es 5');
assert(ir.bassAndInversion.bassName === 'F#', `IR bassName es F# (obtenido: ${ir.bassAndInversion.bassName})`);
assert(ir.bassAndInversion.validatedInversion === 1, 'IR validatedInversion es 1');
assert(ir.outputs.romanNumeral === 'V⁶/V', 'IR outputs.romanNumeral es V⁶/V');
assert(ir.outputs.chordSymbol === 'D/F#', 'IR outputs.chordSymbol es D/F#');
assert(ir.outputs.audioVoicingMidi[0] === 42, `IR outputs.audioVoicingMidi bajo es 42 / F#2 (obtenido: ${ir.outputs.audioVoicingMidi[0]})`);

// ────────────────────────────────────────────────────────────────────────────
// RESULTADOS FINALES
// ────────────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`THEORY ENGINE RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`THEORY ENGINE TESTS FAILED: ${failed} assertion(s) failed`);
}
