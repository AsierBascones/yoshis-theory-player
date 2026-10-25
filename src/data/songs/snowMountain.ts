import type { UniversalSong, SongSection, UniversalMelodyNote, UniversalChord } from '../../types/music';
import {
  INTRO_SECTION,
  VERSE_NOTES,
  VERSE_CHORDS,
  CHORUS_SECTION,
  OUTRO_SECTION,
  ALL_SECTIONS,
} from '../snowMountainData';
import type { RawNote, RawChord } from '../../utils/theoryParser';

function convertNote(n: RawNote, idx: number): UniversalMelodyNote {
  let octaveOffset = 0;
  if (n.pitch) {
    const octMatch = n.pitch.match(/\d+/);
    if (octMatch) {
      octaveOffset = parseInt(octMatch[0], 10) - 4;
    } else if (typeof n.octave === 'number') {
      octaveOffset = n.octave;
    }
  } else if (typeof n.octave === 'number') {
    octaveOffset = n.octave;
  }

  return {
    id: `m-${idx}-${n.beat}`,
    beat: n.beat,
    duration: n.duration,
    sd: String(n.sd),
    octaveOffset,
  };
}

function convertChord(c: RawChord, idx: number): UniversalChord {
  let quality: UniversalChord['quality'] = 'maj';
  if (c.symbol?.includes('°7') || c.roman?.includes('°7') || c.roman?.includes('°⁷')) quality = 'dim7';
  else if (c.symbol?.includes('°') || c.symbol?.includes('dim') || c.roman?.includes('°')) quality = 'dim';
  else if (c.symbol?.includes('m7')) quality = 'min7';
  else if (c.symbol?.includes('m')) quality = 'min';
  else if (c.symbol?.includes('maj7')) quality = 'maj7';
  else if (c.type === 7 || c.symbol?.includes('7')) quality = 'dom7';

  let rootSd = String(c.root);
  if (c.applied === 2 && String(c.root) === '7') rootSd = '#1';
  else if (c.applied === 3 && String(c.root) === '7') rootSd = '#2';
  else if (c.applied === 5 && String(c.root) === '7') rootSd = '#4';
  else if (c.symbol?.startsWith('Eb') || c.roman?.includes('bIII')) rootSd = 'b3';
  else if (c.symbol?.startsWith('Ab') || c.roman?.includes('bVI')) rootSd = 'b6';
  else if (c.symbol?.startsWith('Bb') || c.roman?.includes('bVII')) rootSd = 'b7';
  else if (c.symbol?.startsWith('C#') || c.symbol?.startsWith('c#')) rootSd = '#1';
  else if (c.symbol?.startsWith('D#') || c.symbol?.startsWith('d#')) rootSd = '#2';
  else if (c.symbol?.startsWith('F#') || c.symbol?.startsWith('f#')) rootSd = '#4';

  let roman = c.roman;
  let customSymbol = c.symbol;
  let rootSemitones: number | undefined = undefined;
  let secondaryType: UniversalChord['secondaryType'] = undefined;
  let appliedTarget: number | undefined = undefined;

  if (roman?.includes('/')) {
    const afterSlash = roman.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ROMAN_MAP: Record<string, number> = { i: 1, '1': 1, ii: 2, '2': 2, iii: 3, '3': 3, iv: 4, '4': 4, v: 5, '5': 5, vi: 6, '6': 6, vii: 7, '7': 7 };
    appliedTarget = ROMAN_MAP[afterSlash];
    if (roman.startsWith('vii°') || roman.startsWith('viiø')) {
      secondaryType = 'vii°';
      quality = (c.type === 7 || roman.includes('7') || roman.includes('⁷')) ? 'dim7' : 'dim';
      if (appliedTarget) {
        const targetSemi = [0, 2, 4, 5, 7, 9, 11][appliedTarget - 1] ?? 0;
        rootSemitones = (targetSemi - 1 + 12) % 12;
        const SEMI_TO_SD: Record<number, string> = { 1: '#1', 3: '#2', 6: '#4', 8: '#5', 10: '#6' };
        rootSd = SEMI_TO_SD[rootSemitones] || rootSd;
      }
    } else if (roman.startsWith('V') || roman.startsWith('v')) {
      secondaryType = 'V';
    } else if (roman.startsWith('IV')) {
      secondaryType = 'IV';
    } else if (roman.startsWith('ii')) {
      secondaryType = 'ii';
    }
  } else if ((c.applied === 7 && String(c.root) === '5') || (c.applied === 5 && String(c.root) === '7') || roman?.includes('V/vii') || roman?.includes('vii°/V')) {
    roman = c.type === 7 ? 'vii°⁷/V' : 'vii°/V';
    customSymbol = c.type === 7 ? 'f#°7' : 'f#°';
    quality = c.type === 7 ? 'dim7' : 'dim';
    secondaryType = 'vii°';
    appliedTarget = 5;
    rootSd = '#4';
    rootSemitones = 6;
  } else if (c.applied) {
    appliedTarget = typeof c.applied === 'number' ? c.applied : parseInt(String(c.applied), 10);
  }

  let inv = c.inversion;
  if (inv === undefined) {
    if (c.roman?.includes('⁶₅') || c.roman?.includes('⁶') || c.symbol?.includes('/')) inv = 1;
    else if (c.roman?.includes('⁴₃') || c.roman?.includes('⁶₄')) inv = 2;
    else if (c.roman?.includes('⁴₂')) inv = 3;
    else inv = 0;
  }

  return {
    id: `c-${idx}-${c.beat}`,
    beat: c.beat,
    duration: c.duration,
    roman,
    symbol: customSymbol || c.symbol || '',
    rootSd,
    quality,
    type: (c.type === 7 ? 7 : 5) as 5 | 7 | 9 | 11 | 13,
    inversion: inv as 0 | 1 | 2 | 3,
    borrowed: c.borrowed,
    applied: c.applied ? String(c.applied) : undefined,
    appliedTarget,
    secondaryType,
    customSymbol,
    notes: c.notes || [],
    bassNote: (c.notes && c.notes.length > 0 ? c.notes[0] : 'C3'),
    color: c.color,
    isAltered: c.isAltered,
    _rootSemitones: rootSemitones,
  };
}

