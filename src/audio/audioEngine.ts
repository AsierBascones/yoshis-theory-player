import * as Tone from 'tone';
import type { MusicData, ParsedNote } from '../utils/theoryParser';
import { pitchToMidi } from '../utils/theoryParser';

let melodySynth: Tone.PolySynth | null = null;
let chordSynth: Tone.PolySynth | null = null;
let melodyPart: Tone.Part | null = null;
let chordPart: Tone.Part | null = null;
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
  if (initialized && melodySynth && chordSynth) return;
  initialized = true;

  // Lead / melodía principal
  melodySynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.005,
      decay: 0.15,
      sustain: 0.45,
      release: 0.7,
    },
    volume: -3,
  }).toDestination();

  // Acompañamiento armónico de acordes
  chordSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.02,
      decay: 0.3,
      sustain: 0.5,
      release: 0.9,
    },
    volume: -9,
  }).toDestination();
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
  if (!melodySynth || !chordSynth) initAudio();

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
  Tone.getTransport().loopStart = '0:0:0';

  const totalMeasures = song.totalBeats / song.timeSignature[0];
  Tone.getTransport().loopEnd = `${totalMeasures}:0:0`;

  // 1. Part de Melodía programada en tiempo musical (bars:quarters:sixteenths)
  const melodyEvents = notes.map((note, index) => {
    return {
      time: beatToPositionString(note.beat - 1, song.timeSignature[0]),
      index,
      duration: note.duration,
    };
  });

  melodyPart = new Tone.Part((time, event: { index: number; duration: number }) => {
    const currentNote = liveNotes[event.index];
    if (!currentNote) return;

    const bpmNow = Tone.getTransport().bpm.value;
    const durSecs = (60 / bpmNow) * event.duration;
    const soundingMidi = currentNote.midi;
    const freq = currentNote.name
      ? Tone.Frequency(currentNote.name).toFrequency()
      : Tone.Frequency(soundingMidi, 'midi').toFrequency();
    melodySynth?.triggerAttackRelease(freq, durSecs, time);

    Tone.getDraw().schedule(() => {
      noteOnCallback?.(soundingMidi);
      const offDelay = durSecs * 900;
      setTimeout(() => {
        noteOffCallback?.(soundingMidi);
      }, offDelay);
    }, time);
  }, melodyEvents).start(0);

  // 2. Part de Acordes programada en tiempo musical (bars:quarters:sixteenths)
  const chordEvents = song.chords.map((chord, index) => {
    return {
      time: beatToPositionString(chord.beat - 1, song.timeSignature[0]),
      index,
      duration: chord.duration,
    };
  });

  chordPart = new Tone.Part((time, event: { index: number; duration: number }) => {
    const currentChord = liveChords[event.index];
    if (!currentChord) return;

    const bpmNow = Tone.getTransport().bpm.value;
    const durSecs = (60 / bpmNow) * event.duration * 0.95;
    const soundingMidis = currentChord.midiNotes ?? [currentChord.rootMidi ?? 60];

    soundingMidis.forEach((midi) => {
      const chordFreq = Tone.Frequency(midi, 'midi').toFrequency();
      chordSynth?.triggerAttackRelease(chordFreq, durSecs, time);
    });

    Tone.getDraw().schedule(() => {
      chordCallback?.(soundingMidis);
    }, time);
  }, chordEvents).start(0);

  if (melodyPart) melodyPart.mute = isMelodyMuted;
  if (chordPart) chordPart.mute = isChordsMuted;
}

export async function playTransport() {
  await Tone.start();
  Tone.getTransport().start();
  startTick();
}

export function pauseTransport() {
  Tone.getTransport().pause();
  stopTick();
}

export function stopTransport() {
  Tone.getTransport().stop();
  stopTick();
  tickCallback?.(1);
  chordCallback?.([]);
}

export function setBpm(bpm: number) {
  Tone.getTransport().bpm.value = bpm;
}

let currentSeekBeat = 1;

/**
 * Obtiene el beat exacto actual de reproducción directamente desde Tone.Transport
 */
