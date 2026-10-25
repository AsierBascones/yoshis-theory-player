import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import usePlayerStore from '../../store/usePlayerStore';
import { triggerNote } from '../../audio/audioEngine';
import { midiToNoteNameShort } from '../../utils/midiToNote';
import type { FretRangeResult } from '../../utils/musicTheory';
import {
  HOOKTHEORY_DEGREE_COLORS,
  SEMITONE_COLORS,
} from '../../utils/theoryColors';

interface GuitarStringDef {
  name: string;
  openMidi: number;
  thickness: number; // en píxeles
}

// 6 Cuerdas de guitarra estándar (Tablatura: 1ª arriba [e4], 6ª abajo [E2])
const GUITAR_STRINGS: GuitarStringDef[] = [
  { name: 'e', openMidi: 64, thickness: 1.2 }, // 1ª Cuerda (E4 / High E)
  { name: 'B', openMidi: 59, thickness: 1.6 }, // 2ª Cuerda (B3)
  { name: 'G', openMidi: 55, thickness: 2.0 }, // 3ª Cuerda (G3)
  { name: 'D', openMidi: 50, thickness: 2.5 }, // 4ª Cuerda (D3)
  { name: 'A', openMidi: 45, thickness: 3.0 }, // 5ª Cuerda (A2)
  { name: 'E', openMidi: 40, thickness: 3.6 }, // 6ª Cuerda (E2 / Low E)
];

// Inlays estándar: puntos simples en 3, 5, 7, 9, 15, 17, 19, 21; dobles en 12 y 24
const SINGLE_INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);

export interface ChordVoicing {
  frets: number[]; // [Cuerda 6 (E grave), 5 (A), 4 (D), 3 (G), 2 (B), 1 (E aguda)]
  notes?: string[];
}

/**
 * Diccionario de Posturas de Acorde Estándar (Guitar Voicings)
 * Formato: [Cuerda 6 (E grave), 5 (A), 4 (D), 3 (G), 2 (B), 1 (E aguda)]
 * -1 = cuerda silenciada (X), 0 = cuerda al aire (O), >0 = traste presionado
 */
