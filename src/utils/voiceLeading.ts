/**
 * voiceLeading.ts
 * Motor de conducción de voces continua (Voice Leading) y desacoplamiento entre bajo y bloque armónico superior.
 *
 * Arquitectura en 3 capas:
 * 1. Identidad armónica: Raíz, cualidad y notas constitutivas (resueltas por IntermediateChordModel).
 * 2. Línea de bajo (bass): Tesitura grave (preferencia C2 - C3, MIDI 36 - 48).
 * 3. Bloque armónico superior (pad/voicing): Tesitura media (preferencia C3 - C5, MIDI 48 - 72).
 *
 * Principios de conducción continua:
 * - Detección de cambios exclusivos de bajo (inversiones, slash chords, clichés descendentes):
 *   Las voces superiores se conservan idénticas en altura MIDI sin redisparar.
 * - Conservación de notas comunes en la misma altura MIDI exacta cuando la armonía cambia.
 * - Movimiento por pasos mínimos (segundas o terceras) para las voces restantes.
 * - Inercia de tesitura para evitar derivas o saltos de octava en bloque.
 * - Deduplicación estricta por nota MIDI exacta (no se fusionan notas en diferentes octavas).
 */

import type {
  UniversalChord,
  ResolvedChordVoice,
  ResolvedChord,
  KeySignature,
  IntermediateChordModel,
} from '../types/music';
import {
  buildIntermediateChord,
  renderRomanNumeral,
  renderChordSymbol,
  normalizeKey,
  normalizeSemitone,
  NOTE_TO_PC,
  SCALE_MODE_OFFSETS,
} from './theoryEngine';
import { getDegreeColor } from './theoryColors';

export interface VoiceLeadingConfig {
  bassMinMidi?: number;     // Por defecto 36 (C2)
  bassMaxMidi?: number;     // Por defecto 48 (C3)
  upperMinMidi?: number;    // Por defecto 48 (C3)
  upperMaxMidi?: number;    // Por defecto 72 (C5)
  upperCenterMidi?: number; // Por defecto 60 (C4)
}

export interface VoicedChordOutput {
  bassVoice: ResolvedChordVoice;
  upperVoices: ResolvedChordVoice[];
  voices: ResolvedChordVoice[];
  midiNotes: number[];
  notes: string[];
}

const DEFAULT_CONFIG: Required<VoiceLeadingConfig> = {
  bassMinMidi: 36,
  bassMaxMidi: 48,
  upperMinMidi: 48,
  upperMaxMidi: 72,
  upperCenterMidi: 60,
};

const PC_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function getPitchName(midi: number, useFlats = false): string {
  const pc = normalizeSemitone(midi);
  const oct = Math.floor(midi / 12) - 1;
  const names = useFlats ? PC_FLATS : PC_SHARPS;
  return `${names[pc]}${oct}`;
}

function getNoteLabel(midi: number, useFlats = false): string {
  const pc = normalizeSemitone(midi);
  const names = useFlats ? PC_FLATS : PC_SHARPS;
  return names[pc];
}

function getDegreeSd(pc: number, tonicPc: number): string {
  const semi = normalizeSemitone(pc - tonicPc);
  const SEMI_TO_SD: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
    6: '#4', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
  };
  return SEMI_TO_SD[semi] || '1';
}

function shouldPitchUseFlats(
  tonic: string,
  scale: string,
  model: IntermediateChordModel
): boolean {
  const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);
  const tonicUpper = tonic ? (tonic[0].toUpperCase() + tonic.slice(1)) : 'C';
  const isMinorFlatKey = scale === 'minor' && ['D', 'G', 'C', 'F', 'BB', 'EB', 'AB', 'DB'].includes(tonicUpper.toUpperCase());
  const isSharpSecondary = Boolean(model.applied && model.applied.appliedDegree === 7) ||
    model.rootSemitones === normalizeSemitone((NOTE_TO_PC[tonic] ?? 0) + 1) ||
    model.rootSemitones === normalizeSemitone((NOTE_TO_PC[tonic] ?? 0) + 6);

  if (isSharpSecondary) return false;
  return (
    FLAT_KEYS.has(tonic) ||
    isMinorFlatKey ||
    Boolean(model.applied?.isTritoneSub) ||
    model.borrowedMode === 'minor' || model.borrowedMode === 'phrygian' || model.borrowedMode === 'aeolian' ||
    model.borrowedMode === 'mixolydian' || model.borrowedMode === 'dorian' || model.borrowedMode === 'locrian'
  );
}

