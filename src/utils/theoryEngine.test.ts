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
  normalizeSemitone,
  getPitchClass,
  getScalePitchClasses,
  getChordIntervals,
  getDiatonicChordQuality,
  getDegreePitchClass,
  getMetricAccent,
  isChordTone,
  getMelodicStability,
  detectModalMixture,
  buildIntermediateChord,
  buildCanonicalChordIR,
  renderRomanNumeral,
  renderChordSymbol,
  renderSubLabels,
  parseHookpadChord,
  getChordVoiceFunctionalLabel,
} from './theoryEngine';
import type { IntermediateChordModel, CanonicalChordIR } from '../types/music';
import { parseHookpadSection } from './hookpadImporter';

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
const r4 = buildIntermediateChord({ roman: 'ii/V', root: 2, applied: 5, type: 5, inversion: 0 }, 'C');
assert(r4.rootName === 'A', `R4: Raíz es A (obtenido: ${r4.rootName})`);
assert(r4.chordQuality === 'min', `R4: Cualidad es min (obtenido: ${r4.chordQuality})`);
assert(renderRomanNumeral(r4) === 'ii/V', `R4: Romano es ii/V (obtenido: ${renderRomanNumeral(r4)})`);
assert(renderChordSymbol(r4) === 'Am', `R4: Símbolo es Am (obtenido: ${renderChordSymbol(r4)})`);

// R5: IV/V en Do Mayor -> C (root C, quality maj, roman IV/V)
const r5 = buildIntermediateChord({ roman: 'IV/V', root: 4, applied: 5, type: 5, inversion: 0 }, 'C');
assert(r5.rootName === 'C', `R5: Raíz es C (obtenido: ${r5.rootName})`);
assert(r5.chordQuality === 'maj', `R5: Cualidad es maj (obtenido: ${r5.chordQuality})`);
assert(renderRomanNumeral(r5) === 'IV/V', `R5: Romano es IV/V (obtenido: ${renderRomanNumeral(r5)})`);
assert(renderChordSymbol(r5) === 'C', `R5: Símbolo es C (obtenido: ${renderChordSymbol(r5)})`);

// R5b: IV/V tétrada diatónica -> Cmaj7
const r5b = buildIntermediateChord({ roman: 'IV^Δ⁷/V', root: 4, applied: 5, type: 7, inversion: 0 }, 'C');
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
// 5. FUNDAMENTOS MATEMÁTICOS Y TEORÍA BASE (SPEC SECCIONES 1 Y 2)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Fundamentos Matemáticos y Modos (Spec Sec. 1 y 2):');

// 1.1 y 1.2: Normalización en Z12 y operaciones cromáticas
assert(normalizeSemitone(0) === 0, 'normalizeSemitone(0) es 0');
assert(normalizeSemitone(12) === 0, 'normalizeSemitone(12) es 0');
assert(normalizeSemitone(14) === 2, 'normalizeSemitone(14) es 2');
assert(normalizeSemitone(-1) === 11, 'normalizeSemitone(-1) es 11');
assert(normalizeSemitone(-13) === 11, 'normalizeSemitone(-13) es 11');
assert(normalizeSemitone(25) === 1, 'normalizeSemitone(25) es 1');

// getPitchClass
assert(getPitchClass('C') === 0, 'getPitchClass(C) es 0');
assert(getPitchClass('C#') === 1, 'getPitchClass(C#) es 1');
assert(getPitchClass('Db') === 1, 'getPitchClass(Db) es 1');
assert(getPitchClass('F#') === 6, 'getPitchClass(F#) es 6');
assert(getPitchClass(60) === 0, 'getPitchClass(MIDI 60) es 0');
assert(getPitchClass(69) === 9, 'getPitchClass(MIDI 69 / A4) es 9');

// 1.3: Intervalos de cualidades armónicas
assert(JSON.stringify(getChordIntervals('maj')) === JSON.stringify([0, 4, 7]), 'Intervalos tríada mayor: [0, 4, 7]');
assert(JSON.stringify(getChordIntervals('min')) === JSON.stringify([0, 3, 7]), 'Intervalos tríada menor: [0, 3, 7]');
assert(JSON.stringify(getChordIntervals('dim')) === JSON.stringify([0, 3, 6]), 'Intervalos tríada disminuida: [0, 3, 6]');
assert(JSON.stringify(getChordIntervals('aug')) === JSON.stringify([0, 4, 8]), 'Intervalos tríada aumentada: [0, 4, 8]');
assert(JSON.stringify(getChordIntervals('dom7')) === JSON.stringify([0, 4, 7, 10]), 'Intervalos dom7: [0, 4, 7, 10]');
assert(JSON.stringify(getChordIntervals('maj7')) === JSON.stringify([0, 4, 7, 11]), 'Intervalos maj7: [0, 4, 7, 11]');
assert(JSON.stringify(getChordIntervals('min7')) === JSON.stringify([0, 3, 7, 10]), 'Intervalos min7: [0, 3, 7, 10]');
assert(JSON.stringify(getChordIntervals('halfdim7')) === JSON.stringify([0, 3, 6, 10]), 'Intervalos halfdim7: [0, 3, 6, 10]');
assert(JSON.stringify(getChordIntervals('dim7')) === JSON.stringify([0, 3, 6, 9]), 'Intervalos dim7: [0, 3, 6, 9]');