export const snowMountainSong: UniversalSong = {
  id: 'snow-mountain',
  title: 'Cool, Cool Mountain (Snow Mountain)',
  artist: 'Koji Kondo (Super Mario 64)',
  bpm: 140,
  defaultSwing: {
    enabled: false,
    percentage: 50,
    subdivision: '8n',
  },
  globalKey: {
    tonic: 'C',
    scale: 'major',
  },
  sections: [
    {
      id: 'all',
      name: 'All Sections',
      key: { tonic: 'C', scale: 'major' },
      keys: ALL_SECTIONS.keys,
      beatsPerBar: 4,
      totalBars: 42,
      melody: ALL_SECTIONS.notes.map(convertNote),
      chords: ALL_SECTIONS.chords.map(convertChord),
    },
    {
      id: 'intro',
      name: 'Intro',
      key: { tonic: 'C', scale: 'major' },
      beatsPerBar: 4,
      totalBars: 2,
      melody: INTRO_SECTION.notes.map(convertNote),
      chords: INTRO_SECTION.chords.map(convertChord),
    },
    {
      id: 'verse',
      name: 'Verse',
      key: { tonic: 'C', scale: 'major' },
      beatsPerBar: 4,
      totalBars: 16,
      melody: VERSE_NOTES.map(convertNote),
      chords: VERSE_CHORDS.map(convertChord),
    },
    {
      id: 'chorus',
      name: 'Chorus',
      key: { tonic: 'C', scale: 'major' },
      beatsPerBar: 4,
      totalBars: 16,
      melody: CHORUS_SECTION.notes.map(convertNote),
      chords: CHORUS_SECTION.chords.map(convertChord),
    },
    {
      id: 'outro',
      name: 'Outro',
      key: { tonic: 'C', scale: 'mixolydian' },
      keys: OUTRO_SECTION.keys,
      beatsPerBar: 4,
      totalBars: 8,
      melody: OUTRO_SECTION.notes.map(convertNote),
      chords: OUTRO_SECTION.chords.map(convertChord),
    },
  ],
};
