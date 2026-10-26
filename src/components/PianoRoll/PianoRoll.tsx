import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import * as Tone from 'tone';
import usePlayerStore from '../../store/usePlayerStore';
import {
  HOOKTHEORY_DEGREE_COLORS,
  getDegreeColor,
  getColorByDegree,
  getColorAlpha,
  getHexAlpha,
  getColor,
} from '../../utils/theoryColors';
import { calculateNoteTop, pitchToMidi } from '../../utils/theoryParser';
import { midiToNoteNameShort } from '../../utils/midiToNote';
import {
  seekToBeat,
  triggerChordNotes,
  triggerAudition,
  getCurrentExactBeat,
} from '../../audio/audioEngine';
import {
  generateScaleRows,
  calculateAutoPitchRange,
  applySwingTransform,
  getScaleSpelling,
  formatPitch,
  transposeNoteLetter,
  type DynamicScaleRow,
} from '../../utils/musicTheory';
import { resolveChordVoices, getTransposedChordSymbol, getKeyAtBeat } from '../../utils/theoryEngine';
import { calculateMeasuresTimeline, type MeasureInfo } from '../../utils/rhythmEngine';
import type { ParsedNote } from '../../utils/theoryParser';
import type { UniversalChord, ResolvedChordVoice, ScaleMode } from '../../types/music';

export const HEADER_WIDTH = 58;
const TIME_HEADER_HEIGHT = 28;
const CHORD_BAR_HEIGHT = 56;

// ── Componentes Memoizados para Minimizar Re-renderizados (React.memo) ──

interface MelodyNoteProps {
  note: ParsedNote;
  visualBeat: number;
  visualDuration: number;
  pixelsPerBeat: number;
  computedRowHeight: number;
  topOctave: number;
  isPlaying: boolean;
  isActive: boolean;
  onClick: (beat: number) => void;
}

const MemoizedMelodyNote = React.memo(function MemoizedMelodyNote({
  note,
  visualBeat,
  visualDuration,
  pixelsPerBeat,
  computedRowHeight,
  topOctave,
  isPlaying,
  isActive,
  onClick,
}: MelodyNoteProps) {
  const x = (visualBeat - 1) * pixelsPerBeat;
  const w = Math.max(4, visualDuration * pixelsPerBeat - 1);
  const baseDegreeNum = parseInt(note.sd.replace(/[^1-7]/g, '')) || 1;
  const { color: degreeColor, isAltered: noteIsAltered } = getDegreeColor(note.sd);
  const isAltered = note.isAltered !== undefined ? note.isAltered : noteIsAltered;

  const y = isAltered
    ? calculateNoteTop(note.sd, note.octave, computedRowHeight, topOctave).top
    : calculateNoteTop(String(baseDegreeNum), note.octave, computedRowHeight, topOctave).top;

  const noteColor = degreeColor;
  const backgroundStyle = isAltered
    ? `repeating-linear-gradient(45deg, ${noteColor}, ${noteColor} 4px, rgba(0, 0, 0, 0.45) 4px, rgba(0, 0, 0, 0.45) 8px)`
    : noteColor;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(note.beat);
      }}
      className={`absolute rounded-[3px] transition-all select-none duration-75 hover:scale-[1.02] cursor-pointer ${
        isActive && isPlaying
          ? 'brightness-150 ring-2 ring-white shadow-[0_0_12px_rgba(255,255,255,0.7)] z-20'
          : 'brightness-100 z-10'
      }`}
      title={`${note.name} (Grado: ${note.sd}, Beat: ${note.beat}, Duración: ${note.duration} beats)`}
      style={{
        left: x,
        top: y + 2,
        width: w,
        height: Math.max(12, computedRowHeight - 4),
        background: backgroundStyle,
        border: `1px solid ${noteColor}`,
        boxShadow:
          isActive && isPlaying
            ? `0 0 14px 4px ${noteColor}, inset 0 0 4px rgba(255,255,255,0.9)`
            : '0 1px 3px rgba(0,0,0,0.5)',
        opacity: isActive && isPlaying ? 1 : 0.95,
      }}
    />
  );
});

