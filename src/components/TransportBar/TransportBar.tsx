import React, { useState, useCallback, useRef, useMemo } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import { playTransport, pauseTransport, stopTransport, seekToBeat } from '../../audio/audioEngine';
import { SCALE_MODES } from '../../utils/musicTheory';
import { getPositionInMeasures } from '../../utils/rhythmEngine';
import TempoSwingPopover from './TempoSwingPopover';
import KeyTransposePopover from './KeyTransposePopover';
import MidiImportModal from './MidiImportModal';
import SectionTabsBar from '../Navigation/SectionTabsBar';
import ImportSectionModal from '../Import/ImportSectionModal';
import { parseMidiToUniversalSong, type MidiParseOptions } from '../../utils/midiImporter';
import { isHookpadJson, parseHookpadJson } from '../../utils/hookpadImporter';
import type { ScaleMode } from '../../types/music';

const MODE_ABBR: Record<string, string> = {
  major: 'maj',
  minor: 'min',
  dorian: 'dor',
  phrygian: 'phr',
  lydian: 'lyd',
  mixolydian: 'mix',
  locrian: 'loc',
  harmonic_minor: 'harm min',
  phrygian_dominant: 'phr dom',
};

export default function TransportBar() {
  const {
    catalog,
    selectedSongId,
    currentSong,
    setSongId,
    addSongToCatalog,
    currentSectionId,
    isPlaying,
    currentBeat,
    bpm,
    loop,
    song,
    showMelody,
    showChords,
    pixelsPerBeat,
    rowHeight,
    currentKey,
    keyMode,
    semitoneOffset,
    swingEnabled,
    swingAmount,
    setSection,
    setPlaying,
    setCurrentBeat,
    setPixelsPerBeat,
    setRowHeight,
    setLoop,
    isSustainActive,
    toggleSustain,
  } = usePlayerStore();

  const [isTempoOpen, setIsTempoOpen] = useState(false);
  const [isKeyOpen, setIsKeyOpen] = useState(false);

  // Estados para importación de archivos y secciones
  const [pendingMidiFile, setPendingMidiFile] = useState<File | null>(null);
  const [isMidiModalOpen, setIsMidiModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importModalJson, setImportModalJson] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeBeat = Math.max(1, Math.min(currentBeat, song.totalBeats));
  const fallbackMeter = useMemo(() => ({
    numerator: song.canonicalMeter?.numerator || song.timeSignature?.[0] || 4,
    denominator: song.canonicalMeter?.denominator || song.timeSignature?.[1] || 4,
  }), [song.canonicalMeter, song.timeSignature]);

  const pos = useMemo(() => {
    return getPositionInMeasures(safeBeat - 1, song.totalBeats, song.meters, fallbackMeter);
  }, [safeBeat, song.totalBeats, song.meters, fallbackMeter]);

  const measure = pos.measureNumber;
  const beatInMeasure = pos.beatInMeasure;
  const totalMeasures = pos.totalMeasures;
  const activeMeter = pos.activeMeter;
  const meterText = song.meters && song.meters.length > 1
    ? `${activeMeter.numerator}/${activeMeter.denominator} (+${song.meters.length - 1})`
    : `${activeMeter.numerator}/${activeMeter.denominator}`;

  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      pauseTransport();
      setPlaying(false);
    } else {
      await playTransport();
      setPlaying(true);
    }
  }, [isPlaying, setPlaying]);

  const handleStop = useCallback(() => {
    stopTransport();
    setPlaying(false);
    setCurrentBeat(1);
    seekToBeat(1);
  }, [setPlaying, setCurrentBeat]);

  // ── Seeking interactivo: arrastrar o pulsar el slider salta al beat exacto ──
  const handleSeek = useCallback((newBeat: number) => {
    const target = Math.max(1, Math.min(newBeat, song.totalBeats));
    setCurrentBeat(target);
    seekToBeat(target);
  }, [song.totalBeats, setCurrentBeat]);

  // ── Listener Global de Portapapeles para Hookpad (Ctrl + V) ──
  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      const clipboardText = e.clipboardData?.getData('text') || '';
      if (isHookpadJson(clipboardText)) {
        e.preventDefault();
        setImportModalJson(clipboardText);
        setIsImportModalOpen(true);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleOpenImportWithClipboard = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && isHookpadJson(text)) {
          setImportModalJson(text);
          setIsImportModalOpen(true);
          return;
        }
      }
    } catch {}

    setImportModalJson('');
    setIsImportModalOpen(true);
  }, []);

  // ── Procesamiento de archivos importados (.json o .mid/.midi) ──
  const handleFileProcess = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
      setPendingMidiFile(file);
      setIsMidiModalOpen(true);
    } else if (lower.endsWith('.json')) {
      try {
        const text = await file.text();
        if (isHookpadJson(text)) {
          setImportModalJson(text);
          setIsImportModalOpen(true);
          return;
        }
        const parsed = JSON.parse(text);
        if (!parsed.sections || !Array.isArray(parsed.sections)) {
          throw new Error('Estructura de canción no válida');
        }
        addSongToCatalog(parsed);
      } catch (err) {
        console.error('Error al importar archivo JSON:', err);
        alert('El archivo .json no contiene una estructura de canción UniversalSong ni Hookpad válida.');
      }
    } else {
      alert('Por favor selecciona un archivo con extensión .mid, .midi o .json');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMidiModalConfirm = async (options: MidiParseOptions) => {
    if (!pendingMidiFile) return;
    const universalSong = await parseMidiToUniversalSong(pendingMidiFile, options);
    addSongToCatalog(universalSong);
  };

  const modeAbbr = MODE_ABBR[keyMode] ?? keyMode.slice(0, 3);
  const keyDisplay = `${currentKey} ${modeAbbr}`;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileProcess(file);
      }}
      className="bg-gray-850 border-b border-gray-700 select-none shadow-md"
      style={{ background: '#131B2E' }}
    >
      {/* ── 1. Barra Superior: Pestañas de Secciones Hooktheory ── */}
      <SectionTabsBar
        onOpenImport={(json) => {
          if (json) {
            setImportModalJson(json);
            setIsImportModalOpen(true);
          } else {
            handleOpenImportWithClipboard();
          }
        }}
        onOpenFileSelect={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,.json"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* ── 2. Barra de Herramientas y Controles de Transporte ── */}
      <div className="px-6 py-3">
        {/* Fila con Título y Artista */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>{song.title}</span>
              <span className="text-xs font-normal text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/50">
                TheoryTab Player
              </span>
            </h1>
            <p className="text-[11px] text-gray-400">
              {song.artist} &middot; Tempo: {bpm} BPM &middot; Tonalidad: {keyDisplay} &middot; Compás {meterText}
            </p>
          </div>
        </div>

        {/* ── Barra de progreso superior interactiva (Seeking con click o arrastre) ── */}
        <div className="mb-3 relative group">
          <input
            type="range"
            min={1}
            max={song.totalBeats}
            step={0.25}
            value={safeBeat}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="w-full h-2.5 bg-gray-700/80 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none transition-all group-hover:h-3"
            title={`Beat ${safeBeat.toFixed(2)} de ${song.totalBeats}`}
          />
          <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1 pointer-events-none">
            <span>Beat 1 (M1)</span>
            <span>Beat {safeBeat.toFixed(1)} / {song.totalBeats}</span>
            <span>Beat {song.totalBeats} (M{totalMeasures})</span>
          </div>
        </div>

        {/* Botones de Transporte y Popovers */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2 select-none">
            {/* 1. Botón Play / Pause */}
            <button
              onClick={handlePlayPause}
              className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-95 flex items-center justify-center text-gray-950 shadow-md transition-all"
              title={isPlaying ? "Pausar" : "Reproducir"}
            >
              {isPlaying ? (
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 2. Botón Stop / Rewind */}
            <button
              onClick={handleStop}
              className="w-8 h-8 rounded-lg bg-[#161d27] border border-gray-700/60 hover:bg-[#1e2735] active:scale-95 flex items-center justify-center text-gray-300 transition-colors"
              title="Detener y volver al inicio"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>

            {/* 3. Botón Loop */}
            <button
              onClick={() => setLoop(!loop)}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                loop
                  ? 'bg-amber-500/20 border-amber-500 text-amber-400 font-bold'
                  : 'bg-[#161d27] border-gray-700/60 text-gray-400 hover:text-white hover:bg-[#1e2735]'
              }`}
              title="Bucle (Loop)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* 4. Botón Pedal de Sustain / Resonancia */}
            <button
              onClick={toggleSustain}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isSustainActive
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                  : "bg-[#161d27] text-gray-400 border border-gray-700/60 hover:text-gray-200"
              }`}
              title="Alternar pedal de sustain / resonancia de piano"
            >
              <span className="text-sm">𝄽</span>
              <span>Sustain</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isSustainActive ? "bg-amber-400" : "bg-gray-600"}`} />
            </button>
          </div>

          {/* Posición M:B, Zoom, Botón KEY y Botón BPM con sus Popovers */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Bar & Beat */}
            <div className="flex items-center gap-2 text-gray-200 text-xs font-mono bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-700 shadow-inner">
              <span className="text-gray-400">BAR</span>
              <span className="text-blue-400 font-bold">{String(measure).padStart(2, '0')}</span>
              <span className="text-gray-600">:</span>
              <span className="text-gray-400">BEAT</span>
              <span className="text-emerald-400 font-bold">{beatInMeasure}</span>
            </div>

            {/* Zoom Horizontal (H) */}
            <div className="flex items-center gap-1 bg-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-700">
              <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mr-0.5">Zoom X</span>
              <button
                onClick={() => setPixelsPerBeat((prev) => Math.max(24, prev - 6))}
                title="Reducir zoom horizontal (24px a 96px)"
                className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs flex items-center justify-center border border-gray-700 active:scale-95"
              >
                -
              </button>
              <button
                onClick={() => setPixelsPerBeat(48)}
                title="Reset zoom horizontal a 48px (por defecto)"
                className="px-1 text-[10px] font-mono text-cyan-400 hover:underline"
              >
                {pixelsPerBeat}px
              </button>
              <button
                onClick={() => setPixelsPerBeat((prev) => Math.min(96, prev + 6))}
                title="Aumentar zoom horizontal (24px a 96px)"
                className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs flex items-center justify-center border border-gray-700 active:scale-95"
              >
                +
              </button>
            </div>

            {/* Zoom Vertical (V) */}
            <div className="flex items-center gap-1 bg-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-700">
              <span className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mr-0.5">Zoom Y</span>
              <button
                onClick={() =>
                  setRowHeight((prev) => {
                    const current = typeof prev === 'number' ? prev : 24;
                    return Math.max(18, current - 2);
                  })
                }
                title="Reducir altura de filas (mínimo 18px)"
                className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs flex items-center justify-center border border-gray-700 active:scale-95"
              >
                -
              </button>
              <button
                onClick={() => setRowHeight((prev) => (prev === 'auto' ? 24 : 'auto'))}
                title="Alternar entre Auto-Fit de altura y tamaño manual (24px)"
                className="px-1 text-[10px] font-mono text-emerald-400 hover:underline"
              >
                {rowHeight === 'auto' ? 'Auto' : `${rowHeight}px`}
              </button>
              <button
                onClick={() =>
                  setRowHeight((prev) => {
                    const current = typeof prev === 'number' ? prev : 24;
                    return Math.min(38, current + 2);
                  })
                }
                title="Aumentar altura de filas (máximo 38px)"
                className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs flex items-center justify-center border border-gray-700 active:scale-95"
              >
                +
              </button>
            </div>

            {/* Botón KEY C maj (Popover de Tonalidad & Transposición) */}
            <div className="relative inline-block">
              <button
                onClick={() => {
                  setIsKeyOpen((prev) => !prev);
                  setIsTempoOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                  isKeyOpen
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-900/50'
                    : 'bg-gray-900 text-gray-200 border-gray-700 hover:bg-gray-800 hover:text-white'
                }`}
                title="Ajustar tonalidad y transposición"
              >
                <span className="text-gray-400 text-[11px] font-sans font-semibold">KEY</span>
                <span className="text-blue-400 font-bold">{keyDisplay}</span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${isKeyOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isKeyOpen && (
                <KeyTransposePopover isOpen={isKeyOpen} onClose={() => setIsKeyOpen(false)} />
              )}
            </div>

            {/* Botón BPM (Popover de Tempo & Swing) */}
            <div className="relative inline-block">
              <button
                onClick={() => {
                  setIsTempoOpen((prev) => !prev);
                  setIsKeyOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                  isTempoOpen
                    ? 'bg-red-950/80 text-white border-red-500 shadow-md shadow-red-950/50'
                    : 'bg-gray-900 text-gray-200 border-gray-700 hover:bg-gray-800 hover:text-white'
                }`}
                title="Ajustar Tempo (BPM) y Swing"
              >
                <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-gray-400 text-[11px] font-sans font-semibold">BPM</span>
                <span className="text-orange-400 font-bold">{bpm}</span>
                {swingEnabled && (
                  <span className="text-[10px] bg-red-900/70 text-red-200 px-1 py-0.2 rounded font-sans font-semibold">
                    Sw {swingAmount}%
                  </span>
                )}
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${isTempoOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isTempoOpen && (
                <TempoSwingPopover isOpen={isTempoOpen} onClose={() => setIsTempoOpen(false)} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Importación MIDI */}
      <MidiImportModal
        file={pendingMidiFile}
        isOpen={isMidiModalOpen}
        onClose={() => {
          setIsMidiModalOpen(false);
          setPendingMidiFile(null);
        }}
        onConfirm={handleMidiModalConfirm}
      />

      {/* Modal de Importación de Secciones de Hookpad */}
      <ImportSectionModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialJson={importModalJson}
      />
    </div>
  );
}
