/**
 * midiVoiceSeparation.test.ts
 * Batería de pruebas exhaustivas para la inferencia no destructiva de manos, voces,
 * texturas de acompañamiento (ragtime/stride/arpegio) e integración armónica.
 */

import { parseMidiBufferToIR } from './midiParser';
import { analyzeMidiMusicalIR } from './midiHarmonicAnalyzer';
import { convertMidiAnalysisToUniversalSong } from './midiHooktheoryAdapter';
import { classifyMidiVoices } from './midiVoiceClassifier';

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

console.log('=== TEST SUITE: MIDI Voice & Hand Separation and Harmonic Integration ===\n');

function encodeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  if (value === 0) return [0];
  const bytes: number[] = [];
  let temp = value;
  while (temp > 0) {
    bytes.push(temp & 0x7f);
    temp >>= 7;
  }
  bytes.reverse();
  for (let i = 0; i < bytes.length - 1; i++) {
    bytes[i] |= 0x80;
  }
  return bytes;
}

function buildMTrk(eventsBytes: number[]): number[] {
  const len = eventsBytes.length;
  return [
    0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...eventsBytes,
  ];
}

function buildSMF(format: 0 | 1, ppq: number, tracks: number[][]): Uint8Array {
  const numTracks = tracks.length;
  const mthd = [
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06,
    (format >> 8) & 0xff, format & 0xff,
    (numTracks >> 8) & 0xff, numTracks & 0xff,
    (ppq >> 8) & 0xff, ppq & 0xff,
  ];
  const allBytes = [...mthd];
  for (const t of tracks) {
    allBytes.push(...buildMTrk(t));
  }
  return new Uint8Array(allBytes);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Piano Solo en Pista Única con Melodía y Acompañamiento Mezclados
// ────────────────────────────────────────────────────────────────────────────
console.log('1. Piano Solo en Pista Única:');
{
  const ppq = 480;
  // Compás 1: Bajo C3 (48), Acorde central [E4 (64), G4 (67)], Melodía superior C5 (72)
  const trackEvents: number[] = [];
  // Beat 1 (tick 0): Bajo C3 (48), Acorde E4(64), G4(67), Melodía C5(72)
  trackEvents.push(...encodeVLQ(0), 0x90, 48, 80);
  trackEvents.push(...encodeVLQ(0), 0x90, 64, 75);
  trackEvents.push(...encodeVLQ(0), 0x90, 67, 75);
  trackEvents.push(...encodeVLQ(0), 0x90, 72, 90);

  // Beat 2 (tick 480): Apagar notas anteriores y continuar melodía D5(74)
  trackEvents.push(...encodeVLQ(480), 0x80, 48, 0);
  trackEvents.push(...encodeVLQ(0), 0x80, 64, 0);
  trackEvents.push(...encodeVLQ(0), 0x80, 67, 0);
  trackEvents.push(...encodeVLQ(0), 0x80, 72, 0);

  trackEvents.push(...encodeVLQ(0), 0x90, 74, 85);
  // Beat 3 (tick 960)
  trackEvents.push(...encodeVLQ(480), 0x80, 74, 0);
  trackEvents.push(...encodeVLQ(0), 0x90, 76, 85); // E5
  // End of track (tick 1920)
  trackEvents.push(...encodeVLQ(960), 0x80, 76, 0);
  trackEvents.push(...encodeVLQ(0), 0xff, 0x2f, 0x00);

  const smf = buildSMF(0, ppq, [trackEvents]);
  const ir = parseMidiBufferToIR(smf);
  const voiceRes = classifyMidiVoices(ir);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(Boolean(analysis.voiceAnalysis), 'Genera voiceAnalysis en el resultado');
  assert(ir.allNotes.length === 6, `Conserva exactamente 6 notas originales (obtenido: ${ir.allNotes.length})`);

  // Verificar roles inferidos
  const bassNote = ir.allNotes.find((n) => n.pitchMidi === 48);
  const chordNoteE = ir.allNotes.find((n) => n.pitchMidi === 64);
  const melNoteC5 = ir.allNotes.find((n) => n.pitchMidi === 72);

  const bassVoice = bassNote ? voiceRes.voiceNotes[bassNote.id] : undefined;
  const chordVoice = chordNoteE ? voiceRes.voiceNotes[chordNoteE.id] : undefined;
  const melVoice = melNoteC5 ? voiceRes.voiceNotes[melNoteC5.id] : undefined;

  assert(bassVoice?.voiceRole === 'bass', `C3 clasificado como bajo (obtenido: ${bassVoice?.voiceRole})`);
  assert(bassVoice?.hand === 'left', `Bajo asignado a mano izquierda (obtenido: ${bassVoice?.hand})`);
  assert(chordVoice?.voiceRole === 'accompaniment_chord', `E4 clasificado como acorde de acompañamiento (obtenido: ${chordVoice?.voiceRole})`);
  assert(melVoice?.voiceRole === 'primary_melody', `C5 clasificado como melodía principal (obtenido: ${melVoice?.voiceRole})`);
  assert(melVoice?.hand === 'right', `C5 asignado a mano derecha (obtenido: ${melVoice?.hand})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 2. MIDI Multitrack con Pistas Separadas (Bass, Chords, Lead)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n2. MIDI Multitrack con Pistas Separadas:');
{
  const ppq = 480;
  // Pista 1: Bass (nombre de pista: "Acoustic Bass", program 32)
  const track1: number[] = [
    ...encodeVLQ(0), 0xff, 0x03, 0x04, 0x42, 0x61, 0x73, 0x73, // Track name: "Bass"
    ...encodeVLQ(0), 0xc0, 32, // Program 32 (Acoustic Bass)
    ...encodeVLQ(0), 0x90, 36, 90, // C2 (tick 0)
    ...encodeVLQ(1920), 0x80, 36, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  // Pista 2: Lead (nombre de pista: "Lead Melody")
  const track2: number[] = [
    ...encodeVLQ(0), 0xff, 0x03, 0x04, 0x4c, 0x65, 0x61, 0x64, // Track name: "Lead"
    ...encodeVLQ(0), 0x91, 72, 85, // C5
    ...encodeVLQ(480), 0x81, 72, 0,
    ...encodeVLQ(0), 0x91, 74, 85, // D5
    ...encodeVLQ(480), 0x81, 74, 0,
    ...encodeVLQ(0), 0x91, 76, 85, // E5
    ...encodeVLQ(960), 0x81, 76, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(1, ppq, [track1, track2]);
  const ir = parseMidiBufferToIR(smf);
  const voiceRes = classifyMidiVoices(ir);

  assert(voiceRes.hasIndependentTracks === true, 'Detecta pistas independientes con tesituras separadas');
  assert(voiceRes.confidence >= 0.85, `Confianza global alta ante pistas separadas (obtenido: ${voiceRes.confidence})`);

  const bassNote = ir.allNotes.find((n) => n.pitchMidi === 36);
  const leadNote = ir.allNotes.find((n) => n.pitchMidi === 72);
  assert(voiceRes.voiceNotes[bassNote!.id]?.voiceRole === 'bass', 'Pista Bass asigna rol bass');
  assert(voiceRes.voiceNotes[leadNote!.id]?.voiceRole === 'primary_melody', 'Pista Lead asigna primary_melody');
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Ragtime en Do Mayor con Bajo Alternante C–G
// ────────────────────────────────────────────────────────────────────────────
console.log('\n3. Ragtime en Do Mayor con Bajo Alternante C–G:');
{
  const ppq = 480;
  // Patrón Ragtime:
  // Beat 1: C2 (36)
  // Beat 2: [E3 (52), G3 (55), C4 (60)]
  // Beat 3: G2 (43) (salto de quinta)
  // Beat 4: [E3 (52), G3 (55), C4 (60)]
  const track: number[] = [
    // Beat 1: C2
    ...encodeVLQ(0), 0x90, 36, 95,
    ...encodeVLQ(480), 0x80, 36, 0,
    // Beat 2: Acorde central
    ...encodeVLQ(0), 0x90, 52, 75,
    ...encodeVLQ(0), 0x90, 55, 75,
    ...encodeVLQ(0), 0x90, 60, 75,
    ...encodeVLQ(480), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    // Beat 3: G2 (quinta alternante)
    ...encodeVLQ(0), 0x90, 43, 90,
    ...encodeVLQ(480), 0x80, 43, 0,
    // Beat 4: Acorde central
    ...encodeVLQ(0), 0x90, 52, 75,
    ...encodeVLQ(0), 0x90, 55, 75,
    ...encodeVLQ(0), 0x90, 60, 75,
    ...encodeVLQ(480), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const voiceRes = classifyMidiVoices(ir);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(voiceRes.detectedTexture === 'stride_ragtime', `Textura detectada como stride_ragtime (obtenido: ${voiceRes.detectedTexture})`);

  const c2 = ir.allNotes.find((n) => n.pitchMidi === 36);
  const g2 = ir.allNotes.find((n) => n.pitchMidi === 43);
  const chordN = ir.allNotes.find((n) => n.pitchMidi === 52);

  assert(voiceRes.voiceNotes[c2!.id]?.hand === 'left', 'C2 asignado a mano izquierda');
  assert(voiceRes.voiceNotes[g2!.id]?.hand === 'left', 'G2 asignado a mano izquierda');
  assert(voiceRes.voiceNotes[chordN!.id]?.voiceRole === 'accompaniment_chord', 'Acorde central marcado como accompaniment_chord');

  // Integración armónica: No genera falso C/G ni I⁶₄
  assert(analysis.harmonicSegments.length === 1, `Unifica el compás de ragtime en 1 acorde (obtenido: ${analysis.harmonicSegments.length})`);
  const seg = analysis.harmonicSegments[0];
  assert(seg.chordSymbol === 'C', `Símbolo es C fundamental (obtenido: ${seg.chordSymbol})`);
  assert(seg.romanNumeral === 'I', `Romano es I (obtenido: ${seg.romanNumeral})`);
  assert(seg.inversion === 0, `Inversión es fundamental 0 (obtenido: ${seg.inversion})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Stride con Saltos Graves de Octava y Quinta (G1 < C2)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n4. Stride con Salto a Nota Más Grave (G1 < C2):');
{
  const ppq = 480;
  // Beat 1: C2 (MIDI 36)
  // Beat 2: Acorde [E3 (52), G3 (55), C4 (60)]
  // Beat 3: G1 (MIDI 31, más grave que C2!)
  // Beat 4: Acorde [E3 (52), G3 (55), C4 (60)]
  const track: number[] = [
    ...encodeVLQ(0), 0x90, 36, 95,
    ...encodeVLQ(480), 0x80, 36, 0,
    ...encodeVLQ(0), 0x90, 52, 75,
    ...encodeVLQ(0), 0x90, 55, 75,
    ...encodeVLQ(0), 0x90, 60, 75,
    ...encodeVLQ(480), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x90, 31, 95, // G1 (más grave que C2)
    ...encodeVLQ(480), 0x80, 31, 0,
    ...encodeVLQ(0), 0x90, 52, 75,
    ...encodeVLQ(0), 0x90, 55, 75,
    ...encodeVLQ(0), 0x90, 60, 75,
    ...encodeVLQ(480), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.harmonicSegments.length === 1, 'Unifica el compás de stride en 1 acorde');
  const seg = analysis.harmonicSegments[0];
  assert(seg.rootPitchClass === 0, `Fundamental armónica es C (obtenido: ${seg.rootPitchClass})`);
  assert(seg.inversion === 0, `Inversión es 0 (no se degrada a falso C/G a pesar de que G1 es la nota más grave absoluta)`);
  assert(seg.lowestMidi === 31, `lowestMidi registra fielmente G1 / 31 (obtenido: ${seg.lowestMidi})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Bajo Alternante que SÍ Pertenece a una Inversión Auténtica (C/E y C/G)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n5. Inversiones Auténticas Justificadas:');
{
  const ppq = 480;
  // Compás con 1ª inversión sostenida C/E:
  // Bajo E2 (40) en el pulso 1 y sostenido con voces [G3, C4, E4]
  const trackE: number[] = [
    ...encodeVLQ(0), 0x90, 40, 90, // E2 (tercera en el bajo)
    ...encodeVLQ(0), 0x90, 55, 70, // G3
    ...encodeVLQ(0), 0x90, 60, 75, // C4
    ...encodeVLQ(0), 0x90, 64, 80, // E4
    ...encodeVLQ(1920), 0x80, 40, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0x80, 60, 0,
    ...encodeVLQ(0), 0x80, 64, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smfE = buildSMF(0, ppq, [trackE]);
  const irE = parseMidiBufferToIR(smfE);
  const analysisE = analyzeMidiMusicalIR(irE, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });
  const segE = analysisE.harmonicSegments[0];

  assert(segE.inversion === 1, `Conserva primera inversión auténtica 1 (obtenido: ${segE.inversion})`);
  assert(segE.chordSymbol === 'C/E', `Símbolo refleja C/E (obtenido: ${segE.chordSymbol})`);
  assert(segE.romanNumeral.includes('I⁶'), `Romano refleja I⁶ (obtenido: ${segE.romanNumeral})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 6. Arpegio de una Única Armonía que No Debe Fragmentarse (Alberti Bass)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n6. Arpegio Continuo Consolidado (Alberti Bass):');
{
  const ppq = 480;
  // Alberti: C3 (48) -> G3 (55) -> E3 (52) -> G3 (55) repetido 4 veces en 1 compás
  const track: number[] = [];
  const pcs = [48, 55, 52, 55];
  for (let rep = 0; rep < 4; rep++) {
    for (const p of pcs) {
      track.push(...encodeVLQ(0), 0x90, p, 70);
      track.push(...encodeVLQ(120), 0x80, p, 0);
    }
  }
  track.push(...encodeVLQ(0), 0xff, 0x2f, 0x00);

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const voiceRes = classifyMidiVoices(ir);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(voiceRes.detectedTexture === 'arpeggiated', `Textura detectada como arpeggiated (obtenido: ${voiceRes.detectedTexture})`);
  assert(analysis.harmonicSegments.length === 1, `Alberti bass se consolida en 1 solo acorde (obtenido: ${analysis.harmonicSegments.length})`);
  assert(analysis.harmonicSegments[0].chordSymbol === 'C', `Acorde es C puro`);
  assert(analysis.harmonicSegments[0].inversion === 0, `Inversión es 0 (no fragmenta en falsos cambios)`);
}

// ────────────────────────────────────────────────────────────────────────────
// 7. Progresión ii–V Real y Rápida que Debe Permanecer Separada
// ────────────────────────────────────────────────────────────────────────────
console.log('\n7. Progresión ii–V Rápida:');
{
  const ppq = 480;
  // Compás de 4 tiempos:
  // Tiempos 1 y 2: Dm [D3 (50), F3 (53), A3 (57), D4 (62)]
  // Tiempos 3 y 4: G7 [G2 (43), F3 (53), B3 (59), D4 (62)]
  const track: number[] = [
    // Half 1: Dm
    ...encodeVLQ(0), 0x90, 50, 85,
    ...encodeVLQ(0), 0x90, 53, 80,
    ...encodeVLQ(0), 0x90, 57, 80,
    ...encodeVLQ(0), 0x90, 62, 85,
    ...encodeVLQ(960), 0x80, 50, 0,
    ...encodeVLQ(0), 0x80, 53, 0,
    ...encodeVLQ(0), 0x80, 57, 0,
    ...encodeVLQ(0), 0x80, 62, 0,
    // Half 2: G7
    ...encodeVLQ(0), 0x90, 43, 90,
    ...encodeVLQ(0), 0x90, 53, 80,
    ...encodeVLQ(0), 0x90, 59, 80,
    ...encodeVLQ(0), 0x90, 62, 85,
    ...encodeVLQ(960), 0x80, 43, 0,
    ...encodeVLQ(0), 0x80, 53, 0,
    ...encodeVLQ(0), 0x80, 59, 0,
    ...encodeVLQ(0), 0x80, 62, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  assert(analysis.harmonicSegments.length === 2, `Separa limpiamente la progresión ii-V en 2 acordes (obtenido: ${analysis.harmonicSegments.length})`);
  assert(analysis.harmonicSegments[0].rootPitchClass === 2, `Acorde 1 es D (ii)`);
  assert(analysis.harmonicSegments[0].quality === 'min', `Acorde 1 es menor`);
  assert(analysis.harmonicSegments[1].rootPitchClass === 7, `Acorde 2 es G (V)`);
}

// ────────────────────────────────────────────────────────────────────────────
// 8. Melodía Rápida con Adornos Sobre Tríada Estable (Sin Falsas Extensiones)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n8. Inmunidad Armónica ante Notas de Paso y Adornos:');
{
  const ppq = 480;
  // Acompañamiento estable: C mayor [C3, E3, G3] durante 4 tiempos
  // Melodía rápida con notas de paso (D5 = pitch 74, F5 = pitch 77)
  const track: number[] = [
    // Acorde C sostenido todo el compás (1920 ticks)
    ...encodeVLQ(0), 0x90, 48, 80,
    ...encodeVLQ(0), 0x90, 52, 75,
    ...encodeVLQ(0), 0x90, 55, 75,
    // Melodía rápida: C5(120) -> D5(120) -> E5(120) -> F5(120) -> G5(480)...
    ...encodeVLQ(0), 0x90, 72, 85, // C5
    ...encodeVLQ(120), 0x80, 72, 0,
    ...encodeVLQ(0), 0x90, 74, 80, // D5 (nota de paso breve)
    ...encodeVLQ(120), 0x80, 74, 0,
    ...encodeVLQ(0), 0x90, 76, 85, // E5
    ...encodeVLQ(120), 0x80, 76, 0,
    ...encodeVLQ(0), 0x90, 77, 80, // F5 (nota de paso breve)
    ...encodeVLQ(120), 0x80, 77, 0,
    ...encodeVLQ(0), 0x90, 79, 90, // G5 (nota tenida de acorde)
    ...encodeVLQ(1440), 0x80, 79, 0,
    ...encodeVLQ(0), 0x80, 48, 0,
    ...encodeVLQ(0), 0x80, 52, 0,
    ...encodeVLQ(0), 0x80, 55, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const voiceRes = classifyMidiVoices(ir);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const d5 = ir.allNotes.find((n) => n.pitchMidi === 74);
  assert(voiceRes.voiceNotes[d5!.id]?.voiceRole === 'ornament', `D5 breve clasificado como ornament (obtenido: ${voiceRes.voiceNotes[d5!.id]?.voiceRole})`);

  assert(analysis.harmonicSegments.length === 1, 'Compás agrupado en 1 acorde');
  const seg = analysis.harmonicSegments[0];
  assert(seg.chordSymbol === 'C', `Acorde es C puro sin falso add9 (obtenido: ${seg.chordSymbol})`);
  assert(seg.romanNumeral === 'I', `Romano es I (obtenido: ${seg.romanNumeral})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 9. Acordes con Séptimas Reales Estructuralmente Sostenidas
// ────────────────────────────────────────────────────────────────────────────
console.log('\n9. Preservación de Séptima Auténtica Estructural:');
{
  const ppq = 480;
  // Acorde G7 completo y sostenido: G2 (43), B3 (59), D4 (62), F4 (65) durante todo el compás
  const track: number[] = [
    ...encodeVLQ(0), 0x90, 43, 90,
    ...encodeVLQ(0), 0x90, 59, 80,
    ...encodeVLQ(0), 0x90, 62, 80,
    ...encodeVLQ(0), 0x90, 65, 85, // F4 (séptima menor estructural)
    ...encodeVLQ(1920), 0x80, 43, 0,
    ...encodeVLQ(0), 0x80, 59, 0,
    ...encodeVLQ(0), 0x80, 62, 0,
    ...encodeVLQ(0), 0x80, 65, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'C', referenceKeyScale: 'major' });

  const seg = analysis.harmonicSegments[0];
  assert(seg.chordSymbol === 'G7', `Séptima auténtica no se elimina: símbolo es G7 (obtenido: ${seg.chordSymbol})`);
  assert(seg.quality === 'dom7', `Cualidad es dom7 legítima (obtenido: ${seg.quality})`);
  assert(seg.romanNumeral === 'V⁷', `Romano es V⁷ (obtenido: ${seg.romanNumeral})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 10. Intro Solista de Fireflies en Mi Bemol Mayor
// ────────────────────────────────────────────────────────────────────────────
console.log('\n10. Intro Solista de Fireflies en Mi Bemol Mayor:');
{
  const ppq = 480;
  // Intro solista arpegiada en Eb mayor: Eb4 (63), G4 (67), Bb4 (70)
  const track: number[] = [
    ...encodeVLQ(0), 0x90, 63, 85,
    ...encodeVLQ(480), 0x80, 63, 0,
    ...encodeVLQ(0), 0x90, 67, 85,
    ...encodeVLQ(480), 0x80, 67, 0,
    ...encodeVLQ(0), 0x90, 70, 85,
    ...encodeVLQ(480), 0x80, 70, 0,
    ...encodeVLQ(0), 0x90, 67, 85,
    ...encodeVLQ(480), 0x80, 67, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const analysis = analyzeMidiMusicalIR(ir, { referenceKeyTonic: 'Eb', referenceKeyScale: 'major' });

  assert(analysis.harmonicSegments.length === 1, 'Genera segmento para la intro solista');
  const seg = analysis.harmonicSegments[0];
  assert(seg.chordSymbol === 'Eb', `Reconoce Eb en la intro solista (obtenido: ${seg.chordSymbol})`);
  assert(seg.romanNumeral === 'I', `Romano es I (no degradado a ?)`);
  assert(seg.evidenceLevel === 'sufficient_evidence', `Evidencia es sufficient_evidence`);
}

// ────────────────────────────────────────────────────────────────────────────
// 11. Invarianza Total: Notas MIDI Idénticas Antes y Después del Análisis
// ────────────────────────────────────────────────────────────────────────────
console.log('\n11. Invarianza Total de Notas MIDI Originales:');
{
  const ppq = 480;
  const track: number[] = [
    ...encodeVLQ(0), 0x90, 48, 82, // C3 vel 82
    ...encodeVLQ(240), 0x80, 48, 0,
    ...encodeVLQ(120), 0x90, 55, 91, // G3 vel 91 en tick 360
    ...encodeVLQ(600), 0x80, 55, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);

  // Copia de verificación de las notas originales antes de análisis
  const snapshotBefore = ir.allNotes.map((n) => ({ ...n }));

  const analysis = analyzeMidiMusicalIR(ir);
  const song = convertMidiAnalysisToUniversalSong(analysis, ir);

  assert(ir.allNotes.length === snapshotBefore.length, 'Número de notas idéntico');
  for (let i = 0; i < ir.allNotes.length; i++) {
    const b = snapshotBefore[i];
    const a = ir.allNotes[i];
    assert(b.id === a.id, `Nota ${i} conserva id exacto`);
    assert(b.pitchMidi === a.pitchMidi, `Nota ${i} conserva pitchMidi exacto`);
    assert(b.startTick === a.startTick, `Nota ${i} conserva startTick exacto`);
    assert(b.durationTicks === a.durationTicks, `Nota ${i} conserva durationTicks exacto`);
    assert(b.velocity === a.velocity, `Nota ${i} conserva velocity exacta`);
    assert(b.trackIndex === a.trackIndex, `Nota ${i} conserva trackIndex exacto`);
  }

  // Comprobar que en UniversalSong.melody las notas conservan las mismas duraciones y beats
  assert(song.sections[0].melody.length === ir.allNotes.length, 'UniversalSong.melody contiene todas las notas originales');
}

// ────────────────────────────────────────────────────────────────────────────
// 12. Determinismo Estricto (Importación, Reanálisis y Refresco)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n12. Determinismo Estricto:');
{
  const ppq = 480;
  const track: number[] = [
    ...encodeVLQ(0), 0x90, 36, 90,
    ...encodeVLQ(480), 0x80, 36, 0,
    ...encodeVLQ(0), 0x90, 60, 80,
    ...encodeVLQ(0), 0x90, 64, 80,
    ...encodeVLQ(480), 0x80, 60, 0,
    ...encodeVLQ(0), 0x80, 64, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir1 = parseMidiBufferToIR(smf);
  const ir2 = parseMidiBufferToIR(smf);

  const res1 = analyzeMidiMusicalIR(ir1);
  const res2 = analyzeMidiMusicalIR(ir2);

  assert(JSON.stringify(res1.harmonicSegments) === JSON.stringify(res2.harmonicSegments), 'Segmentos armónicos deterministas');
  assert(JSON.stringify(res1.melodyNotes) === JSON.stringify(res2.melodyNotes), 'Notas melódicas deterministas');
  assert(JSON.stringify(res1.voiceAnalysis) === JSON.stringify(res2.voiceAnalysis), 'Análisis de voces determinista');
}

// ────────────────────────────────────────────────────────────────────────────
// 13. Compatibilidad Multi-PPQ y Métricas (3/4, 2/2, 4/4)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n13. Compatibilidad Multi-PPQ y Métricas:');
{
  const ppqs = [96, 120, 240, 480, 960];
  for (const p of ppqs) {
    const track = [
      ...encodeVLQ(0), 0x90, 60, 80,
      ...encodeVLQ(p), 0x80, 60, 0,
      ...encodeVLQ(0), 0xff, 0x2f, 0x00,
    ];
    const smf = buildSMF(0, p, [track]);
    const ir = parseMidiBufferToIR(smf);
    const analysis = analyzeMidiMusicalIR(ir);
    const n = analysis.melodyNotes[0];
    assert(Math.abs(n.startBeat - 1.0) < 0.001, `PPQ ${p}: startBeat es 1.0`);
    assert(Math.abs(n.durationBeats - 1.0) < 0.001, `PPQ ${p}: durationBeats es exactamente 1.0 negra`);
  }

  // Métrica 3/4
  const ppq = 480;
  const timeSig34 = [
    ...encodeVLQ(0), 0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08, // Time Sig: 3/4
    ...encodeVLQ(0), 0x90, 60, 80,
    ...encodeVLQ(ppq * 3), 0x80, 60, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];
  const smf34 = buildSMF(0, ppq, [timeSig34]);
  const ir34 = parseMidiBufferToIR(smf34);
  const analysis34 = analyzeMidiMusicalIR(ir34);
  assert(analysis34.harmonicSegments[0].durationBeats === 3, `Métrica 3/4 produce compás de 3 beats (obtenido: ${analysis34.harmonicSegments[0].durationBeats})`);
}

// ────────────────────────────────────────────────────────────────────────────
// 14. Honestidad ante Ambigüedad (Casos Indeterminados sin Certeza Artificial)
// ────────────────────────────────────────────────────────────────────────────
console.log('\n14. Honestidad ante Casos Ambiguos:');
{
  const ppq = 480;
  // Nota única aislada en tesitura central (F4 / MIDI 65) sin contexto polifónico
  const track: number[] = [
    ...encodeVLQ(0), 0x90, 65, 80,
    ...encodeVLQ(480), 0x80, 65, 0,
    ...encodeVLQ(0), 0xff, 0x2f, 0x00,
  ];

  const smf = buildSMF(0, ppq, [track]);
  const ir = parseMidiBufferToIR(smf);
  const voiceRes = classifyMidiVoices(ir);
  const noteVoice = voiceRes.voiceNotes[ir.allNotes[0].id];

  assert(noteVoice.hand === 'indeterminate', `Mano de nota central aislada es indeterminate (obtenido: ${noteVoice.hand})`);
  assert(noteVoice.handConfidence === 0.5, `Confianza de mano es 0.5 (sin inventar certeza)`);
  assert(noteVoice.handRationale.length > 0, `Proporciona rationale justificado (obtenido: "${noteVoice.handRationale}")`);
}

console.log('\n========================================');
console.log(`MIDI VOICE SEPARATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('========================================\n');

if (failed > 0) {
  throw new Error(`Suite falló con ${failed} pruebas fallidas`);
}