// 2.1 y 2.2: Escalas de los 7 modos preservando orden
assert(JSON.stringify(getScalePitchClasses('C', 'major')) === JSON.stringify([0, 2, 4, 5, 7, 9, 11]), 'C major scale pitch classes');
assert(JSON.stringify(getScalePitchClasses('A', 'minor')) === JSON.stringify([9, 11, 0, 2, 4, 5, 7]), 'A minor scale pitch classes');
assert(JSON.stringify(getScalePitchClasses('D', 'dorian')) === JSON.stringify([2, 4, 5, 7, 9, 11, 0]), 'D dorian scale pitch classes');
assert(JSON.stringify(getScalePitchClasses('E', 'phrygian')) === JSON.stringify([4, 5, 7, 9, 11, 0, 2]), 'E phrygian scale pitch classes');
assert(JSON.stringify(getScalePitchClasses('F', 'lydian')) === JSON.stringify([5, 7, 9, 11, 0, 2, 4]), 'F lydian scale pitch classes');
assert(JSON.stringify(getScalePitchClasses('G', 'mixolydian')) === JSON.stringify([7, 9, 11, 0, 2, 4, 5]), 'G mixolydian scale pitch classes');
assert(JSON.stringify(getScalePitchClasses('B', 'locrian')) === JSON.stringify([11, 0, 2, 4, 5, 7, 9]), 'B locrian scale pitch classes');

// 2.3: Conversión de grado relativo a pitch class
assert(getDegreePitchClass(1, 'C', 'major') === 0, 'Grado 1 en C mayor es 0');
assert(getDegreePitchClass(3, 'C', 'major') === 4, 'Grado 3 en C mayor es 4');
assert(getDegreePitchClass('b3', 'C', 'major') === 3, 'Grado b3 en C mayor es 3');
assert(getDegreePitchClass('#4', 'C', 'major') === 6, 'Grado #4 en C mayor es 6');
assert(getDegreePitchClass('b7', 'C', 'major') === 10, 'Grado b7 en C mayor es 10');

// Cualidades diatónicas
assert(getDiatonicChordQuality(1, 'major', false) === 'maj', 'Diatonic triad 1 in major is maj');
assert(getDiatonicChordQuality(2, 'major', false) === 'min', 'Diatonic triad 2 in major is min');
assert(getDiatonicChordQuality(7, 'major', false) === 'dim', 'Diatonic triad 7 in major is dim');
assert(getDiatonicChordQuality(5, 'major', true) === 'dom7', 'Diatonic 7th 5 in major is dom7');
assert(getDiatonicChordQuality(7, 'major', true) === 'halfdim7', 'Diatonic 7th 7 in major is halfdim7');

// ────────────────────────────────────────────────────────────────────────────
// 6. BAJO EFECTIVO, INVERSIONES Y COLOR POR BAJO (SPEC SECCIONES 4 Y 9.2)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Bajo Efectivo, Inversiones y Color por Bajo (Spec Sec. 4 y 9.2):');

// I en estado fundamental (C) -> el bajo efectivo es C (grado 1, rojo #D92525, NO alterado)
const chordI = parseHookpadChord({ root: 1, type: 5, inversion: 0 }, 'C');
assert(chordI.bassNote === 'C', `I bajo es C (obtenido: ${chordI.bassNote})`);
assert(chordI.bassDegreeIndex === 1, `I grado del bajo es 1 (obtenido: ${chordI.bassDegreeIndex})`);
assert(chordI.bassScaleDegree === '1', `I bassScaleDegree es 1 (obtenido: ${chordI.bassScaleDegree})`);
assert(chordI.color === '#D92525', `REQ-9.2: I inv 0 color es rojo de fundamental (#D92525) (obtenido: ${chordI.color})`);
assert(!chordI.isAltered, 'I inv 0 es diatónico y no está alterado');

// I6 en Do Mayor (C/E) -> bajo efectivo es E (grado 3, amarillo #C9AC17, NO alterado)
const chordI6 = parseHookpadChord({ root: 1, type: 5, inversion: 1 }, 'C');
assert(chordI6.bassNote === 'E', `I6 bajo es E (obtenido: ${chordI6.bassNote})`);
assert(chordI6.bassDegreeIndex === 3, `I6 grado del bajo es 3 (obtenido: ${chordI6.bassDegreeIndex})`);
assert(chordI6.bassScaleDegree === '3', `I6 bassScaleDegree es 3 (obtenido: ${chordI6.bassScaleDegree})`);
assert(chordI6.bassColor === '#C9AC17', `I6 bassColor es amarillo (#C9AC17) (obtenido: ${chordI6.bassColor})`);
assert(chordI6.color === '#C9AC17', `REQ-9.2: I6 color del bloque deriva del bajo amarillo (#C9AC17) (obtenido: ${chordI6.color})`);
assert(!chordI6.isAltered, 'I6 es diatónico y no está alterado (sin rayas espurias)');

// I6/4 en Do Mayor (C/G) -> bajo efectivo es G (grado 5, cian #0DA8D6)
const chordI64 = parseHookpadChord({ root: 1, type: 5, inversion: 2 }, 'C');
assert(chordI64.bassNote === 'G', `I64 bajo es G (obtenido: ${chordI64.bassNote})`);
assert(chordI64.bassDegreeIndex === 5, `I64 grado del bajo es 5 (obtenido: ${chordI64.bassDegreeIndex})`);
assert(chordI64.color === '#0DA8D6', `REQ-9.2: I64 color del bloque deriva del bajo cian (#0DA8D6) (obtenido: ${chordI64.color})`);