/**
 * Extrae las clases de altura (0..11) constitutivas del bloque armónico superior.
 * Para tríadas y acordes con bajo en la 7ª (ej. I^Δ42 / A/G#), la armonía superior
 * preserva los grados estructurales fundamentales (1, 3, 5).
 */
export function getChordUpperPcs(model: IntermediateChordModel): number[] {
  // Para acordes con 7ª en el bajo (inversion 3), el bloque superior contiene la tríada (1, 3, 5)
  // Para tríadas invertidas, el bloque superior contiene la tríada completa
  const tonesToUse = model.requestedInversion === 3 && model.tones.some(t => t.degree === 7)
    ? model.tones.filter(t => t.degree !== 7)
    : model.tones;

  const pcs = Array.from(
    new Set(tonesToUse.map(t => normalizeSemitone(model.rootSemitones + t.interval)))
  );

  return pcs.sort((a, b) => a - b);
}

/**
 * Detecta si dos acordes contiguos representan un cambio exclusivo de bajo
 * (inversiones, slash chords, clichés descendentes tipo A -> A/G# o C -> C/E).
 */
export function isBassOnlyChange(
  prevModel: IntermediateChordModel,
  currModel: IntermediateChordModel
): boolean {
  // Deben compartir la misma fundamental armónica
  if (prevModel.rootSemitones !== currModel.rootSemitones) {
    return false;
  }

  // Grados estructurales de la tríada (1, 3, 5 / suspensiones)
  const getStructuralPcs = (model: IntermediateChordModel): Set<number> => {
    const structuralTones = model.tones.filter(
      t => t.degree === 1 || t.degree === 2 || t.degree === 3 || t.degree === 4 || t.degree === 5
    );
    return new Set(structuralTones.map(t => normalizeSemitone(model.rootSemitones + t.interval)));
  };

  const prevPcs = getStructuralPcs(prevModel);
  const currPcs = getStructuralPcs(currModel);

  if (prevPcs.size !== currPcs.size) return false;
  for (const p of prevPcs) {
    if (!currPcs.has(p)) return false;
  }

  // La nota del bajo debe ser distinta
  const prevBassPc = normalizeSemitone(prevModel.rootSemitones + prevModel.bassTone.interval);
  const currBassPc = normalizeSemitone(currModel.rootSemitones + currModel.bassTone.interval);
  return prevBassPc !== currBassPc;
}

/**
 * Resuelve la altura MIDI de la línea de bajo anclada en tesitura grave (C2 - C3),
 * minimizando la distancia con el bajo previo para líneas continuas.
 */
export function resolveBassMidi(
  bassPc: number,
  prevBassMidi?: number,
  config = DEFAULT_CONFIG
): number {
  const minMidi = config.bassMinMidi;
  const maxMidi = config.bassMaxMidi;

  // Candidatos en octavas 1, 2 y 3 (24, 36, 48)
  const candidates = [24 + bassPc, 36 + bassPc, 48 + bassPc];

  if (prevBassMidi === undefined) {
    // Acorde inicial: ubicar en C2-C3 (36..47)
    const inRange = candidates.find(c => c >= minMidi && c < maxMidi);
    return inRange !== undefined ? inRange : 36 + bassPc;
  }

  // Acordes siguientes: minimizar distancia con el bajo previo
  let bestCandidate = candidates[1];
  let minCost = Infinity;

  for (const c of candidates) {
    const dist = Math.abs(c - prevBassMidi);
    // Penalización por salir del rango preferente C2 - C3 [36..47]
    let rangePenalty = 0;
    if (c < minMidi) rangePenalty = (minMidi - c) * 3;
    if (c >= maxMidi) rangePenalty = (c - (maxMidi - 1)) * 3;

    const cost = dist + rangePenalty;
    if (cost < minCost) {
      minCost = cost;
      bestCandidate = c;
    }
  }

  return bestCandidate;
}

