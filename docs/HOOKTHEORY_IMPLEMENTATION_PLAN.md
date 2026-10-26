# PLAN DE IMPLEMENTACIÓN Y MATRIZ DE TRAZABILIDAD — HOOKTHEORY ENGINE SPEC

**Documento:** `docs/HOOKTHEORY_IMPLEMENTATION_PLAN.md`  
**Referencia normativa:** `docs/HOOKTHEORY_ENGINE_SPEC.md`  
**Sistema:** HookTheory Music Engine  
**Modelo arquitectónico:** Canonical Intermediate Representation (`CanonicalChordIR`)  
**Fecha de última auditoría y verificación:** 26 de octubre de 2026  
**Estado general:** **100% CONFORME — TODOS LOS REQUISITOS IMPLEMENTADOS Y VERIFICADOS**

---

## 1. Resumen Ejecutivo de Cumplimiento

Se ha contrastado de forma exhaustiva cada apartado de `docs/HOOKTHEORY_ENGINE_SPEC.md` contra el código ejecutable y las baterías de pruebas del proyecto (`npm test`, `npx vite-node src/utils/uiInteraction.test.ts` y `npm run build`).

### Estado Final por Áreas:
1. **Fundamentos Matemáticos (Sección 1):** `IMPLEMENTADO`. Normalización en $\mathbb{Z}_{12}$, desplazamientos cromáticos arbitrarios, intervalos reales en semitonos (1..12). Verificado en tests puros.
2. **Tonalidades, Escalas y Modos (Sección 2):** `IMPLEMENTADO`. Los 7 modos diatónicos admitidos, cálculo ordenado $Scale(T, M)$, distinción unívoca entre fundamental, bajo, grado, alteración y grafía enarmónica.
3. **Construcción de Acordes (Sección 3):** `IMPLEMENTADO`. Tríadas, tétradas, extensiones estructurales vs notas añadidas (`add9` vs `9` vs `maj9`), suspensiones (`sus2`, `sus4`, `sus2sus4`) sin 3ª accidental, y alteraciones reales (`b5`, `#5`, `b9`, `#9`, `#11`).
4. **Bajo, Inversiones y Cifrado (Sección 4):** `IMPLEMENTADO`. Detección de bajo efectivo, cálculo de intervalo a la fundamental (`bassIntervalFromRoot`), grado relativo del bajo (`bassScaleDegree`), alteración (`bassAlteration`), cifrados barrocos (7, 6/5, 4/3, 4/2) y validación ante omisiones con fallback determinista.
5. **Funciones Armónicas Avanzadas (Sección 5):** `IMPLEMENTADO`. Acordes aplicados (`V/ii`, `V7/V`, `vii°7/vi`, `IV/V`), mezcla modal con detección automática y registro de ambigüedad (`REQ-5.3`), y sustitución tritonal con grafía enarmónica bemol (`Db7` vs `C#7`).
6. **Estabilidad Melódica y Métrica (Sección 6):** `IMPLEMENTADO`. Separación estricta entre pertenencia al acorde ($pc(p) \in PitchClasses(C)$) y estabilidad perceptiva. Clasificación contextual de notas no armónicas (notas de paso acentuadas/no acentuadas, bordaduras superiores/inferiores, suspensiones, anticipaciones, apoyaturas y notas de escape) con ponderación métrica y resolución por paso conjunto.
7. **Métrica y Ritmo (Sección 7):** `IMPLEMENTADO`. Compases simples y compuestos manejados por `src/utils/rhythmEngine.ts`, el cual ha permanecido **100% intacto**.
8. **Modelo de Datos y Arquitectura (Sección 8):** `IMPLEMENTADO`. `CanonicalChordIR` actúa como única fuente de verdad armónica, entrada inmutable congelada, con retrocompatibilidad plena con `IntermediateChordModel` y `UniversalChord`.
9. **Presentación Visual (Sección 9):** `IMPLEMENTADO`. Paleta centralizada de 7 colores diatónicos. La regla de color del bloque armónico está 100% unificada: **el color siempre deriva del grado del bajo efectivo** (en fundamental coincide con la raíz, en inversiones/slash chords deriva del bajo real). Acordes diatónicos conservan fondo sólido, mientras que notas y bajos alterados aplican rayado (`isAltered = true`).
10. **Parsing y Renderizado (Sección 10):** `IMPLEMENTADO`. Parseo desacoplado sin pérdida y renderizadores puros (`renderRomanNumeral`, `renderChordSymbol`, `renderSubLabels`).

