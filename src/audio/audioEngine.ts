import * as Tone from 'tone';
import type { MusicData, ParsedNote } from '../utils/theoryParser';
import { pitchToMidi } from '../utils/theoryParser';

// ────────────────────────────────────────────────────────────────────────────
// BANCO DE MUESTRAS ACÚSTICAS REALISTAS: Salamander Grand Piano (Yamaha C5)
// ────────────────────────────────────────────────────────────────────────────

// URLs de muestras optimizadas del Salamander Grand Piano alojadas en CDN
const SALAMANDER_SAMPLES = {
  A0: "A0.mp3",
  C1: "C1.mp3",
  "D#1": "Ds1.mp3",
  "F#1": "Fs1.mp3",
  A1: "A1.mp3",
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
  "D#6": "Ds6.mp3",
  "F#6": "Fs6.mp3",
  A6: "A6.mp3",
  C7: "C7.mp3",
  "D#7": "Ds7.mp3",
  "F#7": "Fs7.mp3",
  A7: "A7.mp3",
  C8: "C8.mp3",
};

const SALAMANDER_BASE_URL = "https://tonejs.github.io/audio/salamander/";

const isBrowser = typeof window !== 'undefined';

// Efectos de espacialidad y calidez acústica
const reverb: Tone.Reverb = isBrowser
  ? new Tone.Reverb({ decay: 1.5, wet: 0.2 }).toDestination()
  : (null as unknown as Tone.Reverb);

const compressor: Tone.Compressor = isBrowser
  ? new Tone.Compressor({ threshold: -18, ratio: 3 }).connect(reverb)
  : (null as unknown as Tone.Compressor);

export let isSamplerLoaded = false;
export let isSustainActive = true;

export function setAudioSustain(active: boolean) {
  isSustainActive = active;
  if (pianoSampler) {
    pianoSampler.release = active ? 2.2 : 0.3;
  }
  if (fallbackSynth) {
    fallbackSynth.set({ envelope: { release: active ? 2.0 : 0.3 } });
  }
}

// Sampler multisampleado del Salamander Grand Piano
export const pianoSampler: Tone.Sampler = isBrowser
  ? new Tone.Sampler({
      urls: SALAMANDER_SAMPLES,
      baseUrl: SALAMANDER_BASE_URL,
      onload: () => {
        isSamplerLoaded = true;
        if (pianoSampler) {
          pianoSampler.release = isSustainActive ? 2.2 : 0.3;
        }
        console.log("🎹 Salamander Grand Piano samples cargados con éxito.");
      },
      onerror: (err) => {
        console.warn("⚠️ No se pudieron descargar las muestras de piano. Usando sintetizador de respaldo:", err);
      },
    }).connect(compressor)
  : (null as unknown as Tone.Sampler);

// Sintetizador polifónico de respaldo seguro (Fallback) para evitar silencios si las muestras aún descargan
export const fallbackSynth: Tone.PolySynth = isBrowser
  ? new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.005,
        decay: 0.25,
        sustain: 0.45,
        release: 0.8,
      },
      volume: -4,
    }).connect(compressor)
  : (null as unknown as Tone.PolySynth);

// ────────────────────────────────────────────────────────────────────────────
// ESTADO Y CONTROL DE REPRODUCCIÓN (Tone.Transport & Tone.Part)
// ────────────────────────────────────────────────────────────────────────────

let melodyPart: Tone.Part | null = null;
let chordPart: Tone.Part | null = null;
let currentSongData: MusicData | null = null;
let tickCallback: ((beat: number) => void) | null = null;
let noteOnCallback: ((midi: number) => void) | null = null;
let noteOffCallback: ((midi: number) => void) | null = null;
let chordCallback: ((midiNotes: number[]) => void) | null = null;
let rafId: number | null = null;
let initialized = false;
let isMelodyMuted = false;
let isChordsMuted = false;
let globalSemitoneOffset = 0;
let liveNotes: ParsedNote[] = [];
let liveChords: MusicData['chords'] = [];

export function setAudioTranspose(semitoneOffset: number) {
  globalSemitoneOffset = semitoneOffset;
}

/**
 * Actualiza las notas y acordes en tiempo real sin detener ni reiniciar Tone.Transport.
 * Las partes de reproducción leen dinámicamente liveNotes y liveChords en cada evento.
 */
