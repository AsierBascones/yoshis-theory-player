import React, { useState, useEffect } from 'react';
import type { ScaleMode } from '../../types/music';
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
  const [chordResolution, setChordResolution] = useState<2 | 4>(4);
  const [melodyTrackIndex, setMelodyTrackIndex] = useState<number>(-1);
  const [harmonyTrackIndex, setHarmonyTrackIndex] = useState<number>(-1);
  const [tracks, setTracks] = useState<MidiTrackInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loadingTracks, setLoadingTracks] = useState<boolean>(false);
  const addSongToCatalog = usePlayerStore((s) => s.addSongToCatalog);

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
      } catch (err) {
        alert('Error al analizar los datos de Hookpad.');
      }
    } else if (manual) {
      alert('El texto pegado no es un JSON válido de Hookpad (debe contener el array "notes" o "chords").');
    }
  };

  useEffect(() => {
    if (!file) {
      setTracks([]);
      return;
    }
    let isMounted = true;
    setLoadingTracks(true);
    inspectMidiTracks(file)
      .then(({ tracks }) => {
        if (!isMounted) return;
        setTracks(tracks);
        // Si hay más de una pista melódica con notas, autoseleccionar candidatos
        const playableTracks = tracks.filter((t) => t.notesCount > 0 && t.channel !== 9);
        if (playableTracks.length >= 2) {
          // Pista más aguda suele ser Lead, la más grave Armonía
          const sorted = [...playableTracks].sort((a, b) => b.avgPitch - a.avgPitch);
          setMelodyTrackIndex(sorted[0].index);
          setHarmonyTrackIndex(sorted[sorted.length - 1].index);
        } else {
          setMelodyTrackIndex(-1);
          setHarmonyTrackIndex(-1);
        }
      })
      .catch((err) => {
        console.error('Error al inspeccionar pistas MIDI:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingTracks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [file]);

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
      <div className="bg-[#121824] border border-gray-700/80 rounded-xl shadow-2xl max-w-lg w-full p-6 text-gray-200 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Importación Inteligente MIDI</h2>
              <p className="text-[11px] text-gray-400 truncate max-w-[280px]" title={file.name}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Banner de acceso rápido para Hookpad */}
        <div className="bg-[#16253b] border border-cyan-500/40 rounded-lg p-2.5 flex items-center justify-between">
          <div className="text-[11px] text-cyan-200">
            <span className="font-bold text-white">¿Datos de Hookpad en el portapapeles?</span>
            <p className="text-gray-400 text-[10px]">Importa acordes y notas directamente sin procesar MIDI</p>
          </div>
          <button
            onClick={handlePasteHookpad}
            type="button"
            className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shrink-0 flex items-center gap-1 shadow-sm active:scale-95"
          >
            <span>📋 Pegar desde Hookpad</span>
          </button>
        </div>

        {/* Formulario */}
        <div className="flex flex-col gap-4 text-xs">
          {/* 1. Tonalidad y Modo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider">
                Tónica (Key)
              </label>
              <select
                value={keyTonic}
                onChange={(e) => setKeyTonic(e.target.value)}
                className="bg-[#1a2232] border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                {TONIC_OPTIONS.map((tonic) => (
                  <option key={tonic} value={tonic}>
                    {tonic}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider">
                Modo (Scale)
              </label>
              <select
                value={keyScale}
                onChange={(e) => setKeyScale(e.target.value as ScaleMode)}
                className="bg-[#1a2232] border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="major">Mayor (Jónico)</option>
                <option value="minor">Menor (Eólico)</option>
                <option value="mixolydian">Mixolidio</option>
                <option value="dorian">Dórico</option>
              </select>
            </div>
          </div>

          {/* 2. Selección de Pistas (si contiene más de una) */}
          {hasMultipleTracks ? (
            <div className="bg-[#0e141f] border border-gray-800 rounded-lg p-3 flex flex-col gap-3">
              <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
                Separación de Pistas MIDI
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[10px] font-medium">Pista Melodía (Lead):</label>
                  <select
                    value={melodyTrackIndex}
                    onChange={(e) => setMelodyTrackIndex(parseInt(e.target.value, 10))}
                    className="bg-[#1a2232] border border-gray-700 rounded-md px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="-1">✨ Auto (Separar tesitura ≥ C4)</option>
                    {tracks.map((t) => (
                      <option key={`m-${t.index}`} value={t.index}>
                        Pista {t.index + 1}: {t.name} ({t.notesCount} n.)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-gray-400 text-[10px] font-medium">Pista Armonía / Bajo:</label>
                  <select
                    value={harmonyTrackIndex}
                    onChange={(e) => setHarmonyTrackIndex(parseInt(e.target.value, 10))}
                    className="bg-[#1a2232] border border-gray-700 rounded-md px-2 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="-1">✨ Auto (Separar tesitura &lt; C4)</option>
                    {tracks.map((t) => (
                      <option key={`h-${t.index}`} value={t.index}>
                        Pista {t.index + 1}: {t.name} ({t.notesCount} n.)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#0e141f] border border-gray-800/80 rounded-lg p-3 text-[11px] text-gray-300 flex items-start gap-2">
              <span className="text-amber-400 text-base leading-none">ℹ</span>
              <div>
                <p className="font-semibold text-gray-200">Pieza de Piano Solista detectada (Pista Única):</p>
                <p className="text-gray-400 text-[10px] mt-0.5">
                  Se aplicará punto de corte inteligente en <strong>C4</strong> (mano derecha para melodía con prioridad de nota aguda y mano izquierda para bajo / acordes).
                </p>
              </div>
            </div>
          )}

          {/* 3. Resolución Armónica de Acordes */}
          <div className="flex flex-col gap-1.5 bg-[#0e141f] border border-gray-800 rounded-lg p-3">
            <label className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider">
              Resolución de Acordes (Barra CHORD)
            </label>
            <p className="text-gray-400 text-[10px] leading-tight mb-1">
              Consolida las notas del bajo y acompañamiento para evitar micro-acordes caóticos de corchea:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChordResolution(4)}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  chordResolution === 4
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-[#1a2232] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>1 compás entero (4 beats)</span>
              </button>
              <button
                type="button"
                onClick={() => setChordResolution(2)}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  chordResolution === 2
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                    : 'bg-[#1a2232] border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>Medio compás (2 beats)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Acciones */}
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
            disabled={isProcessing || loadingTracks}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-gray-950 font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            {isProcessing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-gray-950 border-t-transparent rounded-full animate-spin"></span>
                <span>Procesando...</span>
              </>
            ) : (
              <span>Convertir e Importar</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
