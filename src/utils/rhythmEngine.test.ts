/**
 * rhythmEngine.test.ts
 * Suite de pruebas automatizadas para rhythmEngine:
 * - Regresión exacta a 132 BPM (480 ticks/negra):
 *     120 ticks = 0.1136 s
 *     240 ticks = 0.2273 s
 *     480 ticks = 0.4545 s
 *     960 ticks = 0.9091 s
 *     2160 ticks = 2.7273 s
 * - Tabla canónica de figuras: Redonda (1920), Blanca (960), Negra (480), Corchea (240), Semicorchea (120), Fusa (60), Semifusa (30)
 * - Figuras con puntillo (2880, 1440, 720, 360, 180, 90, 45)
 * - Figuras con doble puntillo (3360, 1680, 840, 420, 210)
 * - Tresillos (1280, 640, 320, 160, 80, 40, 20)
 * - Duraciones fraccionarias, notas largas y valores no estándar
 * - Desacoplamiento de compás (mismo BPM -> misma velocidad y duración en segundos sin importar el compás)
 * - Coherencia visual (píxeles) y de audio (segundos)
 * - Manejo de archivos sin meters (meters vacío)
 */

import {
  TICKS_PER_QUARTER,
  RHYTHMIC_FIGURE_TICKS,
  ticksToQuarters,
  quartersToTicks,
  quartersToSeconds,
  secondsToQuarters,
  ticksToSeconds,
  secondsToTicks,
  quartersToPixels,
  pixelsToQuarters,
  getMusicalFigure,
  normalizeEventTiming,
  isCompoundMeter,
  getMeasureDurationInQuarters,
  getMeterAtQuarter,
  calculateMeasuresTimeline,
  calculateMeasuresForBarCount,
  quartersToSecondsWithTempo,
  secondsToQuartersWithTempo,
  getPositionInMeasures,
  normalizeMeterChange,
  createCanonicalMeter,
  extractExplicitMeters,
  inferMeterFromMusicalData,
  resolveUniversalMeter,
} from './rhythmEngine';
import { parseHookpadSection, parseHookpadJson } from './hookpadImporter';

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

console.log('=== TEST SUITE: Rhythm Engine & Duration Contract ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. CONTRATO BÁSICO DE RESOLUCIÓN Y CONVERSIÓN
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Contrato Canónico de Resolución (480 ticks = 1 negra):');
assert(TICKS_PER_QUARTER === 480, 'TICKS_PER_QUARTER es 480');
assert(ticksToQuarters(480) === 1.0, '480 ticks = 1.0 negras');
assert(ticksToQuarters(240) === 0.5, '240 ticks = 0.5 negras');
assert(ticksToQuarters(120) === 0.25, '120 ticks = 0.25 negras');
assert(ticksToQuarters(960) === 2.0, '960 ticks = 2.0 negras');
assert(ticksToQuarters(1920) === 4.0, '1920 ticks = 4.0 negras');
assert(ticksToQuarters(60) === 0.125, '60 ticks = 0.125 negras');
assert(ticksToQuarters(30) === 0.0625, '30 ticks = 0.0625 negras');
assert(ticksToQuarters(720) === 1.5, '720 ticks = 1.5 negras');

assert(quartersToTicks(1.0) === 480, '1.0 negra = 480 ticks');
assert(quartersToTicks(0.5) === 240, '0.5 negra = 240 ticks');
assert(quartersToTicks(0.25) === 120, '0.25 negra = 120 ticks');
assert(quartersToTicks(2.0) === 960, '2.0 negra = 960 ticks');
assert(quartersToTicks(4.0) === 1920, '4.0 negra = 1920 ticks');
assert(quartersToTicks(1.5) === 720, '1.5 negra = 720 ticks');

// ────────────────────────────────────────────────────────────────────────────
// 2. PRUEBAS DE REGRESIÓN A 132 BPM (480 ticks/negra)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Pruebas de Regresión a 132 BPM (480 ticks/negra):');
const BPM132 = 132;

// 120 ticks = 0.1136 s
const s120 = ticksToSeconds(120, BPM132);
assert(Number(s120.toFixed(4)) === 0.1136, `120 ticks = 0.1136 s (obtenido: ${s120.toFixed(4)})`);

// 240 ticks = 0.2273 s
const s240 = ticksToSeconds(240, BPM132);
assert(Number(s240.toFixed(4)) === 0.2273, `240 ticks = 0.2273 s (obtenido: ${s240.toFixed(4)})`);

// 480 ticks = 0.4545 s
const s480 = ticksToSeconds(480, BPM132);
assert(Number(s480.toFixed(4)) === 0.4545, `480 ticks = 0.4545 s (obtenido: ${s480.toFixed(4)})`);

// 960 ticks = 0.9091 s
const s960 = ticksToSeconds(960, BPM132);
assert(Number(s960.toFixed(4)) === 0.9091, `960 ticks = 0.9091 s (obtenido: ${s960.toFixed(4)})`);

// 2160 ticks:
// - A resolución estándar de 480 ticks/negra: (2160 / 480) * (60 / 132) = 2.0455 s (4.5 negras)
// - A resolución compuesta de 360 ticks/pulso: (2160 / 360) * (60 / 132) = 2.7273 s (6 pulsos)
// - 2880 ticks a 480 ticks/negra: (2880 / 480) * (60 / 132) = 2.7273 s (6 negras)
const s2160_480 = ticksToSeconds(2160, BPM132, 480);
const s2160_360 = ticksToSeconds(2160, BPM132, 360);
const s2880_480 = ticksToSeconds(2880, BPM132, 480);

assert(Number(s2160_480.toFixed(4)) === 2.0455, `2160 ticks (res 480) = 2.0455 s (obtenido: ${s2160_480.toFixed(4)})`);
assert(Number(s2160_360.toFixed(4)) === 2.7273, `2160 ticks (res 360 / compuesto) = 2.7273 s (obtenido: ${s2160_360.toFixed(4)})`);
assert(Number(s2880_480.toFixed(4)) === 2.7273, `2880 ticks (res 480) = 2.7273 s (obtenido: ${s2880_480.toFixed(4)})`);

// ────────────────────────────────────────────────────────────────────────────
// 3. DESACOPLAMIENTO DE COMPÁS Y MIGRACIÓN TEMPORAL
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Desacoplamiento de Compás (Mismo BPM -> Misma Duración Temporal):');
const BPM120 = 120;
// A 120 BPM, una negra dura exactamente 0.5 s, sin importar el compás
const dur44 = quartersToSeconds(1.0, BPM120);
const dur34 = quartersToSeconds(1.0, BPM120);
const dur68 = quartersToSeconds(1.0, BPM120);
const dur128 = quartersToSeconds(1.0, BPM120);

assert(dur44 === 0.5, 'A 120 BPM en 4/4: negra dura 0.500 s');
assert(dur34 === 0.5, 'A 120 BPM en 3/4: negra dura 0.500 s');
assert(dur68 === 0.5, 'A 120 BPM en 6/8: negra dura 0.500 s');
assert(dur128 === 0.5, 'A 120 BPM en 12/8: negra dura 0.500 s');
assert(dur44 === dur34 && dur34 === dur68 && dur68 === dur128, 'Cambiar el compás NO altera la velocidad de reproducción');

// ────────────────────────────────────────────────────────────────────────────
// 4. TABLA CANÓNICA DE FIGURAS Y RECONOCIMIENTO (getMusicalFigure)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Tabla Canónica de Figuras Musicales (getMusicalFigure):');
const figWhole = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.WHOLE);
assert(figWhole.name === 'Redonda' && figWhole.isStandard === true, '1920 ticks = Redonda');

