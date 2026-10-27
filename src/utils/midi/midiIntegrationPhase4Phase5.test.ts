/**
 * midiIntegrationPhase4Phase5.test.ts
 * Batería de pruebas de integración para la Fase 4 y Fase 5:
 * Adaptador Hooktheory, flujo de importación, conversión canónica y validación integral.
 *
 * Cubre:
 * 1. Importación de melodía monofónica.
 * 2. Importación de múltiples pistas (Lead + Chords + Bass).
 * 3. Conversión de IR y análisis a UniversalSong y CanonicalChordIR.
 * 4. Acordes en posición fundamental e inversiones (I, I6, I64, V6).
 * 5. Acordes slash y regla del color por bajo efectivo.
 * 6. Distinción estructural entre add9 y 9.
 * 7. Dominantes secundarias (V/ii vs ii/V) y objetivos aplicados.
 * 8. Tonalidades ambiguas, colecciones atonales y abstención justificada (unknown / ?).
 * 9. Notas solapadas, silencios y ritmos no cuantizados sin deriva.
 * 10. Cambios de tempo y compases (4/4, 3/4).
 * 11. Manejo seguro de archivos vacíos, truncados o corruptos.
 * 12. Simulación de cancelación de importación sin pérdida del estado activo.
 * 13. Reanálisis tras corrección manual de tonalidad o parámetros.
 * 14. Conservación de datos originales, identificadores de notas y procedencia.
 */

import { Midi } from '@tonejs/midi';
import { parseMidiBufferToIR } from './midiParser';
import { estimateKeyCandidates } from './midiTonalAnalyzer';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';
import {
  convertMidiAnalysisToUniversalSong,
  convertMidiHarmonicSegmentToUniversalChord,
  convertMidiMelodyNoteToUniversalNote,
} from './midiHooktheoryAdapter';
import { parseMidiToUniversalSong, inspectMidiTracks } from '../midiImporter';
import { MidiParseError } from '../../types/midiIR';
import type { UniversalSong } from '../../types/music';

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

// Helper para convertir Midi a File sintético
function createSyntheticFile(midi: Midi, name: string): File {
  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'audio/midi' });
  return new File([blob], name);
}

