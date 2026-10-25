import { create } from 'zustand';
import type { UniversalSong, SongSection, KeySignature, ScaleMode } from '../types/music';
import { SONG_CATALOG, snowMountainSong } from '../data/songs';
import { resolvePitch, resolveChordVoicing, getTransposedChordSymbol } from '../utils/theoryEngine';
import {
  setAudioToggles,
  setupSong,
  updateSongLive,
  stopTransport,
  setBpm as audioSetBpm,
  setAudioTranspose,
  setSwingConfig,
} from '../audio/audioEngine';
import { getOptimalTransposeInterval, transposeNoteLetter } from '../utils/musicTheory';
import type { SectionData } from '../data/snowMountainData';
import type { ParsedNote, RawNote, RawChord, MusicData } from '../utils/theoryParser';

interface PlayerState {
  // Catálogo y Canción Universal Activa
  catalog: UniversalSong[];
  selectedSongId: string;
  currentSong: UniversalSong;
  setSongId: (songId: string) => void;
  addSongToCatalog: (song: UniversalSong) => void;

  // Sección Activa
  currentSectionId: string;
  song: SectionData;
  parsedNotes: ParsedNote[];
  isPlaying: boolean;
  currentBeat: number;
  bpm: number;
  pixelsPerBeat: number;
  loop: boolean;
  activeNotes: Set<number>;
  activeChordNotes: Set<number>;
  showMelody: boolean;
  showChords: boolean;
  showInstrument: boolean;
  instrumentType: 'piano' | 'guitar';

  // Desplazamiento de Octava (±8va)
  melodyOctaveShift: number;
  chordsOctaveShift: number;
  shiftMelodyOctave: (delta: number) => void;
  shiftChordsOctave: (delta: number) => void;
  setMelodyOctaveShift: (val: number) => void;
  setChordsOctaveShift: (val: number) => void;

  // Tonalidad y Transposición Hooktheory
  currentKey: string;
  keyMode: string;
  semitoneOffset: number;
  transposeMode: 'parallel' | 'relative';
  transposeScope: 'current' | 'song';

  // Controles de Swing
  swingAmount: number;
  swingEnabled: boolean;
  swingSubdivision: '8n' | '16n';

  // Escala vertical y zoom
  rowHeight: number | 'auto';
  verticalRange: 'auto' | 'c4-c6' | 'c3-c6' | '3oct' | '4oct';

  setSection: (sectionId: string) => void;
  setPlaying: (val: boolean) => void;
  setCurrentBeat: (beat: number) => void;
  setBpm: (bpm: number) => void;
  setPixelsPerBeat: (val: number | ((prev: number) => number)) => void;
  setRowHeight: (val: number | 'auto' | ((prev: number | 'auto') => number | 'auto')) => void;
  setVerticalRange: (range: 'auto' | 'c4-c6' | 'c3-c6' | '3oct' | '4oct') => void;
  setLoop: (val: boolean) => void;
  setActiveNotes: (notes: Set<number>) => void;
  setActiveChordNotes: (notes: Set<number>) => void;
  setShowMelody: (val: boolean) => void;
  setShowChords: (val: boolean) => void;
  setShowInstrument: (val: boolean) => void;
  setInstrumentType: (type: 'piano' | 'guitar') => void;

  setKey: (key: string, mode?: string) => void;
  setSwing: (enabled: boolean, amount?: number, subdivision?: '8n' | '16n') => void;
  setTransposeOptions: (options: {
    transposeMode?: 'parallel' | 'relative';
    transposeScope?: 'current' | 'song';
    keyMode?: string;
  }) => void;
}

/**
 * Resuelve una sección universal de UniversalSong a formato SectionData y ParsedNote[]
 */