// V6/5 en Do Mayor (G7/B) -> bajo efectivo es B (grado 7, magenta #B5179E)
const chordV65 = parseHookpadChord({ root: 5, type: 7, inversion: 1 }, 'C');
assert(chordV65.bassNote === 'B', `V65 bajo es B (obtenido: ${chordV65.bassNote})`);
assert(chordV65.bassDegreeIndex === 7, `V65 grado del bajo es 7 (obtenido: ${chordV65.bassDegreeIndex})`);
assert(chordV65.bassScaleDegree === '7', `V65 bassScaleDegree es 7 (obtenido: ${chordV65.bassScaleDegree})`);
assert(chordV65.bassColor === '#B5179E', `V65 bassColor es magenta (#B5179E) (obtenido: ${chordV65.bassColor})`);
assert(chordV65.color === '#B5179E', `REQ-9.2: V65 color del bloque deriva del bajo magenta (#B5179E) (obtenido: ${chordV65.color})`);

// V4/2 en Do Mayor (G7/F) -> bajo efectivo es F (grado 4, verde #1DB33D)
const chordV42 = parseHookpadChord({ root: 5, type: 7, inversion: 3 }, 'C');
assert(chordV42.bassNote === 'F', `V42 bajo es F (obtenido: ${chordV42.bassNote})`);
assert(chordV42.bassDegreeIndex === 4, `V42 grado del bajo es 4 (obtenido: ${chordV42.bassDegreeIndex})`);
assert(chordV42.bassScaleDegree === '4', `V42 bassScaleDegree es 4 (obtenido: ${chordV42.bassScaleDegree})`);
assert(chordV42.bassColor === '#1DB33D', `V42 bassColor es verde (#1DB33D) (obtenido: ${chordV42.bassColor})`);
assert(chordV42.color === '#1DB33D', `REQ-9.2: V42 color del bloque deriva del bajo verde (#1DB33D) (obtenido: ${chordV42.color})`);

// Bajo alterado / secundario V6/V (D/F# en C Mayor) -> bajo F# (grado #4, verde #1DB33D con isAltered=true)
const chordV6V = parseHookpadChord({ applied: 5, root: 5, type: 5, inversion: 1 }, 'C');
assert(chordV6V.bassNote === 'F#', `V6/V bajo es F# (obtenido: ${chordV6V.bassNote})`);
assert(chordV6V.bassDegreeIndex === 4, `V6/V grado base del bajo es 4 (obtenido: ${chordV6V.bassDegreeIndex})`);
assert(chordV6V.bassScaleDegree === '#4', `V6/V bassScaleDegree es #4 (obtenido: ${chordV6V.bassScaleDegree})`);
assert(chordV6V.color === '#1DB33D', `V6/V color deriva del grado 4 verde (#1DB33D) (obtenido: ${chordV6V.color})`);
assert(chordV6V.isAltered === true, 'V6/V bajo alterado está marcado isAltered=true (rayado)');

// Acorde con slash bajo alterado C7/Bb (I4/2 dom7 en C Mayor) -> bajo Bb (grado b7, magenta #B5179E con isAltered=true)
const chordI42 = parseHookpadChord({ root: 1, type: 7, quality: 'dom7', inversion: 3 }, 'C');
assert(chordI42.bassNote === 'Bb', `C7/Bb bajo es Bb (obtenido: ${chordI42.bassNote})`);
assert(chordI42.bassScaleDegree === 'b7', `C7/Bb bassScaleDegree es b7 (obtenido: ${chordI42.bassScaleDegree})`);
assert(chordI42.color === '#B5179E', `C7/Bb color deriva de grado 7 magenta (#B5179E) (obtenido: ${chordI42.color})`);
assert(chordI42.isAltered === true, 'C7/Bb tiene bajo alterado b7 y está marcado isAltered=true');

// ────────────────────────────────────────────────────────────────────────────
// 7. ESTABILIDAD MELÓDICA CONTEXTUAL Y MÉTRICA (SPEC SECCIÓN 6)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Estabilidad Melódica Contextual y Métrica (Spec Sec. 6):');

// 7.1 Pertenencia al acorde activo (ChordMember)
assert(isChordTone('C', chordI) === true, 'C es chord tone de C mayor');
assert(isChordTone('E', chordI) === true, 'E es chord tone de C mayor');
assert(isChordTone('G', chordI) === true, 'G es chord tone de C mayor');
assert(isChordTone('D', chordI) === false, 'D no es chord tone de tríada C mayor');
assert(isChordTone('F#', chordI) === false, 'F# no es chord tone de C mayor');

// 7.2 Acento métrico
assert(getMetricAccent(1.0, [4, 4]) === 'strong', 'Pulso 1.0 en 4/4 es strong (downbeat)');
assert(getMetricAccent(3.0, [4, 4]) === 'medium', 'Pulso 3.0 en 4/4 es medium (acento secundario)');
assert(getMetricAccent(2.0, [4, 4]) === 'weak', 'Pulso 2.0 en 4/4 es weak');
assert(getMetricAccent(2.5, [4, 4]) === 'weak', 'Subdivisión 2.5 en 4/4 es weak');
assert(getMetricAccent(1.0, [6, 8]) === 'strong', 'Pulso 1.0 en 6/8 es strong');
assert(getMetricAccent(2.5, [6, 8]) === 'medium', 'Pulso 2.5 en 6/8 (offset 1.5 negras) es medium');

