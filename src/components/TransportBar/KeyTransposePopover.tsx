import React, { useRef, useEffect } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import { CIRCLE_OF_FIFTHS, SCALE_MODES, type KeyName } from '../../utils/musicTheory';

interface KeyTransposePopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyTransposePopover({ isOpen, onClose }: KeyTransposePopoverProps) {
  const {
    currentKey,
    keyMode,
    semitoneOffset,
    transposeMode,
    transposeScope,
    setKey,
    setTransposeOptions,
  } = usePlayerStore();

  const popoverRef = useRef<HTMLDivElement>(null);

  // Cerrar al pulsar Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectKey = (key: KeyName) => {
    setKey(key, keyMode);
    onClose(); // Cierra el menú tras seleccionar la tonalidad
  };

  const handleModeChange = (mode: string) => {
    setKey(currentKey, mode);
  };

  // Parámetros geométricos para el Círculo de Quintas
  const wheelSize = 230;
  const cx = wheelSize / 2;
  const cy = wheelSize / 2;
  const radius = 82;
  const buttonSize = 34;

  const currentModeDef = SCALE_MODES[keyMode] ?? SCALE_MODES['major'];

  return (
    <>
      {/* Overlay invisible para detectar click exterior y cerrar limpiamente */}
      <div
        className="fixed inset-0 z-40 bg-transparent cursor-default"
        onClick={onClose}
      />

      <div
        ref={popoverRef}
        className="absolute right-0 top-full mt-2 z-50 w-80 bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl p-4 text-gray-200 select-none backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
        style={{
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)',
          backgroundColor: '#161D2F',
        }}
      >
        {/* ── Encabezado ── */}
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-gray-700/60">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m0 10v4m9-9h-4M7 12H3" />
            </svg>
            Key & Modality
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs p-1 rounded hover:bg-gray-800 transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── 1. Rueda Interactiva: Círculo de Quintas (12 Tonalidades) ── */}
        <div className="flex justify-center my-1">
          <div
            className="relative rounded-full border border-gray-700/60 bg-gray-950/70 shadow-inner"
            style={{ width: wheelSize, height: wheelSize }}
          >
            {/* Centro del Círculo con Información de la Tonalidad y Modo Activo */}
            <div
              className="absolute rounded-full bg-gray-900 border border-gray-700 flex flex-col items-center justify-center shadow-lg pointer-events-none px-1 text-center"
              style={{
                width: 82,
                height: 82,
                left: cx - 41,
                top: cy - 41,
              }}
            >
              <span className="text-lg font-bold text-white tracking-tight leading-none">
                {currentKey}
              </span>
              <span className="text-[9px] text-blue-400 font-semibold uppercase mt-0.5 truncate max-w-[70px]">
                {currentModeDef.name.split(' ')[0]}
              </span>
              <span className="text-[9px] text-gray-400 font-mono mt-0.5">
                {semitoneOffset === 0 ? 'Original' : `${semitoneOffset > 0 ? '+' : ''}${semitoneOffset} st`}
              </span>
            </div>

            {/* 12 Botones de Tonalidad ordenados por Quintas */}
            {CIRCLE_OF_FIFTHS.map((k, index) => {
              const angleDeg = index * 30 - 90; // C a las 12h
              const angleRad = (angleDeg * Math.PI) / 180;
              const x = cx + radius * Math.cos(angleRad) - buttonSize / 2;
              const y = cy + radius * Math.sin(angleRad) - buttonSize / 2;
              const isActive = currentKey === k;

              return (
                <button
                  key={k}
                  onClick={() => handleSelectKey(k)}
                  title={`Seleccionar tonalidad ${k}`}
                  className={`absolute rounded-full flex items-center justify-center text-xs font-bold transition-all duration-150 select-none active:scale-90 ${
                    isActive
                      ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-md shadow-blue-900/80 scale-110 z-10'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'
                  }`}
                  style={{
                    width: buttonSize,
                    height: buttonSize,
                    left: x,
                    top: y,
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 2. Selectores Inferiores: Modo/Escala Completa, Preservación y Ámbito ── */}
        <div className="pt-3 border-t border-gray-700/60 space-y-2.5">
          {/* Desplegable Completo de Modos y Escalas Hooktheory */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] text-gray-400 font-semibold whitespace-nowrap">
              Modo / Escala:
            </label>
            <select
              value={keyMode}
              onChange={(e) => handleModeChange(e.target.value)}
              className="bg-gray-950 text-white text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer w-44 shadow-inner"
            >
              <optgroup label="Modos Diatónicos (Griegos)" className="bg-gray-900 text-blue-300 font-bold">
                <option value="major" className="bg-gray-950 text-white font-normal">Mayor (Jónico)</option>
                <option value="dorian" className="bg-gray-950 text-white font-normal">Dórico</option>
                <option value="phrygian" className="bg-gray-950 text-white font-normal">Frigio</option>
                <option value="lydian" className="bg-gray-950 text-white font-normal">Lidio</option>
                <option value="mixolydian" className="bg-gray-950 text-white font-normal">Mixolidio</option>
                <option value="minor" className="bg-gray-950 text-white font-normal">Menor (Eólico)</option>
                <option value="locrian" className="bg-gray-950 text-white font-normal">Locrio</option>
              </optgroup>
              <optgroup label="Modos Derivados Frecuentes" className="bg-gray-900 text-amber-300 font-bold">
                <option value="harmonic_minor" className="bg-gray-950 text-white font-normal">Menor Armónica</option>
                <option value="phrygian_dominant" className="bg-gray-950 text-white font-normal">Frigio Dominante</option>
              </optgroup>
            </select>
          </div>

          {/* Preservación de grados [ Parallel | Relative ] */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] text-gray-400 font-semibold">Mutación:</span>
              <span className="text-[9px] text-gray-500">grados relativos</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 w-44 bg-gray-950 p-1 rounded-lg border border-gray-800">
              <button
                onClick={() => setTransposeOptions({ transposeMode: 'parallel' })}
                className={`py-1 text-xs font-semibold rounded-md transition-all ${
                  transposeMode === 'parallel'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="Parallel mutation (preserve base scale degrees)"
              >
                Parallel
              </button>
              <button
                onClick={() => setTransposeOptions({ transposeMode: 'relative' })}
                className={`py-1 text-xs font-semibold rounded-md transition-all ${
                  transposeMode === 'relative'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="Preserve scale degrees (TheoryTab invariant)"
              >
                Relative
              </button>
            </div>
          </div>

          {/* Ámbito [ Current position | Whole song ] */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400 font-semibold">Ámbito:</span>
            <div className="grid grid-cols-2 gap-1.5 w-44 bg-gray-950 p-1 rounded-lg border border-gray-800">
              <button
                onClick={() => setTransposeOptions({ transposeScope: 'current' })}
                className={`py-1 text-[11px] font-semibold rounded-md transition-all ${
                  transposeScope === 'current'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                Current
              </button>
              <button
                onClick={() => setTransposeOptions({ transposeScope: 'song' })}
                className={`py-1 text-[11px] font-semibold rounded-md transition-all ${
                  transposeScope === 'song'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                Whole song
              </button>
            </div>
          </div>

          {/* Botón de Reset si está transpuesta o no está en C Mayor */}
          {(semitoneOffset !== 0 || keyMode !== 'major') && (
            <div className="pt-1 flex justify-end">
              <button
                onClick={() => {
                  setKey('C', 'major');
                  onClose();
                }}
                className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-mono"
              >
                <span>↺</span> Reestablecer a C Mayor (Original)
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
