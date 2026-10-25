import React, { useRef, useEffect } from 'react';
import usePlayerStore from '../../store/usePlayerStore';

interface TempoSwingPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TempoSwingPopover({ isOpen, onClose }: TempoSwingPopoverProps) {
  const {
    bpm,
    setBpm,
    swingAmount,
    swingEnabled,
    swingSubdivision,
    setSwing,
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

  const handleBpmStep = (delta: number) => {
    const next = Math.max(40, Math.min(260, bpm + delta));
    setBpm(next);
  };

  const handleBpmInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (!isNaN(val)) {
      setBpm(Math.max(40, Math.min(260, val)));
    }
  };

  const handleSwingToggle = () => {
    const nextEnabled = !swingEnabled;
    if (nextEnabled) {
      const nextAmount = swingAmount === 0 ? 67 : swingAmount;
      setSwing(true, nextAmount);
    } else {
      setSwing(false, swingAmount);
    }
  };

  const bpmPercent = ((bpm - 40) / (260 - 40)) * 100;
  const swingPercent = Math.max(0, Math.min(100, swingAmount));

  return (
    <>
      {/* Overlay invisible para detectar click exterior y cerrar limpiamente */}
      <div
        className="fixed inset-0 z-40 bg-transparent cursor-default"
        onClick={onClose}
      />

      <div
        ref={popoverRef}
        className="absolute right-0 top-full mt-2 z-50 w-72 bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl p-4 text-gray-200 select-none backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
        style={{
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)',
          backgroundColor: '#161D2F',
        }}
      >
        {/* ── Encabezado ── */}
        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-700/60">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Tempo & Swing
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs p-1 rounded hover:bg-gray-800 transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── 1. Selector de BPM ── */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Tempo</span>
            <span className="font-mono text-white font-bold">{bpm} BPM</span>
          </div>

          {/* Stepper [-] [Input] [+] */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => handleBpmStep(-1)}
              title="Reducir 1 BPM"
              className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold text-lg flex items-center justify-center border border-gray-700 transition-all shadow-sm"
            >
              -
            </button>
            <div className="relative">
              <input
                type="number"
                min={40}
                max={260}
                value={bpm}
                onChange={handleBpmInput}
                className="w-24 h-9 bg-gray-950 border border-gray-700 rounded-lg text-center font-mono text-base font-bold text-white focus:outline-none focus:border-red-500 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <button
              onClick={() => handleBpmStep(1)}
              title="Aumentar 1 BPM"
              className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 active:scale-95 text-white font-bold text-lg flex items-center justify-center border border-gray-700 transition-all shadow-sm"
            >
              +
            </button>
          </div>

          {/* Slider horizontal con barra de progreso roja */}
          <div className="pt-1">
            <input
              type="range"
              min={40}
              max={260}
              step={1}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #EF4444 0%, #EF4444 ${bpmPercent}%, #374151 ${bpmPercent}%, #374151 100%)`,
              }}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
              <span>40</span>
              <span>120</span>
              <span>260</span>
            </div>
          </div>
        </div>

        {/* ── 2. Control de Swing ── */}
        <div className="pt-3 border-t border-gray-700/60 space-y-3">
          {/* Encabezado con Swing X% y switch toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-200">
              Swing {swingEnabled ? swingAmount : 0}%
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={swingEnabled}
              onClick={handleSwingToggle}
              className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                swingEnabled ? 'bg-red-500 shadow-sm shadow-red-900/50' : 'bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  swingEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Selector de subdivisión: [ 1/2 beat | 1/4 beat ] */}
          <div className="space-y-1">
            <label className="text-[11px] text-gray-400 block">Subdivisión:</label>
            <div className="grid grid-cols-2 gap-1.5 bg-gray-950 p-1 rounded-lg border border-gray-800">
              <button
                onClick={() => setSwing(swingEnabled, undefined, '8n')}
                className={`py-1 text-xs font-semibold rounded-md transition-all ${
                  swingSubdivision === '8n'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                1/2 beat (8n)
              </button>
              <button
                onClick={() => setSwing(swingEnabled, undefined, '16n')}
                className={`py-1 text-xs font-semibold rounded-md transition-all ${
                  swingSubdivision === '16n'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                1/4 beat (16n)
              </button>
            </div>
          </div>

          {/* Slider horizontal de Swing con barra de progreso roja */}
          <div className={`space-y-1 ${swingEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={swingAmount}
              onChange={(e) => setSwing(swingEnabled, Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #EF4444 0%, #EF4444 ${swingPercent}%, #374151 ${swingPercent}%, #374151 100%)`,
              }}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] text-gray-500 font-mono">
              <span>0% Straight</span>
              <span>100% Swing</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
