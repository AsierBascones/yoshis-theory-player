import React from 'react';
import * as Tone from 'tone';
import usePlayerStore from '../../store/usePlayerStore';
import { getColor, getHexAlpha, getDegreeColor } from '../../utils/theoryColors';
import { seekToBeat, triggerChordNotes } from '../../audio/audioEngine';
import { pitchToMidi } from '../../utils/theoryParser';
import { getTransposedChordSymbol } from '../../utils/theoryEngine';
import type { ScaleMode } from '../../types/music';

export const HEADER_WIDTH = 58; // px columna izquierda de cabecera

export default function ChordAnalysisBar() {
  const {
    song,
    currentBeat,
    pixelsPerBeat,
    isPlaying,
    currentKey,
    keyMode,
    semitoneOffset,
    setCurrentBeat,
    setActiveChordNotes,
  } = usePlayerStore();

  const totalWidth = song.totalBeats * pixelsPerBeat;

  // Determinar acorde activo en el tiempo actual
  const activeChordIndex = (() => {
    let idx = -1;
    for (let i = 0; i < song.chords.length; i++) {
      if (currentBeat >= song.chords[i].beat && currentBeat < song.chords[i].beat + song.chords[i].duration) {
        idx = i;
      }
    }
    return idx;
  })();

  const handleChordClick = async (chordNotes: string[] | undefined, chordBeat: number) => {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }

    if (!isPlaying) {
      setCurrentBeat(chordBeat);
      seekToBeat(chordBeat);
    }

    if (chordNotes && chordNotes.length > 0) {
      triggerChordNotes(chordNotes, '2n');

      const midis = chordNotes
        .map((p) => pitchToMidi(p))
        .filter((m): m is number => m !== null);
      setActiveChordNotes(new Set(midis));

      setTimeout(() => {
        if (!usePlayerStore.getState().isPlaying) {
          setActiveChordNotes(new Set());
        }
      }, 850);
    }
  };

  return (
    <div className="bg-gray-950 border-b border-gray-700/80 overflow-x-auto select-none">
      <div
        className="flex items-stretch relative"
        style={{ width: HEADER_WIDTH + totalWidth, minWidth: HEADER_WIDTH + totalWidth, height: 72 }}
      >
        {/* Etiqueta lateral izquierda fija */}
        <div
          className="flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col items-center justify-center text-gray-400 text-[10px] font-bold uppercase tracking-wider z-20"
          style={{ width: HEADER_WIDTH, height: 72 }}
        >
          <span>CHORD</span>
        </div>

        {/* ── Lienzo con Posicionamiento Absoluto para Acordes ── */}
        <div
          className="relative flex-1 bg-gray-900/60"
          style={{ width: totalWidth, height: 72 }}
        >
          {song.chords.map((chord, idx) => {
            const left = (chord.beat - 1) * pixelsPerBeat;
            const width = chord.duration * pixelsPerBeat;
            const rootStr = String(chord.root || '1');
            const defaultDegreeColor = getDegreeColor(rootStr);
            const chordColor = chord.color || defaultDegreeColor.color;
            const isApplied = Boolean(chord.applied && String(chord.applied) !== '0');
            const isChordAltered =
              Boolean(chord.isAltered) ||
              defaultDegreeColor.isAltered ||
              Boolean(chord.borrowed) ||
              isApplied ||
              rootStr.includes('b') ||
              rootStr.includes('#') ||
              Boolean(chord.roman && (chord.roman.includes('b') || chord.roman.includes('#') || chord.roman.includes('°') || chord.roman.includes('/')));
            const isActive = idx === activeChordIndex;
            const chordNotes = chord.notes ?? [];
            const displaySymbol = getTransposedChordSymbol(chord, { tonic: currentKey, scale: keyMode as ScaleMode }) || chord.symbol;

            const normalBg = isChordAltered
              ? `repeating-linear-gradient(45deg, ${chordColor}35, ${chordColor}35 6px, rgba(0, 0, 0, 0.55) 6px, rgba(0, 0, 0, 0.55) 12px)`
              : chordColor + '22';

            const activeBg = isChordAltered
              ? `repeating-linear-gradient(45deg, ${chordColor}60, ${chordColor}60 6px, rgba(0, 0, 0, 0.4) 6px, rgba(0, 0, 0, 0.4) 12px)`
              : getHexAlpha(chordColor, 0.38);

            return (
              <div
                key={`chord-abs-${idx}`}
                onClick={() => handleChordClick(chordNotes, chord.beat)}
                title={`Tocar acorde ${displaySymbol} (${chord.roman}) - [${chordNotes.join(', ')}]`}
                className="absolute top-0 bottom-0 border-r border-gray-900/60 flex flex-col items-center justify-center font-bold cursor-pointer hover:brightness-125 transition-all select-none"
                style={{
                  left: `${left}px`,
                  width: `${width}px`,
                  background: isActive ? activeBg : normalBg,
                  borderTop: `4px solid ${chordColor}`,
                  boxShadow: isActive ? `inset 0 0 12px ${getHexAlpha(chordColor, 0.4)}` : 'none',
                }}
              >
                <span
                  className="text-sm font-serif drop-shadow-sm font-bold tracking-tight leading-tight"
                  style={{ color: chordColor }}
                >
                  {chord.roman}
                </span>
                {chord.sublabel && (
                  <span className="text-[10px] text-gray-300 font-sans font-medium leading-tight">
                    {chord.sublabel}
                  </span>
                )}
                <span className={`text-[10px] leading-tight ${isActive ? 'text-gray-200 font-semibold' : 'text-gray-400'}`}>
                  {displaySymbol}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
