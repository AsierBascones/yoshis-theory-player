/**
 * hookpadImporter.ts
 * Parser nativo para datos copiados desde el portapapeles de Hookpad (v2.x).
 * Formato JSON con arrays 'notes' y 'chords' en grados relativos (sd).
 */

import type { UniversalSong, UniversalMelodyNote, UniversalChord, ScaleMode, SongSection, SectionType, KeyChange, MeterChange, CanonicalMeter } from '../types/music';
import { parseHookpadChord, getKeyAtBeat, normalizeKey } from './theoryEngine';
import {
  TICKS_PER_QUARTER,
  normalizeEventTiming,
  normalizeMeterChange,
  calculateMeasuresTimeline,
  resolveUniversalMeter,
  createCanonicalMeter,
} from './rhythmEngine';

export const TICKS_PER_BEAT = TICKS_PER_QUARTER; // Hooktheory PPQ estándar (480 ticks = 1 negra)

export function isHookpadJson(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;

  try {
    const data = JSON.parse(trimmed);
    if (typeof data !== 'object' || data === null) return false;
    const modernPayload = data.modern?.payload || data.payload;
    if (modernPayload && (Array.isArray(modernPayload.notes) || Array.isArray(modernPayload.chords))) {
      return true;
    }
    return Array.isArray(data.notes) || Array.isArray(data.chords);
  } catch {
    return false;
  }
}

export function inferSectionTypeFromName(name: string): SectionType {
  const lower = name.toLowerCase().trim();
  if (lower.includes('intro')) return 'intro';
  if (lower.includes('pre-chorus') || lower.includes('prechorus') || lower.includes('pre chorus')) return 'pre-chorus';
  if (lower.includes('chorus') || lower.includes('estribillo')) return 'chorus';
  if (lower.includes('verse') || lower.includes('verso') || lower.includes('estrofa')) return 'verse';
  if (lower.includes('bridge') || lower.includes('puente')) return 'bridge';
  if (lower.includes('outro') || lower.includes('coda') || lower.includes('final')) return 'outro';
  if (lower.includes('solo')) return 'solo';
  return 'custom';
}

