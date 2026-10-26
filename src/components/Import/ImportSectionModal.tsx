import React, { useState, useEffect, useMemo } from 'react';
import usePlayerStore from '../../store/usePlayerStore';
import { isHookpadJson, parseHookpadSection, inferSectionTypeFromName } from '../../utils/hookpadImporter';
import type { SectionType } from '../../types/music';

export interface ImportSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialJson?: string;
}

const SECTION_TYPE_CONFIG: { type: SectionType; label: string; icon: string; color: string }[] = [
  { type: 'intro', label: 'Intro', icon: '🎵', color: 'from-blue-600 to-indigo-600' },
  { type: 'verse', label: 'Verse', icon: '📖', color: 'from-emerald-600 to-teal-600' },
  { type: 'pre-chorus', label: 'Pre-Chorus', icon: '⚡', color: 'from-amber-600 to-orange-600' },
  { type: 'chorus', label: 'Chorus', icon: '🔥', color: 'from-rose-600 to-pink-600' },
  { type: 'bridge', label: 'Bridge', icon: '🌉', color: 'from-purple-600 to-violet-600' },
  { type: 'outro', label: 'Outro', icon: '🏁', color: 'from-cyan-600 to-sky-600' },
  { type: 'solo', label: 'Solo', icon: '🎸', color: 'from-yellow-600 to-amber-600' },
  { type: 'custom', label: 'Custom', icon: '✨', color: 'from-gray-600 to-slate-600' },
];