// 7.3 Factor armónico en tiempo fuerte vs tiempo débil
const stabRootStrong = getMelodicStability(60, chordI, 'major', { beat: 1.0 }); // C4 en tiempo fuerte
assert(stabRootStrong.isChordTone === true, 'C4 en tiempo 1 es chord tone');
assert(stabRootStrong.role === 'root', 'C4 rol es root');
assert(stabRootStrong.perceptualStability === 'very_stable', 'C4 en tiempo fuerte es very_stable');
assert(stabRootStrong.stabilityScore === 1.0, 'C4 en tiempo fuerte tiene score 1.0');

const stabRootWeak = getMelodicStability(60, chordI, 'major', { beat: 2.0 }); // C4 en tiempo débil
assert(stabRootWeak.perceptualStability === 'stable', 'C4 en tiempo débil es stable (no very_stable)');
assert(stabRootWeak.stabilityScore === 0.9, 'C4 en tiempo débil tiene score 0.9');

// 7.4 Nota de Paso no acentuada (Unaccented Passing Tone): C4 (60) -> D4 (62, beat 2) -> E4 (64, beat 3)
const stabPassing = getMelodicStability(62, chordI, 'major', {
  beat: 2.0,
  prevNoteMidi: 60,
  nextNoteMidi: 64,
});
assert(stabPassing.isChordTone === false, 'D4 no es chord tone');
assert(stabPassing.role === 'passing_tone', `D4 rol es passing_tone (obtenido: ${stabPassing.role})`);
assert(stabPassing.resolvesByStep === true, 'D4 resuelve por paso conjunto a E4 (chord tone)');
assert(stabPassing.label === 'Unaccented Passing Tone', `D4 etiqueta es Unaccented Passing Tone (obtenido: ${stabPassing.label})`);
assert(stabPassing.perceptualStability === 'ornamental_stable', 'D4 nota de paso débil es ornamental_stable');

// 7.5 Nota de Paso acentuada (Accented Passing Tone): C4 (60) -> D4 (62, beat 1) -> E4 (64, beat 2)
const stabAccPassing = getMelodicStability(62, chordI, 'major', {
  beat: 1.0,
  prevNoteMidi: 60,
  nextNoteMidi: 64,
});
assert(stabAccPassing.role === 'passing_tone', 'D4 en beat 1 es passing_tone');
assert(stabAccPassing.label === 'Accented Passing Tone', 'D4 en beat 1 es Accented Passing Tone');
assert(stabAccPassing.perceptualStability === 'tense_unresolved', 'Nota de paso acentuada crea tensión (tense_unresolved)');

// 7.6 Bordadura superior (Upper Neighbor Tone): E4 (64) -> F4 (65, beat 2) -> E4 (64)
const stabUpperNeighbor = getMelodicStability(65, chordI, 'major', {
  beat: 2.0,
  prevNoteMidi: 64,
  nextNoteMidi: 64,
});
assert(stabUpperNeighbor.role === 'neighbor_tone', 'F4 es neighbor_tone');
assert(stabUpperNeighbor.label === 'Upper Neighbor Tone', `F4 es Upper Neighbor Tone (obtenido: ${stabUpperNeighbor.label})`);
assert(stabUpperNeighbor.resolvesByStep === true, 'F4 resuelve por paso conjunto retornando a E4');

// 7.7 Bordadura inferior (Lower Neighbor Tone): E4 (64) -> D4 (62, beat 2) -> E4 (64)
const stabLowerNeighbor = getMelodicStability(62, chordI, 'major', {
  beat: 2.0,
  prevNoteMidi: 64,
  nextNoteMidi: 64,
});
assert(stabLowerNeighbor.role === 'neighbor_tone', 'D4 es neighbor_tone');
assert(stabLowerNeighbor.label === 'Lower Neighbor Tone', `D4 es Lower Neighbor Tone (obtenido: ${stabLowerNeighbor.label})`);

// 7.8 Suspensión (Suspension): F4 (65) ligado en beat 1 -> resuelve a E4 (64)
const stabSuspension = getMelodicStability(65, chordI, 'major', {
  beat: 1.0,
  prevNoteMidi: 65,
  nextNoteMidi: 64,
});
assert(stabSuspension.role === 'suspension', `F4 ligado en beat 1 es suspension (obtenido: ${stabSuspension.role})`);
assert(stabSuspension.perceptualStability === 'tense_unresolved', 'Suspensión en tiempo fuerte es tense_unresolved');
assert(stabSuspension.resolvesByStep === true, 'Suspensión resuelve por paso descendente a E4');

// ────────────────────────────────────────────────────────────────────────────
// 8. MEZCLA MODAL Y DETECCIÓN AUTOMÁTICA (SPEC SECCIÓN 5.3)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Mezcla Modal y Detección Automática (Spec Sec. 5.3):');

// 8.1 Préstamo explícito preservado
const mixExplicit = detectModalMixture('minor', 'C', 'major', 8, 'maj', 6);
assert(mixExplicit.isBorrowed === true, 'Préstamo explícito es detectado');
assert(mixExplicit.provenance === 'explicit', 'Procedencia es explicit');
assert(mixExplicit.borrowedMode === 'minor', 'Modo prestado es minor');
assert(!mixExplicit.isAmbiguous, 'No es ambiguo al ser explícito');