export function updateSongLive(notes: ParsedNote[], chords: MusicData['chords']) {
  liveNotes = notes;
  liveChords = chords;
}

export function setSwingConfig(enabled: boolean, amount: number, subdivision: '8n' | '16n') {
  Tone.getTransport().swing = enabled ? Math.max(0, Math.min(100, amount)) / 100 : 0;
  Tone.getTransport().swingSubdivision = subdivision;
}

export function initAudio() {
  if (initialized) return;
  initialized = true;
}

export function setAudioToggles(melodyOn: boolean, chordsOn: boolean) {
  isMelodyMuted = !melodyOn;
  isChordsMuted = !chordsOn;
  if (melodyPart) melodyPart.mute = isMelodyMuted;
  if (chordPart) chordPart.mute = isChordsMuted;
}

function beatToPositionString(beatIndex: number, beatsPerBar = 4): string {
  const bars = Math.floor(beatIndex / beatsPerBar);
  const rem = beatIndex % beatsPerBar;
  const quarters = Math.floor(rem);
  const sixteenths = (rem - quarters) * 4;
  return `${bars}:${quarters}:${sixteenths}`;
}

export function setupSong(
  song: MusicData,
  notes: ParsedNote[],
  onTick: (beat: number) => void,
  onNoteOn: (midi: number) => void,
  onNoteOff: (midi: number) => void,
  onChordChange?: (midiNotes: number[]) => void
) {
  if (!isBrowser) return;
  if (!initialized) initAudio();

  currentSongData = song;
  tickCallback = onTick;
  noteOnCallback = onNoteOn;
  noteOffCallback = onNoteOff;
  chordCallback = onChordChange ?? null;

  liveNotes = notes;
  liveChords = song.chords;

  if (melodyPart) {
    melodyPart.dispose();
    melodyPart = null;
  }
  if (chordPart) {
    chordPart.dispose();
    chordPart = null;
  }

  Tone.getTransport().bpm.value = song.bpm;
  Tone.getTransport().timeSignature = song.timeSignature;
  Tone.getTransport().loop = true;
  Tone.getTransport().loopStart = 0;

  const totalDurationSeconds = song.totalBeats * (60 / song.bpm);
  Tone.getTransport().loopEnd = totalDurationSeconds;

  // 1. Part de Melodía programada con segundos absolutos desacoplados de compás y subdivisión
  const melodyEvents = notes.map((note, index) => {
    const timeSeconds = (note.beat - 1) * (60 / song.bpm);
    return {
      time: timeSeconds,
      index,
      duration: note.duration,
    };
  });

  melodyPart = new Tone.Part((time, event: { index: number; duration: number }) => {
    const currentNote = liveNotes[event.index];
    if (!currentNote) return;

    const bpmNow = Tone.getTransport().bpm.value;
    const durSecs = (60 / bpmNow) * event.duration * (isSustainActive ? 1.05 : 1.0);
    const soundingMidi = currentNote.midi;
    const noteToPlay = currentNote.name || Tone.Frequency(soundingMidi, 'midi').toNote();
    const velocity = 0.82; // Expresividad de melodía principal en piano acústico

    if ((isSamplerLoaded || pianoSampler?.loaded) && pianoSampler) {
      pianoSampler.triggerAttackRelease(noteToPlay, durSecs, time, velocity);
    } else if (fallbackSynth) {
      fallbackSynth.triggerAttackRelease(noteToPlay, durSecs, time, velocity);
    }

    Tone.getDraw().schedule(() => {
      noteOnCallback?.(soundingMidi);
      const offDelay = durSecs * 900;
      setTimeout(() => {
        noteOffCallback?.(soundingMidi);
      }, offDelay);
    }, time);
  }, melodyEvents).start(0);

  // 2. Part de Acordes programada con soporte de pedal de sustain y liberación controlada
  const chordEvents = song.chords.map((chord, index) => {
    const timeSeconds = (chord.beat - 1) * (60 / song.bpm);
    const nextChord = song.chords[index + 1];
    const sustainDuration = nextChord
      ? Math.max(chord.duration, nextChord.beat - chord.beat)
      : chord.duration;

    return {
      time: timeSeconds,
      index,
      duration: chord.duration,
      sustainDuration,
    };
  });

  chordPart = new Tone.Part((time, event: { index: number; duration: number; sustainDuration: number }) => {
    const currentChord = liveChords[event.index];
    if (!currentChord) return;

    const bpmNow = Tone.getTransport().bpm.value;
    const effectiveBeats = isSustainActive ? event.sustainDuration : event.duration;
    const durSecs = (60 / bpmNow) * effectiveBeats;
    const soundingMidis = currentChord.midiNotes ?? [currentChord.rootMidi ?? 60];
    const minMidi = Math.min(...soundingMidis);

    // Al entrar un nuevo acorde con sustain activo, liberar voces previas de forma controlada
    if (isSustainActive) {
      pianoSampler?.releaseAll(time);
      fallbackSynth?.releaseAll(time);
    }

    soundingMidis.forEach((midi) => {
      const isBass = midi === minMidi;
      const velocity = isBass ? 0.75 : 0.62;
      const noteToPlay = Tone.Frequency(midi, 'midi').toNote();

      if ((isSamplerLoaded || pianoSampler?.loaded) && pianoSampler) {
        pianoSampler.triggerAttackRelease(noteToPlay, durSecs, time, velocity);
      } else if (fallbackSynth) {
        fallbackSynth.triggerAttackRelease(noteToPlay, durSecs, time, velocity);
      }
    });

    Tone.getDraw().schedule(() => {
      chordCallback?.(soundingMidis);
    }, time);
  }, chordEvents).start(0);

  if (melodyPart) melodyPart.mute = isMelodyMuted;
  if (chordPart) chordPart.mute = isChordsMuted;
}

