/**
 * midiImporter.ts
 * Utilidad de importación y conversión inteligente de archivos .mid / .midi
 * a la estructura UniversalSong con notación relativa, separación por tesitura
 * y cuantización armónica consolidada por compás / medio compás.
 */

import { Midi } from '@tonejs/midi';
import type { UniversalSong, UniversalMelodyNote, UniversalChord, ScaleMode } from '../types/music';
import { NOTE_TO_PC, parseHookpadChord } from './theoryEngine';

export interface MidiTrackInfo {
  index: number;
  name: string;
  notesCount: number;
  channel: number;
  avgPitch: number;
}

export interface MidiParseOptions {
  keyTonic?: string;
  keyScale?: ScaleMode;
  melodyTrackIndex?: number;  // -1 para auto (separación por punto de corte C4)
  harmonyTrackIndex?: number; // -1 para auto (separación por punto de corte C4)
  splitPointMidi?: number;    // 60 = C4
  chordResolution?: 2 | 4;    // 2 beats (medio compás) o 4 beats (compás completo)
}

const DEGREE_MAP_MAJOR: Record<number, string> = {
  0: '1', 1: '#1', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_MAP_MINOR: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

/**
 * Inspecciona rápidamente un archivo MIDI para extraer metadatos de pistas, tempo y métrica
 */
export async function inspectMidiTracks(file: File): Promise<{
  tracks: MidiTrackInfo[];
  bpm: number;
  timeSignature: [number, number];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);
  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
  const timeSignature: [number, number] = midi.header.timeSignatures.length > 0
    ? [midi.header.timeSignatures[0].timeSignature[0], midi.header.timeSignatures[0].timeSignature[1]]
    : [4, 4];

  const tracks: MidiTrackInfo[] = midi.tracks.map((t, index) => {
    const avgPitch = t.notes.length > 0
      ? Math.round(t.notes.reduce((sum, n) => sum + n.midi, 0) / t.notes.length)
      : 0;
    return {
      index,
      name: t.name ? t.name : t.channel === 9 ? 'Percusión' : `Pista ${index + 1}`,
      notesCount: t.notes.length,
      channel: t.channel,
      avgPitch,
    };
  });

  return { tracks, bpm, timeSignature };
}

function getRomanNumeral(rootSd: string, quality: UniversalChord['quality']): string {
  const isMinor = quality === 'min' || quality === 'min7' || quality === 'halfdim7' || quality === 'dim';
  const romanMap: Record<string, string> = {
    '1': isMinor ? 'i' : 'I',
    'b2': isMinor ? 'bii' : 'bII',
    '2': isMinor ? 'ii' : 'II',
    'b3': isMinor ? 'biii' : 'bIII',
    '3': isMinor ? 'iii' : 'III',
    '4': isMinor ? 'iv' : 'IV',
    '#4': isMinor ? '#iv' : '#IV',
    '5': isMinor ? 'v' : 'V',
    'b6': isMinor ? 'bvi' : 'bVI',
    '6': isMinor ? 'vi' : 'VI',
    'b7': isMinor ? 'bvii' : 'bVII',
    '7': isMinor ? 'vii' : 'VII',
  };
  const base = romanMap[rootSd] || (isMinor ? 'i' : 'I');
  if (quality === 'dom7') return `${base}⁷`;
  if (quality === 'maj7') return `${base}maj⁷`;
  if (quality === 'min7') return `${base}⁷`;
  if (quality === 'dim') return `${base}°`;
  if (quality === 'halfdim7') return `${base}ø⁷`;
  if (quality === 'dim7') return `${base}°⁷`;
  return base;
}