// 8.2 Detección automática en Do Mayor: bVI (Ab mayor, root 8, maj)
const mixAb = detectModalMixture(undefined, 'C', 'major', 8, 'maj', 6);
assert(mixAb.isBorrowed === true, 'Ab en C mayor es detectado como préstamo automático');
assert(mixAb.provenance === 'inferred', 'Procedencia es inferred');
assert(mixAb.borrowedMode === 'minor', `Ab en C mayor asigna modo preferente minor (obtenido: ${mixAb.borrowedMode})`);
assert(mixAb.candidateModes.includes('minor') && mixAb.candidateModes.includes('phrygian'), 'Ab candidatos incluyen minor y phrygian');
assert(mixAb.isAmbiguous === true, 'Ab tiene ambigüedad documentada entre modos compatibles');

// 8.3 Detección automática en Do Mayor: bII (Db mayor, root 1, maj - Acorde Napolitano)
const mixDb = detectModalMixture(undefined, 'C', 'major', 1, 'maj', 2);
assert(mixDb.isBorrowed === true, 'Db en C mayor es detectado como préstamo');
assert(mixDb.borrowedMode === 'phrygian', `Db en C mayor asigna phrygian (napolitano) (obtenido: ${mixDb.borrowedMode})`);
assert(mixDb.candidateModes.includes('phrygian'), 'Db candidatos incluyen phrygian');

// 8.4 Detección automática en Do Mayor: iv (Fm, root 5, min - Subdominante menor)
const mixFm = detectModalMixture(undefined, 'C', 'major', 5, 'min', 4);
assert(mixFm.isBorrowed === true, 'Fm en C mayor es detectado como préstamo');
assert(mixFm.borrowedMode === 'minor', `Fm en C mayor asigna minor (obtenido: ${mixFm.borrowedMode})`);

// 8.5 Detección automática en Do Mayor: bVII (Bb mayor, root 10, maj)
const mixBb = detectModalMixture(undefined, 'C', 'major', 10, 'maj', 7);
assert(mixBb.isBorrowed === true, 'Bb en C mayor es detectado como préstamo');
assert(mixBb.candidateModes.includes('mixolydian') && mixBb.candidateModes.includes('minor'), 'Bb candidatos incluyen mixolydian y minor');
assert(mixBb.isAmbiguous === true, 'Bb tiene ambigüedad entre mixolydian, minor y dorian');

// 8.6 Acorde diatónico nativo no se marca como préstamo
const mixDiatonic = detectModalMixture(undefined, 'C', 'major', 0, 'maj', 1);
assert(mixDiatonic.isBorrowed === false, 'C en C mayor no es préstamo');
assert(mixDiatonic.provenance === 'none', 'Procedencia diatónica es none');

// 8.7 Integración canónica de mezcla modal en parseHookpadChord (Ab sin metadato explícito)
const chordAbAuto = parseHookpadChord({ root: 'b6', type: 5 }, 'C');
assert(chordAbAuto.borrowed === 'minor', `Ab sin metadato infiere borrowed minor en UniversalChord (obtenido: ${chordAbAuto.borrowed})`);
assert(chordAbAuto.ir?.secondary.borrowed?.isBorrowed === true, 'CanonicalChordIR contiene secondary.borrowed');
assert(chordAbAuto.ir?.secondary.borrowed?.provenance === 'inferred', 'CanonicalChordIR secondary.borrowed es inferred');
assert(chordAbAuto.ir?.secondary.borrowed?.isAmbiguous === true, 'CanonicalChordIR secondary.borrowed registra ambigüedad');

// ────────────────────────────────────────────────────────────────────────────
// 9. RESOLUCIÓN DE ACORDES APLICADOS Y DIATÓNICOS (V/ii, ii, V7/ii, ii7)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Resolución de Acordes Aplicados y Diatónicos (V/ii, ii, V7/ii, ii7, Slash Chords):');

// 9.1 Caso de Referencia en Do Mayor: V/ii (Dominante del 2º grado -> La Mayor)
const vOfIiC = parseHookpadChord({ root: 5, applied: 2, type: 5 }, 'C', 'major');
assert(vOfIiC.root === 'A', `V/ii en C: raíz debe ser A (obtenido: ${vOfIiC.root})`);
assert(vOfIiC.quality === 'maj', `V/ii en C: cualidad debe ser maj (obtenido: ${vOfIiC.quality})`);
assert(vOfIiC.symbol === 'A', `V/ii en C: símbolo debe ser A (obtenido: ${vOfIiC.symbol})`);
assert(vOfIiC.roman === 'V/ii', `V/ii en C: romano debe ser V/ii (obtenido: ${vOfIiC.roman})`);
assert(vOfIiC.bass === 'A', `V/ii en C: bajo debe ser A (obtenido: ${vOfIiC.bass})`);
assert(vOfIiC.appliedTarget === 2, `V/ii en C: appliedTarget debe ser 2 (obtenido: ${vOfIiC.appliedTarget})`);
assert(vOfIiC.appliedFunctionDegree === 5, `V/ii en C: appliedFunctionDegree debe ser 5 (obtenido: ${vOfIiC.appliedFunctionDegree})`);
assert(vOfIiC.notes.some(n => n.startsWith('A')), `V/ii en C: notas contienen La (A)`);
assert(vOfIiC.notes.some(n => n.startsWith('C#')), `V/ii en C: notas contienen Do# (C#)`);
assert(vOfIiC.notes.some(n => n.startsWith('E')), `V/ii en C: notas contienen Mi (E)`);