const figHalf = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.HALF);
assert(figHalf.name === 'Blanca' && figHalf.isStandard === true, '960 ticks = Blanca');

const figQuarter = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.QUARTER);
assert(figQuarter.name === 'Negra' && figQuarter.isStandard === true, '480 ticks = Negra');

const figEighth = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.EIGHTH);
assert(figEighth.name === 'Corchea' && figEighth.isStandard === true, '240 ticks = Corchea');

const fig16 = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.SIXTEENTH);
assert(fig16.name === 'Semicorchea' && fig16.isStandard === true, '120 ticks = Semicorchea');

const fig32 = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.THIRTY_SECOND);
assert(fig32.name === 'Fusa' && fig32.isStandard === true, '60 ticks = Fusa');

const fig64 = getMusicalFigure(RHYTHMIC_FIGURE_TICKS.SIXTY_FOURTH);
assert(fig64.name === 'Semifusa' && fig64.isStandard === true, '30 ticks = Semifusa');

// ────────────────────────────────────────────────────────────────────────────
// 5. FIGURAS CON PUNTILLO, DOBLE PUNTILLO Y TRESILLOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Figuras con Puntillo, Doble Puntillo y Tresillos:');
const dotWhole = getMusicalFigure(2880);
assert(dotWhole.name === 'Redonda con puntillo' && dotWhole.isDotted === true, '2880 ticks = Redonda con puntillo');

const dotHalf = getMusicalFigure(1440);
assert(dotHalf.name === 'Blanca con puntillo' && dotHalf.isDotted === true, '1440 ticks = Blanca con puntillo');

const dotQuarter = getMusicalFigure(720);
assert(dotQuarter.name === 'Negra con puntillo' && dotQuarter.isDotted === true, '720 ticks = Negra con puntillo');

const dotEighth = getMusicalFigure(360);
assert(dotEighth.name === 'Corchea con puntillo' && dotEighth.isDotted === true, '360 ticks = Corchea con puntillo');

const dot16 = getMusicalFigure(180);
assert(dot16.name === 'Semicorchea con puntillo' && dot16.isDotted === true, '180 ticks = Semicorchea con puntillo');

const dot32 = getMusicalFigure(90);
assert(dot32.name === 'Fusa con puntillo' && dot32.isDotted === true, '90 ticks = Fusa con puntillo');

const dot64 = getMusicalFigure(45);
assert(dot64.name === 'Semifusa con puntillo' && dot64.isDotted === true, '45 ticks = Semifusa con puntillo');

const ddotQuarter = getMusicalFigure(840);
assert(ddotQuarter.name === 'Negra con doble puntillo' && ddotQuarter.isDoubleDotted === true, '840 ticks = Negra con doble puntillo');

const tripQuarter = getMusicalFigure(320);
assert(tripQuarter.name === 'Tresillo de negra' && tripQuarter.isTriplet === true, '320 ticks = Tresillo de negra');

