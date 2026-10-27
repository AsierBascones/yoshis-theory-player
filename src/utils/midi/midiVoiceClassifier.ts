/**
 * midiVoiceClassifier.ts
 * Capa de inferencia no destructiva para análisis de voces, manos y texturas de acompañamiento.
 *
 * Principios de diseño:
 * 1. No destructivo: no altera notas, eventos, pitches, duraciones ni tiempos del MIDI.
 * 2. Desacoplamiento estricto: hand (mano física inferida) y voiceRole (función musical)
 *    son conceptos independientes inferidos mediante señales separadas.
 * 3. Tolerancia multi-señal: no asume umbrales fijos (ej. corte en C4) ni infalibilidad de pistas.
 * 4. Manejo honesto de la ambigüedad: cuando la evidencia es insuficiente, clasifica como
 *    'indeterminate' con confianza justificada sin inventar certeza artificial.
 */

import type {
  MidiMusicalIR,
  MidiNoteIR,
  AnalyzedVoiceNote,
  VoiceAnalysisResult,
  HandAssignment,
  MusicalVoiceRole,
} from '../../types/midiIR';

interface TimeSlice {
  startTick: number;
  notes: MidiNoteIR[];
}

/**
 * Clasifica de forma no destructiva las notas de una estructura MidiMusicalIR,
 * infiriendo mano probable (izq/der/indeterminada) y rol musical (bajo, acompañamiento,
 * arpegio, melodía principal, contramelodía, adorno o no clasificado).
 */