function resolveSectionData(
  song: UniversalSong,
  section: SongSection,
  effectiveKey: KeySignature,
  semitoneOffset: number,
  melodyOctaveShift = 0,
  chordsOctaveShift = 0,
): { sectionData: SectionData; parsedNotes: ParsedNote[] } {
  const getKeyForBeat = (beat: number): KeySignature => {
    if (!section.keys || section.keys.length === 0) return effectiveKey;
    let active = section.keys[0];
    for (const k of section.keys) {
      if (k.beat <= beat) {
        active = k;
      } else {
        break;
      }
    }
    let transposedTonic = effectiveKey.tonic;
    if (semitoneOffset !== 0) {
      transposedTonic = transposeNoteLetter(active.tonic, semitoneOffset, effectiveKey.tonic);
    }
    return { tonic: transposedTonic, scale: active.scale as ScaleMode };
  };

  const resolvedMelody: ParsedNote[] = section.melody.map((note) => {
    const noteKey = getKeyForBeat(note.beat);
    const finalOctaveOffset = note.octaveOffset + melodyOctaveShift;
    const { midi, pitch, color, isAltered } = resolvePitch(
      note.sd,
      finalOctaveOffset,
      noteKey,
      4
    );

    return {
      beat: note.beat,
      duration: note.duration,
      sd: note.sd,
      scaleDegree: parseInt(note.sd.replace(/\D/g, '')) || 1,
      octave: finalOctaveOffset,
      midi,
      freq: 440 * Math.pow(2, (midi - 69) / 12),
      pitch,
      name: pitch,
      color,
      isAltered,
      striped: isAltered,
      isRest: false,
    };
  });

  const resolvedChords: RawChord[] = section.chords.map((chord) => {
    const chordKey = getKeyForBeat(chord.beat);
    const effectiveBaseOctave = 3 + chordsOctaveShift;
    const res = resolveChordVoicing(chord, chordKey, effectiveBaseOctave);
    const dynamicSymbol = getTransposedChordSymbol(chord, chordKey);
    return {
      beat: chord.beat,
      duration: chord.duration,
      roman: chord.roman,
      symbol: dynamicSymbol || res.symbol,
      root: chord.rootSd,
      quality: chord.quality as unknown as number,
      inversion: chord.inversion,
      borrowed: chord.borrowed,
      color: res.color,
      isAltered: res.isAltered,
      notes: res.notes,
      midiNotes: res.midiNotes,
      rootMidi: res.rootMidi,
      voices: res.voices,
    };
  });

  const sectionData: SectionData = {
    id: section.id,
    name: section.name,
    title: `${song.title} - ${section.name}`,
    artist: song.artist,
    bpm: song.bpm,
    timeSignature: [section.beatsPerBar, 4],
    totalBeats: section.totalBars * section.beatsPerBar,
    keys: section.keys && section.keys.length > 0 ? section.keys : [{ beat: 1, scale: effectiveKey.scale, tonic: effectiveKey.tonic }],
    notes: resolvedMelody as unknown as RawNote[],
    chords: resolvedChords,
  };

  return { sectionData, parsedNotes: resolvedMelody };
}

const initialSong = snowMountainSong;
const initialSection = initialSong.sections[0];
const initialKey = initialSection.key || initialSong.globalKey;
const { sectionData: initialSectionData, parsedNotes: initialParsedNotes } = resolveSectionData(
  initialSong,
  initialSection,
  initialKey,
  0
);