export async function playTransport() {
  if (!isBrowser) return;
  await Tone.start();
  Tone.getTransport().start();
  startTick();
}

export function pauseTransport() {
  if (!isBrowser) return;
  Tone.getTransport().pause();
  stopTick();
  pianoSampler?.releaseAll();
  fallbackSynth?.releaseAll();
}

export function stopTransport() {
  if (!isBrowser) return;
  Tone.getTransport().stop();
  stopTick();
  pianoSampler?.releaseAll();
  fallbackSynth?.releaseAll();
  tickCallback?.(1);
  chordCallback?.([]);
}

export function setBpm(bpm: number) {
  if (!isBrowser) return;
  Tone.getTransport().bpm.value = bpm;
  if (currentSongData) {
    Tone.getTransport().loopEnd = currentSongData.totalBeats * (60 / bpm);
  }
}

let currentSeekBeat = 1;

/**
 * Obtiene el beat exacto actual de reproducción directamente desde Tone.Transport
 * Desacoplado de compás y basado en la unidad canónica de segundos a negras según BPM.
 */
export function getCurrentExactBeat(): number {
  if (!isBrowser || Tone.getTransport().state !== 'started') {
    return currentSeekBeat;
  }
  const bpm = Tone.getTransport().bpm.value || 120;
  return 1 + (Tone.getTransport().seconds * (bpm / 60));
}

/**
 * Seeking exacto en unidades musicales de compás y beat
 * Desacoplado de agrupaciones de compás y basado estrictamente en segundos continuos.
 */
export function seekToBeat(newBeat: number) {
  const safeBeat = Math.max(1, newBeat);
  currentSeekBeat = safeBeat;
  if (isBrowser) {
    const bpm = Tone.getTransport().bpm.value || 120;
    Tone.getTransport().seconds = (safeBeat - 1) * (60 / bpm);
  }
  tickCallback?.(safeBeat);
}

/**
 * Disparo interactivo de acordes (al hacer clic en la barra de análisis o piano roll)
 */