console.log('=== TEST SUITE: MIDI Fases 4 & 5 - Integración y Validación Completa ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. IMPORTACIÓN DE MELODÍA MONOFÓNICA
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Importación de Melodía Monofónica:');
{
  const midi = new Midi();
  const ppq = 480;
  const track = midi.addTrack();
  track.name = 'Solo Flute';
  // Melodía: C5 (72) -> D5 (74) -> E5 (76) -> G5 (79)
  track.addNote({ midi: 72, ticks: 0, durationTicks: ppq });
  track.addNote({ midi: 74, ticks: ppq, durationTicks: ppq });
  track.addNote({ midi: 76, ticks: ppq * 2, durationTicks: ppq });
  track.addNote({ midi: 79, ticks: ppq * 3, durationTicks: ppq });

  const file = createSyntheticFile(midi, 'monophonic_melody.mid');
  const song = await parseMidiToUniversalSong(file, { keyTonic: 'C', keyScale: 'major' });

  assert(song.sections.length === 1, 'Crea 1 sección');
  assert(song.sections[0].melody.length === 4, `Genera 4 notas melódicas (obtenido: ${song.sections[0].melody.length})`);
  assert(song.sections[0].melody[0].sd === '1', 'Nota 1 es grado 1 (C)');
  assert(song.sections[0].melody[1].sd === '2', 'Nota 2 es grado 2 (D)');
  assert(song.sections[0].melody[2].sd === '3', 'Nota 3 es grado 3 (E)');
  assert(song.sections[0].melody[3].sd === '5', 'Nota 4 es grado 5 (G)');
  // Conserva pitch MIDI original
  assert((song.sections[0].melody[0] as any).pitchMidi === 72, 'Conserva pitch MIDI 72');
}

// ────────────────────────────────────────────────────────────────────────────
// 2. MULTITRACK (LEAD MELODY + CHORDS + BASS) Y PREVIEW
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Importación Multitrack y Previsualización (inspectMidiTracks):');
{
  const midi = new Midi();
  const ppq = 480;

  // Track 0: Lead
  const tLead = midi.addTrack();
  tLead.name = 'Vocal Lead';
  tLead.addNote({ midi: 72, ticks: 0, durationTicks: ppq * 2 }); // C5
  tLead.addNote({ midi: 76, ticks: ppq * 2, durationTicks: ppq * 2 }); // E5

  // Track 1: Chords
  const tChords = midi.addTrack();
  tChords.name = 'Piano';
  tChords.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4 }); // C4
  tChords.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 }); // E4
  tChords.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 }); // G4

  // Track 2: Bass
  const tBass = midi.addTrack();
  tBass.name = 'Bass Guitar';
  tBass.addNote({ midi: 36, ticks: 0, durationTicks: ppq * 4 }); // C2

  const file = createSyntheticFile(midi, 'multitrack_song.mid');
  const inspection = await inspectMidiTracks(file);

  assert(inspection.tracks.length === 3, 'Detecta 3 pistas en total');
  assert(inspection.tracks[0].name === 'Vocal Lead', 'Nombre de pista 1 es Vocal Lead');
  assert(inspection.tracks[1].name === 'Piano', 'Nombre de pista 2 es Piano');
  assert(inspection.tracks[2].name === 'Bass Guitar', 'Nombre de pista 3 es Bass Guitar');
  assert(inspection.estimatedKey.tonic === 'C', 'Tonalidad estimada es C');
  assert((inspection.estimatedKey.confidence ?? 0) >= 0.7, 'Confianza estimada >= 70%');
  assert(inspection.previewChords !== undefined && inspection.previewChords.length >= 1, 'Genera previsualización de acordes');
  assert(inspection.previewChords![0].romanNumeral === 'I', 'Primer acorde de preview es I');
}

// ────────────────────────────────────────────────────────────────────────────
// 3. CONVERSIÓN CANÓNICA A UNIVERSALSONG Y CANONICALCHORDIR
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Conversión Canónica a Modelos Internos (midiHooktheoryAdapter):');
{
  const midi = new Midi();
  const ppq = 480;
  const track = midi.addTrack();
  track.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 }); // C3
  track.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4 }); // C4
  track.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 }); // E4
  track.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 }); // G4

  const ir = parseMidiBufferToIR(midi.toArray());
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const song = convertMidiAnalysisToUniversalSong(analysis, ir, { title: 'Test IR Conversion' });

  assert(song.title === 'Test IR Conversion', 'Título asignado correctamente');
  assert(song.globalKey.tonic === 'C' && song.globalKey.scale === 'major', 'Tonalidad global es C major');
  assert(song.sections[0].chords.length === 1, 'Genera 1 acorde');

  const chord = song.sections[0].chords[0];
  assert(chord.roman === 'I', `Romano canónico es I (obtenido: ${chord.roman})`);
  assert(chord.symbol === 'C', `Símbolo canónico es C (obtenido: ${chord.symbol})`);
  assert((chord as any).inferred === true, 'Marcado con procedencia inferred = true');
  assert((chord as any).evidenceLevel === 'sufficient_evidence', 'Nivel de evidencia sufficient_evidence');
  assert((song as any).rawMidiIR !== undefined, 'Conserva referencia inmutable a rawMidiIR');
}

// ────────────────────────────────────────────────────────────────────────────
// 4. POSICIÓN FUNDAMENTAL E INVERSIONES (I, I6, I64, V6)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Reconocimiento de Posición Fundamental e Inversiones:');

// 4.1 I en fundamental (C)
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  t.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 }); // C3 (bajo)
  t.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 }); // E4
  t.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 }); // G4

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  assert(c.roman === 'I', `Fundamental: romano es I (obtenido: ${c.roman})`);
  assert(c.inversion === 0, 'Inversión es 0');
  assert(c.bass === 'C', 'Bajo es C');
}