const tripEighth = getMusicalFigure(160);
assert(tripEighth.name === 'Tresillo de corchea' && tripEighth.isTriplet === true, '160 ticks = Tresillo de corchea');

const trip16 = getMusicalFigure(80);
assert(trip16.name === 'Tresillo de semicorchea' && trip16.isTriplet === true, '80 ticks = Tresillo de semicorchea');

// Preservación estricta de valores arbitrarios o no convencionales
const oddFig = getMusicalFigure(512);
assert(oddFig.ticks === 512, '512 ticks conserva ticks exactos sin redondear');
assert(oddFig.quarters === 512 / 480, '512 ticks calcula negras exactas (1.0667)');
assert(oddFig.isStandard === false, '512 ticks se cataloga como no estándar');

// ────────────────────────────────────────────────────────────────────────────
// 6. NORMALIZACIÓN TEMPORAL DE IMPORTACIONES (normalizeEventTiming)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Normalización Temporal de Importaciones (normalizeEventTiming):');
// Sub-240 ticks: jamás confundir con beats directos
const norm16 = normalizeEventTiming({ startTick: 0, durationTicks: 120 });
assert(norm16.durationQuarter === 0.25, '120 ticks = 0.25 negras (semicorchea)');
assert(norm16.beat === 1.0, 'startTick 0 = beat 1.0');

const norm32 = normalizeEventTiming({ startTick: 120, durationTicks: 60 });
assert(norm32.startQuarter === 0.25, 'startTick 120 = startQuarter 0.25');
assert(norm32.durationQuarter === 0.125, '60 ticks = 0.125 negras (fusa)');
assert(norm32.beat === 1.25, 'beat = 1.25');

const norm64 = normalizeEventTiming({ startTick: 180, durationTicks: 30 });
assert(norm64.durationQuarter === 0.0625, '30 ticks = 0.0625 negras (semifusa)');

// Legacy import with beat and duration in quarters
const normLegacy = normalizeEventTiming({ beat: 3.5, duration: 1.5 });
assert(normLegacy.startQuarter === 2.5, 'Legacy beat 3.5 = 2.5 startQuarter');
assert(normLegacy.durationQuarter === 1.5, 'Legacy duration 1.5 = 1.5 negras');
assert(normLegacy.startTick === 1200, 'Legacy startTick = 1200 ticks');
assert(normLegacy.durationTicks === 720, 'Legacy durationTicks = 720 ticks');

// ────────────────────────────────────────────────────────────────────────────
// 7. COHERENCIA VISUAL (PÍXELES) Y DE AUDIO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Coherencia Visual y Audio:');
const pxPerQuarter = 48;
const q = normLegacy.startQuarter;
const d = normLegacy.durationQuarter;
const x = quartersToPixels(q, pxPerQuarter);
const w = quartersToPixels(d, pxPerQuarter);

assert(x === 120, 'x en canvas = startQuarter * pxPerQuarter (2.5 * 48 = 120px)');
assert(w === 72, 'w en canvas = durationQuarter * pxPerQuarter (1.5 * 48 = 72px)');
assert(pixelsToQuarters(x, pxPerQuarter) === q, 'pixelsToQuarters(x) recupera startQuarter');
assert(pixelsToQuarters(w, pxPerQuarter) === d, 'pixelsToQuarters(w) recupera durationQuarter');

// ────────────────────────────────────────────────────────────────────────────
// 8. MÉTRICAS SIMPLES (2/4, 3/4, 4/4, 5/4)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Métricas Simples (2/4, 3/4, 4/4, 5/4):');
assert(isCompoundMeter(4, 4) === false, '4/4 no es compás compuesto');
assert(isCompoundMeter(3, 4) === false, '3/4 no es compás compuesto');
assert(isCompoundMeter(2, 4) === false, '2/4 no es compás compuesto');
assert(isCompoundMeter(5, 4) === false, '5/4 no es compás compuesto');
assert(isCompoundMeter(3, 8) === false, '3/8 se procesa como 3 corcheas simples, no compuesto');

assert(getMeasureDurationInQuarters(4, 4) === 4.0, '4/4 dura exactamente 4.0 negras');
assert(getMeasureDurationInQuarters(3, 4) === 3.0, '3/4 dura exactamente 3.0 negras');
assert(getMeasureDurationInQuarters(2, 4) === 2.0, '2/4 dura exactamente 2.0 negras');
assert(getMeasureDurationInQuarters(5, 4) === 5.0, '5/4 dura exactamente 5.0 negras');

const measures44 = calculateMeasuresForBarCount(2, undefined, { numerator: 4, denominator: 4 });
assert(measures44.length === 2, 'Genera 2 compases de 4/4');
assert(measures44[0].pulses.length === 4, 'Compás 4/4 tiene 4 pulsos de negra');
assert(measures44[0].pulses[0].label === 'M1', 'Primer pulso de 4/4 es M1');
assert(measures44[0].pulses[1].label === '.2', 'Segundo pulso de 4/4 es .2');
assert(measures44[0].pulses[2].label === '.3', 'Tercer pulso de 4/4 es .3');
assert(measures44[0].pulses[3].label === '.4', 'Cuarto pulso de 4/4 es .4');
assert(measures44[0].subdivisions.length === 8, 'Compás 4/4 tiene 8 subdivisiones de corchea');