const usePlayerStore = create<PlayerState>((set, get) => ({
  catalog: SONG_CATALOG,
  selectedSongId: initialSong.id,
  currentSong: initialSong,

  currentSectionId: initialSection.id,
  song: initialSectionData,
  parsedNotes: initialParsedNotes,
  isPlaying: false,
  currentBeat: 1,
  bpm: initialSong.bpm,
  pixelsPerBeat: 48,
  loop: true,
  activeNotes: new Set(),
  activeChordNotes: new Set(),
  showMelody: true,
  showChords: true,
  showInstrument: true,
  instrumentType: 'piano',

  melodyOctaveShift: 0,
  chordsOctaveShift: 0,

  currentKey: initialKey.tonic,
  keyMode: initialKey.scale,
  semitoneOffset: 0,
  transposeMode: 'relative',
  transposeScope: 'song',

  swingAmount: initialSong.defaultSwing.percentage,
  swingEnabled: initialSong.defaultSwing.enabled,
  swingSubdivision: initialSong.defaultSwing.subdivision,

  rowHeight: 24,
  verticalRange: 'auto',

  shiftMelodyOctave: (delta: number) => {
    const { currentSong, currentSectionId, currentKey, keyMode, semitoneOffset, melodyOctaveShift, chordsOctaveShift } = get();
    const newShift = Math.max(-2, Math.min(2, melodyOctaveShift + delta));
    if (newShift === melodyOctaveShift) return;

    const section = currentSong.sections.find((s) => s.id === currentSectionId) || currentSong.sections[0];
    const effectiveKey: KeySignature = { tonic: currentKey, scale: keyMode as ScaleMode };
    const { sectionData, parsedNotes } = resolveSectionData(
      currentSong,
      section,
      effectiveKey,
      semitoneOffset,
      newShift,
      chordsOctaveShift
    );

    updateSongLive(parsedNotes, sectionData.chords);
    set({
      melodyOctaveShift: newShift,
      song: sectionData,
      parsedNotes,
    });
  },

  shiftChordsOctave: (delta: number) => {
    const { currentSong, currentSectionId, currentKey, keyMode, semitoneOffset, melodyOctaveShift, chordsOctaveShift } = get();
    const newShift = Math.max(-2, Math.min(2, chordsOctaveShift + delta));
    if (newShift === chordsOctaveShift) return;

    const section = currentSong.sections.find((s) => s.id === currentSectionId) || currentSong.sections[0];
    const effectiveKey: KeySignature = { tonic: currentKey, scale: keyMode as ScaleMode };
    const { sectionData, parsedNotes } = resolveSectionData(
      currentSong,
      section,
      effectiveKey,
      semitoneOffset,
      melodyOctaveShift,
      newShift
    );

    updateSongLive(parsedNotes, sectionData.chords);
    set({
      chordsOctaveShift: newShift,
      song: sectionData,
      parsedNotes,
    });
  },

  setMelodyOctaveShift: (val: number) => {
    const clamped = Math.max(-2, Math.min(2, val));
    const delta = clamped - get().melodyOctaveShift;
    get().shiftMelodyOctave(delta);
  },

  setChordsOctaveShift: (val: number) => {
    const clamped = Math.max(-2, Math.min(2, val));
    const delta = clamped - get().chordsOctaveShift;
    get().shiftChordsOctave(delta);
  },

  setSongId: (songId: string) => {
    const targetSong = get().catalog.find((s) => s.id === songId) || snowMountainSong;
    const targetSection = targetSong.sections[0];
    const key = targetSection.key || targetSong.globalKey;
    const { sectionData, parsedNotes } = resolveSectionData(targetSong, targetSection, key, 0, 0, 0);

    stopTransport();

    set({
      selectedSongId: targetSong.id,
      currentSong: targetSong,
      currentSectionId: targetSection.id,
      song: sectionData,
      parsedNotes,
      melodyOctaveShift: 0,
      chordsOctaveShift: 0,
      currentKey: key.tonic,
      keyMode: key.scale,
      semitoneOffset: 0,
      bpm: targetSong.bpm,
      swingAmount: targetSong.defaultSwing.percentage,
      swingEnabled: targetSong.defaultSwing.enabled,
      swingSubdivision: targetSong.defaultSwing.subdivision,
      currentBeat: 1,
      isPlaying: false,
      activeNotes: new Set(),
      activeChordNotes: new Set(),
    });

    audioSetBpm(targetSong.bpm);
    setSwingConfig(
      targetSong.defaultSwing.enabled,
      targetSong.defaultSwing.percentage,
      targetSong.defaultSwing.subdivision
    );

    setupSong(
      sectionData as unknown as MusicData,
      parsedNotes,
      (beat) => set({ currentBeat: beat }),
      (midi) => {
        const next = new Set(get().activeNotes);
        next.add(midi);
        set({ activeNotes: next });
      },
      (midi) => {
        const next = new Set(get().activeNotes);
        next.delete(midi);
        set({ activeNotes: next });
      },
      (chordMidis) => {
        set({ activeChordNotes: new Set(chordMidis) });
      }
    );
  },

  addSongToCatalog: (newSong: UniversalSong) => {
    const existingIndex = get().catalog.findIndex((s) => s.id === newSong.id);
    let nextCatalog: UniversalSong[];
    if (existingIndex >= 0) {
      nextCatalog = [...get().catalog];
      nextCatalog[existingIndex] = newSong;
    } else {
      nextCatalog = [newSong, ...get().catalog];
    }
    set({ catalog: nextCatalog });
    get().setSongId(newSong.id);
  },

  setSection: (sectionId: string) => {
    const { currentSong, currentKey, keyMode, melodyOctaveShift, chordsOctaveShift } = get();
    const section = currentSong.sections.find((s) => s.id === sectionId) || currentSong.sections[0];
    const key: KeySignature = section.key || { tonic: currentKey, scale: keyMode as ScaleMode };
    const { sectionData, parsedNotes } = resolveSectionData(
      currentSong,
      section,
      key,
      0,
      melodyOctaveShift,
      chordsOctaveShift
    );

    stopTransport();

    set({
      currentSectionId: section.id,
      song: sectionData,
      parsedNotes,
      currentKey: key.tonic,
      keyMode: key.scale,
      semitoneOffset: 0,
      currentBeat: 1,
      isPlaying: false,
      activeNotes: new Set(),
      activeChordNotes: new Set(),
    });

    setupSong(
      sectionData as unknown as MusicData,
      parsedNotes,
      (beat) => set({ currentBeat: beat }),
      (midi) => {
        const next = new Set(get().activeNotes);
        next.add(midi);
        set({ activeNotes: next });
      },
      (midi) => {
        const next = new Set(get().activeNotes);
        next.delete(midi);
        set({ activeNotes: next });
      },
      (chordMidis) => {
        set({ activeChordNotes: new Set(chordMidis) });
      }
    );
  },

  setPlaying: (val) => set({ isPlaying: val }),
  setCurrentBeat: (beat) => set({ currentBeat: beat }),
  setBpm: (newBpm) => {
    const clamped = Math.max(30, Math.min(300, newBpm));
    audioSetBpm(clamped);
    set({ bpm: clamped });
  },
  setPixelsPerBeat: (val) =>
    set((state) => ({
      pixelsPerBeat: typeof val === 'function' ? val(state.pixelsPerBeat) : val,
    })),
  setRowHeight: (val) =>
    set((state) => ({
      rowHeight: typeof val === 'function' ? val(state.rowHeight) : val,
    })),
  setVerticalRange: (range) => set({ verticalRange: range }),
  setLoop: (val) => set({ loop: val }),
  setActiveNotes: (notes) => set({ activeNotes: notes }),
  setActiveChordNotes: (notes) => set({ activeChordNotes: notes }),
  setShowMelody: (val) => {
    set({ showMelody: val });
    setAudioToggles(val, get().showChords);
  },
  setShowChords: (val) => {
    set({ showChords: val });
    setAudioToggles(get().showMelody, val);
  },
  setShowInstrument: (val) => set({ showInstrument: val }),
  setInstrumentType: (type) => set({ instrumentType: type }),

  setKey: (key: string, mode?: string) => {
    const { currentSong, currentSectionId, melodyOctaveShift, chordsOctaveShift } = get();
    const section = currentSong.sections.find((s) => s.id === currentSectionId) || currentSong.sections[0];
    const targetScale = (mode || section.key?.scale || 'major') as ScaleMode;
    const baseTonic = section.key?.tonic || 'C';
    const semitoneOffset = getOptimalTransposeInterval(baseTonic, key);

    const effectiveKey: KeySignature = { tonic: key, scale: targetScale };
    const { sectionData, parsedNotes } = resolveSectionData(
      currentSong,
      section,
      effectiveKey,
      semitoneOffset,
      melodyOctaveShift,
      chordsOctaveShift
    );

    setAudioTranspose(semitoneOffset);
    updateSongLive(parsedNotes, sectionData.chords);

    set({
      currentKey: key,
      keyMode: targetScale,
      semitoneOffset,
      song: sectionData,
      parsedNotes,
    });
  },

  setSwing: (enabled, amount = 67, subdivision = '8n') => {
    setSwingConfig(enabled, amount, subdivision);
    set({
      swingEnabled: enabled,
      swingAmount: amount,
      swingSubdivision: subdivision,
    });
  },

  setTransposeOptions: (options) => {
    set((state) => ({
      transposeMode: options.transposeMode ?? state.transposeMode,
      transposeScope: options.transposeScope ?? state.transposeScope,
      keyMode: options.keyMode ?? state.keyMode,
    }));
  },
}));

// Inicializar el transporte de Tone.js con la configuración de swing por defecto (desactivado por defecto)
setSwingConfig(
  initialSong.defaultSwing.enabled,
  initialSong.defaultSwing.percentage,
  initialSong.defaultSwing.subdivision
);

export default usePlayerStore;
