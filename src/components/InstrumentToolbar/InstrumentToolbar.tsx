import React from 'react';
import usePlayerStore from '../../store/usePlayerStore';

export default function InstrumentToolbar() {
  const {
    showInstrument,
    setShowInstrument,
    instrumentType,
    setInstrumentType,
    showMelody,
    setShowMelody,
    showChords,
    setShowChords,
    melodyOctaveShift,
    chordsOctaveShift,
    shiftMelodyOctave,
    shiftChordsOctave,
  } = usePlayerStore();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#0c1017] border-t border-gray-800/80 text-xs text-gray-300 select-none shrink-0 z-30">
      {/* Lado izquierdo: Selector de instrumento */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => setShowInstrument(!showInstrument)} 
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#161d27] border border-gray-700/60 hover:bg-[#1e2735] transition-colors text-gray-300 font-medium"
          title={showInstrument ? "Ocultar teclado interactivo" : "Mostrar teclado interactivo"}
        >
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showInstrument ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span>{showInstrument ? "Hide instrument" : "Show instrument"}</span>
        </button>

        <div className="flex items-center rounded-md bg-[#161d27] border border-gray-700/60 p-0.5">
          <button 
            onClick={() => setInstrumentType("piano")}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded transition-colors text-xs ${
              instrumentType === "piano" ? "bg-[#38bdf8] text-gray-950 font-bold shadow-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <span>🎹</span> Piano
          </button>
          <button 
            onClick={() => setInstrumentType("guitar")}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded transition-colors text-xs ${
              instrumentType === "guitar" ? "bg-[#38bdf8] text-gray-950 font-bold shadow-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            <span>🎸</span> Guitar
          </button>
        </div>
      </div>

      {/* Lado derecho: Ajuste de Octavas (±8va) y SHOW Melody / Chords */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Ajuste de Octava (Melodía y Acordes) */}
        <div className="flex items-center gap-3 text-xs select-none">
          {/* Ajuste de Octava de Melodía */}
          <div className="flex items-center gap-1 bg-[#161d27] border border-gray-700/60 rounded-md px-2 py-1">
            <span className="text-gray-400 font-semibold mr-1">Melody Oct:</span>
            <button
              onClick={() => shiftMelodyOctave(-1)}
              disabled={melodyOctaveShift <= -2}
              className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 disabled:opacity-40"
              title="Bajar melodía una octava (-8va)"
            >
              -8va
            </button>
            <span className="font-mono text-cyan-400 font-bold px-1">
              {melodyOctaveShift > 0 ? `+${melodyOctaveShift}` : melodyOctaveShift}
            </span>
            <button
              onClick={() => shiftMelodyOctave(1)}
              disabled={melodyOctaveShift >= 2}
              className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 disabled:opacity-40"
              title="Subir melodía una octava (+8va)"
            >
              +8va
            </button>
          </div>

          {/* Ajuste de Octava de Acordes */}
          <div className="flex items-center gap-1 bg-[#161d27] border border-gray-700/60 rounded-md px-2 py-1">
            <span className="text-gray-400 font-semibold mr-1">Chords Oct:</span>
            <button
              onClick={() => shiftChordsOctave(-1)}
              disabled={chordsOctaveShift <= -2}
              className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 disabled:opacity-40"
              title="Bajar acordes una octava (-8va)"
            >
              -8va
            </button>
            <span className="font-mono text-cyan-400 font-bold px-1">
              {chordsOctaveShift > 0 ? `+${chordsOctaveShift}` : chordsOctaveShift}
            </span>
            <button
              onClick={() => shiftChordsOctave(1)}
              disabled={chordsOctaveShift >= 2}
              className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 active:scale-95 text-gray-200 disabled:opacity-40"
              title="Subir acordes una octava (+8va)"
            >
              +8va
            </button>
          </div>
        </div>

        <div className="hidden sm:block h-4 w-[1px] bg-gray-800" />

        {/* SHOW Melody / Chords */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-gray-400">SHOW</span>

          {/* Toggle Melody */}
          <button
            onClick={() => setShowMelody(!showMelody)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
              showMelody
                ? "bg-[#38bdf8] border-[#38bdf8] text-gray-950 font-bold shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
            }`}
            title={showMelody ? "Ocultar notas de la melodía" : "Mostrar notas de la melodía"}
          >
            {/* Icono de puntos en diagonal */}
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="13" r="1.5" />
              <circle cx="6.5" cy="9.5" r="1.5" />
              <circle cx="10" cy="6.5" r="1.5" />
              <circle cx="13" cy="3" r="1.5" />
            </svg>
            <span>Melody</span>
          </button>

          {/* Toggle Chords */}
          <button
            onClick={() => setShowChords(!showChords)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all ${
              showChords
                ? "bg-[#38bdf8] border-[#38bdf8] text-gray-950 font-bold shadow-[0_0_10px_rgba(56,189,248,0.3)]"
                : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
            }`}
            title={showChords ? "Ocultar bloques de acordes" : "Mostrar bloques de acordes"}
          >
            {/* Icono de bloques horizontales de acorde */}
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="7" width="3.5" height="2" rx="0.5" />
              <rect x="6.5" y="7" width="3.5" height="2" rx="0.5" />
              <rect x="11" y="7" width="3" height="2" rx="0.5" />
            </svg>
            <span>Chords</span>
          </button>
        </div>
      </div>
    </div>
  );
}