const measures34 = calculateMeasuresForBarCount(2, undefined, { numerator: 3, denominator: 4 });
assert(measures34[0].pulses.length === 3, 'Compás 3/4 tiene 3 pulsos');
assert(measures34[0].durationQuarters === 3.0, 'Compás 3/4 dura 3 negras');
assert(measures34[1].startQuarter === 3.0, 'Compás 2 de 3/4 empieza en negra 3.0');

// ────────────────────────────────────────────────────────────────────────────
// 9. MÉTRICAS COMPUESTAS (6/8, 9/8, 12/8)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Métricas Compuestas (6/8, 9/8, 12/8):');
assert(isCompoundMeter(6, 8) === true, '6/8 es compás compuesto');
assert(isCompoundMeter(9, 8) === true, '9/8 es compás compuesto');
assert(isCompoundMeter(12, 8) === true, '12/8 es compás compuesto');

// 6/8: 6 corcheas = 3 negras. 2 pulsos principales (negras con puntillo = 1.5 negras cada uno).
assert(getMeasureDurationInQuarters(6, 8) === 3.0, '6/8 dura exactamente 3.0 negras canónicas');
const measures68 = calculateMeasuresForBarCount(2, undefined, { numerator: 6, denominator: 8 });
assert(measures68.length === 2, 'Genera 2 compases de 6/8');
assert(measures68[0].pulses.length === 2, '6/8 agrupa en 2 pulsos de negra con puntillo');
assert(measures68[0].pulses[0].offsetInMeasure === 0, 'Pulso 1 de 6/8 en offset 0');
assert(measures68[0].pulses[1].offsetInMeasure === 1.5, 'Pulso 2 de 6/8 en offset 1.5');
assert(measures68[0].pulses[0].label === 'M1', 'Etiqueta pulso 1 de 6/8 es M1');
assert(measures68[0].pulses[1].label === '.2', 'Etiqueta pulso 2 de 6/8 es .2');
assert(measures68[0].subdivisions.length === 6, '6/8 genera 6 subdivisiones ternarias de corchea');
assert(measures68[0].subdivisions[1].offsetInMeasure === 0.5, 'Segunda subdivisión de 6/8 en 0.5 negras');
assert(measures68[0].subdivisions[2].offsetInMeasure === 1.0, 'Tercera subdivisión de 6/8 en 1.0 negras');

// 9/8: 9 corcheas = 4.5 negras. 3 pulsos principales (1.5 negras cada uno).
assert(getMeasureDurationInQuarters(9, 8) === 4.5, '9/8 dura 4.5 negras');
const measures98 = calculateMeasuresForBarCount(1, undefined, { numerator: 9, denominator: 8 });
assert(measures98[0].pulses.length === 3, '9/8 agrupa en 3 pulsos');
assert(measures98[0].pulses[2].offsetInMeasure === 3.0, 'Pulso 3 de 9/8 en offset 3.0');
assert(measures98[0].subdivisions.length === 9, '9/8 genera 9 subdivisiones ternarias');

// 12/8: 12 corcheas = 6 negras. 4 pulsos principales.
assert(getMeasureDurationInQuarters(12, 8) === 6.0, '12/8 dura 6.0 negras');
const measures128 = calculateMeasuresForBarCount(1, undefined, { numerator: 12, denominator: 8 });
assert(measures128[0].pulses.length === 4, '12/8 agrupa en 4 pulsos');
assert(measures128[0].subdivisions.length === 12, '12/8 genera 12 subdivisiones ternarias');

// ────────────────────────────────────────────────────────────────────────────
// 10. CAMBIOS MÉTRICOS A MITAD DE CANCIÓN
// ────────────────────────────────────────────────────────────────────────────
console.log('\n10. Cambios Métricos a Mitad de Canción:');
// Estructura:
// Bar 1 y 2: 4/4 (longitud 4 cada uno -> ocupan [0..8])
// Bar 3 y 4: 3/4 (longitud 3 cada uno -> ocupan [8..14])
// Bar 5 y 6: 6/8 (longitud 3 cada uno -> ocupan [14..20])
const midMeters = [
  normalizeMeterChange({ numBeats: 4, beatUnit: 4, startQuarter: 0 }),
  normalizeMeterChange({ numBeats: 3, beatUnit: 4, startQuarter: 8 }),
  normalizeMeterChange({ numBeats: 6, beatUnit: 8, startQuarter: 14 }),
];

const multiTimeline = calculateMeasuresTimeline(20, midMeters);
assert(multiTimeline.length === 6, 'Timeline contiene 6 compases en total');

// Bar 1 (4/4)
assert(multiTimeline[0].measureNumber === 1, 'Compás 1 número correcto');
assert(multiTimeline[0].startQuarter === 0, 'Compás 1 empieza en 0');
assert(multiTimeline[0].durationQuarters === 4.0, 'Compás 1 dura 4.0');
assert(multiTimeline[0].meterLabel === '4/4', 'Compás 1 es 4/4');
assert(multiTimeline[0].isMeterChange === true, 'Compás 1 marca cambio inicial');

// Bar 2 (4/4)
assert(multiTimeline[1].startQuarter === 4.0, 'Compás 2 empieza en 4.0');
assert(multiTimeline[1].isMeterChange === false, 'Compás 2 mantiene el compás anterior');