---

## 2. Matriz de Trazabilidad y Conformidad

| ID Requisito | Regla Normativa (`HOOKTHEORY_ENGINE_SPEC.md`) | Estado | Archivos y Funciones Implicados | Evidencia y Tests Verificados |
| :--- | :--- | :---: | :--- | :--- |
| **REQ-1.1** | Clases de altura en $\mathbb{Z}_{12} = \{0,\dots,11\}$ con equivalencia de octava | **IMPLEMENTED** | `src/types/music.ts` (`PitchClass`), `src/utils/theoryEngine.ts` (`normalizeSemitone`, `getPitchClass`) | Tests unitarios: normalización de 0, 12, 14, 25, -1, -13 semitonos. |
| **REQ-1.2** | Operaciones cromáticas: $pc(p+n) = ((p+n)\bmod 12 + 12)\bmod 12$ | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`normalizeSemitone`) | Pruebas matemáticas puras con enteros grandes y negativos. |
| **REQ-1.3** | Intervalos reales en semitonos (1..12) sin comprimir | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`getChordIntervals`, `CHORD_INTERVALS`), `src/types/music.ts` | Pruebas de intervalos para las 9 cualidades de acordes normativos. |
| **REQ-2.1** | Admisión de los 7 modos diatónicos y sus offsets relativos | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`SCALE_MODE_OFFSETS`), `src/utils/musicTheory.ts` (`SCALE_MODES`) | Validación de offsets de Jónico, Dórico, Frigio, Lidio, Mixolidio, Eólico y Locrio. |
| **REQ-2.2** | Cálculo ordenado de las 7 notas de cada escala $Scale(T,M)$ | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`getScalePitchClasses`), `src/utils/musicTheory.ts` (`getScaleSpelling`) | Pruebas de clases de altura de los 7 modos en orden de grados 1 a 7. |
| **REQ-2.3** | Distinción explícita entre fundamental, bajo, alteración, clase de altura y grafía | **IMPLEMENTED** | `src/types/music.ts` (`CanonicalChordIR.bassAndInversion`), `src/utils/theoryEngine.ts` | Tests de bajo en $I^6$, $V^6_5$, $V^4_2$, $V^6/V$, $C7/B\flat$. |
| **REQ-2.4** | Identificación de modos paralelos vs relativos y colecciones auxiliares para préstamos | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`detectModalMixture`, `borrowedMode`) | Pruebas de préstamo modal explícito e inferido con lista de modos candidatos. |
| **REQ-3.1** | Modelo conceptual con propiedades armónicas ortogonales e independientes | **IMPLEMENTED** | `src/types/music.ts` (`CanonicalChordIR`, `IntermediateChordModel`) | Modelo IR validado con propiedades desacopladas de texto visual. |
| **REQ-3.2** | Tríadas: Mayor [0,4,7], Menor [0,3,7], Disminuida [0,3,6], Aumentada [0,4,8] | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`buildIntermediateChord`, `getChordIntervals`) | Matriz de 98 casos diatónicos + tests de tríadas R1-R14. |
| **REQ-3.3** | Tétradas: Maj7 [0,4,7,11], Dom7 [0,4,7,10], Min7 [0,3,7,10], Halfdim7 [0,3,6,10], Dim7 [0,3,6,9] | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`buildIntermediateChord`, `CHORD_INTERVALS`) | Matriz combinatoria completa de tétradas en los 7 modos. |
| **REQ-3.4** | Distinción estructural entre extensiones y notas añadidas (`add9` vs `9` vs `maj9`) | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`tones.source`, `rawType`), `src/types/music.ts` | Tests R10 (`I(add9)` sin 7ª) y R11 (`I^Δ9` con 7ª estructural e intervalo 14). |
| **REQ-3.5** | Suspensiones `sus2` [0,2,7], `sus4` [0,5,7], `sus2sus4` [0,2,5,7] sin 3ª accidental | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`tones`, `hasSus2`, `hasSus4`) | Pruebas de exclusión estricta de tercera en suspensiones simples y dobles. |
| **REQ-3.6** | Alteraciones deterministas: `b5`, `#5`, `b9`, `#9`, `#11` modificando intervalos reales | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`tones`, `hasFlat9`, `hasSharp9`, etc.) | Test R12: $E7(\flat 9)$ voicing a 4 voces omitiendo 5ª justa. |
| **REQ-4.1** | Bajo efectivo: fundamental vs bajo, clase de altura, intervalo respecto a la raíz | **IMPLEMENTED** | `src/types/music.ts`, `src/utils/theoryEngine.ts` (`bassIntervalFromRoot`, `bassScaleDegree`) | Tests de cálculo de grado, alteración e intervalo del bajo efectivo. |
| **REQ-4.2** | Cifrado e inversiones: Tríadas (0, 1, 2) y Séptimas (0, 1, 2, 3) con cifrados 7, 6/5, 4/3, 4/2 | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`renderRomanNumeral`) | Tests R1 ($V^6/V$), R7 ($v^6$), R8 ($IV^6$), R9 ($ii^6_5$), $V^4_2$. |
| **REQ-4.3** | Validación de inversión: contrastar con voces reales y mitigar inconsistencias | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`isAmbiguousInversion`, `validatedInversion`) | Test R13: inversión 1 con `no3` detecta ambigüedad y cae a inv 0. |
| **REQ-5.1** | Acordes diatónicos para los 7 modos diatónicos y menor armónica | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`getDiatonicChordQuality`, `DIATONIC_DEGREES_BY_SCALE`) | 98 pruebas combinatorias (7 modos $\times$ 7 grados para tríadas y tétradas). |
| **REQ-5.2** | Acordes aplicados: `V/ii`, `V7/V`, `vii°7/vi`, etc. con raíz, cualidad y destino resueltos | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`applied`, `buildIntermediateChord`) | Tests R1 ($V^6/V$), R2 ($vii^{\circ 7}/ii$), R3 ($vii^{\circ 7}/I$), R4 ($ii/V$), R5 ($IV/V$), R5b ($IV^{\Delta 7}/V$). |
| **REQ-5.3** | Acordes prestados (mezcla modal): metadato explícito, inferencia, candidatos y ambigüedad | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`detectModalMixture`, `buildIntermediateChord`) | Tests con préstamo explícito (`minor`), e inferido ($\flat\text{VI}$, $\flat\text{II}$, $\text{iv}$, $\flat\text{VII}$) con registro de ambigüedad. |
| **REQ-5.4** | Sustitución tritonal con notas guía compartidas y resolución enarmónica bemol (`Db7`) | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`isExplicitFlat`, `isTritoneSub`) | Test R14: $\flat\text{II}^7/I$ ($\Delta$-sub) en Do produce `Db7` (useFlats=true, nunca C#7). |
| **REQ-6.1** | Estabilidad melódica: Pertenencia estricta al acorde $pc(p) \in PitchClasses(C)$ | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`isChordTone`) | Tests unitarios evaluando clases de altura de notas melódicas sobre tríada C mayor. |
| **REQ-6.2** | Clasificación contextual de estabilidad: métrica, función no armónica y resolución | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`getMelodicStability`, `getMetricAccent`) | Tests de nota de paso (acentuada y no acentuada), bordaduras, suspensiones y resolución por paso conjunto. |
| **REQ-7.1** | Compases simples (4/4, 3/4) y jerarquía métrica | **IMPLEMENTED** | `src/utils/rhythmEngine.ts` | 191 pruebas pasadas en `src/utils/rhythmEngine.test.ts`. |
| **REQ-7.2** | Compases compuestos (6/8, 9/8, 12/8) y agrupación ternaria | **IMPLEMENTED** | `src/utils/rhythmEngine.ts` | Tests de 6/8, 9/8, 12/8 y cambios dinámicos pasados al 100%. |
| **REQ-7.3** | Integridad absoluta del motor rítmico (`rhythmEngine.ts` intacto) | **IMPLEMENTED** | `src/utils/rhythmEngine.ts` | `git diff src/utils/rhythmEngine.ts` verificado como estrictamente vacío. |
| **REQ-8.1** | `CanonicalChordIR` como única fuente de verdad armónica | **IMPLEMENTED** | `src/types/music.ts`, `src/utils/theoryEngine.ts` | Modelo canónico completo con todas las propiedades resueltas para presentación y síntesis. |
| **REQ-8.2** | Inmutabilidad de la entrada y procedencia de datos | **IMPLEMENTED** | `src/types/music.ts` (`rawOriginal` readonly congelado) | Verificación de inmutabilidad y flags de procedencia (`explicit` vs `inferred`). |
| **REQ-8.3** | Compatibilidad con `IntermediateChordModel` y `UniversalChord` | **IMPLEMENTED** | `src/types/music.ts`, `src/utils/theoryEngine.ts`, `src/utils/theoryParser.ts` | Compatibilidad retroactiva 100% verificada en toda la aplicación. |
| **REQ-9.1** | Colores diatónicos por grado (1 Rojo a 7 Magenta) centralizados | **IMPLEMENTED** | `src/utils/theoryColors.ts` | Paleta centralizada oficial de Hooktheory. |
| **REQ-9.2** | Color del bloque armónico derivado SIEMPRE del grado del bajo efectivo | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`parseHookpadChord`), `src/components/PianoRoll/PianoRoll.tsx` | Regla unificada sin excepciones: $I$ es rojo (#D92525), $I^6$ es amarillo (#C9AC17), $I^6_4$ es cian (#0DA8D6), $V^4_2$ es verde (#1DB33D), $C7/B\flat$ es magenta (#B5179E). |
| **REQ-9.3** | Tratamiento visual de notas cromáticas y bajos alterados (rayado / patrón diagonal) | **IMPLEMENTED** | `src/components/PianoRoll/PianoRoll.tsx`, `src/utils/theoryEngine.ts` | $V^6/V$ con bajo $\sharp 4$ y $C7/B\flat$ con bajo $\flat 7$ marcados con `isAltered = true`. Diatónicos $I$ e $I^6$ conservan relleno sólido. |
| **REQ-10.1** | Parsing sin pérdida de distinciones estructurales | **IMPLEMENTED** | `src/utils/theoryParser.ts`, `src/utils/theoryEngine.ts` | Pipeline determinista de ingestión de TheoryTab/Hookpad. |
| **REQ-10.2** | Resolución canónica previa a presentación y síntesis | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`buildIntermediateChord`, `buildCanonicalChordIR`) | Salidas `outputs` generadas antes de cualquier consumo en interfaz o audio. |
| **REQ-10.3** | Renderizadores desacoplados que consumen el modelo resuelto | **IMPLEMENTED** | `src/utils/theoryEngine.ts` (`renderRomanNumeral`, `renderChordSymbol`, `renderSubLabels`) | Renderizadores puros sin reinferencia de armonía. |

---

## 3. Resultados de Verificación Ejecutables

```bash
# 1. Suite de pruebas global (teoría, conducción de voces, ritmo)
npm test
  theoryEngine.test.ts: 328 PASSED, 0 FAILED
  voiceLeading.test.ts: 230 PASSED, 0 FAILED
  rhythmEngine.test.ts: 191 PASSED, 0 FAILED
  Total: 749 PASSED, 0 FAILED (100% éxito)

# 2. Suite de interacción de interfaz y transporte
npx vite-node src/utils/uiInteraction.test.ts
  UI INTERACTION RESULTS: 25 PASSED, 0 FAILED (100% éxito)

# 3. Compilación de producción TypeScript y Vite
npm run build
  tsc -b && vite build
  ✓ 991 modules transformed.
  ✓ built in 909ms (0 errores de compilación)
```
