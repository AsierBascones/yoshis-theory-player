/**
 * theoryColors.ts
 * Sistema cromático universal de Hooktheory (TheoryTab).
 * Mapeo de grados de la escala a colores:
 * 1 = Rojo (#E83030)
 * 2 = Naranja (#E87830)
 * 3 = Amarillo (#E8D430)
 * 4 = Verde (#30C030)
 * 5 = Cian (#30B8E8)
 * 6 = Azul (#3060E8)
 * 7 = Violeta (#9030E8)
 */

/**
 * theoryColors.ts
 * Sistema cromático universal de Hooktheory (TheoryTab).
 * Paleta diatónica oficial basada en grados relativos:
 * 1 = Rojo (#D92525)
 * 2 = Naranja (#D97025)
 * 3 = Amarillo dorado (#C9AC17)
 * 4 = Verde (#1DB33D)
 * 5 = Cian brillante (#0DA8D6)
 * 6 = Violeta (#8025D9)
 * 7 = Magenta (#B5179E)
 */

export const HOOKTHEORY_DEGREE_COLORS: Record<string, string> = {
  "1": "#D92525", // Grado 1 (Tónica): Rojo
  "2": "#D97025", // Grado 2: Naranja
  "3": "#C9AC17", // Grado 3: Amarillo dorado
  "4": "#1DB33D", // Grado 4: Verde
  "5": "#0DA8D6", // Grado 5: Cian brillante
  "6": "#8025D9", // Grado 6: Violeta
  "7": "#B5179E", // Grado 7: Magenta
};

// Función auxiliar para obtener el color exacto según el grado relativo (sd)
export function getDegreeColor(sd: string | number): { color: string; isAltered: boolean } {
  const sdStr = String(sd);
  const baseDegree = sdStr.replace(/[#b]/g, "");
  const color = HOOKTHEORY_DEGREE_COLORS[baseDegree] || "#D92525";
  const isAltered = sdStr.includes("#") || sdStr.includes("b");
  return { color, isAltered };
}

export interface TheoryColor {
  primary: string;
  light: string;
  dark: string;
  label: string;
  degree: number;
}

// 12 semitonos según la paleta cromática de Hooktheory
export const SEMITONE_COLORS: TheoryColor[] = [
  { degree: 1,   label: "1",   primary: "#D92525", light: "#FF6B6B", dark: "#A01818" }, // 0 semitonos (1)
  { degree: 1.5, label: "b2",  primary: "#D94525", light: "#FF7D50", dark: "#A02510" }, // 1 semitono
  { degree: 2,   label: "2",   primary: "#D97025", light: "#FFB060", dark: "#A04A10" }, // 2 semitonos (2)
  { degree: 2.5, label: "b3",  primary: "#D0901E", light: "#FFD060", dark: "#9A680E" }, // 3 semitonos
  { degree: 3,   label: "3",   primary: "#C9AC17", light: "#FFE860", dark: "#8F780A" }, // 4 semitonos (3)
  { degree: 4,   label: "4",   primary: "#1DB33D", light: "#60E860", dark: "#107A25" }, // 5 semitonos (4)
  { degree: 4.5, label: "#4",  primary: "#10A880", light: "#40EDB5", dark: "#0A7055" }, // 6 semitonos
  { degree: 5,   label: "5",   primary: "#0DA8D6", light: "#60D8FF", dark: "#087394" }, // 7 semitonos (5)
  { degree: 5.5, label: "b6",  primary: "#4850D6", light: "#7B82FF", dark: "#2C349C" }, // 8 semitonos
  { degree: 6,   label: "6",   primary: "#8025D9", light: "#A962FF", dark: "#551296" }, // 9 semitonos (6)
  { degree: 6.5, label: "b7",  primary: "#9B1EB8", light: "#D34EF2", dark: "#690D7E" }, // 10 semitonos
  { degree: 7,   label: "7",   primary: "#B5179E", light: "#EE53D6", dark: "#7E0D6E" }, // 11 semitonos (7)
];

export const DEGREE_COLORS: Record<number, string> = {
  1: "#D92525",
  2: "#D97025",
  3: "#C9AC17",
  4: "#1DB33D",
  5: "#0DA8D6",
  6: "#8025D9",
  7: "#B5179E",
};

export function getTheoryColor(rootMidi: number, keyMidi = 60): TheoryColor {
  const semitones = ((rootMidi - keyMidi) % 12 + 12) % 12;
  return SEMITONE_COLORS[semitones];
}

export function getColor(rootMidi: number, keyMidi = 60): string {
  return getTheoryColor(rootMidi, keyMidi).primary;
}

export function getColorByDegree(degree: number | string): string {
  const str = String(degree).replace(/[#b]/g, '');
  const num = parseInt(str) || 1;
  return HOOKTHEORY_DEGREE_COLORS[str] ?? DEGREE_COLORS[num] ?? "#D92525";
}

export function getDegreeLabel(rootMidi: number, keyMidi = 60): string {
  return getTheoryColor(rootMidi, keyMidi).label;
}

export function getColorAlpha(rootMidi: number, keyMidi = 60, alpha = 1): string {
  const hex = getColor(rootMidi, keyMidi);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getHexAlpha(hex: string, alpha = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Genera el fondo de la nota estilo Hooktheory:
 * - Notas diatónicas (1..7): Color sólido.
 * - Notas alteradas (#4, b6, b7, etc.): Patrón rayado diagonal característico de Hooktheory.
 */
export function getHooktheoryBackground(
  sd: string,
  degree: number,
  isDimmed = false,
  customColor?: string,
  customStriped?: boolean
): string {
  const baseColor = customColor ?? getColorByDegree(degree);
  const isAltered = customStriped !== undefined ? customStriped : (sd.includes('#') || sd.includes('b'));

  if (!isAltered) {
    return isDimmed ? getHexAlpha(baseColor, 0.45) : baseColor;
  }

  // Patrón rayado diagonal para notas cromáticas alteradas
  const stripeColor = isDimmed ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.85)';
  const mainColor = isDimmed ? getHexAlpha(baseColor, 0.6) : baseColor;
  return `repeating-linear-gradient(135deg, ${mainColor}, ${mainColor} 5px, ${stripeColor} 5px, ${stripeColor} 10px)`;
}