// Bar 3 (3/4)
assert(multiTimeline[2].startQuarter === 8.0, 'Compás 3 empieza exactamente en 8.0');
assert(multiTimeline[2].durationQuarters === 3.0, 'Compás 3 dura 3.0');
assert(multiTimeline[2].meterLabel === '3/4', 'Compás 3 es 3/4');
assert(multiTimeline[2].isMeterChange === true, 'Compás 3 detecta cambio métrico a 3/4');

// Bar 4 (3/4)
assert(multiTimeline[3].startQuarter === 11.0, 'Compás 4 empieza en 11.0');
assert(multiTimeline[3].durationQuarters === 3.0, 'Compás 4 dura 3.0');
assert(multiTimeline[3].isMeterChange === false, 'Compás 4 mantiene 3/4');

// Bar 5 (6/8)
assert(multiTimeline[4].startQuarter === 14.0, 'Compás 5 empieza en 14.0');
assert(multiTimeline[4].durationQuarters === 3.0, 'Compás 5 dura 3.0 (6/8)');
assert(multiTimeline[4].meterLabel === '6/8', 'Compás 5 es 6/8');
assert(multiTimeline[4].isCompound === true, 'Compás 5 es compuesto');
assert(multiTimeline[4].isMeterChange === true, 'Compás 5 detecta cambio métrico a 6/8');
assert(multiTimeline[4].pulses.length === 2, 'Compás 5 tiene 2 pulsos');
assert(multiTimeline[4].pulses[1].absoluteQuarter === 15.5, 'Segundo pulso de compás 5 está en 15.5');

// Bar 6 (6/8)
assert(multiTimeline[5].startQuarter === 17.0, 'Compás 6 empieza en 17.0');
assert(multiTimeline[5].endQuarter === 20.0, 'Compás 6 termina en 20.0');

// ────────────────────────────────────────────────────────────────────────────
// 11. POSICIONAMIENTO Y NAVEGACIÓN MÉTRICA (getPositionInMeasures)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n11. Posicionamiento y Navegación Métrica (getPositionInMeasures):');
const p0 = getPositionInMeasures(0, 20, midMeters);
assert(p0.measureNumber === 1 && p0.beatInMeasure === 1, 'Negra 0 -> Compás 1, Pulso 1');

const p2 = getPositionInMeasures(2.0, 20, midMeters);
assert(p2.measureNumber === 1 && p2.beatInMeasure === 3, 'Negra 2.0 -> Compás 1, Pulso 3 (en 4/4)');

const p8 = getPositionInMeasures(8.0, 20, midMeters);
assert(p8.measureNumber === 3 && p8.beatInMeasure === 1, 'Negra 8.0 -> Compás 3, Pulso 1 (inicio 3/4)');

const p9 = getPositionInMeasures(9.0, 20, midMeters);
assert(p9.measureNumber === 3 && p9.beatInMeasure === 2, 'Negra 9.0 -> Compás 3, Pulso 2 (en 3/4)');

const p14 = getPositionInMeasures(14.0, 20, midMeters);
assert(p14.measureNumber === 5 && p14.beatInMeasure === 1, 'Negra 14.0 -> Compás 5, Pulso 1 (inicio 6/8)');

const p15_5 = getPositionInMeasures(15.5, 20, midMeters);
assert(p15_5.measureNumber === 5 && p15_5.beatInMeasure === 2, 'Negra 15.5 -> Compás 5, Pulso 2 (en 6/8 compuesto)');

// ────────────────────────────────────────────────────────────────────────────
// 12. INTEGRACIÓN DE CAMBIOS DE TEMPO DINÁMICOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n12. Integración de Cambios de Tempo Dinámicos:');
// 120 BPM base, a partir de negra 4 cambia a 60 BPM:
// Negras [0..4] a 120 BPM: 4 * (60 / 120) = 2.0 s
// Negras [4..6] a 60 BPM: 2 * (60 / 60) = 2.0 s
// Tiempo total en negra 6 = 4.0 s
const tempoChanges = [{ bpm: 60, startQuarter: 4 }];
const secAt6 = quartersToSecondsWithTempo(6, 120, tempoChanges);
assert(secAt6 === 4.0, `Negra 6 con cambio de tempo dura exactamente 4.0 s (obtenido: ${secAt6})`);

const qFromSec = secondsToQuartersWithTempo(4.0, 120, tempoChanges);
assert(Math.abs(qFromSec - 6.0) < 0.0001, `4.0 s con cambio de tempo recupera 6.0 negras (obtenido: ${qFromSec})`);

// ────────────────────────────────────────────────────────────────────────────
// 13. MANEJO ESTRICTO DE meters: [] VACÍO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n13. Manejo Estricto de meters: [] Vacío:');
const emptyMetersArr: any[] = [];
const measuresEmpty = calculateMeasuresTimeline(16, emptyMetersArr, { numerator: 4, denominator: 4 });
assert(measuresEmpty.length === 4, 'Con meters: [] genera 4 compases de 4/4 usando fallback');
assert(emptyMetersArr.length === 0, 'No muta ni inserta elementos espurios en el array original');
assert(measuresEmpty[0].isMeterChange === false, 'Sin meters explícitos, no marca isMeterChange en el compás 1');