export function parseHookpadSection(
  textOrData: string | any,
  options?: {
    name?: string;
    type?: SectionType;
    defaultBpm?: number;
    sectionId?: string;
  }
): SongSection {
  const rootData = typeof textOrData === 'string' ? JSON.parse(textOrData.trim()) : textOrData;

  // Unificación estricta: o se lee TODO de modern.payload o TODO de la raíz (nunca mezclar)
  const modernPayload = rootData.modern?.payload || rootData.payload;
  const hasModern = Boolean(
    modernPayload &&
    (Array.isArray(modernPayload.notes) || Array.isArray(modernPayload.chords))
  );

  const data = hasModern ? modernPayload : rootData;
  const isModern = hasModern;

  const activeBpm = typeof options?.defaultBpm === 'number' && options.defaultBpm > 0
    ? options.defaultBpm
    : (data.bpm || data.tempo || rootData.bpm || rootData.tempo || 120);
  const bpm = data.bpm || data.tempo || activeBpm;

  const rawNotes: any[] = Array.isArray(data.notes)
    ? data.notes
    : (!isModern && Array.isArray(rootData.notes) ? rootData.notes : []);

  const rawChords: any[] = Array.isArray(data.chords)
    ? data.chords
    : (!isModern && Array.isArray(rootData.chords) ? rootData.chords : []);

  const resolution = typeof data.ppq === 'number' && data.ppq > 0
    ? data.ppq
    : (typeof rootData.ppq === 'number' && rootData.ppq > 0 ? rootData.ppq : TICKS_PER_BEAT);

  // Extracción e inferencia métrica universal (metadatos explícitos prevalecen; inferencia si ausente)
  const resolvedMetric = resolveUniversalMeter(
    { ...rootData, ...data },
    rawChords,
    rawNotes,
    undefined,
    resolution
  );

  const primaryMeter = resolvedMetric.primaryMeter;
  const metersList = resolvedMetric.meters;
  const hasExplicitMeters = primaryMeter.provenance === 'explicit';
  const beatsPerBar = primaryMeter.numerator;
  const beatUnit = primaryMeter.denominator;

  const detectedKeyObj = (Array.isArray(rootData.keys) && rootData.keys[0]) ||
    (Array.isArray(rootData.modern?.payload?.keys) && rootData.modern.payload.keys[0]) ||
    (Array.isArray(data.keys) && data.keys[0]) ||
    rootData.key ||
    data.key;

  let keyTonic = 'C';
  let rawScale = 'major';

  if (typeof detectedKeyObj === 'string') {
    const keyMatch = detectedKeyObj.replace(/^KEY:\s*/i, '').trim().match(/^([A-Ga-g][#b]?)\s*(.*)$/);
    if (keyMatch) {
      keyTonic = keyMatch[1];
      const scalePart = keyMatch[2].toLowerCase();
      if (scalePart.includes('harm')) rawScale = 'harmonic_minor';
      else if (scalePart.includes('min') || scalePart.includes('aeol')) rawScale = 'minor';
      else if (scalePart.includes('mix')) rawScale = 'mixolydian';
      else if (scalePart.includes('dor')) rawScale = 'dorian';
      else if (scalePart.includes('phryg')) rawScale = 'phrygian';
      else if (scalePart.includes('lyd')) rawScale = 'lydian';
      else if (scalePart.includes('loc')) rawScale = 'locrian';
      else if (scalePart.includes('maj') || scalePart.includes('ion')) rawScale = 'major';
    } else {
      keyTonic = detectedKeyObj;
    }
  } else if (detectedKeyObj && typeof detectedKeyObj === 'object') {
    keyTonic = detectedKeyObj.tonic || detectedKeyObj.key || rootData.tonic || data.tonic || 'C';
    rawScale = detectedKeyObj.scale || detectedKeyObj.mode || rootData.scale || data.scale || 'major';
  } else {
    keyTonic = rootData.tonic || data.tonic || 'C';
    rawScale = rootData.scale || data.scale || rootData.mode || data.mode || 'major';
  }

  const normalizedScaleStr = String(rawScale).toLowerCase();
  let keyScale: ScaleMode = (
    normalizedScaleStr.includes('harm') ? 'harmonic_minor'
    : (normalizedScaleStr.includes('min') || normalizedScaleStr.includes('aeol')) ? 'minor'
    : normalizedScaleStr.includes('mix') ? 'mixolydian'
    : normalizedScaleStr.includes('dor') ? 'dorian'
    : normalizedScaleStr.includes('phryg') ? 'phrygian'
    : normalizedScaleStr.includes('lyd') ? 'lydian'
    : normalizedScaleStr.includes('loc') ? 'locrian'
    : 'major'
  ) as ScaleMode;

  // Extracción robusta de modulación en línea de tiempo (keys: KeyChange[])
  const rawKeys = (Array.isArray(data.keys) && data.keys.length > 0)
    ? data.keys
    : (Array.isArray(rootData.keys) && rootData.keys.length > 0)
      ? rootData.keys
      : (Array.isArray(rootData.modern?.payload?.keys) && rootData.modern.payload.keys.length > 0)
        ? rootData.modern.payload.keys
        : [];

  let keysList: KeyChange[] = [];
  if (rawKeys.length > 0) {
    keysList = rawKeys.map((k: any) => {
      let beat = 1;
      if (isModern || typeof k.startTick === 'number') {
        const timing = normalizeEventTiming(k, 1, resolution);
        beat = timing.beat;
      } else if (typeof k.beat === 'number') {
        beat = k.beat;
      }

      const tonic = k.tonic || keyTonic || 'C';
      const rawSc = String(k.scale || k.mode || keyScale || 'major');
      const norm = normalizeKey({ tonic, scale: rawSc as any });
      return {
        beat,
        tonic: norm.tonic,
        scale: norm.scale,
      };
    }).sort((a: KeyChange, b: KeyChange) => a.beat - b.beat);
  }

  if (keysList.length === 0) {
    keysList = [{ beat: 1, tonic: keyTonic, scale: keyScale }];
  } else {
    keyTonic = keysList[0].tonic;
    keyScale = keysList[0].scale as ScaleMode;
  }

  // 1. Mapeo de notas melódicas relativas con soporte de ticks a beats canónicos
  const melodyNotes: UniversalMelodyNote[] = [];

  rawNotes.forEach((n, idx) => {
    if (n.isRest || n.rest) return;

    let beat: number;
    let duration: number;

    if (isModern || typeof n.startTick === 'number' || typeof n.durationTicks === 'number') {
      const timing = normalizeEventTiming(n, 1, resolution);
      beat = timing.beat;
      duration = timing.duration;
    } else {
      beat = typeof n.beat === 'number' ? n.beat : 1;
      duration = typeof n.duration === 'number' ? n.duration : 1;
    }

    const sd = String(n.sd ?? n.scaleDegree ?? '1');
    const octaveOffset = typeof n.octave === 'number'
      ? n.octave
      : typeof n.octaveOffset === 'number'
      ? n.octaveOffset
      : 0;

    melodyNotes.push({
      id: `hp_m_${idx}_${beat}`,
      beat,
      duration,
      sd,
      octaveOffset,
    });
  });

  // 2. Mapeo de acordes relativos con parseHookpadChord estricto y soporte de ticks
  const chords: UniversalChord[] = [];

  rawChords.forEach((c, idx) => {
    // Si es un silencio o hueco sin acorde, no rellenar con acorde ficticio
    if (
      c.isRest ||
      c.rest ||
      c.type === 'rest' ||
      c.root === 'rest' ||
      c.root === 0 ||
      c.root === '0' ||
      c.root === null ||
      (c.root === undefined && c.sd === undefined && c.roman === undefined)
    ) {
      return;
    }

    let beat: number;
    let duration: number;

    if (isModern || typeof c.startTick === 'number' || typeof c.durationTicks === 'number') {
      const timing = normalizeEventTiming(c, beatsPerBar, resolution);
      beat = typeof c.startTick === 'number' ? timing.beat : (typeof c.beat === 'number' ? timing.beat : idx * beatsPerBar + 1);
      duration = timing.duration;
    } else {
      beat = typeof c.beat === 'number' ? c.beat : (idx * beatsPerBar + 1);
      duration = typeof c.duration === 'number' ? c.duration : beatsPerBar;
    }

    const activeKey = getKeyAtBeat(keysList, beat);

    chords.push(
      parseHookpadChord(
        {
          ...c,
          id: c.id || `hp_c_${idx}_${beat}`,
          beat,
          duration,
        },
        activeKey.tonic,
        activeKey.scale
      )
    );
  });

  // Calcular longitud total sin compases vacíos residuales
  const lastNoteEnd = melodyNotes.reduce((max, n) => Math.max(max, n.beat + n.duration), 1);
  const lastChordEnd = chords.reduce((max, c) => Math.max(max, c.beat + c.duration), 1);
  const absoluteEndBeat = Math.max(lastNoteEnd, lastChordEnd);

  // Calcular compases reales considerando cambios de compás
  const absoluteEndQuarter = Math.max(0, absoluteEndBeat - 1);
  const measures = calculateMeasuresTimeline(
    absoluteEndQuarter,
    metersList,
    { numerator: beatsPerBar, denominator: beatUnit }
  );
  const totalBars = Math.max(1, measures.length);

  const sectionName = options?.name || data.sectionName || data.name || data.title || rootData.sectionName || rootData.name || rootData.title || 'Section';
  const sectionType = options?.type || inferSectionTypeFromName(sectionName);
  const sectionId = options?.sectionId || `sec_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  return {
    id: sectionId,
    name: sectionName,
    type: sectionType,
    meter: { beats: beatsPerBar, beatUnit },
    timeSignature: [beatsPerBar, beatUnit],
    canonicalMeter: primaryMeter,
    meters: metersList,
    hasExplicitMeters,
    bpm,
    key: { tonic: keyTonic, scale: keyScale },
    keys: keysList,
    beatsPerBar,
    totalBars,
    totalMeasures: totalBars,
    melody: melodyNotes,
    notes: melodyNotes,
    chords,
  };
}

export function parseHookpadJson(text: string, defaultBpm?: number): UniversalSong {
  const data = JSON.parse(text.trim());
  const section = parseHookpadSection(data, {
    name: data.title || 'Full Song',
    defaultBpm,
    sectionId: 'main',
  });

  return {
    id: `hookpad_${Date.now()}`,
    title: data.title || 'Clip de Hookpad',
    artist: data.artist || 'Hookpad Export',
    bpm: section.bpm || 120,
    timeSignature: section.timeSignature || [section.beatsPerBar, 4],
    canonicalMeter: section.canonicalMeter,
    meters: section.meters,
    defaultSwing: {
      enabled: Boolean(data.swing || data.defaultSwing?.enabled),
      percentage: data.swingAmount || data.defaultSwing?.percentage || 67,
      subdivision: data.defaultSwing?.subdivision || '8n',
    },
    globalKey: section.key,
    sections: [section],
  };
}