// 9.2 Caso de Referencia en Do Mayor: ii (Segundo grado diatónico -> Re Menor)
const iiC = parseHookpadChord({ root: 2, type: 5 }, 'C', 'major');
assert(iiC.root === 'D', `ii en C: raíz debe ser D (obtenido: ${iiC.root})`);
assert(iiC.quality === 'min', `ii en C: cualidad debe ser min (obtenido: ${iiC.quality})`);
assert(iiC.symbol === 'Dm', `ii en C: símbolo debe ser Dm (obtenido: ${iiC.symbol})`);
assert(iiC.roman === 'ii', `ii en C: romano debe ser ii (obtenido: ${iiC.roman})`);
assert(iiC.bass === 'D', `ii en C: bajo debe ser D (obtenido: ${iiC.bass})`);
assert(!iiC.applied || String(iiC.applied) === '0', `ii en C: no debe ser acorde aplicado`);
assert(iiC.notes.some(n => n.startsWith('D')), `ii en C: notas contienen Re (D)`);
assert(iiC.notes.some(n => n.startsWith('F') && !n.startsWith('F#')), `ii en C: notas contienen Fa natural (F)`);
assert(iiC.notes.some(n => n.startsWith('A')), `ii en C: notas contienen La (A)`);

// 9.3 Caso de Referencia en Do Mayor: V7/ii (Dominante con séptima -> La 7)
const v7OfIiC = parseHookpadChord({ root: 5, applied: 2, type: 7 }, 'C', 'major');
assert(v7OfIiC.root === 'A', `V7/ii en C: raíz debe ser A (obtenido: ${v7OfIiC.root})`);
assert(v7OfIiC.quality === 'dom7', `V7/ii en C: cualidad debe ser dom7 (obtenido: ${v7OfIiC.quality})`);
assert(v7OfIiC.symbol === 'A7', `V7/ii en C: símbolo debe ser A7 (obtenido: ${v7OfIiC.symbol})`);
assert(v7OfIiC.roman === 'V⁷/ii', `V7/ii en C: romano debe ser V⁷/ii (obtenido: ${v7OfIiC.roman})`);
assert(v7OfIiC.appliedTarget === 2, `V7/ii en C: appliedTarget debe ser 2 (obtenido: ${v7OfIiC.appliedTarget})`);
assert(v7OfIiC.notes.some(n => n.startsWith('A')), `V7/ii en C: notas contienen La (A)`);
assert(v7OfIiC.notes.some(n => n.startsWith('C#')), `V7/ii en C: notas contienen Do# (C#)`);
assert(v7OfIiC.notes.some(n => n.startsWith('E')), `V7/ii en C: notas contienen Mi (E)`);
assert(v7OfIiC.notes.some(n => n.startsWith('G')), `V7/ii en C: notas contienen Sol (G)`);

// 9.4 Caso de Referencia en Do Mayor: ii7 (Segundo grado con séptima -> Re menor 7)
const ii7C = parseHookpadChord({ root: 2, type: 7 }, 'C', 'major');
assert(ii7C.root === 'D', `ii7 en C: raíz debe ser D (obtenido: ${ii7C.root})`);
assert(ii7C.quality === 'min7', `ii7 en C: cualidad debe ser min7 (obtenido: ${ii7C.quality})`);
assert(ii7C.symbol === 'Dm7', `ii7 en C: símbolo debe ser Dm7 (obtenido: ${ii7C.symbol})`);
assert(ii7C.roman === 'ii⁷', `ii7 en C: romano debe ser ii⁷ (obtenido: ${ii7C.roman})`);
assert(ii7C.notes.some(n => n.startsWith('D')), `ii7 en C: notas contienen Re (D)`);
assert(ii7C.notes.some(n => n.startsWith('F') && !n.startsWith('F#')), `ii7 en C: notas contienen Fa (F)`);
assert(ii7C.notes.some(n => n.startsWith('A')), `ii7 en C: notas contienen La (A)`);
assert(ii7C.notes.some(n => n.startsWith('C')), `ii7 en C: notas contienen Do (C)`);

// 9.5 Verificación de progresión completa V/ii -> ii mediante parseHookpadSection
const hookpadJsonC = JSON.stringify({
  tonic: 'C',
  scale: 'major',
  bpm: 120,
  chords: [
    { root: 5, applied: 2, type: 5, beat: 1, duration: 2 },
    { root: 2, type: 5, beat: 3, duration: 2 }
  ]
});
const sectionC = parseHookpadSection(hookpadJsonC);
assert(sectionC.chords.length === 2, `Sección contiene 2 acordes`);
assert(sectionC.chords[0].symbol === 'A', `Progresión Acorde 1: símbolo es A (obtenido: ${sectionC.chords[0].symbol})`);
assert(sectionC.chords[0].roman === 'V/ii', `Progresión Acorde 1: romano es V/ii (obtenido: ${sectionC.chords[0].roman})`);
assert(sectionC.chords[0].root === 'A', `Progresión Acorde 1: raíz es A (obtenido: ${sectionC.chords[0].root})`);
assert(sectionC.chords[1].symbol === 'Dm', `Progresión Acorde 2: símbolo es Dm (obtenido: ${sectionC.chords[1].symbol})`);
assert(sectionC.chords[1].roman === 'ii', `Progresión Acorde 2: romano es ii (obtenido: ${sectionC.chords[1].roman})`);
assert(sectionC.chords[1].root === 'D', `Progresión Acorde 2: raíz es D (obtenido: ${sectionC.chords[1].root})`);
assert(sectionC.chords[0].beat < sectionC.chords[1].beat, `Orden temporal preservado estrictamente: V/ii antes de ii`);