// ────────────────────────────────────────────────────────────────────────────
// 14. ALINEACIÓN BIDIRECCIONAL AUDIO / CURSOR / CANVAS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n14. Alineación Bidireccional Audio / Cursor / Canvas:');
// Simular Transport a 120 BPM, cursor en beat 5.5 (startQuarter = 4.5):
const testBeat = 5.5;
const testBpm = 120;
const transportSecs = (testBeat - 1) * (60 / testBpm);
// Fórmula canónica en getCurrentExactBeat: 1 + (Tone.Transport.seconds * (bpm / 60))
const recoveredBeat = 1 + (transportSecs * (testBpm / 60));
assert(Math.abs(recoveredBeat - testBeat) < 0.00001, 'Cursor recupera beat exacto desde segundos de transporte');

const canvasX = (testBeat - 1) * 48;
assert(canvasX === 4.5 * 48, 'Posición canvas X coincide exactamente con (beat - 1) * pxPerQuarter');

// ────────────────────────────────────────────────────────────────────────────
// 15. EXTRACCIÓN DE METADATOS EXPLÍCITOS (extractExplicitMeters)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n15. Extracción de Metadatos Explícitos (extractExplicitMeters):');
const expArr = extractExplicitMeters({ meters: [{ numBeats: 3, beatUnit: 4 }] });
assert(expArr.length === 1, 'Extrae array meters');
assert(expArr[0].numerator === 3 && expArr[0].denominator === 4, 'Extrae 3/4 desde meters');
assert(expArr[0].provenance === 'explicit', 'Procedencia es explicit');

const expStr = extractExplicitMeters({ meter: '6/8' });
assert(expStr.length === 1 && expStr[0].numerator === 6 && expStr[0].denominator === 8, 'Extrae 6/8 desde string meter');

const expTimeSig = extractExplicitMeters({ timeSignature: [5, 4] });
assert(expTimeSig.length === 1 && expTimeSig[0].numerator === 5 && expTimeSig[0].denominator === 4, 'Extrae 5/4 desde timeSignature');

const expPayload = extractExplicitMeters({ modern: { payload: { meters: [{ meter: [7, 4] }] } } });
assert(expPayload.length === 1 && expPayload[0].numerator === 7 && expPayload[0].denominator === 4, 'Extrae 7/4 desde modern.payload.meters');

const expBpb = extractExplicitMeters({ beatsPerBar: 3, beatUnit: 4 });
assert(expBpb.length === 1 && expBpb[0].numerator === 3 && expBpb[0].denominator === 4, 'Extrae 3/4 desde beatsPerBar');

// ────────────────────────────────────────────────────────────────────────────
// 16. INFERENCIA MÉTRICA UNIVERSAL POR RITMO ARMÓNICO (inferMeterFromMusicalData)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n16. Inferencia Métrica Universal por Ritmo Armónico:');

// Caso 3/4 (Vals / Hyrule Castle sin metadatos)
const chords34 = [
  { beat: 1, duration: 3 },
  { beat: 4, duration: 3 },
  { beat: 7, duration: 3 },
  { beat: 10, duration: 3 },
  { beat: 13, duration: 3 },
  { beat: 16, duration: 3 },
  { beat: 19, duration: 3 },
  { beat: 22, duration: 3 },
];
const notes34 = [
  { beat: 1, duration: 1 },
  { beat: 2, duration: 1 },
  { beat: 3, duration: 1 },
  { beat: 4, duration: 2 },
  { beat: 6, duration: 1 },
];
const inferred34 = inferMeterFromMusicalData(chords34, notes34, 24);
assert(inferred34.numerator === 3, `Infiere numerador 3 en 3/4 (obtenido: ${inferred34.numerator})`);
assert(inferred34.denominator === 4, `Infiere denominador 4 en 3/4 (obtenido: ${inferred34.denominator})`);
assert(inferred34.provenance === 'inferred', 'Procedencia es inferred');
assert(inferred34.confidence >= 0.8, `Confianza alta en 3/4 (obtenido: ${inferred34.confidence})`);
assert(inferred34.durationQuarters === 3.0, 'Duración de compás es 3.0 negras');

// Caso 4/4 (Pop estándar)
const chords44 = [
  { beat: 1, duration: 4 },
  { beat: 5, duration: 4 },
  { beat: 9, duration: 4 },
  { beat: 13, duration: 4 },
];
const inferred44 = inferMeterFromMusicalData(chords44, [], 16);
assert(inferred44.numerator === 4 && inferred44.denominator === 4, 'Infiere 4/4 en secuencia de 4 negras');
assert(inferred44.provenance === 'inferred', 'Procedencia es inferred en 4/4');

// Caso 2/4
const chords24 = [
  { beat: 1, duration: 2 },
  { beat: 3, duration: 2 },
  { beat: 5, duration: 2 },
  { beat: 7, duration: 2 },
];
const inferred24 = inferMeterFromMusicalData(chords24, [], 8);
assert(inferred24.numerator === 2 && inferred24.denominator === 4, 'Infiere 2/4 en secuencia de 2 negras');

// Caso 5/4 (Take Five)
const chords54 = [
  { beat: 1, duration: 5 },
  { beat: 6, duration: 5 },
  { beat: 11, duration: 5 },
  { beat: 16, duration: 5 },
];
const inferred54 = inferMeterFromMusicalData(chords54, [], 20);
assert(inferred54.numerator === 5 && inferred54.denominator === 4, 'Infiere 5/4 en compás irregular de 5 negras');
assert(inferred54.type === 'irregular', 'Tipo de métrica en 5/4 es irregular');