export function classifyMidiVoices(ir: MidiMusicalIR): VoiceAnalysisResult {
  const tonalNotes = ir.allNotes.filter((n) => !n.isPercussion);
  const voiceNotes: Record<string, AnalyzedVoiceNote> = {};

  if (tonalNotes.length === 0) {
    return {
      voiceNotes,
      detectedTexture: 'monophonic',
      hasIndependentTracks: false,
      confidence: 1.0,
    };
  }

  const ppq = ir.header.ppq || 480;

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Análisis de pistas y metadatos como SEÑALES (no verdades absolutas)
  // ──────────────────────────────────────────────────────────────────────────
  const tracksWithNotes = ir.tracks.filter((t) => !t.isPercussion && t.notes.length > 0);
  const trackCount = tracksWithNotes.length;

  interface TrackProfile {
    index: number;
    name: string;
    avgPitch: number;
    minPitch: number;
    maxPitch: number;
    noteCount: number;
    nameSuggestsLH: boolean;
    nameSuggestsRH: boolean;
    nameSuggestsBass: boolean;
    nameSuggestsMelody: boolean;
    programSuggestsBass: boolean;
  }

  const trackProfiles: Map<number, TrackProfile> = new Map();
  for (const t of tracksWithNotes) {
    const pitches = t.notes.map((n) => n.pitchMidi);
    const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);
    const nameLower = (t.name || '').toLowerCase();

    const nameSuggestsLH = /left|lh|mano izquierda|izq|linke/i.test(nameLower);
    const nameSuggestsRH = /right|rh|mano derecha|der|rechte/i.test(nameLower);
    const nameSuggestsBass = /bass|bajo|bassline|pedal|contrab/i.test(nameLower);
    const nameSuggestsMelody = /lead|melody|melod[ií]a|solo|soprano|canto|vocal/i.test(nameLower);
    const programSuggestsBass = t.programNumber >= 32 && t.programNumber <= 39;

    trackProfiles.set(t.index, {
      index: t.index,
      name: t.name,
      avgPitch,
      minPitch,
      maxPitch,
      noteCount: t.notes.length,
      nameSuggestsLH,
      nameSuggestsRH,
      nameSuggestsBass,
      nameSuggestsMelody,
      programSuggestsBass,
    });
  }

  // Comprobar si las pistas son genuinamente independientes o si comparten registro
  let hasIndependentTracks = false;
  if (trackCount >= 2) {
    const profiles = Array.from(trackProfiles.values());
    const sortedByAvg = [...profiles].sort((a, b) => a.avgPitch - b.avgPitch);
    const lowestTrack = sortedByAvg[0];
    const highestTrack = sortedByAvg[sortedByAvg.length - 1];

    // Diferencia sustancial de tesitura entre pistas extremas (>= 15 semitonos)
    if (highestTrack.avgPitch - lowestTrack.avgPitch >= 15) {
      hasIndependentTracks = true;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Agrupación Polifónica en Rebanadas Temporales (Time-Slice Clusters)
  // ──────────────────────────────────────────────────────────────────────────
  // Tolerancia de 25 ticks (~1/32 de compás) para considerar notas como ataque simultáneo
  const sortedNotes = [...tonalNotes].sort(
    (a, b) => a.startTick - b.startTick || a.pitchMidi - b.pitchMidi
  );

  const timeSlices: TimeSlice[] = [];
  let currentSlice: MidiNoteIR[] = [];
  let sliceStartTick = -1;

  for (const n of sortedNotes) {
    if (sliceStartTick < 0) {
      sliceStartTick = n.startTick;
      currentSlice = [n];
    } else if (Math.abs(n.startTick - sliceStartTick) <= 25) {
      currentSlice.push(n);
    } else {
      timeSlices.push({ startTick: sliceStartTick, notes: currentSlice });
      sliceStartTick = n.startTick;
      currentSlice = [n];
    }
  }
  if (currentSlice.length > 0) {
    timeSlices.push({ startTick: sliceStartTick, notes: currentSlice });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Reconocimiento de Textura Global (Stride, Ragtime, Arpegios, Polifonía)
  // ──────────────────────────────────────────────────────────────────────────
  let strideRagtimeScore = 0;
  let arpeggioScore = 0;
  let polyphonicSlicesCount = 0;

  for (let sIdx = 0; sIdx < timeSlices.length; sIdx++) {
    const slice = timeSlices[sIdx];
    if (slice.notes.length >= 2) polyphonicSlicesCount++;

    // Patrón Stride / Ragtime:
    // Bajo solo o con octava en pulso fuerte (1 o 3), seguido de acorde en pulso débil (2 o 4)
    const beatPos = ((slice.startTick % (ppq * 4)) / ppq); // Beat en compás 4/4 (0..4)
    const isDownbeat = Math.abs(beatPos) < 0.15 || Math.abs(beatPos - 2) < 0.15;
    const isOffbeat = Math.abs(beatPos - 1) < 0.15 || Math.abs(beatPos - 3) < 0.15;

    const lowestNote = slice.notes[0];
    const isLowRegister = lowestNote.pitchMidi < 55;

    if (isDownbeat && isLowRegister && slice.notes.length <= 2) {
      // Posible golpe de bajo de stride/ragtime
      const nextSlice = timeSlices[sIdx + 1];
      if (nextSlice) {
        const nextBeatPos = ((nextSlice.startTick % (ppq * 4)) / ppq);
        const nextIsOffbeat = Math.abs(nextBeatPos - 1) < 0.2 || Math.abs(nextBeatPos - 3) < 0.2;
        const nextHasMidCluster =
          nextSlice.notes.length >= 2 &&
          nextSlice.notes.some((n) => n.pitchMidi >= 50 && n.pitchMidi <= 76);
        if (nextIsOffbeat && nextHasMidCluster) {
          strideRagtimeScore++;
        }
      }
    }

    // Patrón Arpegio: notas individuales consecutivas de corta duración en registro medio
    if (slice.notes.length === 1 && sIdx > 0 && sIdx < timeSlices.length - 1) {
      const prev = timeSlices[sIdx - 1].notes[0];
      const next = timeSlices[sIdx + 1].notes[0];
      const diff1 = Math.abs(lowestNote.pitchMidi - prev.pitchMidi);
      const diff2 = Math.abs(next.pitchMidi - lowestNote.pitchMidi);
      // Saltos interválicos típicos de arpegio (3, 4, 5, 7 semitonos)
      if ((diff1 === 3 || diff1 === 4 || diff1 === 5 || diff1 === 7) &&
          (diff2 === 3 || diff2 === 4 || diff2 === 5 || diff2 === 7)) {
        arpeggioScore++;
      }
    }
  }

  let detectedTexture: VoiceAnalysisResult['detectedTexture'] = 'polyphonic';
  if (strideRagtimeScore >= 2) {
    detectedTexture = 'stride_ragtime';
  } else if (arpeggioScore >= 4) {
    detectedTexture = 'arpeggiated';
  } else if (polyphonicSlicesCount === 0) {
    detectedTexture = 'monophonic';
  } else if (polyphonicSlicesCount < timeSlices.length * 0.3) {
    detectedTexture = 'mixed';
  } else {
    detectedTexture = 'polyphonic';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Inferencia no destructiva de cada nota individual
  // ──────────────────────────────────────────────────────────────────────────
  // Mapa de notas para búsqueda rápida de contexto melódico horizontal
  const noteIndexMap = new Map<string, number>();
  sortedNotes.forEach((n, idx) => noteIndexMap.set(n.id, idx));

  for (let sIdx = 0; sIdx < timeSlices.length; sIdx++) {
    const slice = timeSlices[sIdx];
    const sliceNotes = slice.notes; // Ya ordenadas por pitch ascendente
    const sliceLowest = sliceNotes[0];
    const sliceHighest = sliceNotes[sliceNotes.length - 1];
    const isPolySlice = sliceNotes.length >= 2;

    for (let nIdx = 0; nIdx < sliceNotes.length; nIdx++) {
      const note = sliceNotes[nIdx];
      const globalIdx = noteIndexMap.get(note.id) ?? 0;
      const prevNote = globalIdx > 0 ? sortedNotes[globalIdx - 1] : undefined;
      const nextNote = globalIdx < sortedNotes.length - 1 ? sortedNotes[globalIdx + 1] : undefined;

      const durBeats = note.durationTicks / ppq;
      const beatInBar = ((note.startTick % (ppq * 4)) / ppq);
      const isStrongBeat = Math.abs(beatInBar) < 0.15 || Math.abs(beatInBar - 2) < 0.15;
      const isBeatPulse = (note.startTick % ppq) === 0;

      const profile = trackProfiles.get(note.trackIndex);

      // ── A. Inferencia de Función Musical (voiceRole) ──
      let voiceRole: MusicalVoiceRole = 'unclassified';
      let voiceConfidence = 0.5;
      let voiceRationale = '';

      // Regla 1: Nota ornamental breve con resolución por paso conjunto
      const isBrief = durBeats <= 0.25;
      let isStepMotion = false;
      if (prevNote && nextNote) {
        const step1 = Math.abs(note.pitchMidi - prevNote.pitchMidi);
        const step2 = Math.abs(nextNote.pitchMidi - note.pitchMidi);
        isStepMotion = (step1 <= 2 && step2 <= 2);
      }

      // En patrón Stride / Ragtime: los clusters en pulsos débiles (beats 2 y 4) son acordes de acompañamiento
      const isStrideOffbeatChord =
        detectedTexture === 'stride_ragtime' &&
        !isStrongBeat &&
        isPolySlice &&
        sliceNotes.every((sn) => sn.pitchMidi >= 48);

      if (isBrief && !isStrongBeat && isStepMotion) {
        voiceRole = 'ornament';
        voiceConfidence = 0.82;
        voiceRationale = 'Nota breve ornamental fuera de pulso fuerte que resuelve por paso conjunto';
      }
      else if (isStrideOffbeatChord) {
        voiceRole = 'accompaniment_chord';
        voiceConfidence = 0.90;
        voiceRationale = 'Nota perteneciente a acorde de acompañamiento en pulso débil de patrón stride/ragtime';
      }
      // Regla 2: Bajo estructural en time-slice polifónico o en registro grave
      else if (isPolySlice && note.id === sliceLowest.id && note.pitchMidi < 60) {
        voiceRole = 'bass';
        voiceConfidence = isStrongBeat ? 0.92 : 0.85;
        voiceRationale = 'Voz inferior de cluster polifónico en registro grave';
      }
      // Regla 3: Salto de bajo alternante (ej. Stride / Ragtime)
      else if (detectedTexture === 'stride_ragtime' && note.pitchMidi < 55) {
        voiceRole = 'bass';
        voiceConfidence = 0.90;
        voiceRationale = 'Ataque de bajo en patrón stride/ragtime alternante';
      }
      // Regla 4: Acorde de acompañamiento en registro medio (entre bajo y melodía)
      else if (isPolySlice && note.id !== sliceLowest.id && note.id !== sliceHighest.id) {
        voiceRole = 'accompaniment_chord';
        voiceConfidence = 0.84;
        voiceRationale = 'Voz intermedia en cluster polifónico de acompañamiento';
      }
      // Regla 5: Voz superior melódica (Time-slice polifónico o contorno más agudo)
      else if (isPolySlice && note.id === sliceHighest.id && note.pitchMidi >= 55) {
        voiceRole = 'primary_melody';
        voiceConfidence = 0.88;
        voiceRationale = 'Voz superior de textura polifónica';
      }
      // Regla 6: Textura arpegiada de acompañamiento
      else if (detectedTexture === 'arpeggiated' && note.pitchMidi < 65) {
        voiceRole = 'arpeggio_support';
        voiceConfidence = 0.80;
        voiceRationale = 'Despliegue arpegiado continuo de acompañamiento armónico';
      }
      // Regla 7: Pista con metadato explícito de bajo o melodía
      else if (profile?.nameSuggestsBass || profile?.programSuggestsBass) {
        voiceRole = 'bass';
        voiceConfidence = 0.88;
        voiceRationale = 'Pista con metadatos explícitos de bajo e instrumento grave';
      } else if (profile?.nameSuggestsMelody) {
        voiceRole = 'primary_melody';
        voiceConfidence = 0.88;
        voiceRationale = 'Pista con metadatos explícitos de melodía/lead';
      }
      // Regla 8: Nota monofónica única
      else {
        if (note.pitchMidi < 48) {
          voiceRole = 'bass';
          voiceConfidence = 0.70;
          voiceRationale = 'Nota monofónica en registro bajo profundo';
        } else if (note.pitchMidi >= 67) {
          voiceRole = 'primary_melody';
          voiceConfidence = 0.70;
          voiceRationale = 'Línea melódica monofónica en registro superior';
        } else {
          voiceRole = 'unclassified';
          voiceConfidence = 0.45;
          voiceRationale = 'Línea monofónica en tesitura intermedia';
        }
      }

      // ── B. Inferencia de Mano Ejecutante (hand) ──
      // Desacoplada estrictamente de la función musical: se basa en señales de pista,
      // posición relativa en el cluster, tesitura y textura.
      let hand: HandAssignment = 'indeterminate';
      let handConfidence = 0.5;
      let handRationale = '';

      // Señal 1: Metadatos explícitos de pista (con validación de tesitura)
      if (profile?.nameSuggestsLH && note.pitchMidi < 72) {
        hand = 'left';
        handConfidence = 0.92;
        handRationale = 'Pista rotulada explícitamente como mano izquierda';
      } else if (profile?.nameSuggestsRH && note.pitchMidi >= 48) {
        hand = 'right';
        handConfidence = 0.92;
        handRationale = 'Pista rotulada explícitamente como mano derecha';
      }
      // Señal 2: Patrón Stride / Ragtime (el bajo y los acordes de pulso débil son tocados por la mano izq)
      else if (detectedTexture === 'stride_ragtime' && note.pitchMidi < 67) {
        hand = 'left';
        handConfidence = 0.88;
        handRationale = 'Patrón de bajo y acordes de acompañamiento ejecutado por mano izquierda en ragtime/stride';
      }
      // Señal 3: Cluster polifónico simultáneo en una sola pista
      else if (isPolySlice) {
        const intervalSpan = sliceHighest.pitchMidi - sliceLowest.pitchMidi;
        // Si el cluster abarca más de una octava y media (>= 18 semitonos),
        // es anatómicamente imposible tocarlo con una sola mano; requiere dos manos:
        if (intervalSpan >= 18) {
          if (note.pitchMidi <= sliceLowest.pitchMidi + 7) {
            hand = 'left';
            handConfidence = 0.85;
            handRationale = 'Extremo inferior de apertura polifónica amplia (> 18 semitonos)';
          } else if (note.pitchMidi >= sliceHighest.pitchMidi - 7) {
            hand = 'right';
            handConfidence = 0.85;
            handRationale = 'Extremo superior de apertura polifónica amplia (> 18 semitonos)';
          } else {
            hand = 'indeterminate';
            handConfidence = 0.40;
            handRationale = 'Voz intermedia en apertura amplia ejecutable por cualquiera de las dos manos';
          }
        }
        // Apertura estándar de piano
        else if (note.pitchMidi < 53) {
          hand = 'left';
          handConfidence = 0.80;
          handRationale = 'Voz grave en cluster polifónico atribuible anatómicamente a mano izquierda';
        } else if (note.pitchMidi >= 67) {
          hand = 'right';
          handConfidence = 0.80;
          handRationale = 'Voz aguda en cluster polifónico atribuible anatómicamente a mano derecha';
        } else {
          hand = 'indeterminate';
          handConfidence = 0.50;
          handRationale = 'Tesitura intermedia compartida (G3-G4) susceptible de cruce o ejecución compartida';
        }
      }
      // Señal 4: Registro extremo sin ambigüedad
      else if (note.pitchMidi < 45) { // < A2
        hand = 'left';
        handConfidence = 0.85;
        handRationale = 'Registro grave profundo característico de mano izquierda';
      } else if (note.pitchMidi >= 76) { // >= E5
        hand = 'right';
        handConfidence = 0.85;
        handRationale = 'Registro agudo característico de mano derecha';
      }
      // Señal 5: Ambigüedad justificada (sin inventar certeza artificial)
      else {
        hand = 'indeterminate';
        handConfidence = 0.50;
        handRationale = 'Pasaje sin separación polifónica suficiente en tesitura compartida';
      }

      const combinedConfidence = Math.round(((voiceConfidence + handConfidence) / 2) * 100) / 100;
      const combinedRationale = `${voiceRationale}. Mano: ${handRationale}`;

      voiceNotes[note.id] = {
        noteId: note.id,
        hand,
        handConfidence,
        handRationale,
        voiceRole,
        voiceConfidence,
        voiceRationale,
        confidence: combinedConfidence,
        rationale: combinedRationale,
      };
    }
  }

  return {
    voiceNotes,
    detectedTexture,
    hasIndependentTracks,
    confidence: hasIndependentTracks ? 0.90 : 0.80,
  };
}