export const GUITAR_CHORD_VOICINGS: Record<string, ChordVoicing> = {
  // C
  'C':     { frets: [-1, 3, 2, 0, 1, 0], notes: ['', 'C3', 'E3', 'G3', 'C4', 'E4'] },
  'C/E':   { frets: [0, 3, 2, 0, 1, 0],  notes: ['E2', 'C3', 'E3', 'G3', 'C4', 'E4'] },
  'C/G':   { frets: [3, 3, 2, 0, 1, 0],  notes: ['G2', 'C3', 'E3', 'G3', 'C4', 'E4'] },
  'C7':    { frets: [-1, 3, 2, 3, 1, 0], notes: ['', 'C3', 'E3', 'Bb3', 'C4', 'E4'] },
  'Cmaj7': { frets: [-1, 3, 2, 0, 0, 0], notes: ['', 'C3', 'E3', 'G3', 'B3', 'E4'] },
  'Cm':    { frets: [-1, 3, 5, 5, 4, 3], notes: ['', 'C3', 'G3', 'C4', 'Eb4', 'G4'] },
  'Cm7':   { frets: [-1, 3, 5, 3, 4, 3], notes: ['', 'C3', 'G3', 'Bb3', 'Eb4', 'G4'] },
  'C#°':   { frets: [-1, -1, 2, 3, 2, 3], notes: ['', '', 'E3', 'Bb3', 'C#4', 'G4'] },
  'c#°':   { frets: [-1, -1, 2, 3, 2, 3], notes: ['', '', 'E3', 'Bb3', 'C#4', 'G4'] },
  'C#°7':  { frets: [-1, -1, 2, 3, 2, 3], notes: ['', '', 'E3', 'Bb3', 'C#4', 'G4'] },
  'c#°7':  { frets: [-1, -1, 2, 3, 2, 3], notes: ['', '', 'E3', 'Bb3', 'C#4', 'G4'] },

  // D
  'D':     { frets: [-1, -1, 0, 2, 3, 2], notes: ['', '', 'D3', 'A3', 'D4', 'F#4'] },
  'D/F#':  { frets: [2, 0, 0, 2, 3, 2],  notes: ['F#2', 'A2', 'D3', 'A3', 'D4', 'F#4'] },
  'D7':    { frets: [-1, -1, 0, 2, 1, 2], notes: ['', '', 'D3', 'A3', 'C4', 'F#4'] },
  'Dm':    { frets: [-1, -1, 0, 2, 3, 1], notes: ['', '', 'D3', 'A3', 'D4', 'F4'] },
  'Dm7':   { frets: [-1, -1, 0, 2, 1, 1], notes: ['', '', 'D3', 'A3', 'C4', 'F4'] },
  'D#°':   { frets: [-1, -1, 1, 2, 1, 2], notes: ['', '', 'D#3', 'A3', 'C4', 'F#4'] },
  'd#°':   { frets: [-1, -1, 1, 2, 1, 2], notes: ['', '', 'D#3', 'A3', 'C4', 'F#4'] },
  'D#°7':  { frets: [-1, -1, 1, 2, 1, 2], notes: ['', '', 'D#3', 'A3', 'C4', 'F#4'] },
  'd#°7':  { frets: [-1, -1, 1, 2, 1, 2], notes: ['', '', 'D#3', 'A3', 'C4', 'F#4'] },

  // E
  'E':     { frets: [0, 2, 2, 1, 0, 0],  notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  'E7':    { frets: [0, 2, 0, 1, 0, 0],  notes: ['E2', 'B2', 'D3', 'G#3', 'B3', 'E4'] },
  'Em':    { frets: [0, 2, 2, 0, 0, 0],  notes: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'] },
  'Em7':   { frets: [0, 2, 0, 0, 0, 0],  notes: ['E2', 'B2', 'D3', 'G3', 'B3', 'E4'] },
  'Eb':    { frets: [-1, 6, 5, 3, 4, 3], notes: ['', 'Eb3', 'G3', 'Bb3', 'Eb4', 'G4'] },
  'Eb7':   { frets: [-1, 6, 5, 6, 4, -1],notes: ['', 'Eb3', 'G3', 'Db4', 'Eb4', ''] },

  // F
  'F':     { frets: [1, 3, 3, 2, 1, 1],  notes: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'] },
  'F/A':   { frets: [-1, 0, 3, 2, 1, 1], notes: ['', 'A2', 'F3', 'A3', 'C4', 'F4'] },
  'F7':    { frets: [1, 3, 1, 2, 1, 1],  notes: ['F2', 'C3', 'Eb3', 'A3', 'C4', 'F4'] },
  'Fm':    { frets: [1, 3, 3, 1, 1, 1],  notes: ['F2', 'C3', 'F3', 'Ab3', 'C4', 'F4'] },
  'F°':    { frets: [-1, -1, 3, 4, 3, 4],notes: ['', '', 'F3', 'B3', 'D4', 'Ab4'] },
  'F°7':   { frets: [-1, -1, 3, 4, 3, 4],notes: ['', '', 'F3', 'B3', 'D4', 'Ab4'] },
  'f°':    { frets: [-1, -1, 3, 4, 3, 4],notes: ['', '', 'F3', 'B3', 'D4', 'Ab4'] },
  'f°7':   { frets: [-1, -1, 3, 4, 3, 4],notes: ['', '', 'F3', 'B3', 'D4', 'Ab4'] },
  'F#':    { frets: [2, 4, 4, 3, 2, 2],  notes: ['F#2', 'C#3', 'F#3', 'A#3', 'C#4', 'F#4'] },
  'F#m':   { frets: [2, 4, 4, 2, 2, 2],  notes: ['F#2', 'C#3', 'F#3', 'A3', 'C#4', 'F#4'] },
  'F#7':   { frets: [2, 4, 2, 3, 2, 2],  notes: ['F#2', 'C#3', 'E3', 'A#3', 'C#4', 'F#4'] },
  'F#°':   { frets: [-1, -1, 4, 5, 4, 5],notes: ['', '', 'F#3', 'C4', 'Eb4', 'A4'] },
  'f#°':   { frets: [-1, -1, 4, 5, 4, 5],notes: ['', '', 'F#3', 'C4', 'Eb4', 'A4'] },
  'F#°7':  { frets: [-1, -1, 4, 5, 4, 5],notes: ['', '', 'F#3', 'C4', 'Eb4', 'A4'] },
  'f#°7':  { frets: [-1, -1, 4, 5, 4, 5],notes: ['', '', 'F#3', 'C4', 'Eb4', 'A4'] },

  // G
  'G':     { frets: [3, 2, 0, 0, 0, 3],  notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'G4'] },
  'G/B':   { frets: [-1, 2, 0, 0, 0, 3], notes: ['', 'B2', 'D3', 'G3', 'B3', 'G4'] },
  'G/D':   { frets: [-1, -1, 0, 0, 0, 3],notes: ['', '', 'D3', 'G3', 'B3', 'G4'] },
  'G7':    { frets: [3, 2, 0, 0, 0, 1],  notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'F4'] },
  'Gm':    { frets: [3, 5, 5, 3, 3, 3],  notes: ['G2', 'D3', 'G3', 'Bb3', 'D4', 'G4'] },
  'Gm7':   { frets: [3, 5, 3, 3, 3, 3],  notes: ['G2', 'D3', 'F3', 'Bb3', 'D4', 'G4'] },

  // A
  'A':     { frets: [-1, 0, 2, 2, 2, 0], notes: ['', 'A2', 'E3', 'A3', 'C#4', 'E4'] },
  'A/C#':  { frets: [-1, 4, 2, 2, 2, 0], notes: ['', 'C#3', 'E3', 'A3', 'C#4', 'E4'] },
  'A7':    { frets: [-1, 0, 2, 0, 2, 0], notes: ['', 'A2', 'E3', 'G3', 'C#4', 'E4'] },
  'Am':    { frets: [-1, 0, 2, 2, 1, 0], notes: ['', 'A2', 'E3', 'A3', 'C4', 'E4'] },
  'Am7':   { frets: [-1, 0, 2, 0, 1, 0], notes: ['', 'A2', 'E3', 'G3', 'C4', 'E4'] },
  'Ab':    { frets: [4, 6, 6, 5, 4, 4],  notes: ['Ab2', 'Eb3', 'Ab3', 'C4', 'Eb4', 'Ab4'] },
  'Ab7':   { frets: [4, 6, 4, 5, 4, 4],  notes: ['Ab2', 'Eb3', 'Gb3', 'C4', 'Eb4', 'Ab4'] },

  // B
  'B':     { frets: [-1, 2, 4, 4, 4, 2], notes: ['', 'B2', 'F#3', 'B3', 'D#4', 'F#4'] },
  'B7':    { frets: [-1, 2, 1, 2, 0, 2], notes: ['', 'B2', 'D#3', 'A3', 'B3', 'F#4'] },
  'Bm':    { frets: [-1, 2, 4, 4, 3, 2], notes: ['', 'B2', 'F#3', 'B3', 'D4', 'F#4'] },
  'Bb':    { frets: [-1, 1, 3, 3, 3, 1], notes: ['', 'Bb2', 'F3', 'Bb3', 'D4', 'F4'] },
  'Bb7':   { frets: [-1, 1, 3, 1, 3, 1], notes: ['', 'Bb2', 'F3', 'Ab3', 'D4', 'F4'] },
  'B°':    { frets: [-1, 2, 3, 4, 3, -1],notes: ['', 'B2', 'F3', 'B3', 'D4', ''] },
};

/**
 * Resuelve la postura estándar (voicing) de cualquier acorde.
 * 1. Prioriza la posición abierta estándar (trastes 0 a 3) si existe.
 * 2. Si es cejilla (barre chord), calcula tanto E-shape (fundamental en 6ª cuerda)
 *    como A-shape (fundamental en 5ª cuerda) y elige automáticamente la variante
 *    con el traste de cejilla más bajo (lowest barre fret) para máxima ergonomía.
 */
export function resolveGuitarVoicing(symbol: string): ChordVoicing {
  const clean = symbol.trim();

  // Helper para verificar si un voicing es postura abierta (trastes 0 a 3 con cuerdas al aire)
  const isOpenChord = (v?: ChordVoicing): boolean => {
    if (!v) return false;
    const active = v.frets.filter((f) => f >= 0);
    return active.length > 0 && active.every((f) => f <= 3) && active.some((f) => f === 0);
  };

  // 1. Si existe postura abierta directa en el diccionario
  if (GUITAR_CHORD_VOICINGS[clean] && isOpenChord(GUITAR_CHORD_VOICINGS[clean])) {
    return GUITAR_CHORD_VOICINGS[clean];
  }

  // Si tiene barra de bajo (ej. C/E o G/B), comprobar si la inversión tiene postura abierta
  const [baseChord] = clean.split('/');
  if (GUITAR_CHORD_VOICINGS[baseChord] && isOpenChord(GUITAR_CHORD_VOICINGS[baseChord])) {
    return GUITAR_CHORD_VOICINGS[baseChord];
  }

  // Mapeo de acordes disminuidos y secundarios frecuentes
  if (clean.includes('vii°') || clean.includes('vii°⁷')) {
    if (clean.includes('/ii')) return GUITAR_CHORD_VOICINGS['c#°7'];
    if (clean.includes('/iii')) return GUITAR_CHORD_VOICINGS['d#°7'];
    if (clean.includes('/V')) return GUITAR_CHORD_VOICINGS['F#°'];
    return GUITAR_CHORD_VOICINGS['B°'];
  }
  if (clean.includes('bIII')) return GUITAR_CHORD_VOICINGS['Eb7'];
  if (clean.includes('bVI')) return GUITAR_CHORD_VOICINGS['Ab'];
  if (clean.includes('bVII')) return GUITAR_CHORD_VOICINGS['Bb7'];

  // 2. Si no es abierta, calcular cejillas E-shape vs A-shape y elegir el traste más bajo
  const match = baseChord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) {
    return GUITAR_CHORD_VOICINGS[clean] || { frets: [-1, 3, 2, 0, 1, 0] };
  }

  const [, root, quality] = match;
  const ROOT_TO_SEMITONE: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };

  const semitone = ROOT_TO_SEMITONE[root] ?? 0;
  const isMinor = quality.includes('m') && !quality.includes('maj');
  const isMaj7 = quality.includes('maj7') || quality.includes('M7');
  const is7th = quality.includes('7') && !isMaj7;
  const isDim = quality.includes('°') || quality.includes('dim');

  // Trastes de cejilla (barre frets)
  let eFret = (semitone - 4 + 12) % 12; // Cuerda 6 (Mi)
  let aFret = (semitone - 9 + 12) % 12; // Cuerda 5 (La)

  // Si eFret o aFret son 0 (abiertas en E o A), tienen prioridad
  const effectiveEFret = eFret === 0 ? 0 : eFret;
  const effectiveAFret = aFret === 0 ? 0 : aFret;

  // Si existe en el diccionario registrado, cotejar si su traste es menor
  if (GUITAR_CHORD_VOICINGS[clean]) {
    const existing = GUITAR_CHORD_VOICINGS[clean];
    const maxFret = Math.max(...existing.frets);
    if (maxFret <= Math.min(effectiveEFret, effectiveAFret) + 2) {
      return existing;
    }
  }

  // Comparación ergonómica: Elegir la cejilla con el traste más bajo (Lowest Barre Fret)
  const useEShape = effectiveEFret <= effectiveAFret;

  if (useEShape) {
    const f = effectiveEFret;
    if (isDim) return { frets: [-1, -1, f, f + 1, f, f + 1] };
    if (isMinor) {
      if (is7th) return { frets: [f, f + 2, f, f, f, f] };
      return { frets: [f, f + 2, f + 2, f, f, f] };
    }
    if (isMaj7) return { frets: [f, f + 2, f + 1, f + 1, f, f] };
    if (is7th) return { frets: [f, f + 2, f, f + 1, f, f] };
    return { frets: [f, f + 2, f + 2, f + 1, f, f] };
  } else {
    const f = effectiveAFret;
    if (isDim) return { frets: [-1, f, f + 1, f > 0 ? f - 1 : f + 2, f + 1, -1] };
    if (isMinor) {
      if (is7th) return { frets: [-1, f, f + 2, f, f + 1, f] };
      return { frets: [-1, f, f + 2, f + 2, f + 1, f] };
    }
    if (isMaj7) return { frets: [-1, f, f + 2, f + 1, f + 2, f] };
    if (is7th) return { frets: [-1, f, f + 2, f, f + 2, f] };
    return { frets: [-1, f, f + 2, f + 2, f + 2, f] };
  }
}

