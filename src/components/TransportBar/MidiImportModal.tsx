import React, { useState, useEffect, useCallback } from 'react';
import type { ScaleMode } from '../../types/music';
import type { KeyCandidate, AnalyzedHarmonicSegment } from '../../types/midiIR';
import { inspectMidiTracks, type MidiTrackInfo, type MidiParseOptions } from '../../utils/midiImporter';
import { isHookpadJson, parseHookpadJson } from '../../utils/hookpadImporter';
import usePlayerStore from '../../store/usePlayerStore';

interface MidiImportModalProps {
  file: File | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: MidiParseOptions) => Promise<void>;
}

const TONIC_OPTIONS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

export default function MidiImportModal({
  file,
  isOpen,
  onClose,
  onConfirm,
}: MidiImportModalProps) {
  const [keyTonic, setKeyTonic] = useState<string>('C');
  const [keyScale, setKeyScale] = useState<ScaleMode>('major');
  const [chordResolution, setChordResolution] = useState<2 | 4>(2);
  const [melodyTrackIndex, setMelodyTrackIndex] = useState<number>(-1);
  const [harmonyTrackIndex, setHarmonyTrackIndex] = useState<number>(-1);
  const [tracks, setTracks] = useState<MidiTrackInfo[]>([]);
  const [bpm, setBpm] = useState<number>(120);
  const [timeSignature, setTimeSignature] = useState<[number, number]>([4, 4]);
  const [estimatedConfidence, setEstimatedConfidence] = useState<number | undefined>(undefined);
  const [isAmbiguous, setIsAmbiguous] = useState<boolean>(false);
  const [candidateKeys, setCandidateKeys] = useState<ReadonlyArray<KeyCandidate>>([]);
  const [previewChords, setPreviewChords] = useState<ReadonlyArray<AnalyzedHarmonicSegment>>([]);
  const [melodyNotesCount, setMelodyNotesCount] = useState<number>(0);
  const [harmonyNotesCount, setHarmonyNotesCount] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const addSongToCatalog = usePlayerStore((s) => s.addSongToCatalog);

  // Analizador defensivo e interactivo para la previsualización sin alterar la canción activa
  const runAnalysis = useCallback(async (
    targetTonic?: string,
    targetScale?: ScaleMode,
    targetMelodyTrack?: number,
    targetResolution?: 2 | 4,
    isInitial: boolean = false
  ) => {
    if (!file) return;
    setLoadingAnalysis(true);
    try {
      const activeTonic = isInitial ? undefined : (targetTonic ?? keyTonic);
      const activeScale = isInitial ? undefined : (targetScale ?? keyScale);
      const activeMelody = isInitial ? undefined : (targetMelodyTrack !== undefined ? targetMelodyTrack : (melodyTrackIndex === -1 ? undefined : melodyTrackIndex));
      const activeResolution = targetResolution ?? chordResolution;

      const res = await inspectMidiTracks(file, {
        referenceKeyTonic: activeTonic,
        referenceKeyScale: activeScale,
        melodyTrackIndex: activeMelody,
        harmonyResolutionBeats: activeResolution,
      });

      setTracks(res.tracks);
      setBpm(res.bpm);
      setTimeSignature(res.timeSignature);
      setEstimatedConfidence(res.estimatedKey.confidence);
      setIsAmbiguous(Boolean(res.estimatedKey.isAmbiguous));
      setCandidateKeys(res.candidateKeys || []);
      setPreviewChords(res.previewChords || []);
      setMelodyNotesCount(res.melodyNotesCount || 0);
      setHarmonyNotesCount(res.harmonyNotesCount || 0);

      if (isInitial || targetTonic === undefined) {
        if (res.estimatedKey.tonic) {
          setKeyTonic(res.estimatedKey.tonic);
          setKeyScale(res.estimatedKey.scale);
        }
      }

      if (isInitial || targetMelodyTrack === undefined) {
        if (res.autoSelectedMelodyTrackIndex !== undefined) {
          setMelodyTrackIndex(res.autoSelectedMelodyTrackIndex);
        } else if (melodyTrackIndex === -1) {
          const playableTracks = res.tracks.filter((t) => t.notesCount > 0 && t.channel !== 9);
          if (playableTracks.length >= 2) {
            const sorted = [...playableTracks].sort((a, b) => b.avgPitch - a.avgPitch);
            setMelodyTrackIndex(sorted[0].index);
          }
        }
      }
    } catch (err) {
      console.error('Error al analizar archivo MIDI:', err);
    } finally {
      setLoadingAnalysis(false);
    }
  }, [file, keyTonic, keyScale, melodyTrackIndex, chordResolution]);

  // Carga inicial al cambiar de archivo
  useEffect(() => {
    if (!file) {
      setTracks([]);
      setPreviewChords([]);
      return;
    }
    runAnalysis(undefined, undefined, undefined, undefined, true);
  }, [file]);

  const handlePasteHookpad = async () => {
    const currentBpm = usePlayerStore.getState().bpm;
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (isHookpadJson(text)) {
          const imported = parseHookpadJson(text, currentBpm);
          addSongToCatalog(imported);
          onClose();
          return;
        }
      }
    } catch {}

    const manual = prompt('Pega aquí el código JSON copiado desde Hookpad:');
    if (manual && isHookpadJson(manual)) {
      try {
        const imported = parseHookpadJson(manual, currentBpm);
        addSongToCatalog(imported);
        onClose();
      } catch {
        alert('Error al analizar los datos de Hookpad.');
      }
    } else if (manual) {
      alert('El texto pegado no es un JSON válido de Hookpad (debe contener el array "notes" o "chords").');
    }
  };

  if (!isOpen || !file) return null;

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      await onConfirm({
        keyTonic,
        keyScale,
        melodyTrackIndex,
        harmonyTrackIndex,
        splitPointMidi: 60, // C4
        chordResolution,
      });
      onClose();
    } catch (err) {
      console.error('Error al importar archivo MIDI:', err);
      alert('Hubo un error al procesar el archivo MIDI. Verifica que sea un archivo .mid válido.');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasMultipleTracks = tracks.filter((t) => t.notesCount > 0 && t.channel !== 9).length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4 animate-fade-in">
      <div className="bg-[#121824] border border-gray-700/80 rounded-xl shadow-2xl max-w-2xl w-full p-6 text-gray-200 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Importación & Traducción MIDI</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  Hooktheory Engine v2.1
                </span>
              </div>
              <p className="text-[11px] text-gray-400 truncate max-w-sm" title={file.name}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB) · {bpm} BPM · Compás {timeSignature[0]}/{timeSignature[1]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            title="Cancelar y cerrar sin modificar"
          >
            ✕
          </button>
        </div>

        {/* Acceso Rápido Hookpad */}
        <div className="bg-[#16253b] border border-cyan-500/40 rounded-lg p-2.5 flex items-center justify-between">
          <div className="text-[11px] text-cyan-200">
            <span className="font-bold text-white">¿Tienes un clip o sección de Hookpad copiado?</span>
            <p className="text-gray-400 text-[10px]">Pega el JSON directamente para importar sin requerir archivo MIDI.</p>
          </div>
          <button
            onClick={handlePasteHookpad}
            type="button"
            className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1 shadow-sm active:scale-95"
          >
            <span>📋 Pegar desde Hookpad</span>
          </button>
        </div>

        {/* 1. Panel de Tonalidad Estimada y Confianza */}
        <div className="bg-[#0e141f] border border-gray-800 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              1. Tonalidad y Modo
            </span>
            {estimatedConfidence !== undefined && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-gray-400">Confianza:</span>
                <span className={`font-mono font-bold ${estimatedConfidence >= 0.7 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {Math.round(estimatedConfidence * 100)}%
                </span>
                {isAmbiguous && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">
                    ⚠️ Ambigüedad tonal
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-[10px] font-medium">Tónica (Key):</label>
              <select
                value={keyTonic}
                onChange={(e) => {
                  const val = e.target.value;
                  setKeyTonic(val);
                  runAnalysis(val, keyScale);
                }}
                className="bg-[#1a2232] border border-gray-700 rounded-md px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {TONIC_OPTIONS.map((tonic) => (
                  <option key={tonic} value={tonic}>
                    {tonic}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-[10px] font-medium">Modo (Scale):</label>
              <select
                value={keyScale}
                onChange={(e) => {
                  const val = e.target.value as ScaleMode;
                  setKeyScale(val);
                  runAnalysis(keyTonic, val);
                }}
                className="bg-[#1a2232] border border-gray-700 rounded-md px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="major">Mayor (Jónico)</option>
                <option value="minor">Menor (Eólico)</option>
                <option value="mixolydian">Mixolidio</option>
                <option value="dorian">Dórico</option>
              </select>
            </div>
          </div>

          {/* Candidatos alternativos */}
          {candidateKeys.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-800/80">
              <span className="text-[10px] text-gray-400 font-medium">Candidatos alternativos:</span>
              {candidateKeys.slice(0, 4).map((cand, idx) => (
                <button
                  key={`${cand.tonic}_${cand.scale}_${idx}`}
                  type="button"
                  onClick={() => {
                    setKeyTonic(cand.tonic);
                    setKeyScale(cand.scale as ScaleMode);
                    runAnalysis(cand.tonic, cand.scale as ScaleMode);
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                    cand.tonic === keyTonic && cand.scale === keyScale
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-gray-800/60 border-gray-700 text-gray-300 hover:text-white'
                  }`}
                >
                  {cand.tonic} {cand.scale} ({Math.round(cand.confidence * 100)}%)
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 2. Separación de Pistas y Voces */}
        <div className="bg-[#0e141f] border border-gray-800 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              2. Separación de Voces (Melodía vs Acompañamiento)
            </span>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span>Melodía: <strong className="text-white">{melodyNotesCount}</strong> n.</span>
              <span>·</span>
              <span>Acompañamiento: <strong className="text-white">{harmonyNotesCount}</strong> n.</span>
            </div>
          </div>

          {hasMultipleTracks ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-gray-400 text-[10px] font-medium">Pista Melódica (Lead):</label>
                <select
                  value={melodyTrackIndex}
                  onChange={(e) => {
                    const idx = parseInt(e.target.value, 10);
                    setMelodyTrackIndex(idx);
                    runAnalysis(keyTonic, keyScale, idx);
                  }}
                  className="bg-[#1a2232] border border-gray-700 rounded-md px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="-1">✨ Auto (Pista más aguda es Melodía)</option>
                  {tracks.map((t) => (
                    <option key={`m-${t.index}`} value={t.index}>
                      Pista {t.index + 1}: {t.name} ({t.notesCount} n.)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-gray-400 text-[10px] font-medium">Pista Armonía / Acompañamiento:</label>
                <select
                  value={harmonyTrackIndex}
                  onChange={(e) => setHarmonyTrackIndex(parseInt(e.target.value, 10))}
                  className="bg-[#1a2232] border border-gray-700 rounded-md px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="-1">✨ Auto: Todas las demás pistas (Bajo + Armonía)</option>
                  {tracks.map((t) => (
                    <option key={`h-${t.index}`} value={t.index}>
                      Pista {t.index + 1}: {t.name} ({t.notesCount} n.)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-gray-300 bg-gray-900/60 p-2.5 rounded border border-gray-800">
              <span className="font-semibold text-amber-300">Pista Única (Piano Solo / Format 0): </span>
              Se aplica división por tesitura en <strong>C4</strong> (mano derecha para melodía con prioridad de nota superior y mano izquierda para acordes / bajo).
            </div>
          )}
        </div>

        {/* 3. Resolución Armónica y Previsualización */}
        <div className="bg-[#0e141f] border border-gray-800 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              3. Resolución Armónica & Previsualización
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setChordResolution(4);
                  runAnalysis(keyTonic, keyScale, melodyTrackIndex, 4);
                }}
                className={`text-[10px] px-2.5 py-1 rounded border transition-all ${
                  chordResolution === 4
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                    : 'bg-[#1a2232] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                1 compás (4 beats)
              </button>
              <button
                type="button"
                onClick={() => {
                  setChordResolution(2);
                  runAnalysis(keyTonic, keyScale, melodyTrackIndex, 2);
                }}
                className={`text-[10px] px-2.5 py-1 rounded border transition-all ${
                  chordResolution === 2
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                    : 'bg-[#1a2232] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                Medio compás (2 beats)
              </button>
              <button
                type="button"
                onClick={() => runAnalysis()}
                disabled={loadingAnalysis}
                className="text-[10px] px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 flex items-center gap-1 ml-1"
                title="Reanalizar con parámetros actuales"
              >
                <span>🔄 Reanalizar</span>
              </button>
            </div>
          </div>

          {/* Carrusel / Fila de Previsualización de Acordes Inferidos */}
          <div className="mt-1">
            <span className="text-[10px] text-gray-400 font-medium block mb-1">
              Acordes inferidos ({previewChords.length} segmentos):
            </span>
            {loadingAnalysis ? (
              <div className="p-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Analizando armonía y estructura musical...</span>
              </div>
            ) : previewChords.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-2 pt-1 max-w-full scrollbar-thin scrollbar-thumb-gray-700">
                {previewChords.slice(0, 16).map((seg, idx) => {
                  const barQuarters = Math.max(1, (timeSignature[0] / timeSignature[1]) * 4);
                  const barNum = 1 + Math.floor((seg.startBeat - 1) / barQuarters);
                  return (
                    <div
                      key={`seg_${seg.startBeat}_${idx}`}
                      className="flex flex-col items-center bg-[#182233] border border-gray-700/80 rounded px-2.5 py-1.5 min-w-[58px] shrink-0 shadow-sm"
                    >
                      <span className="text-[9px] text-cyan-300 font-mono font-medium">M{barNum} · b{seg.startBeat}</span>
                      <span className="text-xs font-bold text-white tracking-tight">{seg.romanNumeral}</span>
                      <span className="text-[10px] text-amber-400 font-medium">{seg.chordSymbol}</span>
                      {seg.isSecondary && (
                        <span className="text-[8px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono mt-0.5">
                          sec
                        </span>
                      )}
                      {seg.isBorrowed && (
                        <span className="text-[8px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono mt-0.5">
                          bor
                        </span>
                      )}
                      {seg.evidenceLevel === 'unknown' && (
                        <span className="text-[8px] px-1 py-0.2 rounded bg-red-500/20 text-red-300 font-mono mt-0.5">
                          ?
                        </span>
                      )}
                    </div>
                  );
                })}
                {previewChords.length > 16 && (
                  <div className="flex items-center justify-center px-2 text-[10px] text-gray-400 shrink-0">
                    +{previewChords.length - 16} más...
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400 p-2 bg-gray-900/40 rounded border border-gray-800 text-center">
                No se detectaron notas de acompañamiento armónico suficientes.
              </div>
            )}
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-800">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || loadingAnalysis}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            {isProcessing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-gray-950 border-t-transparent rounded-full animate-spin"></span>
                <span>Procesando...</span>
              </>
            ) : (
              <span>Confirmar e Importar</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
