import React, { useState, useRef } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import type { SectionType } from '../../types/music';

interface SectionTabsBarProps {
  onOpenImport: (initialJson?: string) => void;
  onOpenFileSelect?: () => void;
}

const SECTION_ICONS: Record<SectionType, string> = {
  intro: '🎵',
  verse: '📖',
  'pre-chorus': '⚡',
  chorus: '🔥',
  bridge: '🌉',
  outro: '🏁',
  solo: '🎸',
  custom: '✨',
};

function getSectionIcon(type?: SectionType, name: string = ''): string {
  if (type && SECTION_ICONS[type]) return SECTION_ICONS[type];
  const lower = name.toLowerCase();
  if (lower.includes('intro')) return '🎵';
  if (lower.includes('pre-chorus') || lower.includes('prechorus')) return '⚡';
  if (lower.includes('chorus') || lower.includes('estribillo')) return '🔥';
  if (lower.includes('verse') || lower.includes('verso')) return '📖';
  if (lower.includes('bridge') || lower.includes('puente')) return '🌉';
  if (lower.includes('outro') || lower.includes('final')) return '🏁';
  if (lower.includes('solo')) return '🎸';
  return '🎼';
}

export default function SectionTabsBar({ onOpenImport, onOpenFileSelect }: SectionTabsBarProps) {
  const {
    catalog,
    selectedSongId,
    currentSong,
    currentSectionId,
    setSongId,
    switchSection,
    updateSection,
    deleteSection,
    song,
  } = usePlayerStore();

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const startEditing = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSectionId(id);
    setEditingName(currentName);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const handleFinishEditing = () => {
    if (editingSectionId) {
      const trimmed = editingName.trim();
      if (trimmed) {
        updateSection(editingSectionId, { name: trimmed });
      }
      setEditingSectionId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishEditing();
    } else if (e.key === 'Escape') {
      setEditingSectionId(null);
    }
  };

  const handleDelete = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSong.sections.length <= 1) {
      alert('La canción debe tener al menos una sección.');
      return;
    }
    if (window.confirm(`¿Seguro que deseas eliminar la sección "${name}"?`)) {
      deleteSection(id);
    }
  };

  const totalMeasures = Math.ceil(song.totalBeats / (song.timeSignature[0] || 4));

  return (
    <div className="bg-[#101726] border-b border-gray-700/70 select-none shadow-md px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      {/* ── 1. Selector de Canción del Catálogo y Botones de Importación ── */}
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={selectedSongId}
          onChange={(e) => setSongId(e.target.value)}
          className="bg-[#182338] text-white border border-gray-600/80 hover:border-cyan-400 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none cursor-pointer transition-colors max-w-[200px] truncate shadow-inner"
          title="Seleccionar canción del catálogo universal"
        >
          {catalog.map((s) => (
            <option key={s.id} value={s.id}>
              🎵 {s.title}
            </option>
          ))}
        </select>

        {onOpenFileSelect && (
          <button
            onClick={onOpenFileSelect}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1a2538] border border-gray-600/70 hover:bg-[#22324c] hover:border-amber-400 text-amber-300 font-semibold text-xs transition-all active:scale-95 shadow-sm"
            title="Importar archivo .mid (MIDI) o .json (Hookpad/UniversalSong)"
          >
            <span>📂</span>
            <span className="hidden sm:inline">Importar</span>
          </button>
        )}

        <button
          onClick={() => onOpenImport()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#14263d] border border-cyan-500/60 hover:bg-[#1a3454] hover:border-cyan-400 text-cyan-300 font-semibold text-xs transition-all active:scale-95 shadow-sm"
          title="Pegar clip copiado desde Hookpad (Ctrl + V / JSON)"
        >
          <span>📋</span>
          <span className="hidden sm:inline">Pegar Hookpad</span>
        </button>
      </div>

      {/* ── 2. Pestañas de Secciones (Estilo Hooktheory) ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full scrollbar-thin scrollbar-thumb-gray-700">
        <span className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mr-1 flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          SECTIONS:
        </span>

        {currentSong.sections.map((sec) => {
          const isSelected = currentSectionId === sec.id;
          const isEditing = editingSectionId === sec.id;
          const icon = getSectionIcon(sec.type, sec.name);
          const barCount = sec.totalMeasures || sec.totalBars || 4;

          if (isEditing) {
            return (
              <div
                key={sec.id}
                className="flex items-center gap-1 bg-[#1c2940] border border-cyan-400 rounded-xl px-2 py-1 shadow-lg shrink-0"
              >
                <span className="text-xs">{icon}</span>
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleFinishEditing}
                  onKeyDown={handleKeyDown}
                  className="bg-transparent text-white text-xs font-bold w-24 outline-none border-b border-cyan-400"
                  autoFocus
                />
              </div>
            );
          }

          return (
            <div
              key={sec.id}
              onClick={() => switchSection(sec.id)}
              onDoubleClick={(e) => startEditing(sec.id, sec.name, e)}
              className={`group relative flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all duration-150 border shrink-0 ${
                isSelected
                  ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-200 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/50 scale-[1.02]'
                  : 'bg-[#141c2c] text-gray-300 border-gray-700/80 hover:bg-[#1a253a] hover:text-white hover:border-gray-600'
              }`}
              title={`Doble clic para renombrar "${sec.name}"`}
            >
              <span className="text-xs">{icon}</span>
              <span className="truncate max-w-[120px]">{sec.name}</span>
              <span
                className={`text-[10px] font-mono px-1 rounded ${
                  isSelected ? 'bg-cyan-900/60 text-cyan-300' : 'bg-gray-800 text-gray-400'
                }`}
              >
                {barCount}m
              </span>

              {/* Botón de renombrar (lápiz al hacer hover) */}
              <button
                type="button"
                onClick={(e) => startEditing(sec.id, sec.name, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-cyan-300 text-gray-400 p-0.5 transition-opacity"
                title="Renombrar sección"
              >
                ✎
              </button>

              {/* Botón de eliminar (✕) */}
              {currentSong.sections.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(sec.id, sec.name, e)}
                  className="opacity-0 group-hover:opacity-100 hover:bg-rose-900/60 hover:text-rose-300 text-gray-400 rounded-full w-4 h-4 flex items-center justify-center transition-opacity ml-0.5"
                  title={`Eliminar sección "${sec.name}"`}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        {/* ── Botón Rápido [+] para Añadir / Importar Otra Sección ── */}
        <button
          onClick={() => onOpenImport()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#142338] border border-cyan-500/50 hover:bg-cyan-500/20 hover:border-cyan-400 text-cyan-300 text-xs font-bold transition-all active:scale-95 shadow-sm shrink-0"
          title="Añadir o importar otra sección desde el portapapeles"
        >
          <span className="text-sm font-bold">+</span>
          <span className="hidden md:inline">Sección</span>
        </button>
      </div>

      {/* ── 3. Metadatos de la Sección Activa (Beats & Compases) ── */}
      <div className="flex items-center gap-2 text-xs font-mono text-gray-400 shrink-0">
        <span className="bg-[#141c2c] px-2.5 py-1 rounded-lg border border-gray-700/70 text-gray-300 font-semibold shadow-inner">
          {song.totalBeats} Beats ({totalMeasures} Compases)
        </span>
      </div>
    </div>
  );
}