export function getCurrentExactBeat(): number {
  if (Tone.getTransport().state !== 'started') {
    return currentSeekBeat;
  }
  const posStr = Tone.getTransport().position.toString();
  const parts = posStr.split(':');
  if (parts.length >= 3) {
    const bars = parseFloat(parts[0]) || 0;
    const quarters = parseFloat(parts[1]) || 0;
    const sixteenths = parseFloat(parts[2]) || 0;
    return 1 + bars * 4 + quarters + sixteenths / 4;
  }
  return currentSeekBeat;
}

/**
 * Seeking exacto en unidades musicales de compás y beat
 */
export function seekToBeat(newBeat: number) {
  const safeBeat = Math.max(1, newBeat);
  currentSeekBeat = safeBeat;
  Tone.getTransport().position = beatToPositionString(safeBeat - 1, 4);
  tickCallback?.(safeBeat);
}

export async function triggerChordNotes(chordNotes: (string | number)[], duration = '2n') {
  if (!chordSynth) initAudio();
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  const freqs = chordNotes.map((n) => {
    if (typeof n === 'number') {
      return Tone.Frequency(n + globalSemitoneOffset, 'midi').toFrequency();
    }
    const midi = pitchToMidi(n);
    if (midi !== null) {
      return Tone.Frequency(midi + globalSemitoneOffset, 'midi').toFrequency();
    }
    return n;
  });
  chordSynth?.triggerAttackRelease(freqs, duration);
}

/**
 * Audición instantánea bajo el cursor de reproducción (Seeking Preview):
 * Suena la nota de la melodía y el acorde activo simultáneamente.
 */
export async function triggerAudition(
  melodyMidiOrPitch?: number | string | null,
  chordNotes?: (string | number)[],
  melodyDuration = '8n',
  chordDuration = '4n'
) {
  if (Tone.getContext().state !== 'running') {
    await Tone.start();
  }
  if (!melodySynth || !chordSynth) initAudio();

  if (melodyMidiOrPitch !== undefined && melodyMidiOrPitch !== null) {
    if (typeof melodyMidiOrPitch === 'number') {
      const freq = Tone.Frequency(melodyMidiOrPitch + globalSemitoneOffset, 'midi').toFrequency();
      melodySynth?.triggerAttackRelease(freq, melodyDuration);
    } else {
      melodySynth?.triggerAttackRelease(melodyMidiOrPitch, melodyDuration);
    }
  }

  if (chordNotes && chordNotes.length > 0) {
    const freqs = chordNotes.map((n) => {
      if (typeof n === 'number') {
        return Tone.Frequency(n + globalSemitoneOffset, 'midi').toFrequency();
      }
      const midi = pitchToMidi(n);
      if (midi !== null) {
        return Tone.Frequency(midi + globalSemitoneOffset, 'midi').toFrequency();
      }
      return n;
    });
    chordSynth?.triggerAttackRelease(freqs, chordDuration);
  }
}

export async function triggerNote(midi: number, duration = '8n', applyTranspose = false) {
  if (!melodySynth) initAudio();
  await Tone.start();
  const soundingMidi = applyTranspose ? midi + globalSemitoneOffset : midi;
  const freq = Tone.Frequency(soundingMidi, 'midi').toFrequency();
  melodySynth?.triggerAttackRelease(freq, duration);
}

export async function triggerNoteByName(noteName: string, duration = '8n') {
  if (!melodySynth) initAudio();
  await Tone.start();
  melodySynth?.triggerAttackRelease(noteName, duration);
}

let lastTickTime = 0;

function startTick() {
  function tick() {
    if (!tickCallback) return;
    if (Tone.getTransport().state === 'started') {
      const now = performance.now();
      // Desacoplar estado global de React: notificar solo a baja frecuencia (~10-15 Hz)
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
  melodyPart?.dispose();
  chordPart?.dispose();
  melodySynth?.dispose();
  chordSynth?.dispose();
  melodyPart = null;
  chordPart = null;
  melodySynth = null;
  chordSynth = null;
  initialized = false;
}
