import {
  resolveChordsWithVoiceLeading,
  isBassOnlyChange,
} from './voiceLeading';
import {
  parseHookpadChord,
  buildIntermediateChord,
} from './theoryEngine';
import type { UniversalChord } from '../types/music';

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

console.log('=== TEST SUITE: Voice Leading & Bass Decoupling ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. SECUENCIA DE REFERENCIA EN LA MAYOR: A -> A/G# -> f#m7 -> Fmaj7(#5)
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Secuencia de Referencia en La Mayor (A -> A/G# -> f#m7 -> Fmaj7(#5)):');

const keyA = { tonic: 'A', scale: 'major' as const };

const rawSeqA: UniversalChord[] = [
  parseHookpadChord({ root: 1, type: 5, inversion: 0, beat: 1, duration: 4 }, keyA), // A
  parseHookpadChord({ root: 1, type: 7, quality: 'maj7', inversion: 3, beat: 5, duration: 4 }, keyA), // A/G# (I^Δ42)
  parseHookpadChord({ root: 6, type: 7, quality: 'min7', inversion: 0, beat: 9, duration: 4 }, keyA), // f#m7 (vi7)
  parseHookpadChord({ root: 6, type: 7, quality: 'maj7', alterations: ['#5'], borrowed: 'minor', beat: 13, duration: 4 }, keyA), // Fmaj7(#5)
];

// Test 1.1: Detección de cambio exclusivo de bajo entre A y A/G#
const modelA = buildIntermediateChord(rawSeqA[0], keyA);
const modelAGsharp = buildIntermediateChord(rawSeqA[1], keyA);
const isBassOnly = isBassOnlyChange(modelA, modelAGsharp);
assert(isBassOnly === true, 'isBassOnlyChange detecta cambio exclusivo de bajo entre A y A/G#');

// Test 1.2: En La Mayor, el bajo de I^Δ42 es estrictamente G# (MIDI 44 = G#2), NO G natural (43)
const resolvedChords = resolveChordsWithVoiceLeading(rawSeqA, () => keyA, 3);

const chordA = resolvedChords[0];
const chordAGsharp = resolvedChords[1];
const chordFsharpMin7 = resolvedChords[2];
const chordFmaj7Sharp5 = resolvedChords[3];

assert(chordAGsharp.voices.find(v => v.isBass)?.noteLabel === 'G#', `Bajo de A/G# es estrictamente G# (obtenido: ${chordAGsharp.voices.find(v => v.isBass)?.noteLabel})`);
assert(chordAGsharp.voices.find(v => v.isBass)?.midi === 44, `Altura MIDI del bajo G#2 es 44 (obtenido: ${chordAGsharp.voices.find(v => v.isBass)?.midi})`);

// Test 1.3: Cliché descendente de bajo continuo en registro grave: A2 (45) -> G#2 (44) -> F#2 (42) -> F2 (41)
const bassMidis = resolvedChords.map(c => c.voices.find(v => v.isBass)?.midi);
console.log('    Bass line midis:', bassMidis);
assert(bassMidis[0] === 45, `Bajo 1 es A2 (45)`);
assert(bassMidis[1] === 44, `Bajo 2 es G#2 (44)`);
assert(bassMidis[2] === 42, `Bajo 3 es F#2 (42)`);
assert(bassMidis[3] === 41, `Bajo 4 es F2 (41)`);

// Test 1.4: Invarianza del bloque superior en A -> A/G#
const upperA = chordA.voices.filter(v => !v.isBass).map(v => v.midi);
const upperAGsharp = chordAGsharp.voices.filter(v => !v.isBass).map(v => v.midi);
console.log('    Upper A:', upperA, 'Upper A/G#:', upperAGsharp);
assert(JSON.stringify(upperA) === JSON.stringify(upperAGsharp), 'Las notas superiores de A y A/G# son estrictamente idénticas en MIDI');

// Test 1.5: Conservación de notas comunes (C# = 61 y E = 64) en toda la progresión
const hasCsharp61InAll = resolvedChords.every(c => c.voices.filter(v => !v.isBass).some(v => v.midi === 61));
const hasE64InAll = resolvedChords.every(c => c.voices.filter(v => !v.isBass).some(v => v.midi === 64));
assert(hasCsharp61InAll, 'C#4 (MIDI 61) se conserva constante en el bloque superior a lo largo de toda la secuencia');
assert(hasE64InAll, 'E4 (MIDI 64) se conserva constante en el bloque superior a lo largo de toda la secuencia');

// ────────────────────────────────────────────────────────────────────────────
// 2. CASO 1: MISMO ACORDE CON BAJO DIFERENTE (Inversiones Consecutivas C -> C/E -> C/G -> C)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Caso 1: Inversiones Consecutivas del Mismo Acorde (C -> C/E -> C/G -> C):');

const keyC = { tonic: 'C', scale: 'major' as const };
const seqInversions: UniversalChord[] = [
  parseHookpadChord({ root: 1, type: 5, inversion: 0, beat: 1, duration: 4 }, keyC), // C
  parseHookpadChord({ root: 1, type: 5, inversion: 1, beat: 5, duration: 4 }, keyC), // C/E
  parseHookpadChord({ root: 1, type: 5, inversion: 2, beat: 9, duration: 4 }, keyC), // C/G
  parseHookpadChord({ root: 1, type: 5, inversion: 0, beat: 13, duration: 4 }, keyC), // C
];

const resInversions = resolveChordsWithVoiceLeading(seqInversions, () => keyC, 3);
const invUpper0 = resInversions[0].voices.filter(v => !v.isBass).map(v => v.midi);
const invUpper1 = resInversions[1].voices.filter(v => !v.isBass).map(v => v.midi);
const invUpper2 = resInversions[2].voices.filter(v => !v.isBass).map(v => v.midi);
const invUpper3 = resInversions[3].voices.filter(v => !v.isBass).map(v => v.midi);

assert(JSON.stringify(invUpper0) === JSON.stringify(invUpper1), 'Upper voices C == C/E');
assert(JSON.stringify(invUpper1) === JSON.stringify(invUpper2), 'Upper voices C/E == C/G');
assert(JSON.stringify(invUpper2) === JSON.stringify(invUpper3), 'Upper voices C/G == C');

const invBassMidis = resInversions.map(c => c.voices.find(v => v.isBass)?.midi);
console.log('    Inversion bass line:', invBassMidis);
assert(invBassMidis[0] === 36, 'Bajo C es C2 (36)');
assert(invBassMidis[1] === 40, 'Bajo C/E es E2 (40)');
assert(invBassMidis[2] === 43, 'Bajo C/G es G2 (43)');
assert(invBassMidis[3] === 36, 'Bajo C final es C2 (36)');

// ────────────────────────────────────────────────────────────────────────────
// 3. CASO 2: CAMBIO ARMÓNICO CON DOS O MÁS NOTAS COMUNES (C -> Am)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Caso 2: Cambio Armónico con Notas Comunes (C -> Am):');

const seqCommon: UniversalChord[] = [
  parseHookpadChord({ root: 1, type: 5, inversion: 0, beat: 1, duration: 4 }, keyC), // C (C-E-G)
  parseHookpadChord({ root: 6, type: 5, inversion: 0, beat: 5, duration: 4 }, keyC), // Am (A-C-E)
];

const resCommon = resolveChordsWithVoiceLeading(seqCommon, () => keyC, 3);
const cUpper = resCommon[0].voices.filter(v => !v.isBass).map(v => v.midi);
const amUpper = resCommon[1].voices.filter(v => !v.isBass).map(v => v.midi);
console.log('    C upper:', cUpper, 'Am upper:', amUpper);

const cInC = cUpper.find(m => m % 12 === 0);
const cInAm = amUpper.find(m => m % 12 === 0);
assert(cInC !== undefined && cInC === cInAm, `Nota común C conservada en MIDI ${cInC}`);

const eInC = cUpper.find(m => m % 12 === 4);
const eInAm = amUpper.find(m => m % 12 === 4);
assert(eInC !== undefined && eInC === eInAm, `Nota común E conservada en MIDI ${eInC}`);

const gInC = cUpper.find(m => m % 12 === 7);
const aInAm = amUpper.find(m => m % 12 === 9);
const gToADistance = Math.abs((aInAm || 0) - (gInC || 0));
assert(gToADistance === 2, `Movimiento mínimo G -> A de exactamente 2 semitonos (distancia: ${gToADistance})`);

// ────────────────────────────────────────────────────────────────────────────
// 4. CASO 3: SALTO ARMÓNICO SIN NOTAS COMUNES (F -> G en Do Mayor)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Caso 3: Salto Armónico sin Notas Comunes (F -> G en Do Mayor):');

const seqNoCommon: UniversalChord[] = [
  parseHookpadChord({ root: 4, type: 5, inversion: 0, beat: 1, duration: 4 }, keyC), // F (F-A-C: 5, 9, 0)
  parseHookpadChord({ root: 5, type: 5, inversion: 0, beat: 5, duration: 4 }, keyC), // G (G-B-D: 7, 11, 2)
];

const resNoCommon = resolveChordsWithVoiceLeading(seqNoCommon, () => keyC, 3);
const fUpper = resNoCommon[0].voices.filter(v => !v.isBass).map(v => v.midi);
const gUpper = resNoCommon[1].voices.filter(v => !v.isBass).map(v => v.midi);
console.log('    F upper:', fUpper, 'G upper:', gUpper);

const maxStep = Math.max(...fUpper.map((fm, i) => Math.abs(gUpper[i] - fm)));
console.log('    Máximo salto de voz:', maxStep);
assert(maxStep <= 4, `Movimiento por pasos mínimos en salto armónico: salto máximo es ${maxStep} semitonos (<= 4)`);

const gCog = gUpper.reduce((s, m) => s + m, 0) / gUpper.length;
assert(gCog >= 50 && gCog <= 70, `Inercia de tesitura respetada (Centro de gravedad: ${gCog.toFixed(1)} en [50..70])`);

// ────────────────────────────────────────────────────────────────────────────
// 5. SINCRONIZACIÓN Y COHERENCIA: MODELO, CANVAS Y REPRODUCCIÓN
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Sincronización y Coherencia (Modelo, Canvas y WebAudio):');

for (const c of resolvedChords) {
  const voiceMidis = c.voices.map(v => v.midi);
  const voicePitches = c.voices.map(v => v.pitch);

  assert(
    JSON.stringify(voiceMidis) === JSON.stringify(c.midiNotes),
    `Chord ${c.symbol}: voice midis coinciden exactamente con c.midiNotes`
  );
  assert(
    JSON.stringify(voicePitches) === JSON.stringify(c.notes),
    `Chord ${c.symbol}: voice pitches coinciden exactamente con c.notes`
  );
  assert(
    c.voices[0].isBass === true,
    `Chord ${c.symbol}: primera voz tiene flag isBass: true`
  );
  const uniqueMidis = new Set(c.midiNotes);
  assert(
    uniqueMidis.size === c.midiNotes.length,
    `Chord ${c.symbol}: no hay notas MIDI duplicadas`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 6. SOPORTE COMPLETO PARA ACORDES TYPE: 11 Y CASOS DE REGRESIÓN
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Soporte Completo para Acordes type: 11 de Hooktheory:');

// Regresión Caso 1: beat: 3, root: 1, type: 11, inversion: 0 en Do Mayor
const c11Raw1 = { beat: 3, root: 1, type: 11, inversion: 0, duration: 4 };
const chord11_1 = parseHookpadChord(c11Raw1, keyC);
const model11_1 = buildIntermediateChord(c11Raw1, keyC);

assert(chord11_1.type === 11, 'Caso 1 (beat 3): type: 11 no se degrada a type: 7');
assert(chord11_1.quality === 'maj7', `Caso 1: cualidad base resuelta es maj7 (obtenido: ${chord11_1.quality})`);
assert(model11_1.tones.some(t => t.degree === 11 && t.interval === 17), 'Caso 1: conserva grado interválico 11 como 17 semitonos');
const intervals1 = model11_1.tones.map(t => t.interval);
assert(JSON.stringify(intervals1) === JSON.stringify([0, 4, 7, 11, 14, 17]), `Caso 1: intervalos teóricos completos [0, 4, 7, 11, 14, 17] (obtenido: ${JSON.stringify(intervals1)})`);
assert(JSON.stringify(model11_1.effectivePitches) === JSON.stringify([0, 2, 4, 5, 7, 11]), `Caso 1: effectivePitches normalizados [0, 2, 4, 5, 7, 11] (obtenido: ${JSON.stringify(model11_1.effectivePitches)})`);
assert(chord11_1.roman === 'I^Δ¹¹', `Caso 1: número romano es I^Δ¹¹ (obtenido: ${chord11_1.roman})`);
assert(chord11_1.symbol === 'Cmaj11', `Caso 1: símbolo absoluto es Cmaj11 (obtenido: ${chord11_1.symbol})`);
assert(!chord11_1.symbol.includes('/'), 'Caso 1: no genera slash chord al tener inversion: 0');

// Regresión Caso 2: beat: 11, root: 1, type: 11, inversion: 0 en Do Mayor
const c11Raw2 = { beat: 11, root: 1, type: 11, inversion: 0, duration: 4 };
const chord11_2 = parseHookpadChord(c11Raw2, keyC);
assert(chord11_2.type === 11, 'Caso 2 (beat 11): type: 11 preservado');
assert(chord11_2.roman === 'I^Δ¹¹', `Caso 2: número romano es I^Δ¹¹ (obtenido: ${chord11_2.roman})`);
assert(chord11_2.symbol === 'Cmaj11', `Caso 2: símbolo absoluto es Cmaj11 (obtenido: ${chord11_2.symbol})`);

// Regresión Caso 3: beat: 19, root: 1, type: 11, inversion: 0 con contexto tonal en beat 17
const keyModulationG = { tonic: 'G', scale: 'major' as const };
const c11Raw3 = { beat: 19, root: 1, type: 11, inversion: 0, duration: 4 };
const chord11_3 = parseHookpadChord(c11Raw3, keyModulationG);
const model11_3 = buildIntermediateChord(c11Raw3, keyModulationG);

assert(chord11_3.type === 11, 'Caso 3 (beat 19 en Sol Mayor): type: 11 preservado');
assert(chord11_3.quality === 'maj7', `Caso 3: cualidad base en Sol Mayor es maj7`);
assert(chord11_3.roman === 'I^Δ¹¹', `Caso 3: número romano es I^Δ¹¹ (obtenido: ${chord11_3.roman})`);
assert(chord11_3.symbol === 'Gmaj11', `Caso 3: símbolo absoluto es Gmaj11 (obtenido: ${chord11_3.symbol})`);
assert(JSON.stringify(model11_3.effectivePitches) === JSON.stringify([0, 2, 6, 7, 9, 11]), `Caso 3: effectivePitches en Sol Mayor [0, 2, 6, 7, 9, 11] (obtenido: ${JSON.stringify(model11_3.effectivePitches)})`);

// Regresión Caso 3b: beat: 19 en contexto Menor (La Menor)
const keyModulationAm = { tonic: 'A', scale: 'minor' as const };
const chord11_3m = parseHookpadChord(c11Raw3, keyModulationAm);
assert(chord11_3m.type === 11, 'Caso 3b: type: 11 en La Menor preservado');
assert(chord11_3m.roman === 'i¹¹', `Caso 3b: número romano en La Menor es i¹¹ (obtenido: ${chord11_3m.roman})`);
assert(chord11_3m.symbol.toLowerCase() === 'am11', `Caso 3b: símbolo absoluto en La Menor es Am11 (obtenido: ${chord11_3m.symbol})`);

// Regresión Caso 4: beat: 39, root: 5, type: 11, inversion: 0 en Do Mayor
const c11Raw4 = { beat: 39, root: 5, type: 11, inversion: 0, duration: 4 };
const chord11_4 = parseHookpadChord(c11Raw4, keyC);
const model11_4 = buildIntermediateChord(c11Raw4, keyC);

assert(chord11_4.type === 11, 'Caso 4 (beat 39): type: 11 no se degrada a type: 7');
assert(chord11_4.quality === 'dom7', `Caso 4: cualidad base resuelta es dom7 (obtenido: ${chord11_4.quality})`);
assert(model11_4.tones.some(t => t.degree === 11 && t.interval === 17), 'Caso 4: undécima justa es intervalo 17 desde la raíz (G -> C)');
const intervals4 = model11_4.tones.map(t => t.interval);
assert(JSON.stringify(intervals4) === JSON.stringify([0, 4, 7, 10, 14, 17]), `Caso 4: intervalos completos dom11 [0, 4, 7, 10, 14, 17] (obtenido: ${JSON.stringify(intervals4)})`);
assert(JSON.stringify(model11_4.effectivePitches) === JSON.stringify([0, 2, 5, 7, 9, 11]), `Caso 4: effectivePitches normalizados [0, 2, 5, 7, 9, 11] (obtenido: ${JSON.stringify(model11_4.effectivePitches)})`);
assert(chord11_4.roman === 'V¹¹', `Caso 4: número romano es V¹¹ (obtenido: ${chord11_4.roman})`);
assert(chord11_4.symbol === 'G11', `Caso 4: símbolo absoluto es G11 (obtenido: ${chord11_4.symbol})`);
assert(!chord11_4.symbol.includes('/'), 'Caso 4: no genera slash chord al tener inversion: 0');

// Test 6.2: Voice Leading y asignación de notas MIDI en acordes de onceava
const seqWith11: UniversalChord[] = [
  parseHookpadChord({ root: 1, type: 5, inversion: 0, beat: 1, duration: 4 }, keyC),
  chord11_1,
  chord11_4,
];
const resolvedWith11 = resolveChordsWithVoiceLeading(seqWith11, () => keyC, 3);
const vlChord11_1 = resolvedWith11[1];
const vlChord11_4 = resolvedWith11[2];

assert(vlChord11_1.voices.some(v => v.voiceNumber === '11'), 'Voz de 11ª etiquetada con voiceNumber: "11" en Cmaj11');
assert(vlChord11_4.voices.some(v => v.voiceNumber === '11'), 'Voz de 11ª etiquetada con voiceNumber: "11" en G11');
assert(vlChord11_1.voices[0].isBass === true, 'Bajo de Cmaj11 tiene isBass: true');
assert(vlChord11_4.voices[0].isBass === true, 'Bajo de G11 tiene isBass: true');
assert(vlChord11_1.midiNotes.length === new Set(vlChord11_1.midiNotes).size, 'No hay notas MIDI duplicadas en Cmaj11');
assert(vlChord11_4.midiNotes.length === new Set(vlChord11_4.midiNotes).size, 'No hay notas MIDI duplicadas en G11');

// Test 6.3: Omisiones y alteraciones en acordes de onceava
const c11Omit3 = parseHookpadChord({ root: 5, type: 11, omits: [3], beat: 1, duration: 4 }, keyC);
const modelOmit3 = buildIntermediateChord(c11Omit3, keyC);
assert(!modelOmit3.tones.some(t => t.degree === 3), 'omits: [3] no incluye el grado 3 en tones');
assert(c11Omit3.symbol.includes('ⁿᵒ³'), `Símbolo refleja omisión no3 (obtenido: ${c11Omit3.symbol})`);

const c11Sharp11 = parseHookpadChord({ root: 4, type: 11, alterations: ['#11'], beat: 1, duration: 4 }, keyC);
const modelSharp11 = buildIntermediateChord(c11Sharp11, keyC);
const sharp11Tone = modelSharp11.tones.find(t => t.degree === 11);
assert(sharp11Tone?.interval === 18 && sharp11Tone.alteration === 1, 'alterations: ["#11"] produce intervalo 18 con alteración +1');

// Test 6.4: No regresión de acordes de 7ª
const chord7_V = parseHookpadChord({ root: 5, type: 7, inversion: 0, beat: 1, duration: 4 }, keyC);
assert(chord7_V.roman === 'V⁷', `V7 renderiza V⁷ (obtenido: ${chord7_V.roman})`);
assert(chord7_V.symbol === 'G7', `V7 renderiza G7 (obtenido: ${chord7_V.symbol})`);
assert(!buildIntermediateChord(chord7_V, keyC).tones.some(t => t.degree === 11), 'V7 no contiene grado 11');

const chord7_I = parseHookpadChord({ root: 1, type: 7, inversion: 0, beat: 1, duration: 4 }, keyC);
assert(chord7_I.roman === 'I^Δ⁷', `I7 en Mayor renderiza I^Δ⁷ (obtenido: ${chord7_I.roman})`);
assert(chord7_I.symbol === 'Cmaj7', `I7 en Mayor renderiza Cmaj7 (obtenido: ${chord7_I.symbol})`);

const chord7_ii = parseHookpadChord({ root: 2, type: 7, inversion: 0, beat: 1, duration: 4 }, keyC);
assert(chord7_ii.roman === 'ii⁷', `ii7 en Mayor renderiza ii⁷ (obtenido: ${chord7_ii.roman})`);
assert(chord7_ii.symbol === 'Dm7', `ii7 en Mayor renderiza Dm7 (obtenido: ${chord7_ii.symbol})`);

// ────────────────────────────────────────────────────────────────────────────
// 7. PRESERVACIÓN DE TYPE Y ADDS DE HOOKTHEORY (SIN SÉPTIMAS ACCIDENTALES)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Preservación de type y adds (Hooktheory):');

// 7.1: type: 5, adds: [9] en raíz 1 (Do Mayor)
const add9_I_raw = { root: 1, type: 5, inversion: 0, adds: [9], omits: [], alterations: [], suspensions: [] };
const add9_I = parseHookpadChord(add9_I_raw, keyC);
const model_add9_I = buildIntermediateChord(add9_I_raw, keyC);

assert(add9_I.type === 5, `Caso add9 I: type permanece 5 (obtenido: ${add9_I.type})`);
assert(model_add9_I.type === 5, `Caso add9 I: model.type permanece 5 (obtenido: ${model_add9_I.type})`);
assert(model_add9_I.tones.length === 4, `Caso add9 I: contiene exactamente 4 notas (obtenido: ${model_add9_I.tones.length})`);
assert(!model_add9_I.tones.some(t => t.degree === 7), 'Caso add9 I: NO contiene grado 7');
const add9_I_intervals = model_add9_I.tones.map(t => t.interval);
assert(JSON.stringify(add9_I_intervals) === JSON.stringify([0, 4, 7, 14]), `Caso add9 I: intervalos [0, 4, 7, 14] (obtenido: ${JSON.stringify(add9_I_intervals)})`);
assert(add9_I.roman === 'I⁽ᵃᵈᵈ⁹⁾', `Caso add9 I: número romano I⁽ᵃᵈᵈ⁹⁾ (obtenido: ${add9_I.roman})`);
assert(add9_I.symbol === 'C⁽add9⁾', `Caso add9 I: símbolo absoluto C⁽add9⁾ (obtenido: ${add9_I.symbol})`);
assert(!add9_I.roman.includes('⁹⁽') && !add9_I.roman.includes('9('), `Caso add9 I: no genera I9(add9) ni I⁹⁽ᵃᵈᵈ⁹⁾`);
assert(!add9_I.symbol.includes('maj9') && !add9_I.symbol.includes('C9'), `Caso add9 I: no genera Cmaj9 ni C9`);

// 7.2: type: 5, adds: [9] en raíz 7 (Do Mayor) - Caso de referencia 2
const add9_vii_raw = { root: 7, type: 5, inversion: 0, adds: [9], omits: [], alterations: [], suspensions: [] };
const add9_vii = parseHookpadChord(add9_vii_raw, keyC);
const model_add9_vii = buildIntermediateChord(add9_vii_raw, keyC);

assert(add9_vii.type === 5, `Caso add9 vii°: type permanece 5 (obtenido: ${add9_vii.type})`);
assert(!model_add9_vii.tones.some(t => t.degree === 7), 'Caso add9 vii°: NO contiene grado 7 (séptima disminuida o menor)');
const add9_vii_intervals = model_add9_vii.tones.map(t => t.interval);
assert(JSON.stringify(add9_vii_intervals) === JSON.stringify([0, 3, 6, 14]), `Caso add9 vii°: intervalos [0, 3, 6, 14] (obtenido: ${JSON.stringify(add9_vii_intervals)})`);
assert(add9_vii.roman === 'vii°⁽ᵃᵈᵈ⁹⁾', `Caso add9 vii°: número romano vii°⁽ᵃᵈᵈ⁹⁾ (obtenido: ${add9_vii.roman})`);
assert(add9_vii.symbol === 'B°⁽add9⁾', `Caso add9 vii°: símbolo absoluto B°⁽add9⁾ (obtenido: ${add9_vii.symbol})`);

// 7.3: type: 5, adds: [9] en raíz 5 (Sol en Do Mayor) - Caso V(add9)
const add9_V_raw = { root: 5, type: 5, inversion: 0, adds: [9], omits: [], alterations: [], suspensions: [] };
const add9_V = parseHookpadChord(add9_V_raw, keyC);
const model_add9_V = buildIntermediateChord(add9_V_raw, keyC);

assert(add9_V.type === 5, `Caso add9 V: type permanece 5 (obtenido: ${add9_V.type})`);
assert(!model_add9_V.tones.some(t => t.degree === 7), 'Caso add9 V: NO contiene séptima (grado 7)');
assert(add9_V.roman === 'V⁽ᵃᵈᵈ⁹⁾', `Caso add9 V: número romano V⁽ᵃᵈᵈ⁹⁾ (obtenido: ${add9_V.roman})`);
assert(add9_V.symbol === 'G⁽add9⁾', `Caso add9 V: símbolo absoluto G⁽add9⁾ (obtenido: ${add9_V.symbol})`);
assert(add9_V.symbol !== 'G9', `Caso add9 V: no es G9`);

// 7.4: Voice Leading y coherencia de notas MIDI en add9 (verificación de alturas absolutas)
const vl_add9_seq = resolveChordsWithVoiceLeading([add9_I, add9_V], () => keyC, 3);
const vl_I = vl_add9_seq[0];
const vl_V = vl_add9_seq[1];

// En Do Mayor, C(add9) no debe contener B (pitch class 11, MIDI 59 o 71)
const hasBInCadd9 = vl_I.midiNotes.some(m => m % 12 === 11);
assert(!hasBInCadd9, 'C(add9) en Canvas/audio: NO contiene la nota Si (séptima mayor, PC 11)');

// En Do Mayor, G(add9) no debe contener F (pitch class 5, MIDI 53 o 65)
const hasFInGadd9 = vl_V.midiNotes.some(m => m % 12 === 5);
assert(!hasFInGadd9, 'G(add9) en Canvas/audio: NO contiene la nota Fa (séptima menor, PC 5)');

// Alturas MIDI exactas de C(add9): Bajo C2 (36) y bloque superior [55, 60, 62, 64] (G3, C4, D4, E4)
assert(JSON.stringify(vl_I.midiNotes) === JSON.stringify([36, 55, 60, 62, 64]), `C(add9) alturas MIDI exactas: [36, 55, 60, 62, 64] (obtenido: ${JSON.stringify(vl_I.midiNotes)})`);
assert(vl_I.voices.length === 5, `C(add9) tiene 5 voces (1 bajo + 4 superiores)`);
assert(!vl_I.voices.some(v => v.voiceNumber === '7'), 'C(add9) no tiene ninguna voz etiquetada con "7"');

// 7.5: type: 9 conserva séptima estructural
const chord_type9 = parseHookpadChord({ root: 1, type: 9, inversion: 0 }, keyC);
const model_type9 = buildIntermediateChord(chord_type9, keyC);
assert(chord_type9.type === 9, 'type: 9 conserva type: 9');
assert(model_type9.tones.some(t => t.degree === 7), 'type: 9 incluye grado 7');
assert(chord_type9.roman === 'I^Δ⁹', `type: 9 en Mayor produce I^Δ⁹ (obtenido: ${chord_type9.roman})`);
assert(chord_type9.symbol === 'Cmaj9', `type: 9 en Mayor produce Cmaj9 (obtenido: ${chord_type9.symbol})`);

// 7.6: type: 5 sin adds permanece tríada pura
const triad_I = parseHookpadChord({ root: 1, type: 5, inversion: 0 }, keyC);
const model_triad = buildIntermediateChord(triad_I, keyC);
assert(triad_I.type === 5, 'Tríada pura conserva type: 5');
assert(model_triad.tones.length === 3, 'Tríada pura tiene exactamente 3 notas');
assert(JSON.stringify(model_triad.tones.map(t => t.interval)) === JSON.stringify([0, 4, 7]), 'Tríada intervalos [0, 4, 7]');
assert(triad_I.roman === 'I', `Tríada roman es I (obtenido: ${triad_I.roman})`);
assert(triad_I.symbol === 'C', `Tríada symbol es C (obtenido: ${triad_I.symbol})`);

// 7.7: type: 5, adds: [11] no añade 7ª ni 9ª
const add11_raw = { root: 1, type: 5, inversion: 0, adds: [11] };
const add11_chord = parseHookpadChord(add11_raw, keyC);
const model_add11 = buildIntermediateChord(add11_raw, keyC);
assert(add11_chord.type === 5, `add11: type permanece 5 (obtenido: ${add11_chord.type})`);
assert(!model_add11.tones.some(t => t.degree === 7), 'add11: NO añade grado 7');
assert(!model_add11.tones.some(t => t.degree === 9), 'add11: NO añade grado 9');
assert(model_add11.tones.some(t => t.degree === 11 && t.interval === 17), 'add11: contiene grado 11');
assert(JSON.stringify(model_add11.tones.map(t => t.interval)) === JSON.stringify([0, 4, 7, 17]), `add11: intervalos [0, 4, 7, 17] (obtenido: ${JSON.stringify(model_add11.tones.map(t => t.interval))})`);
assert(add11_chord.roman === 'I⁽ᵃᵈᵈ¹¹⁾', `add11: roman I⁽ᵃᵈᵈ¹¹⁾ (obtenido: ${add11_chord.roman})`);
assert(add11_chord.symbol === 'C⁽add11⁾', `add11: symbol C⁽add11⁾ (obtenido: ${add11_chord.symbol})`);

// 7.8: type: 5, adds: [13] no añade 7ª, 9ª ni 11ª
const add13_raw = { root: 1, type: 5, inversion: 0, adds: [13] };
const add13_chord = parseHookpadChord(add13_raw, keyC);
const model_add13 = buildIntermediateChord(add13_raw, keyC);
assert(add13_chord.type === 5, `add13: type permanece 5 (obtenido: ${add13_chord.type})`);
assert(!model_add13.tones.some(t => t.degree === 7), 'add13: NO añade grado 7');
assert(!model_add13.tones.some(t => t.degree === 9), 'add13: NO añade grado 9');
assert(!model_add13.tones.some(t => t.degree === 11), 'add13: NO añade grado 11');
assert(model_add13.tones.some(t => t.degree === 13 && t.interval === 21), 'add13: contiene grado 13');
assert(JSON.stringify(model_add13.tones.map(t => t.interval)) === JSON.stringify([0, 4, 7, 21]), `add13: intervalos [0, 4, 7, 21] (obtenido: ${JSON.stringify(model_add13.tones.map(t => t.interval))})`);
assert(add13_chord.roman === 'I⁽ᵃᵈᵈ¹³⁾', `add13: roman I⁽ᵃᵈᵈ¹³⁾ (obtenido: ${add13_chord.roman})`);
assert(add13_chord.symbol === 'C⁽add13⁾', `add13: symbol C⁽add13⁾ (obtenido: ${add13_chord.symbol})`);

// ────────────────────────────────────────────────────────────────────────────
// 8. CASOS CRÍTICOS DE ARMONÍA HOOKTHEORY (MODOS, INVERSIONES, DOMINANTES ALTERADOS)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Casos Críticos de Armonía Hooktheory:');

// 8.1: Séptima mayor en acordes prestados del modo menor (bVI en Sol Mixolidio)
const keyGMix = { tonic: 'G', scale: 'mixolydian' as const };
const c_bVI_maj7 = parseHookpadChord(
  { root: 6, type: 7, borrowed: 'minor', inversion: 0, beat: 1, duration: 4 },
  keyGMix
);
const model_bVI_maj7 = buildIntermediateChord(
  { root: 6, type: 7, borrowed: 'minor', inversion: 0, beat: 1, duration: 4 },
  keyGMix
);

assert(model_bVI_maj7.rootName === 'Eb', `Caso 1: Fundamental de bVI en Sol Mixolidio es Eb (obtenido: ${model_bVI_maj7.rootName})`);
assert(model_bVI_maj7.chordQuality === 'maj7', `Caso 1: Cualidad resuelta es maj7 (obtenido: ${model_bVI_maj7.chordQuality})`);
assert(c_bVI_maj7.symbol === 'Ebmaj7', `Caso 1: Símbolo absoluto es Ebmaj7 (obtenido: ${c_bVI_maj7.symbol})`);
assert(c_bVI_maj7.roman.includes('♭VI') && c_bVI_maj7.roman.includes('^Δ'), `Caso 1: Cifrado romano refleja ♭VI con 7ª mayor (obtenido: ${c_bVI_maj7.roman})`);
assert(!c_bVI_maj7.symbol.includes('Eb7') || c_bVI_maj7.symbol === 'Ebmaj7', `Caso 1: NO genera Eb7 dominante`);
// Notas efectivas deben contener D natural (PC 2), NO Db (PC 1)
assert(model_bVI_maj7.effectivePitches.includes(2), `Caso 1: Notas efectivas contienen Re natural (PC 2: D)`);
assert(!model_bVI_maj7.effectivePitches.includes(1), `Caso 1: Notas efectivas NO contienen Reb (PC 1: Db)`);

// 8.2: Desacoplamiento de raíz e inversión: F6 en Sol Mixolidio
const c_F6 = parseHookpadChord(
  { root: 7, type: 6, inversion: 0, beat: 1, duration: 4 },
  keyGMix
);
const model_F6 = buildIntermediateChord(
  { root: 7, type: 6, inversion: 0, beat: 1, duration: 4 },
  keyGMix
);
assert(model_F6.rootName === 'F', `Caso 2: Fundamental de grado 7 en Sol Mixolidio es F (obtenido: ${model_F6.rootName})`);
assert(model_F6.rootSemitones === 5, `Caso 2: rootSemitones es 5 (F)`);
assert(model_F6.bassSemitones === 5, `Caso 2: bassSemitones es 5 (F)`);
assert(model_F6.requestedInversion === 0, `Caso 2: requestedInversion es 0`);
assert(model_F6.resolvedInversion === 0, `Caso 2: resolvedInversion es 0`);
assert(model_F6.tones.some(t => t.degree === 6 && t.interval === 9), `Caso 2: Contiene la 6ª añadida (Re, intervalo 9)`);
assert(c_F6.symbol === 'F6', `Caso 2: Símbolo absoluto es F6 (obtenido: ${c_F6.symbol})`);
assert(!c_F6.symbol.includes('D7'), `Caso 2: NO se confunde con D7 ni genera D7/F#`);

// F con adds: [6]
const c_F_add6 = parseHookpadChord(
  { root: 7, type: 5, adds: [6], inversion: 0, beat: 1, duration: 4 },
  keyGMix
);
assert(c_F_add6.symbol === 'F6', `Caso 2b: adds: [6] genera símbolo F6 (obtenido: ${c_F_add6.symbol})`);

// 8.3: Cualidad menor de tríadas diatónicas: grado ii en Sol Mayor (Am)
const keyGMaj = { tonic: 'G', scale: 'major' as const };
const c_ii_G = parseHookpadChord(
  { root: 2, type: 5, inversion: 0, beat: 1, duration: 4 },
  keyGMaj
);
const model_ii_G = buildIntermediateChord(
  { root: 2, type: 5, inversion: 0, beat: 1, duration: 4 },
  keyGMaj
);
assert(model_ii_G.rootName === 'A', `Caso 3: Fundamental es A (obtenido: ${model_ii_G.rootName})`);
assert(model_ii_G.chordQuality === 'min', `Caso 3: Cualidad de grado ii en Mayor es min (obtenido: ${model_ii_G.chordQuality})`);
assert(c_ii_G.symbol === 'Am', `Caso 3: Símbolo absoluto refleja 'Am' (obtenido: ${c_ii_G.symbol})`);
assert(c_ii_G.roman === 'ii', `Caso 3: Cifrado romano es ii (obtenido: ${c_ii_G.roman})`);

// 8.4: Acorde tónica menor prestado en 1ª inversión: Gm/Bb en Sol Mayor
const c_Gm_Bb = parseHookpadChord(
  { root: 1, type: 5, inversion: 1, borrowed: 'minor', beat: 1, duration: 4 },
  keyGMaj
);
const model_Gm_Bb = buildIntermediateChord(
  { root: 1, type: 5, inversion: 1, borrowed: 'minor', beat: 1, duration: 4 },
  keyGMaj
);
assert(model_Gm_Bb.rootName === 'G', `Caso 4: Fundamental es G`);
assert(model_Gm_Bb.chordQuality === 'min', `Caso 4: Cualidad es min`);
assert(model_Gm_Bb.bassName === 'Bb', `Caso 4: Bajo resuelto es Sib (Bb) (obtenido: ${model_Gm_Bb.bassName})`);
assert(model_Gm_Bb.bassSemitones === 10, `Caso 4: bassSemitones es 10 (Bb)`);
assert(c_Gm_Bb.symbol === 'Gm/Bb', `Caso 4: Símbolo absoluto es Gm/Bb (obtenido: ${c_Gm_Bb.symbol})`);
assert(c_Gm_Bb.roman.startsWith('i⁶'), `Caso 4: Cifrado romano refleja 1ª inversión de i (obtenido: ${c_Gm_Bb.roman})`);
assert(model_Gm_Bb.effectivePitches.includes(10), `Caso 4: Clases de altura contienen Sib (PC 10)`);
assert(!model_Gm_Bb.effectivePitches.includes(11), `Caso 4: Clases de altura NO contienen Si natural (PC 11: B)`);

// 8.5: Dominantes con novena alterada: E7(b9) y E7(#9)
// IR teórico mantiene las 5 funciones
const c_E7b9 = parseHookpadChord(
  { root: 3, type: 7, alterations: ['b9'], inversion: 0, beat: 1, duration: 4 },
  keyC
);
const model_E7b9 = buildIntermediateChord(
  { root: 3, type: 7, alterations: ['b9'], inversion: 0, beat: 1, duration: 4 },
  keyC
);
assert(model_E7b9.rootName === 'E', `Caso 5: Fundamental es E`);
assert(model_E7b9.tones.length === 5, `Caso 5: IR mantiene exactamente las 5 funciones (obtenido: ${model_E7b9.tones.length})`);
assert(model_E7b9.tones.some(t => t.degree === 1 && t.interval === 0), `Caso 5: Contiene fundamental (E)`);
assert(model_E7b9.tones.some(t => t.degree === 3 && t.interval === 4), `Caso 5: Contiene 3ª mayor (G#)`);
assert(model_E7b9.tones.some(t => t.degree === 5 && t.interval === 7), `Caso 5: Contiene 5ª justa (B)`);
assert(model_E7b9.tones.some(t => t.degree === 7 && t.interval === 10), `Caso 5: Contiene 7ª menor (D)`);
assert(model_E7b9.tones.some(t => t.degree === 9 && t.alteration === -1), `Caso 5: Contiene b9 alterada (F)`);
assert(c_E7b9.symbol === 'E7(b9)', `Caso 5: Símbolo absoluto es E7(b9) (obtenido: ${c_E7b9.symbol})`);

// Política de audio a 4 voces para WebAudio y Voice Leading
assert(model_E7b9.audioVoicingMidi.length === 4, `Caso 5: Voicing de audio contiene exactamente 4 notas (obtenido: ${model_E7b9.audioVoicingMidi.length})`);
// La 5ª (Si = PC 11) se omite en el audio
assert(!model_E7b9.audioVoicingMidi.some(m => m % 12 === 11), `Caso 5: El voicing de audio omite la 5ª (B / PC 11)`);
// Contiene bajo E, 3ª G#, 7ª D, b9 F
assert(model_E7b9.audioVoicingMidi.some(m => m % 12 === 4), `Caso 5: Audio voicing contiene fundamental E`);
assert(model_E7b9.audioVoicingMidi.some(m => m % 12 === 8), `Caso 5: Audio voicing contiene 3ª mayor G#`);
assert(model_E7b9.audioVoicingMidi.some(m => m % 12 === 2), `Caso 5: Audio voicing contiene 7ª menor D`);
assert(model_E7b9.audioVoicingMidi.some(m => m % 12 === 5), `Caso 5: Audio voicing contiene b9 F`);

// Piano roll functional labels en resolveChordsWithVoiceLeading
const vl_E7b9 = resolveChordsWithVoiceLeading([c_E7b9], () => keyC);
const e7b9_voices = vl_E7b9[0].voices;
const bassVoiceE = e7b9_voices.find(v => v.isBass);
const thirdVoiceGsharp = e7b9_voices.find(v => v.midi % 12 === 8);
const seventhVoiceD = e7b9_voices.find(v => v.midi % 12 === 2);
const flat9VoiceF = e7b9_voices.find(v => v.midi % 12 === 5);

assert(bassVoiceE?.label === '1', `Caso 5: Bajo E etiquetado como '1' (obtenido: ${bassVoiceE?.label})`);
assert(thirdVoiceGsharp?.label === '3', `Caso 5: 3ª G# etiquetada como '3' (obtenido: ${thirdVoiceGsharp?.label})`);
assert(seventhVoiceD?.label === 'b7', `Caso 5: 7ª D etiquetada como 'b7' (obtenido: ${seventhVoiceD?.label})`);
assert(flat9VoiceF?.label === 'b9', `Caso 5: b9 F etiquetada como 'b9' (obtenido: ${flat9VoiceF?.label})`);
assert(flat9VoiceF?.label !== '1', `Caso 5: Fa NO se etiqueta erróneamente como '1'`);

// 8.6: Dominante con #9: E7(#9)
const c_E7sharp9 = parseHookpadChord(
  { root: 3, type: 7, alterations: ['#9'], inversion: 0, beat: 1, duration: 4 },
  keyC
);
const model_E7sharp9 = buildIntermediateChord(
  { root: 3, type: 7, alterations: ['#9'], inversion: 0, beat: 1, duration: 4 },
  keyC
);
assert(model_E7sharp9.tones.length === 5, `Caso 5b: IR de E7(#9) mantiene las 5 funciones`);
assert(c_E7sharp9.symbol === 'E7(#9)', `Caso 5b: Símbolo absoluto es E7(#9) (obtenido: ${c_E7sharp9.symbol})`);
assert(model_E7sharp9.audioVoicingMidi.length === 4, `Caso 5b: Audio voicing de E7(#9) tiene 4 notas`);

const vl_E7sharp9 = resolveChordsWithVoiceLeading([c_E7sharp9], () => keyC);
const sharp9Voice = vl_E7sharp9[0].voices.find(v => v.midi % 12 === 7 || v.midi % 12 === (4 + 15) % 12);
assert(sharp9Voice?.label === '#9', `Caso 5b: Voz #9 etiquetada como '#9' (obtenido: ${sharp9Voice?.label})`);

// ============================================================================
// 9. REQUISITO 10: ACORDES APLICADOS/SECUNDARIOS (applied) EN HOOKTHEORY V2
// ============================================================================
console.log('\n--- 9. ACORDES APLICADOS/SECUNDARIOS EN HOOKTHEORY V2 ---');

// 9.1: Caso A: vii°7/ii en La Mayor (root: 2, applied: 7, type: 7)
const raw_vii7_ii = { root: 2, applied: 7, type: 7, inversion: 0 };
const model_vii7_ii = buildIntermediateChord(raw_vii7_ii, keyA);
const chord_vii7_ii = parseHookpadChord(raw_vii7_ii, keyA);

assert(model_vii7_ii.appliedFunctionDegree === 7, `9.1: appliedFunctionDegree es 7 (obtenido: ${model_vii7_ii.appliedFunctionDegree})`);
assert(model_vii7_ii.targetDegree === 2, `9.1: targetDegree es 2 (obtenido: ${model_vii7_ii.targetDegree})`);
assert(model_vii7_ii.targetRootSemitones === 11, `9.1: targetRootSemitones es 11 (B / Si) (obtenido: ${model_vii7_ii.targetRootSemitones})`);
assert(model_vii7_ii.appliedRootSemitones === 10, `9.1: appliedRootSemitones es 10 (A# / La#) (obtenido: ${model_vii7_ii.appliedRootSemitones})`);
assert(model_vii7_ii.rootName === 'A#', `9.1: rootName es A# (obtenido: ${model_vii7_ii.rootName})`);
assert(chord_vii7_ii.quality === 'dim7', `9.1: Calidad es dim7 (obtenido: ${chord_vii7_ii.quality})`);
assert(chord_vii7_ii.symbol === 'A#°7', `9.1: Símbolo absoluto es A#°7 (obtenido: ${chord_vii7_ii.symbol})`);
assert(!chord_vii7_ii.symbol.includes('m7(b5)'), `9.1: NO genera A#m7(b5)`);
assert(chord_vii7_ii.roman === 'vii°⁷/ii', `9.1: Cifrado romano es vii°⁷/ii (obtenido: ${chord_vii7_ii.roman})`);
assert(!chord_vii7_ii.roman.includes('ii/vii') && !chord_vii7_ii.roman.includes('ii7/vii°'), `9.1: NO invierte numerador y denominador`);
const intervals_vii7_ii = model_vii7_ii.tones.map(t => t.interval);
assert(JSON.stringify(intervals_vii7_ii) === JSON.stringify([0, 3, 6, 9]), `9.1: Intervalos son [0, 3, 6, 9] (obtenido: ${JSON.stringify(intervals_vii7_ii)})`);
assert(JSON.stringify(model_vii7_ii.effectivePitches) === JSON.stringify([1, 4, 7, 10]), `9.1: Clases de altura son [1, 4, 7, 10] (C#, E, G, A#) (obtenido: ${JSON.stringify(model_vii7_ii.effectivePitches)})`);

// 9.2: Caso B: vii°7/I en La Mayor (root: 1, applied: 7, type: 7)
const raw_vii7_I = { root: 1, applied: 7, type: 7, inversion: 0 };
const model_vii7_I = buildIntermediateChord(raw_vii7_I, keyA);
const chord_vii7_I = parseHookpadChord(raw_vii7_I, keyA);

assert(model_vii7_I.appliedFunctionDegree === 7, `9.2: appliedFunctionDegree es 7 (obtenido: ${model_vii7_I.appliedFunctionDegree})`);
assert(model_vii7_I.targetDegree === 1, `9.2: targetDegree es 1 (obtenido: ${model_vii7_I.targetDegree})`);
assert(model_vii7_I.targetRootSemitones === 9, `9.2: targetRootSemitones es 9 (A / La) (obtenido: ${model_vii7_I.targetRootSemitones})`);
assert(model_vii7_I.appliedRootSemitones === 8, `9.2: appliedRootSemitones es 8 (G# / Sol#) (obtenido: ${model_vii7_I.appliedRootSemitones})`);
assert(model_vii7_I.rootName === 'G#', `9.2: rootName es G# (obtenido: ${model_vii7_I.rootName})`);
assert(chord_vii7_I.quality === 'dim7', `9.2: Calidad es dim7 (obtenido: ${chord_vii7_I.quality})`);
assert(chord_vii7_I.symbol === 'G#°7', `9.2: Símbolo absoluto es G#°7 (obtenido: ${chord_vii7_I.symbol})`);
assert(!chord_vii7_I.symbol.includes('Em7(b5)'), `9.2: NO genera Em7(b5)`);
assert(chord_vii7_I.roman === 'vii°⁷/I', `9.2: Cifrado romano es vii°⁷/I (obtenido: ${chord_vii7_I.roman})`);
assert(!chord_vii7_I.roman.startsWith('V'), `9.2: NO genera V7/I erróneamente`);
const intervals_vii7_I = model_vii7_I.tones.map(t => t.interval);
assert(JSON.stringify(intervals_vii7_I) === JSON.stringify([0, 3, 6, 9]), `9.2: Intervalos son [0, 3, 6, 9] (obtenido: ${JSON.stringify(intervals_vii7_I)})`);

// 9.3: Dominantes secundarias V7/ii y V7/I en La Mayor
const raw_V7_ii = { root: 2, applied: 5, type: 7, inversion: 0 };
const chord_V7_ii = parseHookpadChord(raw_V7_ii, keyA);
assert(chord_V7_ii.symbol === 'F#7', `9.3: V7/ii genera símbolo F#7 (obtenido: ${chord_V7_ii.symbol})`);
assert(chord_V7_ii.roman === 'V⁷/ii', `9.3: V7/ii genera cifrado V⁷/ii (obtenido: ${chord_V7_ii.roman})`);

const raw_V7_I = { root: 1, applied: 5, type: 7, inversion: 0 };
const chord_V7_I = parseHookpadChord(raw_V7_I, keyA);
assert(chord_V7_I.symbol === 'E7', `9.3: V7/I genera símbolo E7 (obtenido: ${chord_V7_I.symbol})`);
assert(chord_V7_I.roman === 'V⁷/I', `9.3: V7/I genera cifrado V⁷/I (obtenido: ${chord_V7_I.roman})`);

// 9.4: Tríada aplicada vii°/V en Do Mayor (Snow Mountain)
const raw_vii_V = { root: 5, applied: 7, type: 5, inversion: 0 };
const model_vii_V = buildIntermediateChord(raw_vii_V, keyC);
const chord_vii_V = parseHookpadChord(raw_vii_V, keyC);
assert(model_vii_V.appliedFunctionDegree === 7, `9.4: appliedFunctionDegree es 7 (obtenido: ${model_vii_V.appliedFunctionDegree})`);
assert(model_vii_V.targetDegree === 5, `9.4: targetDegree es 5 (obtenido: ${model_vii_V.targetDegree})`);
assert(model_vii_V.rootSemitones === 6, `9.4: Raíz es F# (semitono 6) (obtenido: ${model_vii_V.rootSemitones})`);
assert(chord_vii_V.quality === 'dim', `9.4: Tríada de calidad dim (obtenido: ${chord_vii_V.quality})`);
assert(chord_vii_V.symbol === 'F#°', `9.4: Símbolo es F#° (obtenido: ${chord_vii_V.symbol})`);
assert(chord_vii_V.roman === 'vii°/V', `9.4: Cifrado romano es vii°/V (obtenido: ${chord_vii_V.roman})`);
assert(JSON.stringify(model_vii_V.tones.map(t => t.interval)) === JSON.stringify([0, 3, 6]), `9.4: Intervalos de tríada disminuida [0, 3, 6]`);

// 9.5: Inversiones de vii°7/ii
const inv0 = parseHookpadChord({ root: 2, applied: 7, type: 7, inversion: 0 }, keyA);
const inv1 = parseHookpadChord({ root: 2, applied: 7, type: 7, inversion: 1 }, keyA);
const inv2 = parseHookpadChord({ root: 2, applied: 7, type: 7, inversion: 2 }, keyA);
const inv3 = parseHookpadChord({ root: 2, applied: 7, type: 7, inversion: 3 }, keyA);

assert(inv0.roman === 'vii°⁷/ii' && inv0.symbol === 'A#°7' && inv0.bassNote === 'A#', `9.5: inv 0 es vii°⁷/ii con bajo A# (obtenido: ${inv0.roman}, ${inv0.symbol}, ${inv0.bassNote})`);
assert(inv1.roman === 'vii°⁶₅/ii' && inv1.symbol === 'A#°7/C#' && inv1.bassNote === 'C#', `9.5: inv 1 es vii°⁶₅/ii con bajo C# (obtenido: ${inv1.roman}, ${inv1.symbol}, ${inv1.bassNote})`);
assert(inv2.roman === 'vii°⁴₃/ii' && inv2.symbol === 'A#°7/E' && inv2.bassNote === 'E', `9.5: inv 2 es vii°⁴₃/ii con bajo E (obtenido: ${inv2.roman}, ${inv2.symbol}, ${inv2.bassNote})`);
assert(inv3.roman === 'vii°⁴₂/ii' && inv3.symbol === 'A#°7/G' && inv3.bassNote === 'G', `9.5: inv 3 es vii°⁴₂/ii con bajo G (obtenido: ${inv3.roman}, ${inv3.symbol}, ${inv3.bassNote})`);

// 9.6: Acorde semidisminuido explícito viiø7/ii
const raw_halfdim = { root: 2, applied: 7, type: 7, quality: 'halfdim7' };
const chord_halfdim = parseHookpadChord(raw_halfdim, keyA);
const model_halfdim = buildIntermediateChord(raw_halfdim, keyA);
assert(chord_halfdim.quality === 'halfdim7', `9.6: Calidad es halfdim7`);
assert(chord_halfdim.symbol === 'A#m7(b5)', `9.6: Símbolo es A#m7(b5)`);
assert(chord_halfdim.roman === 'viiø⁷/ii', `9.6: Cifrado romano es viiø⁷/ii`);
assert(JSON.stringify(model_halfdim.tones.map(t => t.interval)) === JSON.stringify([0, 3, 6, 10]), `9.6: Intervalos [0, 3, 6, 10]`);

// 9.7: Estabilidad de re-parseo (idempotencia)
const reparsed_vii7_ii = parseHookpadChord(chord_vii7_ii, keyA);
assert(reparsed_vii7_ii.symbol === chord_vii7_ii.symbol, `9.7: Símbolo idéntico tras re-parseo (${reparsed_vii7_ii.symbol})`);
assert(reparsed_vii7_ii.roman === chord_vii7_ii.roman, `9.7: Cifrado romano idéntico tras re-parseo (${reparsed_vii7_ii.roman})`);
assert(reparsed_vii7_ii.applied === '7', `9.7: applied se mantiene como '7' tras re-parseo`);
assert(reparsed_vii7_ii.targetDegree === 2, `9.7: targetDegree se mantiene como 2 tras re-parseo`);

// 9.8: Progresión completa de referencia: I → vii°7/ii → ii7 → vii°7/I en La Mayor
const refProg = [
  parseHookpadChord({ root: 1, type: 5 }, keyA),
  parseHookpadChord({ root: 2, applied: 7, type: 7 }, keyA),
  parseHookpadChord({ root: 2, type: 7 }, keyA),
  parseHookpadChord({ root: 1, applied: 7, type: 7 }, keyA),
];
assert(refProg[0].roman === 'I' && refProg[0].symbol === 'A', `9.8: Acorde 1 es I / A`);
assert(refProg[1].roman === 'vii°⁷/ii' && refProg[1].symbol === 'A#°7', `9.8: Acorde 2 es vii°⁷/ii / A#°7`);
assert(refProg[2].roman === 'ii⁷' && refProg[2].symbol === 'Bm7', `9.8: Acorde 3 es ii⁷ / Bm7`);
assert(refProg[3].roman === 'vii°⁷/I' && refProg[3].symbol === 'G#°7', `9.8: Acorde 4 es vii°⁷/I / G#°7`);

console.log(`\n========================================`);
console.log(`VOICE LEADING RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  throw new Error(`Voice leading tests failed: ${failed} failure(s)`);
}
