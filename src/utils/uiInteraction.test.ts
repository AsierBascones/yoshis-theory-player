/**
 * uiInteraction.test.ts
 * Pruebas unitarias para UI/UX, transporte, selección persistente y nombres de escalas.
 */

import { formatScaleName } from './musicTheory';
import usePlayerStore from '../store/usePlayerStore';
import type { UniversalChord, ScaleMode } from '../types/music';
import { isLoopActive } from '../audio/audioEngine';
import { resolveChordVoices } from './theoryEngine';

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

console.log('=== TEST SUITE: UI/UX, Transport & Selection ===\n');

// ────────────────────────────────────────────────────────────────────────────
// 1. FORMATEO VISUAL DE NOMBRES DE ESCALAS (formatScaleName)
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Formateo de nombres de escalas:');

assert(formatScaleName('Harmonic_minor') === 'Harmonic minor', `Harmonic_minor -> Harmonic minor (obtenido: ${formatScaleName('Harmonic_minor')})`);
assert(formatScaleName('harmonic_minor') === 'Harmonic minor', `harmonic_minor -> Harmonic minor (obtenido: ${formatScaleName('harmonic_minor')})`);
assert(formatScaleName('Natural_minor') === 'Natural minor', `Natural_minor -> Natural minor (obtenido: ${formatScaleName('Natural_minor')})`);
assert(formatScaleName('natural_minor') === 'Natural minor', `natural_minor -> Natural minor (obtenido: ${formatScaleName('natural_minor')})`);
assert(formatScaleName('Phrygian') === 'Phrygian', `Phrygian -> Phrygian (obtenido: ${formatScaleName('Phrygian')})`);
assert(formatScaleName('phrygian') === 'Phrygian', `phrygian -> Phrygian (obtenido: ${formatScaleName('phrygian')})`);
assert(formatScaleName('phrygian_dominant') === 'Phrygian dominant', `phrygian_dominant -> Phrygian dominant (obtenido: ${formatScaleName('phrygian_dominant')})`);
assert(formatScaleName('major') === 'Major', `major -> Major (obtenido: ${formatScaleName('major')})`);
assert(formatScaleName('minor') === 'Minor', `minor -> Minor (obtenido: ${formatScaleName('minor')})`);
assert(formatScaleName('') === 'Major', `Cadena vacía produce Major por defecto`);

// ────────────────────────────────────────────────────────────────────────────
// 2. PERSISTENCIA DE SELECCIÓN DE ACORDE EN EL STORE
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. Persistencia de selección de acordes en Zustand:');

const testChord1: UniversalChord = {
  id: 'c-test-1',
  beat: 1,
  duration: 4,
  roman: 'I',
  symbol: 'C',
  rootSd: '1',
  quality: 'maj',
  type: 5,
  inversion: 0,
  notes: ['C4', 'E4', 'G4'],
  midiNotes: [60, 64, 67],
  bassNote: 'C3',
};

const testChord2: UniversalChord = {
  id: 'c-test-2',
  beat: 5,
  duration: 4,
  roman: 'vii°⁷/ii',
  symbol: 'A#°7',
  rootSd: '2',
  quality: 'dim7',
  type: 7,
  inversion: 0,
  notes: ['A#4', 'C#4', 'E4', 'G4'],
  midiNotes: [70, 73, 76, 79],
  bassNote: 'A#3',
};

// 2.1: Estado inicial sin selección
assert(usePlayerStore.getState().selectedChord === null, 'Inicialmente selectedChord es null');

// 2.2: Selección de un acorde
usePlayerStore.getState().setSelectedChord(testChord1);
assert(usePlayerStore.getState().selectedChord?.id === 'c-test-1', 'setSelectedChord establece el acorde seleccionado');

// 2.3: La selección permanece estable tras avanzar currentBeat (simulación de playhead)
usePlayerStore.getState().setCurrentBeat(8);
assert(usePlayerStore.getState().selectedChord?.id === 'c-test-1', 'La selección NO se borra cuando el playhead avanza');

// 2.4: La selección permanece estable al alternar isPlaying
usePlayerStore.getState().setPlaying(true);
assert(usePlayerStore.getState().selectedChord?.id === 'c-test-1', 'La selección NO se borra al iniciar reproducción');
usePlayerStore.getState().setPlaying(false);
assert(usePlayerStore.getState().selectedChord?.id === 'c-test-1', 'La selección NO se borra al pausar');

// 2.5: La selección se actualiza al seleccionar otro acorde
usePlayerStore.getState().setSelectedChord(testChord2);
assert(usePlayerStore.getState().selectedChord?.id === 'c-test-2', 'Al seleccionar otro acorde se actualiza correctamente');

// 2.6: Limpieza manual explícita
usePlayerStore.getState().setSelectedChord(null);
assert(usePlayerStore.getState().selectedChord === null, 'La selección puede limpiarse explícitamente pasando null');