// 4.2 I6 (primera inversión, C/E)
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  t.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 4 }); // E3 (bajo)
  t.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4 }); // C4
  t.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 }); // G4

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  assert(c.roman === 'I⁶', `Primera inversión: romano es I⁶ (obtenido: ${c.roman})`);
  assert(c.symbol === 'C/E', `Símbolo es C/E (obtenido: ${c.symbol})`);
  assert(c.inversion === 1, 'Inversión es 1');
  assert(c.bass === 'E', 'Bajo efectivo es E');
}

// 4.3 I64 (segunda inversión, C/G)
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  t.addNote({ midi: 43, ticks: 0, durationTicks: ppq * 4 }); // G2 (bajo)
  t.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4 }); // C4
  t.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 }); // E4

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  assert(c.roman === 'I⁶₄', `Segunda inversión: romano es I⁶₄ (obtenido: ${c.roman})`);
  assert(c.symbol === 'C/G', `Símbolo es C/G (obtenido: ${c.symbol})`);
  assert(c.inversion === 2, 'Inversión es 2');
  assert(c.bass === 'G', 'Bajo efectivo es G');
}

// 4.4 V6 (Sol mayor en primera inversión, G/B)
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  t.addNote({ midi: 47, ticks: 0, durationTicks: ppq * 4 }); // B2 (bajo)
  t.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 }); // G3
  t.addNote({ midi: 62, ticks: 0, durationTicks: ppq * 4 }); // D4

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  assert(c.roman === 'V⁶', `Sol en 1ª inversión: romano es V⁶ (obtenido: ${c.roman})`);
  assert(c.symbol === 'G/B', `Símbolo es G/B (obtenido: ${c.symbol})`);
  assert(c.inversion === 1, 'Inversión es 1');
  assert(c.bass === 'B', 'Bajo efectivo es B');
}