const MemoizedChordVoicing = React.memo(function MemoizedChordVoicing({
  chord,
  voice,
  pixelsPerBeat,
  computedRowHeight,
  topOctave,
  isChordActive,
}: {
  chord: UniversalChord | any;
  voice: ResolvedChordVoice;
  pixelsPerBeat: number;
  computedRowHeight: number;
  topOctave: number;
  isChordActive: boolean;
}) {
  const x = (chord.beat - 1) * pixelsPerBeat;
  const w = Math.max(chord.duration * pixelsPerBeat - 2, 4);

  // Posición vertical exacta según voice.sd y su octava respecto al centro (C5 = oct 0)
  const octaveOffset = Math.floor(voice.midi / 12) - 5;
  const y = calculateNoteTop(voice.sd, octaveOffset, computedRowHeight, topOctave).top;

  const isVoiceAltered = voice.isAltered || voice.sd.includes('b') || voice.sd.includes('#');

  const background = isVoiceAltered
    ? `repeating-linear-gradient(45deg, ${voice.color}35, ${voice.color}35 4px, rgba(0, 0, 0, 0.45) 4px, rgba(0, 0, 0, 0.45) 8px)`
    : `${voice.color}33`;

  const activeBackground = isVoiceAltered
    ? `repeating-linear-gradient(45deg, ${voice.color}75, ${voice.color}75 4px, rgba(0, 0, 0, 0.4) 4px, rgba(0, 0, 0, 0.4) 8px)`
    : getColorAlpha(voice.midi, 60, 0.45);

  const displayLabel = voice.isBass && chord.inversion ? 'Bass' : (voice.label || voice.voiceNumber || '1');

  return (
    <div
      className="absolute rounded-[3px] transition-all duration-100 hover:brightness-125 hover:opacity-90 hover:z-20 cursor-pointer pointer-events-none"
      title={`Acorde ${chord.symbol || chord.customSymbol} (${chord.roman}): Voz ${displayLabel} (${voice.pitch})`}
      style={{
        left: x + 1,
        top: y + 2,
        width: w,
        height: Math.max(12, computedRowHeight - 4),
        background: isChordActive ? activeBackground : background,
        border: `1.5px dashed ${voice.color}`,
        boxShadow: isChordActive
          ? `0 0 10px 1px ${getColorAlpha(voice.midi, 60, 0.45)}`
          : 'none',
        zIndex: 2,
      }}
    >
      {w > 12 && (
        <div className="absolute inset-0 flex items-center pl-1.5 select-none overflow-hidden">
          <span
            className="text-[10px] font-bold tracking-tight opacity-95 font-mono drop-shadow-sm select-none"
            style={{ color: '#ffffff' }}
          >
            {displayLabel}
          </span>
        </div>
      )}
    </div>
  );
});