export async function parseMidiToUniversalSong(
  file: File,
  options: MidiParseOptions | string = 'C',
  keyScaleParam: ScaleMode = 'major'
): Promise<UniversalSong> {
  const opts: MidiParseOptions = typeof options === 'string'
    ? { keyTonic: options, keyScale: keyScaleParam }
    : options;

  const keyTonic = opts.keyTonic || 'C';
  const keyScale = opts.keyScale || 'major';
  const splitPointMidi = opts.splitPointMidi ?? 60; // C4 por defecto
  const chordResolution = opts.chordResolution ?? 4; // 4 beats (1 compás) o 2 beats (medio compás)

  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
  const timeSignature = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures[0].timeSignature
    : [4, 4];
  const beatsPerBar = timeSignature[0] || 4;
  const secondsPerBeat = 60 / bpm;
  const tonicPc = NOTE_TO_PC[keyTonic] ?? 0;
  const degreeMap = keyScale === 'minor' ? DEGREE_MAP_MINOR : DEGREE_MAP_MAJOR;

  // Filtrar pistas melódicas excluyendo percusión
  const melodicTracks = midi.tracks.filter(
    (t) => t.notes.length > 0 && !t.instrument.percussion && t.channel !== 9
  );

  type RawMidiNote = (typeof midi.tracks)[0]['notes'][0];
  let rawMelodyCandidates: RawMidiNote[] = [];
  let rawAccompanimentNotes: RawMidiNote[] = [];

  const melodyTrackIdx = opts.melodyTrackIndex ?? -1;
  const harmonyTrackIdx = opts.harmonyTrackIndex ?? -1;

  if (melodyTrackIdx >= 0 && harmonyTrackIdx >= 0 && melodyTrackIdx !== harmonyTrackIdx) {
    // Selección explícita de pistas separadas
    if (midi.tracks[melodyTrackIdx]) {
      rawMelodyCandidates = [...midi.tracks[melodyTrackIdx].notes];
    }
    if (midi.tracks[harmonyTrackIdx]) {
      rawAccompanimentNotes = [...midi.tracks[harmonyTrackIdx].notes];
    }
  } else {
    // Separación por tesitura / split point (C4 = MIDI 60)
    // Especial para piezas de piano solista (Scott Joplin, Ragtime, etc.)
    const allNotes: RawMidiNote[] = [];
    const sourceTracks = melodicTracks.length > 0 ? melodicTracks : midi.tracks;
    sourceTracks.forEach((t) => allNotes.push(...t.notes));

    allNotes.forEach((n) => {
      if (n.midi >= splitPointMidi) {
        rawMelodyCandidates.push(n);
      } else {
        rawAccompanimentNotes.push(n);
      }
    });
  }

  // ── 1. Procesamiento de Melodía con Prioridad de Nota Superior (Top-Note Priority) ──
  // Si hay polifonía simultánea en la mano derecha (octavas, terceras), la nota más aguda toma
  // prioridad melódica y las notas inferiores se derivan al acompañamiento armónico.
  const melodyNotes: UniversalMelodyNote[] = [];
  const beatGroupMap = new Map<number, RawMidiNote[]>();

  rawMelodyCandidates.forEach((n) => {
    const rawBeat = 1 + n.time / secondsPerBeat;
    const qBeat = Math.round(rawBeat * 4) / 4;
    const existing = beatGroupMap.get(qBeat) || [];
    existing.push(n);
    beatGroupMap.set(qBeat, existing);
  });

  const sortedBeatKeys = Array.from(beatGroupMap.keys()).sort((a, b) => a - b);
  let melodyNoteIdx = 0;

  for (const qBeat of sortedBeatKeys) {
    const group = beatGroupMap.get(qBeat)!;
    // Encontrar la nota más aguda en este beat
    group.sort((a, b) => b.midi - a.midi);
    const topNote = group[0];

    // Las notas secundarias inferiores de la mano derecha enriquecen el acompañamiento
    for (let i = 1; i < group.length; i++) {
      rawAccompanimentNotes.push(group[i]);
    }

    const durationBeats = Math.max(0.25, Math.round((topNote.duration / secondsPerBeat) * 4) / 4);
    const notePc = topNote.midi % 12;
    const semitonesAboveTonic = (notePc - tonicPc + 12) % 12;
    const sd = degreeMap[semitonesAboveTonic] || '1';

    // Octava relativa al registro central de la melodía (C5 / baseOctave = 5)
    const tonicBaseMidi = 72 + tonicPc;
    const octaveOffset = Math.floor((topNote.midi - tonicBaseMidi) / 12);

    melodyNotes.push({
      id: `m_${melodyNoteIdx++}`,
      beat: qBeat,
      duration: durationBeats,
      sd,
      octaveOffset,
    });
  }

  // ── 2. Cuantización Armónica Consolidada por Compás o Medio Compás ──
  // Agrupa todas las notas del acompañamiento en ventanas métricas regulares (2 o 4 beats)
  // para evitar la generación de micro-acordes caóticos de corchea.
  const chords: UniversalChord[] = [];
  const totalBeats = Math.max(
    8,
    Math.ceil((midi.duration || 4) * (bpm / 60))
  );
  const totalBars = Math.ceil(totalBeats / beatsPerBar);
  const step = chordResolution; // 2 o 4 beats

  let lastChord: { rootSd: string; quality: UniversalChord['quality']; roman: string } = {
    rootSd: '1',
    quality: 'maj',
    roman: 'I',
  };

  for (let startBeat = 1; startBeat <= totalBeats; startBeat += step) {
    const windowEnd = startBeat + step;

    // Recopilar notas de acompañamiento activas durante esta ventana
    const notesInWindow = rawAccompanimentNotes.filter((n) => {
      const nBeat = 1 + n.time / secondsPerBeat;
      const nDur = Math.max(0.25, n.duration / secondsPerBeat);
      return nBeat < windowEnd && nBeat + nDur > startBeat;
    });

    if (notesInWindow.length > 0) {
      // 1. Identificar la fundamental del bajo: la nota más grave que sonó en la ventana
      const lowestMidi = Math.min(...notesInWindow.map((n) => n.midi));
      const rootPc = lowestMidi % 12;
      const semitonesFromTonic = (rootPc - tonicPc + 12) % 12;
      const rootSd = degreeMap[semitonesFromTonic] || '1';

      // 2. Analizar intervalos armónicos presentes respecto a la fundamental
      const intervals = new Set(
        notesInWindow.map((n) => ((n.midi % 12) - rootPc + 12) % 12)
      );

      let quality: UniversalChord['quality'] = 'maj';
      if (intervals.has(3)) {
        if (intervals.has(6)) {
          quality = intervals.has(10) ? 'halfdim7' : 'dim';
        } else {
          quality = intervals.has(10) ? 'min7' : 'min';
        }
      } else if (intervals.has(4)) {
        if (intervals.has(10)) {
          quality = 'dom7';
        } else if (intervals.has(11)) {
          quality = 'maj7';
        } else if (intervals.has(8)) {
          quality = 'aug';
        } else {
          quality = 'maj';
        }
      } else {
        // Fallback diatónico según el grado de la fundamental en la tonalidad
        if (keyScale === 'major') {
          if ([2, 4, 9].includes(semitonesFromTonic)) quality = 'min';
          else if (semitonesFromTonic === 11) quality = 'dim';
          else quality = 'maj';
        } else {
          if ([0, 5].includes(semitonesFromTonic)) quality = 'min';
          else if (semitonesFromTonic === 2) quality = 'dim';
          else quality = 'maj';
        }
      }

      const roman = getRomanNumeral(rootSd, quality);
      lastChord = { rootSd, quality, roman };

      chords.push(parseHookpadChord({
        id: `c_${startBeat}`,
        beat: startBeat,
        duration: step,
        roman,
        root: rootSd,
        quality,
        type: quality.includes('7') ? 7 : 5,
      }, keyTonic, keyScale));
    } else {
      // Si el compás o medio compás no tuvo notas de acompañamiento, mantener el acorde anterior
      chords.push(parseHookpadChord({
        id: `c_${startBeat}`,
        beat: startBeat,
        duration: step,
        roman: lastChord.roman,
        root: lastChord.rootSd,
        quality: lastChord.quality,
        type: lastChord.quality.includes('7') ? 7 : 5,
      }, keyTonic, keyScale));
    }
  }

  // Si por alguna razón no se generaron acordes, generar progresión diatónica de 4 compases
  if (chords.length === 0) {
    const progression = [
      { rootSd: '1', quality: 'maj' as const, roman: 'I' },
      { rootSd: '4', quality: 'maj' as const, roman: 'IV' },
      { rootSd: '5', quality: 'dom7' as const, roman: 'V7' },
      { rootSd: '1', quality: 'maj' as const, roman: 'I' },
    ];
    for (let bar = 0; bar < totalBars; bar++) {
      const stepProg = progression[bar % progression.length];
      chords.push(parseHookpadChord({
        id: `c_auto_${bar}`,
        beat: bar * beatsPerBar + 1,
        duration: beatsPerBar,
        roman: stepProg.roman,
        root: stepProg.rootSd,
        quality: stepProg.quality,
        type: stepProg.quality.includes('7') ? 7 : 5,
      }, keyTonic, keyScale));
    }
  }

  return {
    id: `midi_${Date.now()}`,
    title: file.name.replace(/\.[^/.]+$/, ''),
    artist: 'Importado (MIDI)',
    bpm,
    defaultSwing: { enabled: false, percentage: 50, subdivision: '8n' },
    globalKey: { tonic: keyTonic, scale: keyScale },
    sections: [
      {
        id: 'main',
        name: 'Full Song',
        key: { tonic: keyTonic, scale: keyScale },
        beatsPerBar,
        totalBars,
        melody: melodyNotes,
        chords,
      },
    ],
  };
}