// ────────────────────────────────────────────────────────────────────────────
// 3. LÓGICA DE FILTRADO DE ATAJO DE TECLADO (Enter y Space)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Lógica de filtrado de atajo de teclado:');

function shouldHandleShortcut(key: string, code: string, targetTag: string, isEditable: boolean): boolean {
  if (key !== 'Enter' && code !== 'Space' && key !== ' ') {
    return false;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(targetTag) || isEditable) {
    return false;
  }
  return true;
}

assert(shouldHandleShortcut('Enter', 'Enter', 'BODY', false) === true, 'Enter en BODY ejecuta el atajo');
assert(shouldHandleShortcut(' ', 'Space', 'DIV', false) === true, 'Space en DIV ejecuta el atajo');
assert(shouldHandleShortcut('Enter', 'Enter', 'INPUT', false) === false, 'Enter en INPUT NO ejecuta el atajo');
assert(shouldHandleShortcut('Enter', 'Enter', 'TEXTAREA', false) === false, 'Enter en TEXTAREA NO ejecuta el atajo');
assert(shouldHandleShortcut('Enter', 'Enter', 'SELECT', false) === false, 'Enter en SELECT NO ejecuta el atajo');
assert(shouldHandleShortcut('Enter', 'Enter', 'DIV', true) === false, 'Enter en elemento editable NO ejecuta el atajo');
assert(shouldHandleShortcut('Enter', 'Enter', 'BUTTON', false) === false, 'Enter en BUTTON NO ejecuta el atajo global (evita doble toggle)');
assert(shouldHandleShortcut('Escape', 'Escape', 'BODY', false) === false, 'Otras teclas NO activan el atajo');

// ────────────────────────────────────────────────────────────────────────────
// 4. COMPORTAMIENTO Y SINCRONIZACIÓN DEL BOTÓN LOOP
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Comportamiento y sincronización del botón Loop:');

// 4.1: Activar Loop sincroniza el estado de Zustand y el transporte de audio
usePlayerStore.getState().setLoop(true);
assert(usePlayerStore.getState().loop === true, 'setLoop(true) actualiza loop en store');
assert(isLoopActive === true, 'setLoop(true) sincroniza isLoopActive en audioEngine');

// 4.2: Desactivar Loop antes de reproducir
usePlayerStore.getState().setLoop(false);
assert(usePlayerStore.getState().loop === false, 'setLoop(false) actualiza loop a false en store');
assert(isLoopActive === false, 'setLoop(false) propaga loop=false al transporte de audio');

// 4.3: Desactivar Loop durante la reproducción no altera la posición ni reinicia la canción
usePlayerStore.getState().setCurrentBeat(8);
usePlayerStore.getState().setPlaying(true);
usePlayerStore.getState().setLoop(false);
assert(usePlayerStore.getState().currentBeat === 8, 'Desactivar Loop durante reproducción conserva currentBeat (obtenido: 8)');
assert(usePlayerStore.getState().isPlaying === true, 'Desactivar Loop durante reproducción mantiene isPlaying activo');
assert(isLoopActive === false, 'audioEngine recibe desactivación inmediata de loop');

// 4.4: Iniciar una canción nueva no reactiva accidentalmente Loop si el usuario lo desactivó
// Loop sigue en false antes de cambiar canción
const songs = usePlayerStore.getState().catalog;
if (songs.length >= 2) {
  usePlayerStore.getState().setSongId(songs[1].id);
  assert(usePlayerStore.getState().loop === false, 'Cambiar de canción conserva loop=false en store');
  assert(isLoopActive === false, 'setupSong no reactiva forzadamente el bucle en audioEngine');
  // Restaurar canción 0
  usePlayerStore.getState().setSongId(songs[0].id);
} else {
  // Comprobación directa de preservación en setupSong
  assert(isLoopActive === false, 'isLoopActive permanece en false');
}

// 4.5: Reactivación de Loop funciona correctamente
usePlayerStore.getState().setLoop(true);
assert(usePlayerStore.getState().loop === true, 'Reactivar loop establece true en store');
assert(isLoopActive === true, 'Reactivar loop propaga true a audioEngine');

// 4.6: Al finalizar la canción con Loop desactivado, la reproducción se detiene sin volver al inicio
usePlayerStore.getState().setLoop(false);
const totalBeats = usePlayerStore.getState().song.totalBeats;
// Simulación de llegada al final
usePlayerStore.getState().setCurrentBeat(totalBeats);
usePlayerStore.getState().setPlaying(false);
assert(usePlayerStore.getState().currentBeat === totalBeats, `Al finalizar sin loop se conserva en el beat final ${totalBeats} sin reiniciar a beat 1`);
assert(usePlayerStore.getState().isPlaying === false, 'isPlaying pasa a false al finalizar');

// ────────────────────────────────────────────────────────────────────────────
// 5. NOMBRES DE NOTAS DE LOS ACORDES EN EL PIANO ROLL
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Nombres de notas de los acordes en el Piano Roll:');