const MemoizedChordBarBlock = React.memo(function MemoizedChordBarBlock({
  chord,
  pixelsPerBeat,
  isActive,
  onClick,
  currentKey,
  keyMode,
}: {
  chord: UniversalChord | any;
  pixelsPerBeat: number;
  isActive: boolean;
  onClick: (notes: string[] | undefined, beat: number) => void;
  currentKey?: string;
  keyMode?: string;
}) {
  const left = (chord.beat - 1) * pixelsPerBeat;
  const width = chord.duration * pixelsPerBeat;
  const rootStr = String(chord.rootSd || chord.root || '1');
  const defaultDegreeColor = getDegreeColor(rootStr);
  const chordColor = chord.color || defaultDegreeColor.color;
  const isBorrowed = Boolean(chord.borrowed);
  const isApplied = Boolean(chord.applied && String(chord.applied) !== '0');
  const isChordAltered =
    Boolean(chord.isAltered) ||
    defaultDegreeColor.isAltered ||
    isBorrowed ||
    isApplied ||
    rootStr.includes('b') ||
    rootStr.includes('♭') ||
    rootStr.includes('#') ||
    Boolean(chord.roman && (chord.roman.includes('b') || chord.roman.includes('♭') || chord.roman.includes('#') || chord.roman.includes('°') || chord.roman.includes('/') || chord.roman.includes('Δ')));
  const displaySymbol = currentKey
    ? getTransposedChordSymbol(chord, { tonic: currentKey, scale: (keyMode || 'major') as ScaleMode }) || chord.customSymbol || chord.symbol
    : chord.customSymbol || chord.symbol;

  // Textura de franjas diagonales de préstamo con acento amarillo/dorado
  const normalBg = isChordAltered
    ? isBorrowed
      ? `repeating-linear-gradient(45deg, rgba(234, 179, 8, 0.35), rgba(234, 179, 8, 0.35) 6px, rgba(0, 0, 0, 0.6) 6px, rgba(0, 0, 0, 0.6) 12px)`
      : `repeating-linear-gradient(45deg, ${chordColor}35, ${chordColor}35 6px, rgba(0, 0, 0, 0.55) 6px, rgba(0, 0, 0, 0.55) 12px)`
    : chordColor + '22';

  const activeBg = isChordAltered
    ? isBorrowed
      ? `repeating-linear-gradient(45deg, rgba(234, 179, 8, 0.65), rgba(234, 179, 8, 0.65) 6px, rgba(0, 0, 0, 0.45) 6px, rgba(0, 0, 0, 0.45) 12px)`
      : `repeating-linear-gradient(45deg, ${chordColor}60, ${chordColor}60 6px, rgba(0, 0, 0, 0.4) 6px, rgba(0, 0, 0, 0.4) 12px)`
    : getHexAlpha(chordColor, 0.38);

  const borderAccentColor = isBorrowed ? '#EAB308' : chordColor;

  const isCompact = width < 45;
  let displayRoman = (chord.roman || '').replace(/\^/g, '');
  if (isCompact) {
    displayRoman = displayRoman.replace(/\s*\([^)]*\)/g, '');
  }

  return (
    <div
      onClick={() => onClick(chord.notes, chord.beat)}
      title={`Tocar acorde ${displaySymbol} (${chord.roman})`}
      className="absolute top-0 bottom-0 border-r border-gray-900/60 font-bold cursor-pointer hover:brightness-125 transition-all select-none"
      style={{
        left: `${left}px`,
        width: `${width}px`,
        background: isActive ? activeBg : normalBg,
        borderTop: `4px solid ${borderAccentColor}`,
        boxShadow: isActive ? `inset 0 0 12px ${getHexAlpha(borderAccentColor, 0.4)}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
        padding: '0 2px',
      }}
    >
      <span
        className={`${isCompact ? 'text-[9px]' : 'text-xs md:text-sm'} font-serif drop-shadow-sm font-bold tracking-tight leading-tight w-full text-center truncate`}
        style={{ color: isBorrowed ? '#FACC15' : chordColor }}
      >
        {displayRoman}
      </span>
      {!isCompact && chord.sublabel && !displayRoman.includes(chord.sublabel) && (
        <span className={`text-[9px] font-sans font-medium leading-tight w-full text-center truncate ${isBorrowed ? 'text-amber-300 font-semibold' : 'text-gray-300'}`}>
          {chord.sublabel}
        </span>
      )}
      <span className={`text-[9px] md:text-[10px] leading-tight w-full text-center truncate ${isActive ? 'text-gray-200 font-semibold' : 'text-gray-400'}`}>
        {displaySymbol}
      </span>
    </div>
  );
});

export default function PianoRoll() {
  const {
    song,
    parsedNotes,
    currentBeat,
    currentSectionId,
    isPlaying,
    activeNotes,
    showMelody,
    showChords,
    pixelsPerBeat,
    currentKey,
    keyMode,
    semitoneOffset,
    rowHeight,
    verticalRange,
    swingAmount,
    swingEnabled,
    swingSubdivision,
    setPixelsPerBeat,
    setVerticalRange,
    setCurrentBeat,
    setActiveNotes,
    setActiveChordNotes,
  } = usePlayerStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const notesGridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const pitchAxisRef = useRef<HTMLDivElement>(null);

  const [gridAvailableHeight, setGridAvailableHeight] = useState<number>(0);
  const [containerClientWidth, setContainerClientWidth] = useState<number>(0);
  const [scrollLeft, setScrollLeft] = useState<number>(0);

  const spelling = useMemo(() => getScaleSpelling(currentKey, keyMode), [currentKey, keyMode]);

  // Medir dimensiones del contenedor para scroll horizontal y virtualización
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;
    const updateWidth = () => {
      if (scrollEl.clientWidth > 0) setContainerClientWidth(scrollEl.clientWidth);
    };
    updateWidth();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerClientWidth(w);
      }
    });
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, []);

  // Medir la altura real disponible de la rejilla central
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      const h = el.clientHeight;
      if (h > 0) setGridAvailableHeight(h);
    };
    updateSize();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setGridAvailableHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Al cambiar de sección, restablecer scroll a 0 y reajustar vista (autoFit)
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
    setScrollLeft(0);

    if (containerClientWidth > 0 && song.totalBeats > 0) {
      const availableWidth = containerClientWidth - HEADER_WIDTH;
      const fitPixels = Math.floor(availableWidth / song.totalBeats);
      if (fitPixels >= 32 && fitPixels <= 64) {
        setPixelsPerBeat(fitPixels);
      } else if (fitPixels > 64) {
        setPixelsPerBeat(48);
      } else {
        setPixelsPerBeat(40);
      }
    }
  }, [currentSectionId, song.id, containerClientWidth, song.totalBeats, setPixelsPerBeat]);

  // ── Cálculo dinámico de octavas visibles según verticalRange ──
  const { bottomOctave, topOctave } = useMemo(() => {
    if (verticalRange === 'c4-c6') {
      return { bottomOctave: 0, topOctave: 2 };
    }
    if (verticalRange === 'c3-c6') {
      return { bottomOctave: -1, topOctave: 2 };
    }
    if (verticalRange === '3oct') {
      return { bottomOctave: -1, topOctave: 2 };
    }
    if (verticalRange === '4oct') {
      return { bottomOctave: -2, topOctave: 2 };
    }

    const autoRange = calculateAutoPitchRange(parsedNotes, song.chords);
    return {
      bottomOctave: Math.min(-1, autoRange.bottomOctave),
      topOctave: Math.max(2, autoRange.topOctave),
    };
  }, [verticalRange, parsedNotes, song.chords]);

  // Tonalidad y modo activos en el tiempo actual (soporta modulaciones en línea de tiempo)
  const activeKeyAtBeat = useMemo(() => {
    return getKeyAtBeat(song.keys, currentBeat);
  }, [song.keys, currentBeat]);

  const effectiveKey = useMemo(() => {
    if (semitoneOffset !== 0) {
      return transposeNoteLetter(activeKeyAtBeat.tonic, semitoneOffset, currentKey);
    }
    return activeKeyAtBeat.tonic;
  }, [activeKeyAtBeat.tonic, semitoneOffset, currentKey]);

  const effectiveMode = activeKeyAtBeat.scale;

  // Filas diatónicas recalculadas según la escala activa en el pulso actual y octavas
  const scaleRows: DynamicScaleRow[] = useMemo(
    () => generateScaleRows(effectiveKey, effectiveMode, semitoneOffset, bottomOctave, topOctave),
    [effectiveKey, effectiveMode, semitoneOffset, bottomOctave, topOctave]
  );

  const computedRowHeight = useMemo(() => {
    if (typeof rowHeight === 'number') {
      return rowHeight;
    }
    const count = scaleRows.length || 15;
    if (gridAvailableHeight > 0 && count > 0) {
      return Math.max(20, Math.floor(gridAvailableHeight / count));
    }
    return 22;
  }, [rowHeight, scaleRows.length, gridAvailableHeight]);

  const totalBeatsWidth = song.totalBeats * pixelsPerBeat;
  const totalSectionWidth = HEADER_WIDTH + totalBeatsWidth;
  const isOverflowingX = containerClientWidth > 0 && totalSectionWidth > containerClientWidth;
  const totalGridHeight = Math.max(gridAvailableHeight, scaleRows.length * computedRowHeight);

  // ── 1. VIRTUALIZACIÓN HORIZONTAL (Windowing / Culling) ──
  // Calcula la ventana visible según scrollLeft y el ancho del viewport con buffer
  const BUFFER_BEATS = 8;
  const visibleStartBeat = Math.max(1, scrollLeft / pixelsPerBeat - BUFFER_BEATS);
  const visibleEndBeat =
    (scrollLeft + (containerClientWidth || 1200)) / pixelsPerBeat + BUFFER_BEATS;

  const visibleMelodyNotes = useMemo(() => {
    if (!showMelody) return [];
    return parsedNotes.filter(
      (n) => n.beat + n.duration >= visibleStartBeat && n.beat <= visibleEndBeat
    );
  }, [parsedNotes, showMelody, visibleStartBeat, visibleEndBeat]);

  const visibleChords = useMemo(() => {
    return song.chords.filter(
      (c) => c.beat + c.duration >= visibleStartBeat && c.beat <= visibleEndBeat
    );
  }, [song.chords, visibleStartBeat, visibleEndBeat]);

  const fallbackMeter = useMemo(() => ({
    numerator: song.canonicalMeter?.numerator || song.timeSignature?.[0] || 4,
    denominator: song.canonicalMeter?.denominator || song.timeSignature?.[1] || 4,
  }), [song.canonicalMeter, song.timeSignature]);

  const timelineMeasures = useMemo(() => {
    return calculateMeasuresTimeline(
      song.totalBeats,
      song.meters && song.meters.length > 0 ? song.meters : undefined,
      fallbackMeter
    );
  }, [song.totalBeats, song.meters, fallbackMeter]);

  const visibleMeasures = useMemo(() => {
    return timelineMeasures.filter(
      (m) => m.endQuarter + 1 >= visibleStartBeat && m.startQuarter + 1 <= visibleEndBeat
    );
  }, [timelineMeasures, visibleStartBeat, visibleEndBeat]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (pitchAxisRef.current) {
      pitchAxisRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handlePitchAxisWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollTop += e.deltaY;
    }
  };

  // ── 2. DESACOPLAR PLAYHEAD Y AUTOSCROLL A 60 FPS (Vía RAF + Transform Directo) ──
  useEffect(() => {
    let rafId: number;
    const playheadEl = playheadRef.current;
    const scrollEl = scrollContainerRef.current;

    const renderLoop = () => {
      if (isPlaying) {
        const exactBeat = getCurrentExactBeat();
        const x = (exactBeat - 1) * pixelsPerBeat;

        // Trasladar la línea del playhead directamente en el compositor sin causar re-renders en React
        if (playheadEl) {
          playheadEl.style.transform = `translateX(${x}px)`;
        }

        // Autoscroll suave
        if (scrollEl) {
          const visibleWidth = scrollEl.clientWidth;
          const curScroll = scrollEl.scrollLeft;
          if (x > curScroll + visibleWidth * 0.6) {
            scrollEl.scrollLeft = x - visibleWidth * 0.3;
          } else if (x < curScroll) {
            scrollEl.scrollLeft = Math.max(0, x - 50);
          }
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, pixelsPerBeat]);

  // Actualizar posición del playhead al hacer seeking o pausar
  useEffect(() => {
    if (!isPlaying && playheadRef.current) {
      const x = (currentBeat - 1) * pixelsPerBeat;
      playheadRef.current.style.transform = `translateX(${x}px)`;
    }
  }, [isPlaying, currentBeat, pixelsPerBeat]);

  // ── Zoom interactivo con Rueda del ratón ──
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY * -0.05;
        setPixelsPerBeat((prev) => Math.min(Math.max(Math.round(prev + zoomDelta), 24), 96));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [setPixelsPerBeat]);

  const getMidiRowIndex = useCallback(
    (midi: number): number => {
      let bestIdx = 0;
      let minDiff = 999;
      scaleRows.forEach((r, idx) => {
        const diff = Math.abs(r.baseMidi - midi);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = idx;
        }
      });
      return bestIdx;
    },
    [scaleRows]
  );

  const activeChordIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < song.chords.length; i++) {
      if (
        currentBeat >= song.chords[i].beat &&
        currentBeat < song.chords[i].beat + song.chords[i].duration
      ) {
        idx = i;
      }
    }
    return idx;
  }, [currentBeat, song.chords]);

  const activeChord = activeChordIndex !== -1 ? song.chords[activeChordIndex] : null;

  const handleChordClick = useCallback(
    async (chordNotes: string[] | undefined, chordBeat: number) => {
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
    },
    [isPlaying, setCurrentBeat, setActiveChordNotes]
  );

  const handleSeekAndAudition = useCallback(
    async (targetBeat: number) => {
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }

      seekToBeat(targetBeat);
      setCurrentBeat(targetBeat);

      let activeMelodyNote: (typeof parsedNotes)[0] | undefined;
      if (showMelody) {
        activeMelodyNote = parsedNotes.find((n) => {
          return targetBeat >= n.beat && targetBeat < n.beat + n.duration;
        });
      }

      const activeChordAtBeat = song.chords.find((c) => {
        return targetBeat >= c.beat && targetBeat < c.beat + c.duration;
      });

      const melodySound = activeMelodyNote ? activeMelodyNote.name || activeMelodyNote.midi : null;
      const chordNotes = showChords && activeChordAtBeat ? activeChordAtBeat.notes ?? [] : [];

      triggerAudition(melodySound, chordNotes, '8n', '4n');

      const newActiveNotes = new Set<number>();
      if (activeMelodyNote && typeof activeMelodyNote.midi === 'number') {
        newActiveNotes.add(activeMelodyNote.midi);
      }
      setActiveNotes(newActiveNotes);

      const newActiveChordNotes = new Set<number>();
      if (activeChordAtBeat && activeChordAtBeat.notes) {
        activeChordAtBeat.notes.forEach((p) => {
          const m = pitchToMidi(p);
          if (m !== null) newActiveChordNotes.add(m);
        });
      }
      setActiveChordNotes(newActiveChordNotes);

      setTimeout(() => {
        if (!usePlayerStore.getState().isPlaying) {
          setActiveNotes(new Set());
          setActiveChordNotes(new Set());
        }
      }, 600);
    },
    [showMelody, showChords, parsedNotes, song.chords, setCurrentBeat, setActiveNotes, setActiveChordNotes]
  );

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const rawBeat = 1 + clickX / pixelsPerBeat;
    const targetBeat = Math.max(1, Math.min(song.totalBeats, Math.round(rawBeat * 4) / 4));
    handleSeekAndAudition(targetBeat);
  };

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = notesGridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const rawBeat = 1 + clickX / pixelsPerBeat;
    const targetBeat = Math.max(1, Math.min(song.totalBeats, Math.round(rawBeat * 4) / 4));
    handleSeekAndAudition(targetBeat);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
      {/* Contenedor principal con scroll horizontal único y condicional */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-hidden select-none custom-scrollbar bg-gray-950 flex flex-col"
      >
        <div
          className="flex-1 flex flex-row min-h-0 relative min-w-full"
          style={{
            width: isOverflowingX ? `${totalSectionWidth}px` : '100%',
          }}
        >
          {/* ── Columna Lateral de notas y grados SIEMPRE FIJA a la izquierda (sticky left-0 z-30) ── */}
          <div
            className="sticky left-0 z-30 shrink-0 w-12 md:w-14 bg-[#0d1117] border-r border-gray-800 shadow-[2px_0_8px_rgba(0,0,0,0.5)] select-none flex flex-col"
            style={{ width: HEADER_WIDTH }}
          >
            {/* Cabecera superior: selector Auto/rango */}
            <div
              className="flex items-center justify-center shrink-0 px-1 border-b border-gray-700/80 bg-gray-900"
              style={{ height: TIME_HEADER_HEIGHT }}
            >
              <select
                value={verticalRange}
                onChange={(e) => setVerticalRange(e.target.value as any)}
                className="w-full bg-gray-800 text-[9px] font-mono font-bold text-gray-300 rounded border border-gray-700 py-0.5 px-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                title="Rango vertical de octavas visibles"
              >
                <option value="auto">Auto</option>
                <option value="c4-c6">C4–C6</option>
                <option value="c3-c6">C3–C6</option>
                <option value="3oct">3 Oct</option>
                <option value="4oct">4 Oct</option>
              </select>
            </div>

            {/* Filas de notas sincronizadas en altura con el grid */}
            <div
              ref={pitchAxisRef}
              onWheel={handlePitchAxisWheel}
              className="flex-1 min-h-0 overflow-hidden flex flex-col"
            >
              <div style={{ height: totalGridHeight }} className="flex flex-col">
                {scaleRows.map((row, rowIdx) => {
                  const rowDegreeStr = String(row.degree);
                  const degColor =
                    HOOKTHEORY_DEGREE_COLORS[rowDegreeStr] || getColorByDegree(row.degree);
                  const isTonic = row.degree === 1;

                  return (
                    <div
                      key={`pitch-axis-row-${rowIdx}`}
                      className="flex items-center px-1 text-[10px] font-mono border-b border-gray-800/40 box-border shrink-0"
                      style={{
                        height: computedRowHeight,
                        minHeight: computedRowHeight,
                        maxHeight: computedRowHeight,
                        background: isTonic ? degColor + '28' : degColor + '12',
                        borderBottomColor: isTonic ? degColor + '50' : '#111827',
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white mr-1 shadow-sm shrink-0"
                        style={{ backgroundColor: degColor }}
                      >
                        {row.degree}
                      </span>
                      <span
                        className={`text-[10px] font-semibold truncate ${
                          isTonic ? 'text-white font-bold' : 'text-gray-300'
                        }`}
                      >
                        {row.noteName}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Espacio fijo a la izquierda de la barra de acordes inferior */}
            <div
              className="shrink-0 border-t-2 border-gray-950 flex items-center justify-center text-[10px] font-bold text-gray-500 tracking-wider bg-[#0d1117]"
              style={{ height: CHORD_BAR_HEIGHT }}
            >
              CHORD
            </div>
          </div>

          {/* ── Contenido desplazable horizontalmente (Desliza por detrás de la columna fija) ── */}
          <div
            className="flex-1 flex flex-col min-h-0 relative"
            style={{
              width: totalBeatsWidth,
              minWidth: totalBeatsWidth,
            }}
          >
            {/* ── 1. Cabecera de Compases (TimeHeader) Virtualizada ── */}
            <div
              onClick={handleTimelineClick}
              className="bg-gray-900 border-b border-gray-700/80 shrink-0 relative overflow-hidden cursor-pointer"
              style={{
                height: TIME_HEADER_HEIGHT,
                width: totalBeatsWidth,
              }}
              title="Haz click para saltar a cualquier compás"
            >
              {visibleMeasures.map((measure) => {
                return (
                  <React.Fragment key={`th-measure-${measure.measureNumber}`}>
                    {measure.pulses.map((pulse, pulseIdx) => {
                      const nextQuarter =
                        pulseIdx + 1 < measure.pulses.length
                          ? measure.pulses[pulseIdx + 1].absoluteQuarter
                          : measure.endQuarter;
                      const pulseWidth = (nextQuarter - pulse.absoluteQuarter) * pixelsPerBeat;
                      const isMeasureStart = pulseIdx === 0;

                      return (
                        <div
                          key={`th-pulse-${measure.measureNumber}-${pulseIdx}`}
                          className="absolute top-0 bottom-0 flex items-center justify-between border-r px-1 text-[10px] font-mono pointer-events-none hover:bg-white/5"
                          style={{
                            left: pulse.absoluteQuarter * pixelsPerBeat,
                            width: pulseWidth,
                            borderColor: isMeasureStart ? (measure.isMeterChange ? '#38BDF8' : '#4B5563') : '#1F2937',
                            background: isMeasureStart
                              ? measure.isMeterChange
                                ? 'rgba(56, 189, 248, 0.15)'
                                : 'rgba(55, 65, 81, 0.28)'
                              : 'transparent',
                            color: isMeasureStart ? (measure.isMeterChange ? '#38BDF8' : '#93C5FD') : '#6B7280',
                          }}
                        >
                          <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                            <span>{pulse.label}</span>
                            {isMeasureStart && measure.isMeterChange && (
                              <span className="px-1 py-0.2 rounded bg-cyan-900/80 text-cyan-200 border border-cyan-500/50 font-bold text-[9px] shadow-sm">
                                {measure.numerator}/{measure.denominator}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {/* Insignias / etiquetas flotantes doradas/ámbar de modulación estilo Hookpad */}
              {song.keys && song.keys.map((k, kIdx) => {
                const left = (k.beat - 1) * pixelsPerBeat;
                const scaleName = k.scale ? k.scale.charAt(0).toUpperCase() + k.scale.slice(1) : 'Major';
                return (
                  <div
                    key={`key-mod-badge-${kIdx}-${k.beat}`}
                    className="absolute top-1 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-amber-950 border border-amber-300 shadow-[0_2px_8px_rgba(245,158,11,0.5)] font-sans text-[10px] font-bold tracking-wide pointer-events-none whitespace-nowrap select-none"
                    style={{ left: `${left + 2}px` }}
                    title={`Modulación a ${k.tonic} ${scaleName} (Beat ${k.beat})`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-950 animate-pulse" />
                    <span>{k.tonic} {scaleName}</span>
                  </div>
                );
              })}
            </div>

            {/* ── 2. Rejilla de Notas Virtualizada (ocupa el espacio flexible central) ── */}
            <div
              ref={gridContainerRef}
              onScroll={handleGridScroll}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative"
              style={{ width: totalBeatsWidth }}
            >
              <div
                ref={notesGridRef}
                onClick={handleGridClick}
                className="relative cursor-pointer"
                style={{
                  width: totalBeatsWidth,
                  height: totalGridHeight,
                }}
              >
                {/* Filas horizontales fijas con fondo tenue del color del grado */}
                {scaleRows.map((row, rowIdx) => {
                  const rowDegreeStr = String(row.degree);
                  const rowColor =
                    HOOKTHEORY_DEGREE_COLORS[rowDegreeStr] || getColorByDegree(row.degree);
                  const isTonic = row.degree === 1;

                  return (
                    <div
                      key={`grid-row-${rowIdx}`}
                      className="absolute w-full pointer-events-none box-border"
                      style={{
                        top: rowIdx * computedRowHeight,
                        height: computedRowHeight,
                        backgroundColor: rowColor + '12',
                        borderBottom: `1px solid ${isTonic ? rowColor + '40' : '#151C2C'}`,
                      }}
                    />
                  );
                })}

                {/* Líneas divisorias dinámicas: Compases, Pulsos y Subdivisiones VIRTUALIZADAS */}
                {visibleMeasures.map((measure) => {
                  const isLastMeasure = measure.measureNumber === timelineMeasures.length;
                  return (
                    <React.Fragment key={`grid-measure-${measure.measureNumber}`}>
                      {/* 1. Límite de compás (gruesa / cian si hay cambio métrico) */}
                      <div
                        key={`bar-start-${measure.measureNumber}`}
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{
                          left: measure.startQuarter * pixelsPerBeat,
                          width: measure.isMeterChange ? 2 : 1,
                          background: measure.isMeterChange ? '#38BDF8' : '#4B5563',
                          zIndex: 2,
                        }}
                      />

                      {/* 2. Líneas de pulso (intermedias) */}
                      {measure.pulses.map((pulse, pIdx) => {
                        if (pIdx === 0) return null; // pulso 0 coincide con el inicio de compás
                        return (
                          <div
                            key={`pulse-line-${measure.measureNumber}-${pIdx}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: pulse.absoluteQuarter * pixelsPerBeat,
                              width: 1,
                              background: '#2B384E',
                              zIndex: 1,
                            }}
                          />
                        );
                      })}

                      {/* 3. Líneas de subdivisión (muy tenues) */}
                      {measure.subdivisions.map((sub, sIdx) => {
                        const coincidesWithPulse = measure.pulses.some(
                          (p) => Math.abs(p.offsetInMeasure - sub.offsetInMeasure) < 0.001
                        );
                        if (coincidesWithPulse) return null;
                        return (
                          <div
                            key={`sub-line-${measure.measureNumber}-${sIdx}`}
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{
                              left: sub.absoluteQuarter * pixelsPerBeat,
                              width: 1,
                              background: '#151C2C',
                              zIndex: 0,
                            }}
                          />
                        );
                      })}

                      {/* Límite final para el último compás */}
                      {isLastMeasure && (
                        <div
                          key={`bar-end-${measure.measureNumber}`}
                          className="absolute top-0 bottom-0 pointer-events-none"
                          style={{
                            left: measure.endQuarter * pixelsPerBeat,
                            width: 1,
                            background: '#4B5563',
                            zIndex: 2,
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Líneas verticales divisorias doradas/ámbar en los puntos de modulación */}
                {song.keys && song.keys.map((k, kIdx) => (
                  <div
                    key={`key-mod-grid-line-${kIdx}-${k.beat}`}
                    className="absolute top-0 bottom-0 pointer-events-none z-10 border-l-2 border-dashed border-amber-400/60"
                    style={{ left: (k.beat - 1) * pixelsPerBeat }}
                  />
                ))}

                {/* Bandas de fondo por acorde VIRTUALIZADAS */}
                {visibleChords.map((chord, i) => {
                  const x = (chord.beat - 1) * pixelsPerBeat;
                  const w = chord.duration * pixelsPerBeat;
                  const chordColor = chord.color ?? getColor(chord.rootMidi ?? 60, 60);
                  const colorAlpha = getHexAlpha(chordColor, 0.03);

                  return (
                    <div
                      key={`chord-bg-${(chord as any).id || chord.beat || i}`}
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{
                        left: x,
                        width: w,
                        background: colorAlpha,
                        zIndex: 0,
                      }}
                    />
                  );
                })}

                {/* Bloques de acordes de referencia en Piano Roll VIRTUALIZADOS (Deduplicación limpia) */}
                {showChords &&
                  visibleChords.map((chord, chordIdx) => {
                    const isChordActive = activeChord === chord;
                    const rawVoices: ResolvedChordVoice[] =
                      (chord as any).voices && (chord as any).voices.length > 0
                        ? (chord as any).voices
                        : resolveChordVoices(chord as any, { tonic: currentKey, scale: keyMode as any }, 4);

                    // Deduplicación estricta por carril vertical: si dos voces coinciden en la misma coordenada 'y',
                    // se renderiza un único bloque priorizando 'Bass' si está invertido.
                    const seenY = new Map<number, ResolvedChordVoice>();
                    for (const v of rawVoices) {
                      const octaveOffset = Math.floor(v.midi / 12) - 5;
                      const yKey = Math.round(calculateNoteTop(v.sd, octaveOffset, computedRowHeight, topOctave).top * 10) / 10;
                      if (!seenY.has(yKey)) {
                        seenY.set(yKey, v);
                      } else {
                        if (v.isBass || v.label === 'Bass') {
                          seenY.set(yKey, v);
                        }
                      }
                    }
                    const voices = Array.from(seenY.values());

                    return voices.map((voice: ResolvedChordVoice, nIdx: number) => {
                      return (
                        <MemoizedChordVoicing
                          key={`chord-voice-${(chord as any).id || chord.beat || chordIdx}-${voice.midi}-${nIdx}`}
                          chord={chord}
                          voice={voice}
                          pixelsPerBeat={pixelsPerBeat}
                          computedRowHeight={computedRowHeight}
                          topOctave={topOctave}
                          isChordActive={isChordActive}
                        />
                      );
                    });
                  })}

                {/* Bloques de notas de la melodía VIRTUALIZADOS con Swing Reactivo */}
                {showMelody &&
                  visibleMelodyNotes.map((note, i) => {
                    const { visualBeat, visualDuration } = applySwingTransform(
                      note.beat,
                      note.duration,
                      swingEnabled,
                      swingAmount / 100,
                      swingSubdivision
                    );

                    // Iluminación individual: solo se enciende el bloque de nota específico bajo el playhead
                    const isNoteActive = currentBeat >= note.beat && currentBeat < (note.beat + note.duration);
                    const isActive = isPlaying && isNoteActive;

                    return (
                      <MemoizedMelodyNote
                        key={`melody-note-${(note as any).id || `${note.beat}-${note.midi}-${i}`}`}
                        note={note}
                        visualBeat={visualBeat}
                        visualDuration={visualDuration}
                        pixelsPerBeat={pixelsPerBeat}
                        computedRowHeight={computedRowHeight}
                        topOctave={topOctave}
                        isPlaying={isPlaying}
                        isActive={isActive}
                        onClick={handleSeekAndAudition}
                      />
                    );
                  })}
              </div>
            </div>

            {/* ── 3. Barra de Acordes (CHORD) VIRTUALIZADA ── */}
            <div
              className="shrink-0 h-14 border-t-2 border-gray-950 bg-[#0d1117] relative z-20"
              style={{
                height: CHORD_BAR_HEIGHT,
                width: totalBeatsWidth,
              }}
            >
              <div
                className="relative bg-gray-900/60"
                style={{ height: CHORD_BAR_HEIGHT, width: totalBeatsWidth }}
              >
                {visibleChords.map((chord, idx) => {
                  const isActive = activeChord === chord;
                  const chordKey = getKeyAtBeat(song.keys, chord.beat);
                  return (
                    <MemoizedChordBarBlock
                      key={`chord-bar-${(chord as any).id || chord.beat || idx}`}
                      chord={chord}
                      pixelsPerBeat={pixelsPerBeat}
                      isActive={isActive}
                      onClick={handleChordClick}
                      currentKey={chordKey.tonic}
                      keyMode={chordKey.scale}
                    />
                  );
                })}
              </div>
            </div>

            {/* ── 4. Playhead Sincronizado Desacoplado (Cruza Ruler + Piano Roll + Chords) ── */}
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 pointer-events-none will-change-transform z-25"
              style={{
                left: 0,
                width: 2,
                background: '#EF4444',
                boxShadow: '0 0 14px 2px rgba(239, 68, 68, 0.95)',
                transform: `translateX(${(Math.max(1, currentBeat) - 1) * pixelsPerBeat}px)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
