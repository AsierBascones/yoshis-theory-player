import React, { useEffect, useRef, useState } from 'react';
import usePlayerStore from './store/usePlayerStore';
import { initAudio, setupSong, disposeAudio, playTransport, pauseTransport } from './audio/audioEngine';
import TransportBar from './components/TransportBar/TransportBar';
import PianoRoll from './components/PianoRoll/PianoRoll';
import InstrumentToolbar from './components/InstrumentToolbar/InstrumentToolbar';
import VirtualPiano from './components/VirtualPiano/VirtualPiano';
import GuitarFretboard from './components/GuitarFretboard/GuitarFretboard';
import type { MusicData } from './utils/theoryParser';

export default function App() {
  const {
    song,
    parsedNotes,
    showInstrument,
    setShowInstrument,
    instrumentType,
    setCurrentBeat,
    setActiveNotes,
    setActiveChordNotes,
    setPlaying,
  } = usePlayerStore();

  const activeNotesRef = useRef<Set<number>>(new Set());

  // ── Estado y lógica para el Divisor Redimensionable (Vertical Splitter) ──
  const [instrumentHeight, setInstrumentHeight] = useState<number>(230);
  const isDraggingRef = useRef<boolean>(false);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(instrumentHeight);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = instrumentHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaY = e.clientY - startYRef.current;
    if (!showInstrument && deltaY < -10) {
      setShowInstrument(true);
    }
    const newHeight = startHeightRef.current - deltaY;
    const minHeight = 90;
    const maxHeight = Math.floor(window.innerHeight * 0.6);
    setInstrumentHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    isDraggingRef.current = true;
    startYRef.current = e.touches[0].clientY;
    startHeightRef.current = instrumentHeight;
    document.body.style.userSelect = 'none';

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length === 0) return;
    e.preventDefault();
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (!showInstrument && deltaY < -10) {
      setShowInstrument(true);
    }
    const newHeight = startHeightRef.current - deltaY;
    const minHeight = 90;
    const maxHeight = Math.floor(window.innerHeight * 0.6);
    setInstrumentHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    document.body.style.userSelect = '';
    window.removeEventListener('touchmove', handleTouchMove);
    window.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('touchcancel', handleTouchEnd);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  // ── Atajos Globales de Teclado (Enter y Space para alternar Play/Pause) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Filtrar solo las teclas del atajo (Enter o Space)
      if (e.key !== 'Enter' && e.code !== 'Space' && e.key !== ' ') {
        return;
      }

      // 2. Comprobar si el foco está en un elemento editable o en un botón
      const target = e.target as HTMLElement | null;
      if (
        target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.tagName === 'BUTTON'
        )
      ) {
        // No capturar en inputs ni interferir con la activación normal de botones
        return;
      }

      // 3. Prevenir el comportamiento por defecto únicamente al ejecutar el atajo
      e.preventDefault();

      // 4. Alternar reproducción de forma atómica y fiable
      const state = usePlayerStore.getState();
      if (state.isPlaying) {
        pauseTransport();
        state.setPlaying(false);
      } else {
        playTransport()
          .then(() => {
            state.setPlaying(true);
          })
          .catch((err) => {
            console.error('Error al reanudar reproducción con atajo:', err);
          });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    initAudio();

    setupSong(
      song as unknown as MusicData,
      parsedNotes,
      (beat) => {
        setCurrentBeat(beat);
      },
      (midi) => {
        const next = new Set(activeNotesRef.current);
        next.add(midi);
        activeNotesRef.current = next;
        setActiveNotes(new Set(next));
      },
      (midi) => {
        const next = new Set(activeNotesRef.current);
        next.delete(midi);
        activeNotesRef.current = next;
        setActiveNotes(new Set(next));
      },
      (chordMidis) => {
        setActiveChordNotes(new Set(chordMidis));
      },
      () => {
        setPlaying(false);
        setCurrentBeat(song.totalBeats);
      }
    );

    return () => {
      disposeAudio();
    };
  }, [song, parsedNotes, setCurrentBeat, setActiveNotes, setActiveChordNotes]);

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#0d1117] text-white overflow-hidden font-sans select-none">
      {/* ── 1. Barra de Navegación por Secciones y Transporte ── */}
      <TransportBar />

      {/* ── 2. Área central del Visor (Piano Roll + Chords) ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <PianoRoll />
      </div>

      {/* ── 3. Barra divisora interactiva (Vertical Splitter Handle) ── */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="w-full h-2 cursor-row-resize flex items-center justify-center bg-[#0d1117] hover:bg-[#1e293b] active:bg-[#38bdf8]/40 transition-colors group select-none z-30 shrink-0"
        title="Arrastra para cambiar el tamaño del Piano Roll y del instrumento"
      >
        {/* Píldora visual de agarre (handle) */}
        <div className="w-12 h-1 rounded-full bg-gray-600 group-hover:bg-gray-400 group-active:bg-[#38bdf8] transition-colors" />
      </div>

      {/* ── 4. Zona Inferior (Barra de herramientas + VirtualPiano / Guitarra) ── */}
      <div
        style={{ height: showInstrument ? `${instrumentHeight}px` : 'auto' }}
        className="shrink-0 flex flex-col min-h-0 overflow-hidden bg-[#0c1017]"
      >
        <InstrumentToolbar />
        {showInstrument && (
          <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-hidden">
            {instrumentType === 'piano' ? <VirtualPiano /> : <GuitarFretboard />}
          </div>
        )}
      </div>
    </div>
  );
}
