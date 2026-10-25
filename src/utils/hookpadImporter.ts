/**
 * hookpadImporter.ts
 * Parser nativo para datos copiados desde el portapapeles de Hookpad (v2.x).
 * Formato JSON con arrays 'notes' y 'chords' en grados relativos (sd).
 */

import type { UniversalSong, UniversalMelodyNote, UniversalChord, ScaleMode } from '../types/music';
import { parseHooktheoryChord } from './theoryEngine';

export function isHookpadJson(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;

  try {
    const data = JSON.parse(trimmed);
    return (
      typeof data === 'object' &&
      data !== null &&
      (Array.isArray(data.notes) || Array.isArray(data.chords))
    );
  } catch {
    return false;
  }
}

export function parseHookpadJson(text: string, defaultBpm?: number): UniversalSong {
  const data = JSON.parse(text.trim());

  const activeBpm = typeof defaultBpm === 'number' && defaultBpm > 0 ? defaultBpm : 120;
  const bpm = data.bpm || data.tempo || activeBpm;
  const meter = data.meter || data.timeSignature || [4, 4];
  const beatsPerBar = Array.isArray(meter) ? meter[0] || 4 : 4;

  const keyTonic = data.key?.tonic || data.keys?.[0]?.tonic || 'C';
  const rawScale = data.key?.scale || data.keys?.[0]?.scale || 'major';
  const keyScale: ScaleMode = (
    ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'].includes(rawScale)
      ? rawScale
      : 'major'
  ) as ScaleMode;

  // 1. Mapeo de notas melódicas relativas
  const rawNotes: any[] = Array.isArray(data.notes) ? data.notes : [];
  const melodyNotes: UniversalMelodyNote[] = [];

  rawNotes.forEach((n, idx) => {
    if (n.isRest) return;

    const sd = String(n.sd || n.scaleDegree || '1');
    const octaveOffset = typeof n.octave === 'number'
      ? n.octave
      : typeof n.octaveOffset === 'number'
      ? n.octaveOffset
      : 0;
    const beat = typeof n.beat === 'number' ? n.beat : 1;
    const duration = typeof n.duration === 'number' ? n.duration : 1;

    melodyNotes.push({
      id: `hp_m_${idx}_${beat}`,
      beat,
      duration,
      sd,
      octaveOffset,
    });
  });

  // 2. Mapeo de acordes relativos con parseHooktheoryChord estricto
  const rawChords: any[] = Array.isArray(data.chords) ? data.chords : [];
  const chords: UniversalChord[] = rawChords.map((c, idx) => {
    return parseHooktheoryChord(
      {
        ...c,
        id: c.id || `hp_c_${idx}_${c.beat ?? (idx * beatsPerBar + 1)}`,
        beat: typeof c.beat === 'number' ? c.beat : (idx * beatsPerBar + 1),
        duration: typeof c.duration === 'number' ? c.duration : beatsPerBar,
      },
      keyTonic
    );
  });

  // Calcular longitud total
  const maxMelodyBeat = melodyNotes.reduce((max, n) => Math.max(max, n.beat + n.duration), 1);
  const maxChordBeat = chords.reduce((max, c) => Math.max(max, c.beat + c.duration), 1);
  const totalBeats = Math.max(8, Math.ceil(Math.max(maxMelodyBeat, maxChordBeat)));
  const totalBars = Math.ceil(totalBeats / beatsPerBar);

  return {
    id: `hookpad_${Date.now()}`,
    title: data.title || 'Clip de Hookpad',
    artist: data.artist || 'Hookpad Export',
    bpm,
    defaultSwing: {
      enabled: Boolean(data.swing || data.defaultSwing?.enabled),
      percentage: data.swingAmount || data.defaultSwing?.percentage || 67,
      subdivision: data.defaultSwing?.subdivision || '8n',
    },
    globalKey: {
      tonic: keyTonic,
      scale: keyScale,
    },
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