// 9.6 Verificación en Sol Mayor (G major):
// En G mayor: ii es Am (A-C-E), V/ii es E mayor (E-G#-B)
const vOfIiG = parseHookpadChord({ root: 5, applied: 2, type: 5 }, 'G', 'major');
assert(vOfIiG.root === 'E', `V/ii en G: raíz debe ser E (obtenido: ${vOfIiG.root})`);
assert(vOfIiG.quality === 'maj', `V/ii en G: cualidad debe ser maj`);
assert(vOfIiG.symbol === 'E', `V/ii en G: símbolo debe ser E (obtenido: ${vOfIiG.symbol})`);
assert(vOfIiG.roman === 'V/ii', `V/ii en G: romano debe ser V/ii (obtenido: ${vOfIiG.roman})`);
assert(vOfIiG.notes.some(n => n.startsWith('E')), `V/ii en G: notas contienen Mi (E)`);
assert(vOfIiG.notes.some(n => n.startsWith('G#')), `V/ii en G: notas contienen Sol# (G#)`);
assert(vOfIiG.notes.some(n => n.startsWith('B')), `V/ii en G: notas contienen Si (B)`);

const iiG = parseHookpadChord({ root: 2, type: 5 }, 'G', 'major');
assert(iiG.root === 'A', `ii en G: raíz debe ser A (obtenido: ${iiG.root})`);
assert(iiG.quality === 'min', `ii en G: cualidad debe ser min`);
assert(iiG.symbol === 'Am', `ii en G: símbolo debe ser Am (obtenido: ${iiG.symbol})`);
assert(iiG.roman === 'ii', `ii en G: romano debe ser ii (obtenido: ${iiG.roman})`);

const v7OfIiG = parseHookpadChord({ root: 5, applied: 2, type: 7 }, 'G', 'major');
assert(v7OfIiG.root === 'E', `V7/ii en G: raíz debe ser E`);
assert(v7OfIiG.symbol === 'E7', `V7/ii en G: símbolo debe ser E7 (obtenido: ${v7OfIiG.symbol})`);
assert(v7OfIiG.roman === 'V⁷/ii', `V7/ii en G: romano debe ser V⁷/ii (obtenido: ${v7OfIiG.roman})`);

// 9.7 Verificación en Fa Mayor (F major):
// En F mayor: ii es Gm (G-Bb-D), V/ii es D mayor (D-F#-A)
const vOfIiF = parseHookpadChord({ root: 5, applied: 2, type: 5 }, 'F', 'major');
assert(vOfIiF.root === 'D', `V/ii en F: raíz debe ser D (obtenido: ${vOfIiF.root})`);
assert(vOfIiF.quality === 'maj', `V/ii en F: cualidad debe ser maj`);
assert(vOfIiF.symbol === 'D', `V/ii en F: símbolo debe ser D (obtenido: ${vOfIiF.symbol})`);
assert(vOfIiF.roman === 'V/ii', `V/ii en F: romano debe ser V/ii (obtenido: ${vOfIiF.roman})`);
assert(vOfIiF.notes.some(n => n.startsWith('D')), `V/ii en F: notas contienen Re (D)`);
assert(vOfIiF.notes.some(n => n.startsWith('F#')), `V/ii en F: notas contienen Fa# (F#)`);
assert(vOfIiF.notes.some(n => n.startsWith('A')), `V/ii en F: notas contienen La (A)`);

const iiF = parseHookpadChord({ root: 2, type: 5 }, 'F', 'major');
assert(iiF.root === 'G', `ii en F: raíz debe ser G (obtenido: ${iiF.root})`);
assert(iiF.quality === 'min', `ii en F: cualidad debe ser min`);
assert(iiF.symbol === 'Gm', `ii en F: símbolo debe ser Gm (obtenido: ${iiF.symbol})`);
assert(iiF.roman === 'ii', `ii en F: romano debe ser ii (obtenido: ${iiF.roman})`);

// 9.8 Verificación en Re Mayor (D major):
// En D mayor: ii es Em (E-G-B), V/ii es B mayor (B-D#-F#)
const vOfIiD = parseHookpadChord({ root: 5, applied: 2, type: 5 }, 'D', 'major');
assert(vOfIiD.root === 'B', `V/ii en D: raíz debe ser B (obtenido: ${vOfIiD.root})`);
assert(vOfIiD.quality === 'maj', `V/ii en D: cualidad debe ser maj`);
assert(vOfIiD.symbol === 'B', `V/ii en D: símbolo debe ser B (obtenido: ${vOfIiD.symbol})`);
assert(vOfIiD.roman === 'V/ii', `V/ii en D: romano debe ser V/ii (obtenido: ${vOfIiD.roman})`);
assert(vOfIiD.notes.some(n => n.startsWith('B')), `V/ii en D: notas contienen Si (B)`);
assert(vOfIiD.notes.some(n => n.startsWith('D#')), `V/ii en D: notas contienen Re# (D#)`);
assert(vOfIiD.notes.some(n => n.startsWith('F#')), `V/ii en D: notas contienen Fa# (F#)`);