/**
 * Mapeo Único para la Melodía:
 * Busca exactamente una única cuerda y un único traste para una nota melódica,
 * priorizando las primeras 3 cuerdas agudas (1ª e4, 2ª B3, 3ª G3) en la zona activa de la mano.
 */
export function getOptimalMelodyPosition(
  midi: number,
  handCenterFret = 2
): { strIdx: number; fret: number } | null {
  const candidates: Array<{ strIdx: number; fret: number; score: number }> = [];

  GUITAR_STRINGS.forEach((str, strIdx) => {
    const fret = midi - str.openMidi;
    if (fret >= 0 && fret <= 24) {
      // Priorizar cuerdas 0 (1ª e4), 1 (2ª B3), 2 (3ª G3)
      const stringPenalty = strIdx < 3 ? strIdx * 2 : 12 + (strIdx - 3) * 5;
      const dist = Math.abs(fret - handCenterFret);
      const fretHighPenalty = fret > 14 ? (fret - 14) * 4 : 0;
      const score = stringPenalty + dist + fretHighPenalty;
      candidates.push({ strIdx, fret, score });
    }
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);
  return { strIdx: candidates[0].strIdx, fret: candidates[0].fret };
}

export default function GuitarFretboard() {
  const {
    song,
    parsedNotes,
    currentBeat,
    isPlaying,
    activeNotes,
    showMelody,
    showChords,
    semitoneOffset,
  } = usePlayerStore();

  const [fretMode, setFretMode] = useState<'auto' | '24'>('auto');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Acorde activo en el instante actual
  const activeChord = useMemo(() => {
    return (
      song.chords.find(
        (c) => currentBeat >= c.beat && currentBeat < c.beat + c.duration
      ) || null
    );
  }, [currentBeat, song.chords]);

  // Postura de acorde activa (voicings de 6 cuerdas)
  const activeVoicing = useMemo<ChordVoicing | null>(() => {
    if (!showChords || !activeChord) return null;
    return resolveGuitarVoicing(activeChord.symbol);
  }, [showChords, activeChord]);

  // Centro de mano de la postura activa
  const handCenterFret = useMemo<number>(() => {
    if (!activeVoicing) return 2;
    const pressed = activeVoicing.frets.filter((f) => f > 0);
    if (pressed.length === 0) return 2;
    return Math.round(pressed.reduce((a, b) => a + b, 0) / pressed.length);
  }, [activeVoicing]);

  // 2. Nota activa de la melodía en el instante actual (un único pitch)
  const activeMelodyNote = useMemo(() => {
    if (!showMelody) return null;
    if (isPlaying) {
      return (
        parsedNotes.find(
          (n) => currentBeat >= n.beat && currentBeat < n.beat + n.duration
        ) || null
      );
    }
    if (activeNotes.size > 0) {
      const firstMidi = Array.from(activeNotes)[0];
      return parsedNotes.find((n) => n.midi === firstMidi) || { midi: firstMidi, sd: '1' };
    }
    return null;
  }, [showMelody, isPlaying, currentBeat, parsedNotes, activeNotes]);

  // Posición única de la melodía en el diapasón (exactamente una cuerda y un traste)
  const melodyPosition = useMemo<{ strIdx: number; fret: number; midi: number } | null>(() => {
    if (!activeMelodyNote || typeof activeMelodyNote.midi !== 'number') return null;
    const pos = getOptimalMelodyPosition(activeMelodyNote.midi, handCenterFret);
    if (!pos) return null;
    return { ...pos, midi: activeMelodyNote.midi };
  }, [activeMelodyNote, handCenterFret]);

  // 3. Auto-Fit inteligente del rango de trastes según la postura activa y melodía
  const autoRange = useMemo<FretRangeResult>(() => {
    const usedFrets: number[] = [];

    // Recolectar trastes de las posturas de acordes de la canción
    song.chords.forEach((chord) => {
      const voicing = resolveGuitarVoicing(chord.symbol);
      voicing.frets.forEach((f) => {
        if (f >= 0) usedFrets.push(f);
      });
    });

    // Recolectar trastes óptimos de la melodía
    parsedNotes.forEach((n) => {
      if (typeof n.midi === 'number') {
        const pos = getOptimalMelodyPosition(n.midi, 2);
        if (pos) usedFrets.push(pos.fret);
      }
    });

    if (usedFrets.length === 0) {
      return { startFret: 0, endFret: 5, visibleFretsCount: 6 };
    }

    const minF = Math.min(...usedFrets);
    const maxF = Math.max(...usedFrets);

    const startFret = minF <= 2 ? 0 : minF;
    const endFret = Math.min(24, Math.max(startFret + 4, maxF));

    return {
      startFret,
      endFret,
      visibleFretsCount: endFret - startFret + 1,
    };
  }, [song.chords, parsedNotes]);

  const startFret = fretMode === '24' ? 0 : autoRange.startFret;
  const endFret = fretMode === '24' ? 24 : autoRange.endFret;

  const visibleFrets = useMemo<number[]>(() => {
    const list: number[] = [];
    for (let f = startFret; f <= endFret; f++) {
      list.push(f);
    }
    return list;
  }, [startFret, endFret]);

  // Centrar al cambiar a modo 24
  useEffect(() => {
    if (fretMode === '24' && scrollRef.current) {
      const fretWidth = 46;
      const targetCenter = (autoRange.startFret + (autoRange.endFret - autoRange.startFret) / 2) * fretWidth;
      const clientWidth = scrollRef.current.clientWidth;
      scrollRef.current.scrollLeft = Math.max(0, targetCenter - clientWidth / 2);
    }
  }, [fretMode, autoRange]);

  // Disparo interactivo de nota
  const handleFretClick = async (midi: number) => {
    try {
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }
      await triggerNote(midi, '8n');
    } catch (err) {
      console.error('Error triggering guitar note:', err);
    }
  };

  // Color de nota según grado relativo Hooktheory
  const getNoteColorAndStyle = (midi: number) => {
    const tonicMidi = 60 + semitoneOffset;
    const semitones = ((midi - tonicMidi) % 12 + 12) % 12;
    const colorDef = SEMITONE_COLORS[semitones];
    const baseDegree = colorDef.label.replace(/[#b]/g, '');
    const color = HOOKTHEORY_DEGREE_COLORS[baseDegree] || colorDef.primary;
    const isAltered = colorDef.label.includes('#') || colorDef.label.includes('b');
    return { color, isAltered, label: colorDef.label };
  };

  return (
    <div className="bg-[#0b0e14] flex flex-col items-center w-full h-full select-none px-3 py-1 border-t border-gray-800/80 justify-between overflow-hidden">
      {/* ── Cabecera de controles del diapasón ── */}
      <div className="w-full flex items-center justify-between mb-1 px-2 max-w-7xl shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-gray-300 tracking-wide uppercase flex items-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-amber-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            Diapasón de Guitarra
          </span>
          {showChords && activeChord && (
            <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded shadow-sm">
              Acorde: {activeChord.symbol}
            </span>
          )}
        </div>

        {/* Toggle [ Auto (Trastes X–Y) | 24 Trastes ] */}
        <div className="flex items-center bg-[#131923] border border-gray-700/60 rounded-md p-0.5 text-[10px]">
          <button
            onClick={() => setFretMode('auto')}
            className={`px-2.5 py-0.5 rounded transition-colors font-medium ${
              fretMode === 'auto'
                ? 'bg-[#38bdf8] text-gray-950 font-bold shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Auto (Trastes {autoRange.startFret}–{autoRange.endFret})
          </button>
          <button
            onClick={() => setFretMode('24')}
            className={`px-2.5 py-0.5 rounded transition-colors font-medium ${
              fretMode === '24'
                ? 'bg-[#38bdf8] text-gray-950 font-bold shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            24 Trastes
          </button>
        </div>
      </div>

      {/* ── Tablero del diapasón ── */}
      <div
        ref={scrollRef}
        className={`w-full max-w-7xl flex-1 min-h-0 flex flex-col justify-center ${
          fretMode === '24' ? 'overflow-x-auto custom-scrollbar pb-1' : 'overflow-x-hidden'
        }`}
      >
        <div
          className={`bg-[#171310] border-2 border-[#3d2c20] rounded-lg shadow-2xl relative flex flex-col px-2 py-1 select-none h-full justify-between max-h-[160px] min-h-[70px] ${
            fretMode === '24' ? 'min-w-[1100px]' : 'w-full'
          }`}
        >
          {/* Fila superior: Números de traste */}
          <div className="flex w-full border-b border-[#4d392b] pb-0.5 mb-0.5 font-mono text-[10px] text-amber-200/60 font-semibold shrink-0">
            {/* Columna de indicación Mute/Str */}
            <div className="w-7 shrink-0 text-center text-gray-500 font-mono text-[9px]">
              Str
            </div>
            {visibleFrets.map((fret) => (
              <div
                key={fret}
                className={`flex-1 text-center ${
                  fret === 0 ? 'text-amber-400 font-bold max-w-[40px]' : ''
                }`}
              >
                {fret === 0 ? 'Nut' : fret}
              </div>
            ))}
          </div>

          {/* 6 Cuerdas horizontales con sus trastes */}
          <div className="flex flex-col justify-around flex-1 min-h-0 relative py-0.5">
            {GUITAR_STRINGS.map((str, strIdx) => {
              // En GUITAR_CHORD_VOICINGS: index 0 es Cuerda 6 (Low E), index 5 es Cuerda 1 (High E)
              const voicingFret = activeVoicing ? activeVoicing.frets[5 - strIdx] : null;
              const isMuted = voicingFret === -1;
              const isOpenChordString = voicingFret === 0;

              return (
                <div key={strIdx} className="flex w-full items-center relative flex-1 min-h-[14px] max-h-[26px]">
                  {/* Columna indicadora izquierda: X (Muted), O (Open) o Nombre de Cuerda */}
                  <div className="w-7 shrink-0 flex items-center justify-center font-mono text-[10px] z-10">
                    {showChords && isMuted ? (
                      <span className="text-red-500 font-extrabold text-sm select-none" title="Cuerda silenciada (✕)">
                        ✕
                      </span>
                    ) : showChords && isOpenChordString ? (
                      <span className="text-emerald-400 font-bold text-xs select-none" title="Cuerda al aire (Open ○)">
                        ○
                      </span>
                    ) : (
                      <span className="text-gray-500 text-[9px] font-semibold">
                        {str.name}
                      </span>
                    )}
                  </div>

                  {/* Alambre metálico horizontal de la cuerda */}
                  <div
                    className="absolute left-7 right-0 pointer-events-none"
                    style={{
                      height: `${str.thickness}px`,
                      backgroundColor: '#d8dee9',
                      opacity: 0.55 + strIdx * 0.08,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.85)',
                    }}
                  />

                  {/* Casillas de trastes */}
                  {visibleFrets.map((fret) => {
                    const midi = str.openMidi + fret;
                    const isNut = fret === 0;

                    // 1. ¿Toca el acorde en este traste específico de esta cuerda?
                    const isChordFret = showChords && voicingFret !== null && voicingFret === fret;

                    // 2. ¿Toca la melodía exactamente en esta cuerda y este traste?
                    const isMelodyFret =
                      showMelody &&
                      melodyPosition !== null &&
                      melodyPosition.strIdx === strIdx &&
                      melodyPosition.fret === fret;

                    const isActive = isChordFret || isMelodyFret;
                    const noteShort = midiToNoteNameShort(midi).replace(/\d+/, '');
                    const { color, isAltered } = getNoteColorAndStyle(midi);

                    return (
                      <div
                        key={fret}
                        onClick={() => handleFretClick(midi)}
                        className={`flex-1 relative flex items-center justify-center h-full cursor-pointer border-r transition-colors group ${
                          isNut
                            ? 'max-w-[40px] border-r-4 border-amber-200/80 bg-amber-950/30'
                            : 'border-r border-[#443224]'
                        } hover:bg-amber-400/10`}
                        title={`Cuerda ${str.name}, Traste ${fret}: ${noteShort} (MIDI ${midi})`}
                      >
                        {/* Círculo de digitación interactivo */}
                        {isActive ? (
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-xl transition-all duration-75 ${
                              isMelodyFret
                                ? 'ring-4 ring-amber-300 scale-125 shadow-[0_0_16px_4px_rgba(251,191,36,0.95)] z-40 animate-pulse'
                                : 'opacity-95 z-20'
                            }`}
                            style={{
                              backgroundColor: color,
                              backgroundImage: isAltered
                                ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.35) 3px, rgba(0,0,0,0.35) 6px)'
                                : undefined,
                              boxShadow: isMelodyFret
                                ? '0 0 16px 4px rgba(251,191,36,0.95)'
                                : `0 0 10px 2px ${color}`,
                              border: isMelodyFret ? '2px solid #ffffff' : '1.5px dashed rgba(255,255,255,0.85)',
                            }}
                          >
                            {noteShort}
                          </div>
                        ) : isNut ? (
                          <span className="text-[9px] font-mono font-bold text-amber-300/60 z-10">
                            {str.name}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Marcadores de trastes (Inlays con dots en 3, 5, 7, 9, 12, 15, 17, 19, 21, 24) */}
          <div className="flex w-full pt-0.5 pointer-events-none shrink-0">
            <div className="w-7 shrink-0" />
            {visibleFrets.map((fret) => {
              const isSingle = SINGLE_INLAYS.has(fret);
              const isDouble = DOUBLE_INLAYS.has(fret);
              const isNut = fret === 0;

              return (
                <div
                  key={fret}
                  className={`flex-1 flex justify-center items-center h-2 ${
                    isNut ? 'max-w-[40px]' : ''
                  }`}
                >
                  {isSingle && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-200/40 shadow-sm" />
                  )}
                  {isDouble && (
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-200/50 shadow-sm" />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-200/50 shadow-sm" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