export default function ImportSectionModal({ isOpen, onClose, initialJson = '' }: ImportSectionModalProps) {
  const { currentSong, currentSectionId, addSection, updateSection, setSongKey } = usePlayerStore();
  const currentSection = currentSong.sections.find((s) => s.id === currentSectionId) || currentSong.sections[0];

  const [rawJson, setRawJson] = useState<string>('');
  const [sectionType, setSectionType] = useState<SectionType>('verse');
  const [sectionName, setSectionName] = useState<string>('Verse 1');
  const [destination, setDestination] = useState<'add' | 'overwrite'>('add');
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState<boolean>(false);

  // Generador de sugerencia inteligente de nombres según las secciones existentes
  const getSmartSuggestedName = (type: SectionType): string => {
    const config = SECTION_TYPE_CONFIG.find((c) => c.type === type);
    const baseLabel = config?.label || 'Section';

    if (type === 'intro') {
      const hasIntro = currentSong.sections.some((s) => s.type === 'intro' || s.name.toLowerCase().includes('intro'));
      return hasIntro ? 'Intro 2' : 'Intro';
    }
    if (type === 'outro') {
      const hasOutro = currentSong.sections.some((s) => s.type === 'outro' || s.name.toLowerCase().includes('outro'));
      return hasOutro ? 'Outro 2' : 'Outro';
    }

    // Contar cuántas secciones de este tipo existen ya
    const existingCount = currentSong.sections.filter(
      (s) => s.type === type || s.name.toLowerCase().startsWith(baseLabel.toLowerCase())
    ).length;

    return `${baseLabel} ${existingCount + 1}`;
  };

  // Inicializar estado cuando se abre el modal o cambia initialJson
  useEffect(() => {
    if (!isOpen) return;

    const initialText = initialJson.trim();
    setRawJson(initialText);
    setDestination('add');
    setIsNameManuallyEdited(false);

    if (initialText && isHookpadJson(initialText)) {
      try {
        const parsed = JSON.parse(initialText);
        const inferredName = parsed.title || parsed.sectionName || parsed.name || '';
        const inferredType = inferredName ? inferSectionTypeFromName(inferredName) : 'verse';
        setSectionType(inferredType);
        setSectionName(inferredName || getSmartSuggestedName(inferredType));
      } catch {
        const defaultType: SectionType = 'verse';
        setSectionType(defaultType);
        setSectionName(getSmartSuggestedName(defaultType));
      }
    } else {
      const defaultType: SectionType = 'verse';
      setSectionType(defaultType);
      setSectionName(getSmartSuggestedName(defaultType));
    }
  }, [isOpen, initialJson]);

  // Selección de tipo de sección y actualización automática del nombre si no ha sido editado a mano
  const handleSelectType = (type: SectionType) => {
    setSectionType(type);
    if (!isNameManuallyEdited) {
      setSectionName(getSmartSuggestedName(type));
    }
  };

  // Validación y parseo previo para la tarjeta de previsualización
  const parsedPreview = useMemo(() => {
    if (!rawJson.trim()) return null;
    try {
      const parsedJson = JSON.parse(rawJson.trim());
      const modernPayload = parsedJson.modern?.payload || parsedJson.payload;
      const hasModern = Boolean(
        modernPayload && (Array.isArray(modernPayload.notes) || Array.isArray(modernPayload.chords))
      );
      const dataSource = hasModern ? modernPayload : parsedJson;

      const rawNotes = Array.isArray(dataSource.notes) ? dataSource.notes : [];
      const rawChords = Array.isArray(dataSource.chords) ? dataSource.chords : [];

      const notesCount = rawNotes.filter((n: any) => !n.isRest && !n.rest).length;
      const chordsCount = rawChords.filter(
        (c: any) => !c.isRest && !c.rest && c.root !== 'rest' && c.root !== 0 && c.root !== '0' && c.root !== null
      ).length;
      const isValid = notesCount > 0 || chordsCount > 0;

      if (!isValid) return null;

      try {
        const sec = parseHookpadSection(rawJson, {
          name: sectionName,
          type: sectionType,
          defaultBpm: currentSong.bpm,
        });
        const meterUnit = sec.meter?.beatUnit || 4;
        const meterLabel = sec.meters && sec.meters.length > 1
          ? `${sec.beatsPerBar}/${meterUnit} (+${sec.meters.length - 1})`
          : `${sec.beatsPerBar}/${meterUnit}`;

        return {
          valid: true,
          beats: sec.totalBars * sec.beatsPerBar,
          bars: sec.totalBars,
          meter: meterLabel,
          bpm: sec.bpm || currentSong.bpm,
          key: `${sec.key.tonic} ${sec.key.scale}`,
          notesCount: sec.melody.length || notesCount,
          chordsCount: sec.chords.length || chordsCount,
        };
      } catch {
        const meter = parsedJson.meter || parsedJson.modern?.payload?.meter || [4, 4];
        const beatsPerBar = Array.isArray(meter) ? meter[0] || 4 : 4;
        const beatUnit = Array.isArray(meter) ? meter[1] || 4 : 4;
        const keyTonic = parsedJson.key?.tonic || parsedJson.modern?.payload?.key?.tonic || 'C';
        const keyScale = parsedJson.key?.scale || parsedJson.modern?.payload?.key?.scale || 'major';
        const bpm = parsedJson.bpm || parsedJson.modern?.payload?.bpm || currentSong.bpm || 120;
        return {
          valid: true,
          beats: 16,
          bars: 4,
          meter: `${beatsPerBar}/${beatUnit}`,
          bpm,
          key: `${keyTonic} ${keyScale}`,
          notesCount,
          chordsCount,
        };
      }
    } catch (e) {
      return { valid: false, error: (e as Error).message };
    }
  }, [rawJson, sectionName, sectionType, currentSong.bpm]);

  if (!isOpen) return null;

  const handleImport = () => {
    if (!parsedPreview?.valid) return;

    try {
      const newSection = parseHookpadSection(rawJson, {
        name: sectionName.trim() || 'Section',
        type: sectionType,
        defaultBpm: currentSong.bpm,
      });

      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(rawJson.trim());
      } catch {}
      const detectedKey = parsedJson?.keys?.[0] || parsedJson?.modern?.payload?.keys?.[0] || newSection.key;
      const tonic = detectedKey?.tonic || newSection.key?.tonic || "C";
      const scale = detectedKey?.scale || newSection.key?.scale || "major";

      if (destination === 'add') {
        addSection(newSection);
      } else {
        updateSection(currentSectionId, {
          name: newSection.name,
          type: newSection.type,
          melody: newSection.melody,
          notes: newSection.melody,
          chords: newSection.chords,
          totalBars: newSection.totalBars,
          totalMeasures: newSection.totalBars,
          key: newSection.key,
          bpm: newSection.bpm,
          beatsPerBar: newSection.beatsPerBar,
          timeSignature: newSection.timeSignature,
          canonicalMeter: newSection.canonicalMeter,
          meter: newSection.meter,
          meters: newSection.meters,
          hasExplicitMeters: newSection.hasExplicitMeters,
        });
      }

      // Asignar obligatoriamente al estado del reproductor:
      setSongKey({ tonic, scale });

      onClose();
    } catch (err) {
      alert(`Error al importar sección: ${(err as Error).message}`);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setRawJson(text);
          if (isHookpadJson(text)) {
            try {
              const parsed = JSON.parse(text);
              const inferredName = parsed.title || parsed.sectionName || parsed.name || '';
              if (inferredName) {
                const inferredType = inferSectionTypeFromName(inferredName);
                setSectionType(inferredType);
                setSectionName(inferredName);
                setIsNameManuallyEdited(true);
              }
            } catch {}
          }
        }
      }
    } catch {
      alert('Por favor pega el JSON directamente en el campo de texto.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-xl bg-[#111827] border border-gray-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-gray-200 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Encabezado del Modal ── */}
        <div className="px-6 py-4 bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 border-b border-gray-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 text-lg shadow-sm">
              📋
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Importar Sección de Hookpad
              </h2>
              <p className="text-xs text-gray-400">
                Pega el código copiado de Hooktheory (Ctrl + C) para añadirlo a tu proyecto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── Contenido Principal ── */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[75vh]">
          {/* 1. Selector de Tipo de Sección (Pills) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Tipo de Sección</span>
              <span className="text-[10px] text-gray-400 font-normal lowercase">(determina etiqueta y color)</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SECTION_TYPE_CONFIG.map((c) => {
                const isSelected = sectionType === c.type;
                return (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => handleSelectType(c.type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                      isSelected
                        ? 'bg-gradient-to-r ' + c.color + ' text-white border-transparent shadow-md scale-[1.02]'
                        : 'bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-750 hover:border-gray-600'
                    }`}
                  >
                    <span className="text-sm">{c.icon}</span>
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Nombre de la Sección */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center justify-between">
              <span>Nombre de la Sección</span>
              <span className="text-[11px] text-cyan-400 font-normal">Sugerencia inteligente activa</span>
            </label>
            <input
              type="text"
              value={sectionName}
              onChange={(e) => {
                setSectionName(e.target.value);
                setIsNameManuallyEdited(true);
              }}
              placeholder="Ej: Intro, Verse 1, Chorus..."
              className="w-full bg-[#162030] border border-gray-700 rounded-xl px-3.5 py-2.5 text-white font-medium text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all shadow-inner"
            />
          </div>

          {/* 3. Destino de la Importación */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Destino
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  destination === 'add'
                    ? 'bg-cyan-950/40 border-cyan-500/80 text-white shadow-sm ring-1 ring-cyan-500/40'
                    : 'bg-gray-800/60 border-gray-700/80 text-gray-400 hover:bg-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name="destination"
                  value="add"
                  checked={destination === 'add'}
                  onChange={() => setDestination('add')}
                  className="mt-0.5 text-cyan-500 focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-xs text-cyan-200 flex items-center gap-1.5">
                    <span>➕</span> Añadir como nueva sección
                  </span>
                  <span className="text-[11px] text-gray-400 mt-0.5">
                    Se creará una nueva pestaña en el proyecto manteniendo las demás
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  destination === 'overwrite'
                    ? 'bg-amber-950/40 border-amber-500/80 text-white shadow-sm ring-1 ring-amber-500/40'
                    : 'bg-gray-800/60 border-gray-700/80 text-gray-400 hover:bg-gray-800'
                }`}
              >
                <input
                  type="radio"
                  name="destination"
                  value="overwrite"
                  checked={destination === 'overwrite'}
                  onChange={() => setDestination('overwrite')}
                  className="mt-0.5 text-amber-500 focus:ring-0"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-xs text-amber-300 flex items-center gap-1.5">
                    <span>🔄</span> Sobrescribir sección actual
                  </span>
                  <span className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[170px]" title={currentSection.name}>
                    Reemplazará &quot;{currentSection.name}&quot;
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 4. Campo de Pegado de JSON */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Datos JSON de Hookpad
              </label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold hover:underline"
              >
                <span>📋</span> Pegar portapapeles
              </button>
            </div>
            <textarea
              rows={3}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              placeholder="Pega aquí el JSON de Hookpad (ej: { 'notes': [...], 'chords': [...] })"
              className="w-full bg-[#0d121c] border border-gray-700/80 rounded-xl p-3 font-mono text-xs text-gray-300 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-none shadow-inner"
            />
          </div>

          {/* 5. Previsualización / Estado del JSON */}
          {parsedPreview && (
            <div className="p-3.5 rounded-xl bg-gray-900/90 border border-gray-700/80 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Previsualización de la Sección
                </span>
                <span className="text-emerald-400 font-mono text-[11px] font-bold">
                  ✓ JSON Válido
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono pt-1">
                <div className="bg-gray-800/80 p-2 rounded-lg border border-gray-700/50">
                  <div className="text-gray-400 text-[10px]">COMPASES</div>
                  <div className="text-white font-bold">{parsedPreview.bars}m ({parsedPreview.beats}b)</div>
                </div>
                <div className="bg-gray-800/80 p-2 rounded-lg border border-gray-700/50">
                  <div className="text-gray-400 text-[10px]">TONALIDAD</div>
                  <div className="text-cyan-300 font-bold truncate">{parsedPreview.key}</div>
                </div>
                <div className="bg-gray-800/80 p-2 rounded-lg border border-gray-700/50">
                  <div className="text-gray-400 text-[10px]">MELODÍA</div>
                  <div className="text-amber-300 font-bold">{parsedPreview.notesCount} notas</div>
                </div>
                <div className="bg-gray-800/80 p-2 rounded-lg border border-gray-700/50">
                  <div className="text-gray-400 text-[10px]">ACORDES</div>
                  <div className="text-indigo-300 font-bold">{parsedPreview.chordsCount} acordes</div>
                </div>
              </div>
            </div>
          )}

          {rawJson.trim() && !parsedPreview && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
              <span>⚠️</span> El texto pegado no es un JSON válido de Hookpad (debe contener notas o acordes).
            </div>
          )}
        </div>

        {/* ── Pie de Acción del Modal ── */}
        <div className="px-6 py-4 bg-gray-900 border-t border-gray-700/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!parsedPreview?.valid}
            onClick={handleImport}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${
              parsedPreview?.valid
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-950/50 active:scale-95'
                : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
            }`}
          >
            <span>📥</span>
            <span>Importar Sección</span>
          </button>
        </div>
      </div>
    </div>
  );
}