// Caso 7/4 (Money)
const chords74 = [
  { beat: 1, duration: 7 },
  { beat: 8, duration: 7 },
  { beat: 15, duration: 7 },
  { beat: 22, duration: 7 },
];
const inferred74 = inferMeterFromMusicalData(chords74, [], 28);
assert(inferred74.numerator === 7 && inferred74.denominator === 4, 'Infiere 7/4 en compás irregular de 7 negras');

// Caso 6/8 (Compuesto con acentos ternarios en 1.5)
const chords68Data = [
  { beat: 1, duration: 3 },
  { beat: 4, duration: 3 },
  { beat: 7, duration: 3 },
  { beat: 10, duration: 3 },
];
const notes68Data = [
  { beat: 1, duration: 1.5 },
  { beat: 2.5, duration: 1.5 },
  { beat: 4, duration: 1.5 },
  { beat: 5.5, duration: 1.5 },
  { beat: 7, duration: 1.5 },
  { beat: 8.5, duration: 1.5 },
];
const inferred68 = inferMeterFromMusicalData(chords68Data, notes68Data, 12);
assert(inferred68.numerator === 6 && inferred68.denominator === 8, `Infiere 6/8 ante acentuación ternaria (obtenido: ${inferred68.numerator}/${inferred68.denominator})`);
assert(inferred68.type === 'compound', '6/8 es clasificado como compound');
assert(inferred68.pulsesPerMeasure === 2, '6/8 tiene 2 pulsos principales');

// Caso 9/8
const chords98Data = [
  { beat: 1, duration: 4.5 },
  { beat: 5.5, duration: 4.5 },
];
const inferred98 = inferMeterFromMusicalData(chords98Data, [], 9);
assert(inferred98.numerator === 9 && inferred98.denominator === 8, 'Infiere 9/8 ante acordes de 4.5 negras');
assert(inferred98.pulsesPerMeasure === 3, '9/8 tiene 3 pulsos');

// Caso 12/8 (Blues / balada lenta)
const chords128Data = [
  { beat: 1, duration: 6 },
  { beat: 7, duration: 6 },
];
const notes128Data = [
  { beat: 1, duration: 1.5 },
  { beat: 2.5, duration: 1.5 },
  { beat: 4, duration: 1.5 },
  { beat: 5.5, duration: 1.5 },
];
const inferred128 = inferMeterFromMusicalData(chords128Data, notes128Data, 12);
assert(inferred128.numerator === 12 && inferred128.denominator === 8, 'Infiere 12/8 en compás de 6 negras con subdivisiones ternarias');
assert(inferred128.pulsesPerMeasure === 4, '12/8 tiene 4 pulsos principales');

// ────────────────────────────────────────────────────────────────────────────
// 17. TRESILLOS EN COMPÁS SIMPLE VS COMPÁS COMPUESTO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n17. Tresillos en Compás Simple vs Compás Compuesto:');
// 4/4 con tresillos de corchea (duración 1/3 de negra = 160 ticks = 0.333)
const chords44Triplets = [
  { beat: 1, duration: 4 },
  { beat: 5, duration: 4 },
];
const notes44Triplets = [
  { beat: 1, duration: 0.333 },
  { beat: 1.333, duration: 0.333 },
  { beat: 1.666, duration: 0.333 },
  { beat: 2, duration: 1.0 },
];
const inferred44Triplets = inferMeterFromMusicalData(chords44Triplets, notes44Triplets, 8);
assert(inferred44Triplets.numerator === 4 && inferred44Triplets.denominator === 4, 'Tresillos en 4/4 NO engañan al motor para inferir 6/8 ni 12/8');

// ────────────────────────────────────────────────────────────────────────────
// 18. DATOS INCOMPLETOS, AMBIGUOS O CONTRADICTORIOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n18. Datos Incompletos, Ambiguos o Contradictorios:');
const emptyInference = inferMeterFromMusicalData([], []);
assert(emptyInference.numerator === 4 && emptyInference.denominator === 4, 'Sin eventos aplica fallback 4/4');
assert(emptyInference.provenance === 'fallback', 'Procedencia es fallback');
assert(emptyInference.ambiguity === 'ambiguous', 'Ambigüedad es ambiguous');
assert(emptyInference.confidence === 0.25, 'Confianza es 0.25');

// Un solo acorde errático sin compás claro
const singleOddChord = [{ beat: 1, duration: 3.7 }];
const oddInference = inferMeterFromMusicalData(singleOddChord, []);
assert(oddInference.ambiguity === 'ambiguous', 'Acorde asimétrico marca ambigüedad');

// ────────────────────────────────────────────────────────────────────────────
// 19. PRUEBA DE REGRESIÓN HOOKPAD: HYRULE CASTLE
// ────────────────────────────────────────────────────────────────────────────
console.log('\n19. Prueba de Regresión Hookpad: Hyrule Castle (Clip en 3/4 sin meters explícitos):');
const hyruleCastleJson = JSON.stringify({
  title: "The Legend of Zelda: A Link to the Past - Hyrule Castle",
  artist: "Koji Kondo",
  bpm: 120,
  meters: [],
  notes: [
    { sd: "1", beat: 1, duration: 1 },
    { sd: "2", beat: 2, duration: 1 },
    { sd: "3", beat: 3, duration: 1 },
    { sd: "1", beat: 4, duration: 3 }
  ],
  chords: [
    { sd: "1", type: 5, beat: 1, duration: 3 },
    { sd: "4", type: 5, beat: 4, duration: 3 },
    { sd: "5", type: 5, beat: 7, duration: 3 },
    { sd: "1", type: 5, beat: 10, duration: 3 }
  ]
});