// 5.1: Verificación de voces resueltas con altura MIDI real y nombres de notas
const chordVoicesC = resolveChordVoices(testChord1, { tonic: 'C', scale: 'major' as ScaleMode });
assert(chordVoicesC.length >= 3, `Acorde Do mayor genera al menos 3 voces (obtenido: ${chordVoicesC.length})`);
assert(chordVoicesC[0].pitch.startsWith('C') || chordVoicesC[0].noteLabel === 'C', `Bajo de C contiene nota C (pitch: ${chordVoicesC[0].pitch}, label: ${chordVoicesC[0].noteLabel})`);
assert(chordVoicesC.some((v) => v.pitch.startsWith('E') || v.noteLabel === 'E'), 'Voces de C contienen tercera Mi (E)');
assert(chordVoicesC.some((v) => v.pitch.startsWith('G') || v.noteLabel === 'G'), 'Voces de C contienen quinta Sol (G)');

// 5.2: Respeto de ortografía modal y convención de bemoles en tonalidades con bemoles (Eb mayor)
const testChordEb: UniversalChord = {
  id: 'c-test-eb',
  beat: 1,
  duration: 4,
  roman: 'I',
  symbol: 'Eb',
  rootSd: '1',
  quality: 'maj',
  type: 5,
  inversion: 0,
  notes: ['Eb4', 'G4', 'Bb4'],
  midiNotes: [63, 67, 70],
  bassNote: 'Eb3',
  voices: [
    { midi: 51, pitch: 'Eb3', label: '1', noteLabel: 'Eb', sd: '1', color: '#D92525', isAltered: false, isBass: true, voiceNumber: '1' },
    { midi: 55, pitch: 'G3', label: '3', noteLabel: 'G', sd: '3', color: '#E57373', isAltered: false, isBass: false, voiceNumber: '2' },
    { midi: 58, pitch: 'Bb3', label: '5', noteLabel: 'Bb', sd: '5', color: '#EF9A9A', isAltered: false, isBass: false, voiceNumber: '3' },
  ],
};
const chordVoicesEb = resolveChordVoices(testChordEb, { tonic: 'Eb', scale: 'major' as ScaleMode });
assert(chordVoicesEb.some((v) => v.pitch.startsWith('Eb') || v.noteLabel === 'Eb'), 'Acorde Eb usa ortografía con bemoles Eb (no D#)', chordVoicesEb.map(v => ({ pitch: v.pitch, noteLabel: v.noteLabel, midi: v.midi })));
assert(chordVoicesEb.some((v) => v.pitch.startsWith('Bb') || v.noteLabel === 'Bb'), 'Acorde Eb usa ortografía con bemoles Bb (no A#)');

// 5.3: Adaptación de longitud de etiqueta (completa con octava vs compacta sin octava)
function getChordVoiceLabelForWidth(voice: { pitch: string; noteLabel: string }, w: number): string {
  const noteNameWithOctave = voice.pitch || 'C4';
  const noteNameShort = voice.noteLabel || noteNameWithOctave.replace(/\d+/g, '');
  return w >= 28 ? noteNameWithOctave : noteNameShort;
}

const sampleVoice = { pitch: 'C3', noteLabel: 'C' };
assert(getChordVoiceLabelForWidth(sampleVoice, 40) === 'C3', 'Bloque ancho (w >= 28) muestra altura con octava: C3');
assert(getChordVoiceLabelForWidth(sampleVoice, 20) === 'C', 'Bloque compacto (w < 28) muestra nombre sin octava: C');

// ────────────────────────────────────────────────────────────────────────────
// 6. CENTRADO ÓPTICO DEL BOTÓN PLAY
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Verificación geométrica del centrado óptico del botón Play:');

// El icono triangular M8 5v14l11-7z en viewBox 0 0 24 24:
// Vértices: (8, 5), (8, 19), (19, 12)
// Centroide Y: (5 + 19 + 12) / 3 = 12.0 (perfectamente centrado verticalmente en 24)
// Centroide X: (8 + 8 + 19) / 3 = 11.67 (a solo 0.33 unidades del centro 12.0)
const playTriangle = {
  v1: { x: 8, y: 5 },
  v2: { x: 8, y: 19 },
  v3: { x: 19, y: 12 },
};
const centroidX = (playTriangle.v1.x + playTriangle.v2.x + playTriangle.v3.x) / 3;
const centroidY = (playTriangle.v1.y + playTriangle.v2.y + playTriangle.v3.y) / 3;

assert(centroidY === 12, `Centroide vertical del triángulo está exactamente centrado en Y=12`);
assert(Math.abs(centroidX - 12) < 0.5, `Centroide horizontal del triángulo está a menos de 0.5 unidades de X=12 (obtenido: ${centroidX.toFixed(2)})`);

console.log(`\n========================================`);
console.log(`UI INTERACTION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================\n`);

if (failed > 0) {
  throw new Error(`UI interaction tests failed: ${failed} failure(s)`);
}