/**
 * Genera el voicing inicial del bloque superior en tesitura media (~C3 a C5, centro ~C4).
 */
export function voiceInitialUpperBlock(
  targetPcs: number[],
  config = DEFAULT_CONFIG
): number[] {
  const center = config.upperCenterMidi;
  const minMidi = config.upperMinMidi;
  const maxMidi = config.upperMaxMidi;

  // Para cada pitch class, elegir la octava más cercana a C4 (MIDI 60) dentro de C3-C5
  const result: number[] = [];
  for (const pc of targetPcs) {
    const candidates = [36 + pc, 48 + pc, 60 + pc, 72 + pc];
    const valid = candidates.filter(c => c >= minMidi && c <= maxMidi);
    if (valid.length === 0) {
      result.push(60 + pc);
      continue;
    }
    valid.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    result.push(valid[0]);
  }

  return Array.from(new Set(result)).sort((a, b) => a - b);
}

/**
 * Conducción de voces continua para el bloque superior (mínima distancia interválica).
 * 1. Conserva notas comunes en su altura MIDI exacta.
 * 2. Mueve voces restantes por pasos mínimos a las notas disponibles.
 * 3. Mantiene la inercia de tesitura en la franja media.
 */
export function voiceLeadingStep(
  prevUpperMidis: number[],
  targetPcs: number[],
  config = DEFAULT_CONFIG
): number[] {
  if (prevUpperMidis.length === 0) {
    return voiceInitialUpperBlock(targetPcs, config);
  }

  const targetPcSet = new Set(targetPcs);
  const preservedMidis: number[] = [];
  const coveredPcs = new Set<number>();
  const unassignedPrevMidis: number[] = [];

  // Paso 1: Conservación de notas comunes en altura exacta
  for (const prevM of prevUpperMidis) {
    const pc = normalizeSemitone(prevM);
    if (targetPcSet.has(pc) && !coveredPcs.has(pc)) {
      preservedMidis.push(prevM);
      coveredPcs.add(pc);
    } else {
      unassignedPrevMidis.push(prevM);
    }
  }

  // Pitch classes del nuevo acorde que aún faltan por cubrir
  const remainingTargetPcs = targetPcs.filter(pc => !coveredPcs.has(pc));
  const newMidis: number[] = [...preservedMidis];

  // Paso 2: Movimiento por pasos mínimos de las voces restantes
  if (unassignedPrevMidis.length > 0 && remainingTargetPcs.length > 0) {
    // Emparejar cada voz libre previa con el pitch class objetivo más cercano
    const availableTargets = [...remainingTargetPcs];
    const availablePrev = [...unassignedPrevMidis];

    while (availablePrev.length > 0 && availableTargets.length > 0) {
      let bestPair = { prevIdx: 0, targetIdx: 0, targetMidi: 60, dist: Infinity };

      for (let pIdx = 0; pIdx < availablePrev.length; pIdx++) {
        const pm = availablePrev[pIdx];
        for (let tIdx = 0; tIdx < availableTargets.length; tIdx++) {
          const tpc = availableTargets[tIdx];
          // Candidato de altura MIDI para tpc más cercano a pm
          const oct = Math.round((pm - tpc) / 12);
          const candidateMidi = oct * 12 + tpc;
          const dist = Math.abs(candidateMidi - pm);

          if (dist < bestPair.dist) {
            bestPair = { prevIdx: pIdx, targetIdx: tIdx, targetMidi: candidateMidi, dist };
          }
        }
      }

      newMidis.push(bestPair.targetMidi);
      availablePrev.splice(bestPair.prevIdx, 1);
      availableTargets.splice(bestPair.targetIdx, 1);
    }

    // Si aún quedan targets sin voz (ej. transición de tríada a tétrada), asignar en tesitura media
    for (const tpc of availableTargets) {
      const candidates = [48 + tpc, 60 + tpc, 72 + tpc];
      const valid = candidates.filter(c => c >= config.upperMinMidi && c <= config.upperMaxMidi);
      const chosen = valid.length > 0
        ? valid.sort((a, b) => Math.abs(a - config.upperCenterMidi) - Math.abs(b - config.upperCenterMidi))[0]
        : 60 + tpc;
      newMidis.push(chosen);
    }
  } else if (remainingTargetPcs.length > 0) {
    // Si no había voces libres previas, añadir los targets restantes en tesitura media
    for (const tpc of remainingTargetPcs) {
      const candidates = [48 + tpc, 60 + tpc, 72 + tpc];
      const valid = candidates.filter(c => c >= config.upperMinMidi && c <= config.upperMaxMidi);
      const chosen = valid.length > 0
        ? valid.sort((a, b) => Math.abs(a - config.upperCenterMidi) - Math.abs(b - config.upperCenterMidi))[0]
        : 60 + tpc;
      newMidis.push(chosen);
    }
  }

  // Paso 3: Inercia de tesitura (control de centro de gravedad)
  let result = Array.from(new Set(newMidis)).sort((a, b) => a - b);
  if (result.length > 0) {
    const cog = result.reduce((s, m) => s + m, 0) / result.length;
    // Si la tesitura derivó demasiado hacia agudos (> 69) y puede descender
    if (cog > 69 && result.every(m => m - 12 >= config.upperMinMidi - 2)) {
      result = result.map(m => m - 12);
    }
    // Si la tesitura derivó demasiado hacia graves (< 51) y puede ascender
    if (cog < 51 && result.every(m => m + 12 <= config.upperMaxMidi + 2)) {
      result = result.map(m => m + 12);
    }
  }

  return result.sort((a, b) => a - b);
}

