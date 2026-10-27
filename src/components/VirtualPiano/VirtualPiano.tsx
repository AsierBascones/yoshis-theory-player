import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import usePlayerStore from '../../store/usePlayerStore';
import { triggerNote } from '../../audio/audioEngine';
import {
  calculateSongPitchRange,
  getScaleSpelling,
  formatPitch,
} from '../../utils/musicTheory';
import { getColor, getColorAlpha } from '../../utils/theoryColors';
import { isBlackKey } from '../../utils/midiToNote';
import { pitchToMidi } from '../../utils/theoryParser';

interface KeyInfo {
  midi: number;
  isBlack: boolean;
}

const BLACK_KEY_OFFSETS: Record<number, number> = {
  1: 0.62, // C#
  3: 0.68, // D#
  6: 0.60, // F#
  8: 0.67, // G#
  10: 0.73, // A#
};

export default function VirtualPiano() {
  const {
    song,
    parsedNotes,
    currentBeat,
    isPlaying,
    activeNotes,
    activeChordNotes,
    showMelody,
    showChords,
    selectedChord,
    currentKey,
    keyMode,
    semitoneOffset,
  } = usePlayerStore();

  const [keyboardMode, setKeyboardMode] = useState<'auto' | '88'>('auto');
  const scrollRef = useRef<HTMLDivElement>(null);

  const tonicMidi = 60 + semitoneOffset;
  const spelling = useMemo(() => getScaleSpelling(currentKey, keyMode), [currentKey, keyMode]);

  // 1. Rango dinámico calculado para la canción/sección actual (Auto-Fit)
  const autoRange = useMemo(
    () => calculateSongPitchRange(parsedNotes, song.chords),
    [parsedNotes, song.chords]
  );

  const startMidi = keyboardMode === '88' ? 21 : autoRange.startMidi;
  const endMidi = keyboardMode === '88' ? 108 : autoRange.endMidi;

  // Parámetros de tamaño según el modo activo
  const is88 = keyboardMode === '88';
  const whiteKeyWidth = is88 ? 22 : 28;
  const blackKeyWidth = is88 ? 14 : 18;

  // Lista de teclas en el rango
  const keys = useMemo<KeyInfo[]>(() => {
    const list: KeyInfo[] = [];
    for (let midi = startMidi; midi <= endMidi; midi++) {
      list.push({ midi, isBlack: isBlackKey(midi) });
    }
    return list;
  }, [startMidi, endMidi]);

  const whiteKeys = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blackKeys = useMemo(() => keys.filter((k) => k.isBlack), [keys]);
  const totalWidth = whiteKeys.length * whiteKeyWidth;

  // 2. Centrado automático en el rango activo de la canción al activar 88 teclas
  useEffect(() => {
    if (keyboardMode === '88' && scrollRef.current) {
      let whiteCountBefore = 0;
      for (let m = 21; m < autoRange.startMidi; m++) {
        if (!isBlackKey(m)) whiteCountBefore++;
      }
      let whiteCountInside = 0;
      for (let m = autoRange.startMidi; m <= autoRange.endMidi; m++) {
        if (!isBlackKey(m)) whiteCountInside++;
      }
      const targetCenter = (whiteCountBefore + whiteCountInside / 2) * whiteKeyWidth;
      const visibleWidth = scrollRef.current.clientWidth;
      scrollRef.current.scrollLeft = Math.max(0, targetCenter - visibleWidth / 2);
    }
  }, [keyboardMode, autoRange, whiteKeyWidth]);

  // Posición X de teclas blancas
  const getWhiteKeyX = (midi: number): number => {
    let count = 0;
    for (let m = startMidi; m < midi; m++) {
      if (!isBlackKey(m)) count++;
    }
    return count * whiteKeyWidth;
  };

  // Posición X de teclas negras (relativo al carril de teclas blancas)
  const getBlackKeyX = (midi: number): number => {
    let whiteCountBefore = 0;
    for (let m = startMidi; m < midi; m++) {
      if (!isBlackKey(m)) whiteCountBefore++;
    }
    const semitone = midi % 12;
    const offset = BLACK_KEY_OFFSETS[semitone] ?? 0.65;
    return (whiteCountBefore - 1 + offset) * whiteKeyWidth;
  };

  // Evento pointerDown interactivo
  const handlePointerDown = async (midi: number) => {
    try {
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }
      await triggerNote(midi, '8n');
    } catch (err) {
      console.error('Error al pulsar tecla de piano:', err);
    }
  };

  const activeChord = useMemo(() => {
    return song.chords.find(
      (c) => currentBeat >= c.beat && currentBeat < c.beat + c.duration
    );
  }, [currentBeat, song.chords]);

  const chordForLabels = selectedChord || activeChord;

  // 3. Iluminación de teclas estrictamente sincronizada con selección persistente y currentBeat
  const activePitchesAtBeat = useMemo(() => {
    const melody = new Set<number>();
    const chord = new Set<number>();

    // 1. Acorde: La selección manual es persistente y permanece iluminada en el teclado
    if (selectedChord && showChords) {
      if (selectedChord.midiNotes && selectedChord.midiNotes.length > 0) {
        selectedChord.midiNotes.forEach((m) => chord.add(m));
      } else if (selectedChord.notes) {
        selectedChord.notes.forEach((p) => {
          const m = pitchToMidi(p);
          if (m !== null) chord.add(m);
        });
      }
    } else if (showChords) {
      // Si no hay selección manual: durante reproducción sigue el playhead; en pausa muestra notas de preview
      if (isPlaying && activeChord) {
        if (activeChord.midiNotes && activeChord.midiNotes.length > 0) {
          activeChord.midiNotes.forEach((m) => chord.add(m));
        } else if (activeChord.rootMidi) {
          chord.add(activeChord.rootMidi);
        }
      } else {
        activeChordNotes.forEach((m) => chord.add(m));
      }
    }

    // 2. Melodía: dinámicamente iluminada bajo el playhead al reproducir o al interactuar
    if (isPlaying) {
      if (showMelody) {
        for (const n of parsedNotes) {
          if (currentBeat >= n.beat && currentBeat < n.beat + n.duration) {
            melody.add(n.midi);
          }
        }
      }
    } else {
      if (showMelody) activeNotes.forEach((m) => melody.add(m));
    }

    return { melody, chord };
  }, [isPlaying, showMelody, showChords, currentBeat, parsedNotes, song.chords, activeNotes, activeChordNotes, selectedChord, activeChord]);

  // Grado del semitono respecto a la tónica activa
  const getDegreeNumber = (midi: number): number => {
    const tonicMidi = 60 + semitoneOffset;
    const semitones = ((midi - tonicMidi) % 12 + 12) % 12;
    const map = [1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7];
    return map[semitones] ?? 1;
  };

  return (
    <div className="bg-gray-950/95 flex flex-col items-center w-full h-full select-none justify-between overflow-hidden py-1">
      {/* ── Encabezado del Teclado con Selector [ Auto (Song Range) | 88 Keys ] ── */}
      <div className="flex items-center justify-between w-full max-w-5xl px-4 py-1 flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-gray-300 text-xs font-mono font-bold tracking-tight">
            {keyboardMode === 'auto'
              ? `Piano (${autoRange.startPitch} – ${autoRange.endPitch})`
              : '88-Key Grand Piano (A0 – C8)'}
          </span>
          <span className="text-gray-500 text-[10px] font-mono hidden sm:inline">
            &middot; {keys.length} teclas ({whiteKeys.length} blancas)
          </span>
        </div>

        {/* Selector de modo */}
        <div className="flex items-center bg-gray-900 border border-gray-700/80 p-0.5 rounded-lg text-xs font-mono shadow-inner">
          <button
            onClick={() => setKeyboardMode('auto')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all ${
              keyboardMode === 'auto'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            title="Auto-Fit al rango de notas de la canción"
          >
            Auto ({autoRange.startPitch}–{autoRange.endPitch})
          </button>
          <button
            onClick={() => setKeyboardMode('88')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all ${
              keyboardMode === '88'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            title="Piano completo de 88 teclas (A0 – C8)"
          >
            88 Keys
          </button>
        </div>
      </div>

      {/* ── Lienzo del Teclado Interactivo ── */}
      <div
        ref={scrollRef}
        className="w-full flex-1 min-h-0 overflow-x-auto flex justify-center px-4 pb-1.5 pt-0.5 items-center"
      >
        <div
          className="relative bg-gray-950 p-1.5 rounded-b-xl border border-gray-800 shadow-inner flex-shrink-0 h-[135px] min-h-[120px] max-h-[145px]"
          style={{ width: totalWidth + 3 }}
        >
          {/* ── Teclas Blancas ── */}
          {whiteKeys.map((key) => {
            const isMelodyActive = activePitchesAtBeat.melody.has(key.midi);
            const isChordActive = activePitchesAtBeat.chord.has(key.midi);
            const isActive = isMelodyActive || isChordActive;

            const noteColor = getColor(key.midi, tonicMidi);
            const voiceMatch = chordForLabels?.voices?.find((v) => v.midi === key.midi);
            const noteName = voiceMatch
              ? (voiceMatch.label || formatPitch(key.midi, spelling, currentKey).replace(/\d+/g, ''))
              : formatPitch(key.midi, spelling, currentKey).replace(/\d+/g, '');
            const x = getWhiteKeyX(key.midi);
            const isC = key.midi % 12 === 0;
            const octaveNum = Math.floor(key.midi / 12) - 1;

            return (
              <div
                key={`white-key-${key.midi}`}
                onPointerDown={() => handlePointerDown(key.midi)}
                className="absolute top-0 rounded-b cursor-pointer border border-gray-400 flex flex-col items-center justify-end pb-1.5 transition-all duration-75 active:scale-y-[0.98] h-full"
                style={{
                  left: x,
                  width: whiteKeyWidth - 1,
                  background: isActive
                    ? isMelodyActive
                      ? noteColor
                      : getColorAlpha(key.midi, tonicMidi, 0.45)
                    : '#FFFFFF',
                  boxShadow: isActive
                    ? `0 0 16px 3px ${getColorAlpha(key.midi, tonicMidi, 0.8)}, inset 0 -4px 6px rgba(0,0,0,0.2)`
                    : 'inset 0 -3px 4px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.15)',
                  zIndex: 1,
                }}
              >
                {/* Círculo indicador con el NOMBRE REAL DE LA NOTA y COLOR RELATIVO AL TRANSPONER */}
                {isActive && (
                  <div
                    className="min-w-[21px] h-[21px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-md mb-1 leading-none transition-all scale-105"
                    style={{ background: noteColor, border: '1.5px solid white' }}
                  >
                    {noteName}
                  </div>
                )}

                {isC && !isActive && (
                  <span className="text-[9px] font-bold font-mono text-gray-500 mb-1">
                    C{octaveNum}
                  </span>
                )}
              </div>
            );
          })}

          {/* ── Teclas Negras ── */}
          {blackKeys.map((key) => {
            const isMelodyActive = activePitchesAtBeat.melody.has(key.midi);
            const isChordActive = activePitchesAtBeat.chord.has(key.midi);
            const isActive = isMelodyActive || isChordActive;

            const noteColor = getColor(key.midi, tonicMidi);
            const voiceMatch = chordForLabels?.voices?.find((v) => v.midi === key.midi);
            const noteName = voiceMatch
              ? (voiceMatch.label || formatPitch(key.midi, spelling, currentKey).replace(/\d+/g, ''))
              : formatPitch(key.midi, spelling, currentKey).replace(/\d+/g, '');
            const x = getBlackKeyX(key.midi);
            const semitones = ((key.midi - tonicMidi) % 12 + 12) % 12;
            const isNoteAltered = [1, 3, 6, 8, 10].includes(semitones);
            const activeBg = isNoteAltered
              ? `repeating-linear-gradient(45deg, ${noteColor}, ${noteColor} 3px, rgba(0, 0, 0, 0.45) 3px, rgba(0, 0, 0, 0.45) 6px)`
              : noteColor;

            return (
              <div
                key={`black-key-${key.midi}`}
                onPointerDown={() => handlePointerDown(key.midi)}
                className="absolute top-0 rounded-b cursor-pointer border border-black flex flex-col items-center justify-end pb-1 transition-all duration-75 active:scale-y-[0.97]"
                style={{
                  left: x,
                  width: blackKeyWidth,
                  height: '63%',
                  background: isActive ? activeBg : '#1E293B',
                  boxShadow: isActive
                    ? `0 0 14px 4px ${getColorAlpha(key.midi, tonicMidi, 0.85)}`
                    : '0 4px 6px rgba(0,0,0,0.6), inset 0 -2px 3px rgba(255,255,255,0.12)',
                  zIndex: 10,
                }}
              >
                {isActive && (
                  <div
                    className="min-w-[17px] h-[17px] px-0.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-md mb-0.5 leading-none transition-all scale-105"
                    style={{ background: noteColor, border: '1px solid white' }}
                  >
                    {noteName}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
