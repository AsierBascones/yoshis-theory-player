const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToNoteName(midi: number, preferFlat = false): string {
  const octave = Math.floor(midi / 12) - 1;
  const names = preferFlat ? NOTE_NAMES_FLAT : NOTE_NAMES;
  return `${names[midi % 12]}${octave}`;
}

export function midiToNoteNameShort(midi: number, preferFlat = false): string {
  const names = preferFlat ? NOTE_NAMES_FLAT : NOTE_NAMES;
  return names[midi % 12];
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}