export async function triggerChordNotes(chordNotes: (string | number)[], duration?: string) {
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  if (!initialized) initAudio();

  // Limpiar resonancias previas si el sustain está activo
  if (isSustainActive) {
    pianoSampler?.releaseAll();
    fallbackSynth?.releaseAll();
  }

  const effectiveDuration = duration ?? (isSustainActive ? '2n' : '4n');

  const noteData = chordNotes.map((n) => {
    if (typeof n === 'number') {
      const midi = n + globalSemitoneOffset;
      return { midi, note: Tone.Frequency(midi, 'midi').toNote() };
    }
    const midi = pitchToMidi(n);
    if (midi !== null) {
      const transposed = midi + globalSemitoneOffset;
      return { midi: transposed, note: Tone.Frequency(transposed, 'midi').toNote() };
    }
    return { midi: Tone.Frequency(n).toMidi(), note: n };
  });

  const validMidis = noteData.map((d) => d.midi).filter((m): m is number => m !== null && !isNaN(m));
  const minMidi = validMidis.length > 0 ? Math.min(...validMidis) : -1;

  noteData.forEach(({ midi, note }) => {
    const isBass = midi === minMidi;
    const velocity = isBass ? 0.75 : 0.62;

    if ((isSamplerLoaded || pianoSampler?.loaded) && pianoSampler) {
      pianoSampler.triggerAttackRelease(note, effectiveDuration, undefined, velocity);
    } else if (fallbackSynth) {
      fallbackSynth.triggerAttackRelease(note, effectiveDuration, undefined, velocity);
    }
  });
}

/**
 * Audición instantánea bajo el cursor de reproducción (Seeking Preview):
 * Suena la nota de la melodía y el acorde activo simultáneamente con sus dinámicas de piano.
 */
export async function triggerAudition(
  melodyMidiOrPitch?: number | string | null,
  chordNotes?: (string | number)[],
  melodyDuration?: string,
  chordDuration?: string
) {
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  if (!initialized) initAudio();

  if (isSustainActive) {
    pianoSampler?.releaseAll();
    fallbackSynth?.releaseAll();
  }

  const effectiveMelodyDur = melodyDuration ?? (isSustainActive ? '4n' : '8n');

  if (melodyMidiOrPitch !== undefined && melodyMidiOrPitch !== null) {
    const noteToPlay = typeof melodyMidiOrPitch === 'number'
      ? Tone.Frequency(melodyMidiOrPitch + globalSemitoneOffset, 'midi').toNote()
      : melodyMidiOrPitch;

    if ((isSamplerLoaded || pianoSampler?.loaded) && pianoSampler) {
      pianoSampler.triggerAttackRelease(noteToPlay, effectiveMelodyDur, undefined, 0.82);
    } else if (fallbackSynth) {
      fallbackSynth.triggerAttackRelease(noteToPlay, effectiveMelodyDur, undefined, 0.82);
    }
  }

  if (chordNotes && chordNotes.length > 0) {
    await triggerChordNotes(chordNotes, chordDuration);
  }
}

export async function triggerNote(midi: number, duration = '8n', applyTranspose = false) {
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  if (!initialized) initAudio();

  const soundingMidi = applyTranspose ? midi + globalSemitoneOffset : midi;
  const noteName = Tone.Frequency(soundingMidi, 'midi').toNote();
  const velocity = soundingMidi < 48 ? 0.75 : 0.82;

  if ((isSamplerLoaded || pianoSampler?.loaded) && pianoSampler) {
    pianoSampler.triggerAttackRelease(noteName, duration, undefined, velocity);
  } else if (fallbackSynth) {
    fallbackSynth.triggerAttackRelease(noteName, duration, undefined, velocity);
  }
}

export async function triggerNoteByName(noteName: string, duration = '8n') {
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  if (!initialized) initAudio();

  if ((isSamplerLoaded || pianoSampler?.loaded) && pianoSampler) {
    pianoSampler.triggerAttackRelease(noteName, duration, undefined, 0.82);
  } else if (fallbackSynth) {
    fallbackSynth.triggerAttackRelease(noteName, duration, undefined, 0.82);
  }
}

let lastTickTime = 0;

function startTick() {
  function tick() {
    if (!tickCallback) return;
    if (Tone.getTransport().state === 'started') {
      const now = performance.now();
      // Desacoplar estado global de React: notificar a baja frecuencia (~10-15 Hz)
      // para evitar re-renderizados continuos a 60 FPS en el árbol de componentes.
      if (now - lastTickTime >= 80) {
        lastTickTime = now;
        const currentExactBeat = getCurrentExactBeat();
        tickCallback(currentExactBeat);
      }
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

function stopTick() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function disposeAudio() {
  stopTick();
  if (melodyPart) {
    melodyPart.dispose();
    melodyPart = null;
  }
  if (chordPart) {
    chordPart.dispose();
    chordPart = null;
  }
}