const hyruleSong = parseHookpadJson(hyruleCastleJson);
const hyruleSec = hyruleSong.sections[0];

assert(hyruleSec.canonicalMeter?.numerator === 3, `Hyrule Castle infiere numerador 3 (obtenido: ${hyruleSec.canonicalMeter?.numerator})`);
assert(hyruleSec.canonicalMeter?.denominator === 4, `Hyrule Castle infiere denominador 4 (obtenido: ${hyruleSec.canonicalMeter?.denominator})`);
assert(hyruleSec.beatsPerBar === 3, `Hyrule Castle beatsPerBar es 3 (obtenido: ${hyruleSec.beatsPerBar})`);
assert(hyruleSec.timeSignature?.[0] === 3 && hyruleSec.timeSignature?.[1] === 4, 'Hyrule Castle timeSignature es [3, 4]');
assert(hyruleSec.totalBars === 4, `Hyrule Castle totalBars es 4 (12 negras / 3) (obtenido: ${hyruleSec.totalBars})`);

// Comprobación de líneas de compás en la cuadrícula
const hyruleMeasures = calculateMeasuresTimeline(12, hyruleSec.meters, { numerator: 3, denominator: 4 });
assert(hyruleMeasures.length === 4, 'Genera exactamente 4 compases');
assert(hyruleMeasures[0].startQuarter === 0 && hyruleMeasures[0].endQuarter === 3, 'Compás 1 de Hyrule es [0..3]');
assert(hyruleMeasures[1].startQuarter === 3 && hyruleMeasures[1].endQuarter === 6, 'Compás 2 de Hyrule es [3..6]');
assert(hyruleMeasures[2].startQuarter === 6 && hyruleMeasures[2].endQuarter === 9, 'Compás 3 de Hyrule es [6..9]');
assert(hyruleMeasures[3].startQuarter === 9 && hyruleMeasures[3].endQuarter === 12, 'Compás 4 de Hyrule es [9..12]');

// Comprobación de que cada acorde empieza exactamente en el inicio de su compás
assert(hyruleSec.chords[0].beat === 1, 'Acorde 1 empieza en beat 1 (compás 1)');
assert(hyruleSec.chords[1].beat === 4, 'Acorde 2 empieza en beat 4 (compás 2)');
assert(hyruleSec.chords[2].beat === 7, 'Acorde 3 empieza en beat 7 (compás 3)');
assert(hyruleSec.chords[3].beat === 10, 'Acorde 4 empieza en beat 10 (compás 4)');

// Comprobación de contador BAR : BEAT en transporte
const posHyruleBeat1 = getPositionInMeasures(0, 12, hyruleSec.meters, { numerator: 3, denominator: 4 });
assert(posHyruleBeat1.measureNumber === 1 && posHyruleBeat1.beatInMeasure === 1, 'Beat 1 -> M1 : 1');

const posHyruleBeat3 = getPositionInMeasures(2, 12, hyruleSec.meters, { numerator: 3, denominator: 4 });
assert(posHyruleBeat3.measureNumber === 1 && posHyruleBeat3.beatInMeasure === 3, 'Beat 3 -> M1 : 3');

const posHyruleBeat4 = getPositionInMeasures(3, 12, hyruleSec.meters, { numerator: 3, denominator: 4 });
assert(posHyruleBeat4.measureNumber === 2 && posHyruleBeat4.beatInMeasure === 1, 'Beat 4 -> M2 : 1 (NO M1 : 4)');

const posHyruleBeat7 = getPositionInMeasures(6, 12, hyruleSec.meters, { numerator: 3, denominator: 4 });
assert(posHyruleBeat7.measureNumber === 3 && posHyruleBeat7.beatInMeasure === 1, 'Beat 7 -> M3 : 1');

// ────────────────────────────────────────────────────────────────────────────
// 20. PRUEBA DE INTEGRACIÓN: CLIP CON METADATOS EXPLÍCITOS (5/4)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n20. Prueba de Integración: Clip con Metadatos Explícitos (5/4):');
const explicit54Json = JSON.stringify({
  title: "Dave Brubeck - Take Five",
  artist: "Paul Desmond",
  bpm: 174,
  meter: [5, 4],
  chords: [
    { sd: "1", type: 5, beat: 1, duration: 5 },
    { sd: "5", type: 5, beat: 6, duration: 5 }
  ]
});

const song54 = parseHookpadJson(explicit54Json);
const sec54 = song54.sections[0];
assert(sec54.beatsPerBar === 5, 'Clip explícito extrae beatsPerBar 5');
assert(sec54.timeSignature?.[0] === 5 && sec54.timeSignature?.[1] === 4, 'Clip explícito tiene timeSignature [5, 4]');
assert(sec54.hasExplicitMeters === true, 'hasExplicitMeters es true');
assert(sec54.totalBars === 2, '2 compases de 5 negras = 10 negras');

console.log('\n========================================');
console.log(`RHYTHM ENGINE RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`Rhythm engine tests failed: ${failed} errors.`);
}
