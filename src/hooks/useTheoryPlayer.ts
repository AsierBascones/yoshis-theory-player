/**
 * useTheoryPlayer.ts
 * Hook Central del Reproductor Universal de Teoría Musical.
 * Encapsula transporte, síntesis de Tone.js, resolución matemática de notas,
 * transposición en tiempo real, swing y cálculos de rango dinámico.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import type {
  UniversalSong,
  SongSection,
  KeySignature,
  ScaleMode,
  ResolvedMelodyNote,
  ResolvedChord,
} from '../types/music';
import {
  resolvePitch,
  resolveChordVoicing,
  applySwingTransform,
  getScaleSpelling,
  formatPitch,
  NOTE_TO_PC,
} from '../utils/theoryEngine';
import {
  initAudio,
  setupSong,
  disposeAudio,
  playTransport,
  pauseTransport,
  stopTransport,
  seekToBeat as audioSeekToBeat,
  setBpm as audioSetBpm,
  setSwingConfig,
  setAudioLoop,
  setAudioToggles,
  updateSongLive,
} from '../audio/audioEngine';
import {
  generateScaleRows,
  calculateAutoPitchRange,
  getOptimalTransposeInterval,
  type DynamicScaleRow,
  type FretRangeResult,
} from '../utils/musicTheory';
import { resolveGuitarVoicing, getOptimalMelodyPosition } from '../components/GuitarFretboard/GuitarFretboard';

export interface UseTheoryPlayerProps {
  song: UniversalSong;
  initialSectionId?: string;
}

export function useTheoryPlayer({ song, initialSectionId }: UseTheoryPlayerProps) {
  // ── 1. Sección Activa ──
  const [activeSectionId, setActiveSectionId] = useState<string>(
    initialSectionId || song.sections[0]?.id || 'all'
  );

  const currentSection: SongSection = useMemo(() => {
    return song.sections.find((s) => s.id === activeSectionId) || song.sections[0] || {
      id: 'default',
      name: 'Default',
      key: song.globalKey,
      beatsPerBar: 4,
      totalBars: 8,
      melody: [],
      chords: [],
    };
  }, [song, activeSectionId]);

  // Si cambia la canción, reiniciar a la primera sección si la actual no existe
  useEffect(() => {
    if (!song.sections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(song.sections[0]?.id || 'all');
    }
  }, [song, activeSectionId]);

  // ── 2. Tonalidad y Transposición en Tiempo Real ──
  const [currentKey, setCurrentKey] = useState<KeySignature>(currentSection.key || song.globalKey);
  const [semitoneOffset, setSemitoneOffset] = useState<number>(0);

  // Al cambiar de sección, sincronizar su tonalidad nativa
  useEffect(() => {
    if (currentSection.key) {
      setCurrentKey(currentSection.key);
      setSemitoneOffset(0);
    }
  }, [currentSection]);

  const changeKey = useCallback(
    (newTonic: string, newScale?: ScaleMode) => {
      const baseTonic = currentSection.key?.tonic || song.globalKey.tonic;
      const interval = getOptimalTransposeInterval(baseTonic, newTonic);
      setSemitoneOffset(interval);
      setCurrentKey((prev) => ({
        tonic: newTonic,
        scale: newScale || prev.scale,
      }));
    },
    [currentSection, song.globalKey]
  );

  // ── 3. Tempo (BPM) y Swing ──
  const [bpm, setBpmState] = useState<number>(song.bpm);
  const [swingEnabled, setSwingEnabled] = useState<boolean>(song.defaultSwing.enabled);
  const [swingAmount, setSwingAmount] = useState<number>(song.defaultSwing.percentage);
  const [swingSubdivision, setSwingSubdivision] = useState<'8n' | '16n'>(song.defaultSwing.subdivision);

  const updateBpm = useCallback((newBpm: number) => {
    const clamped = Math.max(30, Math.min(300, newBpm));
    setBpmState(clamped);
    audioSetBpm(clamped);
  }, []);

  const updateSwing = useCallback((enabled: boolean, amount = 67, subdivision: '8n' | '16n' = '8n') => {
    setSwingEnabled(enabled);
    setSwingAmount(amount);
    setSwingSubdivision(subdivision);
    setSwingConfig(enabled, amount, subdivision);
  }, []);

  // ── 4. Resolución Musical de Notas y Acordes (Motor Puto Desacoplado) ──
  const resolvedNotes = useMemo<ResolvedMelodyNote[]>(() => {
    return currentSection.melody.map((note) => {
      const { midi, pitch, color, isAltered } = resolvePitch(
        note.sd,
        note.octaveOffset,
        currentKey,
        4
      );

      const { visualBeat, visualDuration } = applySwingTransform(
        note.beat,
        note.duration,
        swingEnabled,
        swingAmount / 100,
        swingSubdivision
      );

      return {
        id: note.id,
        beat: note.beat,
        duration: note.duration,
        visualBeat,
        visualDuration,
        sd: note.sd,
        octaveOffset: note.octaveOffset,
        midi,
        pitch,
        color,
        isAltered,
      };
    });
  }, [currentSection.melody, currentKey, swingEnabled, swingAmount, swingSubdivision]);

  const resolvedChords = useMemo<ResolvedChord[]>(() => {
    return currentSection.chords.map((chord) => {
      return resolveChordVoicing(chord, currentKey);
    });
  }, [currentSection.chords, currentKey]);

  // ── 5. Auto Range Dinámico de Filas Diatónicas (Piano Roll) ──
  const [verticalRange, setVerticalRange] = useState<'auto' | 'c4-c6' | 'c3-c6' | '3oct' | '4oct'>('auto');
  const [rowHeight, setRowHeight] = useState<number | 'auto'>('auto');
  const [pixelsPerBeat, setPixelsPerBeat] = useState<number>(48);

  const { bottomOctave, topOctave } = useMemo(() => {
    if (verticalRange === 'c4-c6') return { bottomOctave: 0, topOctave: 2 };
    if (verticalRange === 'c3-c6') return { bottomOctave: -1, topOctave: 2 };
    if (verticalRange === '3oct') return { bottomOctave: -1, topOctave: 2 };
    if (verticalRange === '4oct') return { bottomOctave: -2, topOctave: 2 };

    // Auto: evalúa melodía Y acordes simultáneamente para no cortar bajos (G3, E3, C3)
    const autoRange = calculateAutoPitchRange(resolvedNotes, resolvedChords);
    return {
      bottomOctave: Math.min(-1, autoRange.bottomOctave),
      topOctave: Math.max(2, autoRange.topOctave),
    };
  }, [verticalRange, resolvedNotes, resolvedChords]);

  const scaleRows: DynamicScaleRow[] = useMemo(() => {
    return generateScaleRows(
      currentKey.tonic,
      currentKey.scale,
      semitoneOffset,
      bottomOctave,
      topOctave
    );
  }, [currentKey, semitoneOffset, bottomOctave, topOctave]);

  // ── 6. Rango de Trastes de Guitarra (Auto-Fit enfocado en postura) ──
  const fretRange = useMemo<FretRangeResult>(() => {
    const usedFrets: number[] = [];

    resolvedChords.forEach((chord) => {
      const voicing = resolveGuitarVoicing(chord.symbol);
      voicing.frets.forEach((f) => {
        if (f >= 0) usedFrets.push(f);
      });
    });

    resolvedNotes.forEach((n) => {
      const pos = getOptimalMelodyPosition(n.midi, 2);
      if (pos) usedFrets.push(pos.fret);
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
  }, [resolvedChords, resolvedNotes]);

  // ── 7. Estado del Transporte Tone.js ──
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<number>(1);
  const [loop, setLoop] = useState<boolean>(true);
  const handleSetLoop = useCallback((val: boolean) => {
    setLoop(val);
    setAudioLoop(val);
  }, []);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [activeChordNotes, setActiveChordNotes] = useState<Set<number>>(new Set());

  // Capas de visibilidad de instrumentos y elementos
  const [showMelody, setShowMelody] = useState<boolean>(true);
  const [showChords, setShowChords] = useState<boolean>(true);
  const [showInstrument, setShowInstrument] = useState<boolean>(true);
  const [instrumentType, setInstrumentType] = useState<'piano' | 'guitar'>('piano');

  const activeNotesRef = useRef<Set<number>>(new Set());

  // Inicializar motor de audio y programar la sección activa
  useEffect(() => {
    initAudio();

    const musicData = {
      title: `${song.title} - ${currentSection.name}`,
      artist: song.artist,
      bpm,
      timeSignature: currentSection.timeSignature || [currentSection.canonicalMeter?.numerator || currentSection.beatsPerBar, currentSection.canonicalMeter?.denominator || 4] as [number, number],
      meters: currentSection.meters,
      totalBeats: currentSection.totalBars * currentSection.beatsPerBar,
      keys: [{ beat: 1, scale: currentKey.scale, tonic: currentKey.tonic }],
      chords: resolvedChords,
    };

    const parsedMelody = resolvedNotes.map((n) => ({
      beat: n.beat,
      duration: n.duration,
      midi: n.midi,
      name: n.pitch,
      sd: n.sd,
      octave: n.octaveOffset,
      color: n.color,
      isAltered: n.isAltered,
    }));

    setupSong(
      musicData as any,
      parsedMelody as any,
      (beat) => setCurrentBeat(beat),
      (midi) => {
        const next = new Set(activeNotesRef.current);
        next.add(midi);
        activeNotesRef.current = next;
        setActiveNotes(new Set(next));
      },
      (midi) => {
        const next = new Set(activeNotesRef.current);
        next.delete(midi);
        activeNotesRef.current = next;
        setActiveNotes(new Set(next));
      },
      (chordMidis) => {
        setActiveChordNotes(new Set(chordMidis));
      },
      () => {
        setIsPlaying(false);
      }
    );

    return () => {
      disposeAudio();
    };
  }, [song, currentSection, currentKey, resolvedNotes, resolvedChords, bpm]);

  // Actualizar visibilidad de audio de partes en tiempo real
  useEffect(() => {
    setAudioToggles(showMelody, showChords);
  }, [showMelody, showChords]);

  // ── 8. Controles de Transporte ──
  const play = useCallback(async () => {
    await playTransport();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    pauseTransport();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      pause();
    } else {
      await play();
    }
  }, [isPlaying, play, pause]);

  const stop = useCallback(() => {
    stopTransport();
    setIsPlaying(false);
    setCurrentBeat(1);
    audioSeekToBeat(1);
    activeNotesRef.current.clear();
    setActiveNotes(new Set());
    setActiveChordNotes(new Set());
  }, []);

  const seek = useCallback((beat: number) => {
    const totalBeats = currentSection.totalBars * currentSection.beatsPerBar;
    const clamped = Math.max(1, Math.min(beat, totalBeats));
    setCurrentBeat(clamped);
    audioSeekToBeat(clamped);
  }, [currentSection]);

  // ── 9. Elementos Activos en el Playhead Instantáneo ──
  const activeChord = useMemo(() => {
    if (isPlaying) {
      return (
        resolvedChords.find(
          (c) => currentBeat >= c.beat && currentBeat < c.beat + c.duration
        ) || null
      );
    }
    return resolvedChords[0] || null;
  }, [isPlaying, currentBeat, resolvedChords]);

  const activeMelodyNote = useMemo(() => {
    if (!showMelody) return null;
    if (isPlaying) {
      return (
        resolvedNotes.find(
          (n) => currentBeat >= n.beat && currentBeat < n.beat + n.duration
        ) || null
      );
    }
    if (activeNotes.size > 0) {
      const firstMidi = Array.from(activeNotes)[0];
      return resolvedNotes.find((n) => n.midi === firstMidi) || null;
    }
    return null;
  }, [showMelody, isPlaying, currentBeat, resolvedNotes, activeNotes]);

  const totalBeats = currentSection.totalBars * currentSection.beatsPerBar;
  const spelling = useMemo(() => getScaleSpelling(currentKey.tonic, currentKey.scale), [currentKey]);

  return {
    // Canción y Sección
    song,
    currentSection,
    activeSectionId,
    setSection: setActiveSectionId,

    // Tonalidad y Transposición
    currentKey,
    semitoneOffset,
    changeKey,
    spelling,

    // Tempo y Swing
    bpm,
    setBpm: updateBpm,
    swing: {
      enabled: swingEnabled,
      amount: swingAmount,
      subdivision: swingSubdivision,
    },
    setSwing: updateSwing,

    // Datos Resueltos Puros
    resolvedNotes,
    resolvedChords,
    scaleRows,
    fretRange,
    totalBeats,

    // Elementos en el Playhead
    activeChord,
    activeMelodyNote,
    activeNotes,
    activeChordNotes,

    // Transporte
    isPlaying,
    currentBeat,
    loop,
    setLoop: handleSetLoop,
    play,
    pause,
    togglePlay,
    stop,
    seek,

    // Opciones Visuales
    showMelody,
    setShowMelody,
    showChords,
    setShowChords,
    showInstrument,
    setShowInstrument,
    instrumentType,
    setInstrumentType,
    pixelsPerBeat,
    setPixelsPerBeat,
    rowHeight,
    setRowHeight,
    verticalRange,
    setVerticalRange,
  };
}