/**
 * Resuelve una progresión completa de acordes aplicando la arquitectura en 3 capas
 * y conducción de voces continua (voice leading).
 */
export function resolveChordsWithVoiceLeading(
  chords: UniversalChord[],
  getKeyFn: (beat: number) => KeySignature | string,
  baseOctave = 3,
  config: VoiceLeadingConfig = DEFAULT_CONFIG
): ResolvedChord[] {
  const cfg: Required<VoiceLeadingConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
    // Ajustar límites si baseOctave fue modificado
    upperCenterMidi: (baseOctave + 2) * 12,
  };

  const results: ResolvedChord[] = [];
  let prevModel: IntermediateChordModel | null = null;
  let prevBassMidi: number | undefined = undefined;
  let prevUpperMidis: number[] = [];

  for (let idx = 0; idx < chords.length; idx++) {
    const chord = chords[idx];
    const key = getKeyFn(chord.beat);
    const { tonic, scale } = normalizeKey(key);
    const tonicPc = NOTE_TO_PC[tonic] ?? 0;

    const model = buildIntermediateChord(chord, key, baseOctave);
    const useFlats = shouldPitchUseFlats(tonic, scale, model);
    const bassPc = normalizeSemitone(model.rootSemitones + model.bassTone.interval);

    let currentBassMidi: number;
    let currentUpperMidis: number[];

    if (!prevModel || prevUpperMidis.length === 0) {
      // 1. Acorde inicial
      currentBassMidi = resolveBassMidi(bassPc, undefined, cfg);
      const targetUpperPcs = getChordUpperPcs(model);
      currentUpperMidis = voiceInitialUpperBlock(targetUpperPcs, cfg);
    } else if (isBassOnlyChange(prevModel, model)) {
      // 2. Cambio exclusivo de bajo (clichés, slash chords, inversiones sobre misma armonía)
      // Mantener idénticas las notas superiores y sus alturas MIDI sin redisparar
      currentBassMidi = resolveBassMidi(bassPc, prevBassMidi, cfg);
      currentUpperMidis = [...prevUpperMidis];
    } else {
      // 3. Cambio armónico general: conducción de voces por pasos mínimos y notas comunes
      currentBassMidi = resolveBassMidi(bassPc, prevBassMidi, cfg);
      const targetUpperPcs = getChordUpperPcs(model);
      currentUpperMidis = voiceLeadingStep(prevUpperMidis, targetUpperPcs, cfg);
    }

    // Evitar colisión de registro si el bajo coincide exactamente con una voz superior
    if (currentUpperMidis.includes(currentBassMidi)) {
      currentUpperMidis = currentUpperMidis.map(m => m === currentBassMidi ? m + 12 : m);
    }

    // Deduplicación estricta por nota MIDI exacta
    const allMidis = Array.from(new Set([currentBassMidi, ...currentUpperMidis])).sort((a, b) => a - b);

    // Construcción de la voz de bajo
    const bassSd = getDegreeSd(bassPc, tonicPc);
    const { color: bassColor, isAltered: bassAltered } = getDegreeColor(bassSd);
    const bassVoice: ResolvedChordVoice = {
      midi: currentBassMidi,
      pitch: getPitchName(currentBassMidi, useFlats),
      noteLabel: getNoteLabel(currentBassMidi, useFlats),
      sd: bassSd,
      color: bassColor,
      isAltered: bassAltered,
      isBass: true,
      voiceNumber: 'Bass',
      label: chord.inversion ? 'Bass' : '1',
    };

    // Construcción de las voces armónicas superiores
    const upperVoices: ResolvedChordVoice[] = currentUpperMidis.map(m => {
      const pc = normalizeSemitone(m);
      const sd = getDegreeSd(pc, tonicPc);
      const { color, isAltered } = getDegreeColor(sd);
      const intervalFromRoot = normalizeSemitone(pc - model.rootSemitones);

      let voiceNumber = '1';
      if (intervalFromRoot === 3 || intervalFromRoot === 4) voiceNumber = '3';
      else if (intervalFromRoot === 5) voiceNumber = model.tones.some(t => t.degree === 11) ? '11' : (model.tones.some(t => t.degree === 4) ? '4' : '11');
      else if (intervalFromRoot === 6 || intervalFromRoot === 7 || intervalFromRoot === 8) voiceNumber = '5';
      else if (intervalFromRoot >= 9 && intervalFromRoot <= 11) voiceNumber = '7';
      else if (intervalFromRoot === 2) voiceNumber = '9';

      return {
        midi: m,
        pitch: getPitchName(m, useFlats),
        noteLabel: getNoteLabel(m, useFlats),
        sd,
        color,
        isAltered,
        isBass: false,
        voiceNumber,
        label: voiceNumber,
      };
    });

    const voices: ResolvedChordVoice[] = [bassVoice, ...upperVoices];
    const notes = voices.map(v => v.pitch);
    const rootSd = getDegreeSd(model.rootSemitones, tonicPc);
    const { color: chordColor, isAltered: rootAltered } = getDegreeColor(rootSd);

    const roman = chord.roman || renderRomanNumeral(model);
    const symbol = chord.customSymbol || renderChordSymbol(model);

    results.push({
      id: chord.id,
      beat: chord.beat,
      duration: chord.duration,
      roman,
      symbol,
      rootMidi: currentBassMidi,
      voices,
      midiNotes: allMidis,
      notes,
      color: chordColor,
      isAltered: rootAltered || Boolean(model.borrowedMode) || Boolean(model.applied) || voices.some(v => v.isAltered),
    });

    prevModel = model;
    prevBassMidi = currentBassMidi;
    prevUpperMidis = currentUpperMidis;
  }

  return results;
}