const iiD = parseHookpadChord({ root: 2, type: 5 }, 'D', 'major');
assert(iiD.root === 'E', `ii en D: raíz debe ser E (obtenido: ${iiD.root})`);
assert(iiD.quality === 'min', `ii en D: cualidad debe ser min`);
assert(iiD.symbol === 'Em', `ii en D: símbolo debe ser Em (obtenido: ${iiD.symbol})`);
assert(iiD.roman === 'ii', `ii en D: romano debe ser ii (obtenido: ${iiD.roman})`);

// 9.9 Acordes con barra explícitos (Slash Chords) no se confunden con acordes aplicados:
// En Re Mayor: V en 1ª inversión es A/C# (la fundamental es A, el bajo es la 3ª C#)
const slashAoverCSharpInD = parseHookpadChord({ root: 5, inversion: 1, type: 5 }, 'D', 'major');
assert(slashAoverCSharpInD.symbol === 'A/C#', `Slash chord A/C# (V6 en D): símbolo es A/C# (obtenido: ${slashAoverCSharpInD.symbol})`);
assert(slashAoverCSharpInD.bass === 'C#' || slashAoverCSharpInD.bassNote === 'C#', `A/C#: bajo es C#`);
assert(!slashAoverCSharpInD.applied || String(slashAoverCSharpInD.applied) === '0', `Slash chord A/C#: NO tiene applied chord`);
assert(!slashAoverCSharpInD.roman.includes('/ii'), `Slash chord A/C#: romano NO contiene /ii (obtenido: ${slashAoverCSharpInD.roman})`);
assert(slashAoverCSharpInD.roman === 'V⁶', `Slash chord A/C#: romano es V⁶ (obtenido: ${slashAoverCSharpInD.roman})`);

// En Do Mayor: I en 1ª inversión es C/E (fundamental C, bajo E)
const slashCoverE = parseHookpadChord({ root: 1, inversion: 1, type: 5 }, 'C', 'major');
assert(slashCoverE.bass === 'E', `C/E: bajo es E (obtenido: ${slashCoverE.bass})`);
assert(slashCoverE.symbol === 'C/E', `C/E: símbolo es C/E (obtenido: ${slashCoverE.symbol})`);
assert(slashCoverE.roman === 'I⁶', `C/E: romano es I⁶ (obtenido: ${slashCoverE.roman})`);
assert(!slashCoverE.applied || String(slashCoverE.applied) === '0', `C/E: NO tiene applied chord`);

// En Do Mayor: V/ii en 1ª inversión es V6/ii con símbolo A/C#
// Demuestra que el slash del símbolo (/C#) denota el bajo, mientras que el slash del romano (/ii) denota el objetivo aplicado
const slashV6ofIi = parseHookpadChord({ root: 5, applied: 2, inversion: 1, type: 5 }, 'C', 'major');
assert(slashV6ofIi.symbol === 'A/C#', `V6/ii: símbolo es A/C# (obtenido: ${slashV6ofIi.symbol})`);
assert(slashV6ofIi.roman === 'V⁶/ii', `V6/ii: romano es V⁶/ii (obtenido: ${slashV6ofIi.roman})`);
assert(slashV6ofIi.bass === 'C#', `V6/ii: bajo es C# (obtenido: ${slashV6ofIi.bass})`);
assert(slashV6ofIi.appliedTarget === 2, `V6/ii: objetivo aplicado es grado 2 (ii)`);

// 9.10 Acordes Diatónicos Ordinarios no se ven alterados:
const diatonicV = parseHookpadChord({ root: 5, type: 5 }, 'C', 'major');
assert(diatonicV.root === 'G', `V diatónico en C: raíz es G (obtenido: ${diatonicV.root})`);
assert(diatonicV.quality === 'maj', `V diatónico en C: cualidad es maj`);
assert(diatonicV.symbol === 'G', `V diatónico en C: símbolo es G (obtenido: ${diatonicV.symbol})`);
assert(diatonicV.roman === 'V', `V diatónico en C: romano es V (obtenido: ${diatonicV.roman})`);
assert(!diatonicV.applied || String(diatonicV.applied) === '0', `V diatónico: sin applied`);

const diatonicV7 = parseHookpadChord({ root: 5, type: 7 }, 'C', 'major');
assert(diatonicV7.root === 'G', `V7 diatónico en C: raíz es G (obtenido: ${diatonicV7.root})`);
assert(diatonicV7.quality === 'dom7', `V7 diatónico en C: cualidad es dom7`);
assert(diatonicV7.symbol === 'G7', `V7 diatónico en C: símbolo es G7 (obtenido: ${diatonicV7.symbol})`);
assert(diatonicV7.roman === 'V⁷', `V7 diatónico en C: romano es V⁷ (obtenido: ${diatonicV7.roman})`);

// ────────────────────────────────────────────────────────────────────────────
// RESULTADOS FINALES
// ────────────────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`THEORY ENGINE RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`THEORY ENGINE TESTS FAILED: ${failed} assertion(s) failed`);
}