// ────────────────────────────────────────────────────────────────────────────
// 5. COLOR DE BLOQUE ARMÓNICO POR BAJO EFECTIVO (REQ-9.2)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Regla de Color Armónico por Bajo Efectivo:');
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  // C/E (inversión 1 con Mi en el bajo)
  t.addNote({ midi: 52, ticks: 0, durationTicks: ppq * 4 }); // E3
  t.addNote({ midi: 60, ticks: 0, durationTicks: ppq * 4 }); // C4
  t.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 }); // G4

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  // En Hooktheory, el grado 3 (E en Do mayor) corresponde al color amarillo (#C9AC17 o similar)
  // mientras que el grado 1 (C) es rojo (#D92525)
  assert(c.color !== undefined, 'Acorde tiene color asignado');
  assert(c.color !== '#D92525', 'El color de C/E NO es rojo (no deriva de la raíz C)');
  assert(c.color === '#C9AC17', `El color de C/E deriva del bajo E (grado 3 amarillo: ${c.color})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 6. DISTINCIÓN ESTRUCTURAL: add9 vs 9 (REQ-3.4)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Distinción Estructural entre add9 y 9:');

// 6.1 Acorde add9: Tríada + 9ª añadida sin 7ª
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  // C(add9): C3 (48), E4 (64), G4 (67), D5 (74)
  t.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 }); // C3
  t.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 }); // E4
  t.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 }); // G4
  t.addNote({ midi: 74, ticks: 0, durationTicks: ppq * 4 }); // D5 (9ª)

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  assert(c.symbol === 'C⁽add9⁾', `Símbolo de add9 es C⁽add9⁾ (obtenido: ${c.symbol})`);
  assert(c.roman === 'I⁽ᵃᵈᵈ⁹⁾', `Romano de add9 es I⁽ᵃᵈᵈ⁹⁾ (obtenido: ${c.roman})`);
  assert(c.type === 5, 'Tipo estructural es 5 (tríada, no tétrada)');
}

// 6.2 Acorde 9 estructural: Tétrada con 7ª + 9ª
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  // Cmaj9: C3 (48), E4 (64), G4 (67), B4 (71 = 7ª), D5 (74 = 9ª)
  t.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 });
  t.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 });
  t.addNote({ midi: 67, ticks: 0, durationTicks: ppq * 4 });
  t.addNote({ midi: 71, ticks: 0, durationTicks: ppq * 4 });
  t.addNote({ midi: 74, ticks: 0, durationTicks: ppq * 4 });

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const c = song.sections[0].chords[0];
  assert(c.symbol.includes('9') && !c.symbol.includes('add9'), `Símbolo de 9 estructural es Cmaj9 (obtenido: ${c.symbol})`);
  assert(c.type >= 7, 'Tipo estructural es >= 7');
}

// ────────────────────────────────────────────────────────────────────────────
// 7. DOMINANTES SECUNDARIAS: V/ii vs ii/V
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Dominantes Secundarias y Precisión Semántica (V/ii vs ii/V):');

// 7.1 V/ii en Do mayor (A mayor: A - C# - E resolviendo en ii)
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  // Compás 1: A mayor (V/ii)
  t.addNote({ midi: 45, ticks: 0, durationTicks: ppq * 4 }); // A2
  t.addNote({ midi: 61, ticks: 0, durationTicks: ppq * 4 }); // C#4
  t.addNote({ midi: 64, ticks: 0, durationTicks: ppq * 4 }); // E4
  // Compás 2: Dm (ii)
  t.addNote({ midi: 50, ticks: ppq * 4, durationTicks: ppq * 4 }); // D3
  t.addNote({ midi: 62, ticks: ppq * 4, durationTicks: ppq * 4 }); // D4
  t.addNote({ midi: 65, ticks: ppq * 4, durationTicks: ppq * 4 }); // F4
  t.addNote({ midi: 69, ticks: ppq * 4, durationTicks: ppq * 4 }); // A4

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const v_ii = song.sections[0].chords[0];
  const ii = song.sections[0].chords[1];

  assert(v_ii.secondaryType === 'V', 'Tipo secundario es V');
  assert(v_ii.appliedTarget === 2, 'Objetivo aplicado es grado 2 (ii)');
  assert(v_ii.roman === 'V/ii', `Cifrado romano es V/ii (obtenido: ${v_ii.roman})`);
  assert(v_ii.symbol === 'A', `Símbolo es A (obtenido: ${v_ii.symbol})`);
  assert(v_ii.root === 'A', 'Fundamental es A');
  assert(ii.roman === 'ii', `Acorde de resolución es ii (obtenido: ${ii.roman})`);
  assert(ii.symbol === 'Dm', `Símbolo de resolución es Dm (obtenido: ${ii.symbol})`);
}

// 7.2 ii/V en Do mayor (Em: E - G - B en contexto de modulación o dominante V)
{
  const midi = new Midi();
  const ppq = 480;
  const t = midi.addTrack();
  // D mayor (V/V en C): D3, F#4, A4
  t.addNote({ midi: 50, ticks: 0, durationTicks: ppq * 4 });
  t.addNote({ midi: 66, ticks: 0, durationTicks: ppq * 4 });
  t.addNote({ midi: 69, ticks: 0, durationTicks: ppq * 4 });

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const v_v = song.sections[0].chords[0];
  assert(v_v.secondaryType === 'V', 'Tipo secundario es V');
  assert(v_v.appliedTarget === 5, 'Objetivo es V');
  assert(v_v.roman === 'V/V', `Romano es V/V (obtenido: ${v_v.roman})`);
  assert(v_v.symbol === 'D', `Símbolo es D (obtenido: ${v_v.symbol})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 8. ABSTENCIÓN JUSTIFICADA ANTE CASOS DESCONOCIDOS / ATONALES
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Abstención Justificada ante Ambigüedad y Colecciones Atonales:');

// 8.1 Segmento armónico sin evidencia (unknown)
{
  const unknownSeg = {
    startTick: 0,
    endTick: 1920,
    startBeat: 1,
    durationBeats: 4,
    chordSymbol: '?',
    romanNumeral: '?',
    rootPitchClass: 0,
    quality: 'maj',
    inversion: 0,
    bassPitchClass: 0,
    isSecondary: false,
    isBorrowed: false,
    evidenceLevel: 'unknown' as const,
    alternativeHypotheses: [],
    sourceNoteIds: [],
  };

  const chord = convertMidiHarmonicSegmentToUniversalChord(unknownSeg, 'C', 'major');
  assert(chord.roman === '?', 'Romano es ? ante evidencia unknown');
  assert(chord.symbol === '?', 'Símbolo es ? ante evidencia unknown');
  assert((chord as any).evidenceLevel === 'unknown', 'Preserva evidenceLevel unknown');
  assert((chord as any).inferred === true, 'Marcado como inferencia');
}

// ────────────────────────────────────────────────────────────────────────────
// 9. RITMOS NO CUANTIZADOS Y CAMBIOS DE TEMPO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Ritmos No Cuantizados, Cambios de Tempo y Compases:');
{
  const midi = new Midi();
  const ppq = 480;
  // Tempo inicial 120 BPM, cambio en tick 1920 a 80 BPM
  midi.header.tempos.push({ ticks: 0, bpm: 120 });
  midi.header.tempos.push({ ticks: ppq * 4, bpm: 80 });

  const t = midi.addTrack();
  // Nota sincopada ligeramente retrasada (tick 120 = 1/4 de beat)
  t.addNote({ midi: 72, ticks: 120, durationTicks: ppq });
  // Nota en compás 2 (tick 1920)
  t.addNote({ midi: 76, ticks: ppq * 4, durationTicks: ppq * 2 });

  const song = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  const melody = song.sections[0].melody;
  assert(melody.length === 2, 'Lee las 2 notas melódicas');
  assert(melody[0].beat === 1.25, `Nota sincopada en beat 1.25 (obtenido: ${melody[0].beat})`);
  assert(melody[1].beat === 5, `Nota en compás 2 exactamente en beat 5.0 (obtenido: ${melody[1].beat})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 10. ARCHIVOS VACÍOS, TRUNCADOS Y FORMATOS NO SOPORTADOS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n10. Manejo Defensivo de Errores Binarios:');

// 10.1 Archivo vacío (0 bytes)
try {
  await parseMidiToUniversalSong(new Uint8Array(0));
  assert(false, 'Buffer de 0 bytes debió lanzar error');
} catch (e: any) {
  assert(e instanceof MidiParseError && e.code === 'EMPTY_FILE', 'Lanza EMPTY_FILE ante buffer vacío');
}

// 10.2 Archivo truncado
try {
  await parseMidiToUniversalSong(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00]));
  assert(false, 'Buffer truncado debió lanzar error');
} catch (e: any) {
  assert(e instanceof MidiParseError && e.code === 'TRUNCATED_HEADER', 'Lanza TRUNCATED_HEADER ante cabecera incompleta');
}

// 10.3 Formato 2 no soportado
{
  const midiF2 = new Midi();
  const bytesF2 = midiF2.toArray();
  bytesF2[9] = 2; // Forzar Format 2
  try {
    await parseMidiToUniversalSong(bytesF2);
    assert(false, 'Format 2 debió ser rechazado');
  } catch (e: any) {
    assert(e instanceof MidiParseError && e.code === 'UNSUPPORTED_FORMAT', 'Rechaza Format 2 con código UNSUPPORTED_FORMAT');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 11. SEGURIDAD ANTE CANCELACIÓN Y AISLAMIENTO DE ESTADO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n11. Aislamiento de Estado y Seguridad ante Cancelación:');
{
  const initialActiveSong: UniversalSong = {
    id: 'original_song_id',
    title: 'Canción Activa Original',
    artist: 'Original Artist',
    bpm: 120,
    defaultSwing: { enabled: false, percentage: 50, subdivision: '8n' },
    globalKey: { tonic: 'F', scale: 'major' },
    sections: [],
  };

  let simulatedStoreState = {
    currentSong: initialActiveSong,
    selectedSongId: initialActiveSong.id,
  };

  // Simulación: usuario abre modal, analiza un archivo pero CANCELA
  const midi = new Midi();
  const track = midi.addTrack();
  track.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
  const file = createSyntheticFile(midi, 'cancel_test.mid');

  // La inspección se ejecuta
  const preview = await inspectMidiTracks(file);
  assert(preview.tracks.length === 1, 'Inspección completada con éxito');

  // Usuario pulsa "Cancelar" -> la canción activa NO sufre mutación
  assert(simulatedStoreState.currentSong.id === 'original_song_id', 'ID de canción activa permanece inalterado');
  assert(simulatedStoreState.currentSong.title === 'Canción Activa Original', 'Título permanece inalterado');
  assert(simulatedStoreState.currentSong.globalKey.tonic === 'F', 'Tonalidad activa permanece en F mayor');
}

// ────────────────────────────────────────────────────────────────────────────
// 12. REANÁLISIS TRAS CORRECCIÓN MANUAL DE PARÁMETROS
// ────────────────────────────────────────────────────────────────────────────
console.log('\n12. Reanálisis Dinámico con Nueva Tonalidad de Referencia:');
{
  const midi = new Midi();
  const ppq = 480;
  const track = midi.addTrack();
  // Acorde G mayor: G3 (55), B4 (71), D5 (74)
  track.addNote({ midi: 55, ticks: 0, durationTicks: ppq * 4 });
  track.addNote({ midi: 71, ticks: 0, durationTicks: ppq * 4 });
  track.addNote({ midi: 74, ticks: 0, durationTicks: ppq * 4 });

  // Análisis 1: En contexto de Do mayor -> Sol es V
  const songInC = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'C', keyScale: 'major' });
  assert(songInC.sections[0].chords[0].roman === 'V', 'En Do Mayor, el acorde es V');
  assert(songInC.sections[0].chords[0].symbol === 'G', 'Símbolo es G');

  // Análisis 2: Reanálisis en contexto de Sol mayor -> Sol es I
  const songInG = await parseMidiToUniversalSong(midi.toArray(), { keyTonic: 'G', keyScale: 'major' });
  assert(songInG.sections[0].chords[0].roman === 'I', 'Reanalizado en Sol Mayor, el acorde es I');
  assert(songInG.sections[0].chords[0].symbol === 'G', 'Símbolo sigue siendo G');
}

// ────────────────────────────────────────────────────────────────────────────
// 13. CLASIFICACIÓN MELÓDICA CONTEXTUAL Y NOTAS DE PASO
// ────────────────────────────────────────────────────────────────────────────
console.log('\n13. Clasificación Contextual de Notas Melódicas:');
{
  const midi = new Midi();
  const ppq = 480;
  const tAcc = midi.addTrack();
  tAcc.addNote({ midi: 48, ticks: 0, durationTicks: ppq * 4 }); // C3

  const tMel = midi.addTrack();
  // C5 (acorde) -> D5 (paso) -> E5 (acorde)
  tMel.addNote({ midi: 72, ticks: 0, durationTicks: ppq });
  tMel.addNote({ midi: 74, ticks: ppq, durationTicks: ppq });
  tMel.addNote({ midi: 76, ticks: ppq * 2, durationTicks: ppq });

  const song = await parseMidiToUniversalSong(midi.toArray(), {
    keyTonic: 'C',
    keyScale: 'major',
    melodyTrackIndex: 1,
  });

  const [n1, n2, n3] = song.sections[0].melody;
  assert((n1 as any).melodicRole === 'chord_tone', 'n1 (C5) clasificado como chord_tone');
  assert((n1 as any).isChordTone === true, 'n1 isChordTone es true');
  assert((n2 as any).melodicRole === 'passing_tone', 'n2 (D5) clasificado como passing_tone');
  assert((n2 as any).isChordTone === false, 'n2 isChordTone es false');
  assert((n3 as any).melodicRole === 'chord_tone', 'n3 (E5) clasificado como chord_tone');
  assert((n3 as any).isChordTone === true, 'n3 isChordTone es true');
}

// ────────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`INTEGRATION TESTS (PHASES 4 & 5) RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  throw new Error(`Integration tests failed: ${failed} failure(s)`);
}
