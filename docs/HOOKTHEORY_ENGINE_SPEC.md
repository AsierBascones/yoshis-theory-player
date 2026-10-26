HOOKTHEORY ENGINE SPEC
Especificación normativa del motor de teoría musical

Documento: docs/HOOKTHEORY_ENGINE_SPEC.md
Sistema: HookTheory Engine
Estado: Especificación de referencia para implementación y validación
Idioma: Inglés para identificadores de código; español para documentación
Modelo arquitectónico: Canonical Intermediate Representation (CanonicalChordIR)

0. Propósito y alcance

HookTheory Engine es el núcleo de teoría musical responsable de interpretar, representar y resolver información armónica y melódica de forma consistente.

Debe transformar las entradas musicales en una representación canónica independiente de la presentación visual, de la síntesis de audio y del formato de entrada.

La implementación debe permitir:

Interpretar acordes y notas en contexto tonal.
Calcular clases de altura e intervalos musicales reales.
Identificar grados de escala y funciones armónicas.
Construir tríadas, tétradas, extensiones, suspensiones y acordes alterados.
Resolver inversiones, bajo efectivo y cifrado.
Analizar dominantes secundarios, acordes aplicados, mezcla modal y sustituciones tritonales.
Evaluar la estabilidad melódica respecto a la armonía activa.
Proporcionar información fiable a los sistemas de presentación, coloración y síntesis.
Mantener compatibilidad con los modelos públicos existentes.
0.1 Principio fundamental

La representación musical canónica es la única fuente de verdad para los resultados armónicos resueltos.

Los renderizadores, la interfaz y los sistemas de síntesis no deben volver a inferir de forma independiente la teoría que ya ha resuelto el motor.

0.2 Alcance de las garantías

Esta especificación distingue tres clases de comportamiento:

Normativo: reglas musicales y matemáticas que deben cumplirse.
Configurado por el producto: convenciones de notación, colores y presentación que deben mantenerse consistentes.
Analítico: inferencias musicales que pueden requerir contexto adicional y deben expresar su grado de certeza cuando corresponda.

Una inferencia heurística no debe presentarse como un hecho musical demostrado.

1. Fundamentos matemáticos
1.1 Clases de altura

Las clases de altura se representan mediante el grupo cíclico:

Z12={0,1,…,11}

Correspondencia cromática de referencia:

Pitch class	Nombre
0	C
1	C♯ / D♭
2	D
3	D♯ / E♭
4	E
5	F
6	F♯ / G♭
7	G
8	G♯ / A♭
9	A
10	A♯ / B♭
11	B

La clase de altura representa equivalencia por octavas. No determina por sí sola la octava, la grafía enarmónica ni la función musical de una nota.

1.2 Operaciones cromáticas

Para una nota con clase de altura p y un desplazamiento de n semitonos:

pc⁡(p+n)=((p+n) mod 12+12) mod 12

La implementación debe producir resultados normalizados entre 0 y 11, incluidos desplazamientos negativos.

1.3 Intervalos
Intervalo	Semitonos
Segunda menor	1
Segunda mayor	2
Tercera menor	3
Tercera mayor	4
Cuarta justa	5
Tritono	6
Quinta justa	7
Sexta menor	8
Sexta mayor	9
Séptima menor	10
Séptima mayor	11
Octava justa	12

Los intervalos deben conservar su distancia real en semitonos. La identidad interválica y su representación escrita son conceptos diferentes: seis semitonos pueden escribirse como cuarta aumentada o quinta disminuida según el contexto.

2. Tonalidades, escalas y modos
2.1 Modos admitidos

El motor debe admitir los siete modos diatónicos:

Modo	Offsets desde la tónica
Ionian	[0, 2, 4, 5, 7, 9, 11]
Dorian	[0, 2, 3, 5, 7, 9, 10]
Phrygian	[0, 1, 3, 5, 7, 8, 10]
Lydian	[0, 2, 4, 6, 7, 9, 11]
Mixolydian	[0, 2, 4, 5, 7, 9, 10]
Aeolian	[0, 2, 3, 5, 7, 8, 10]
Locrian	[0, 1, 3, 5, 6, 8, 10]
2.2 Cálculo de las escalas

Dada una tónica T y los offsets de un modo M:

Scale⁡(T,M)={(T+oi) mod 12∣oi∈M}

El resultado debe conservar el orden de los grados de la escala, no limitarse a devolver un conjunto desordenado de clases de altura.

2.3 Grados relativos

Cada nota de la escala debe poder relacionarse con un grado relativo del 1 al 7.

El motor debe distinguir entre:

Grado de la fundamental del acorde.
Grado de la nota del bajo.
Alteración cromática respecto al grado diatónico.
Clase de altura absoluta.
Grafía musical de la nota.

No se debe deducir que una nota cromática carece de función únicamente porque su clase de altura no pertenezca a la escala base.

2.4 Modos paralelos y relativos

El motor debe distinguir entre:

Modos relativos que comparten las mismas clases de altura.
Modos paralelos que comparten la misma tónica.
Tonalidad y modo activos del análisis.
Escalas o colecciones auxiliares utilizadas para analizar acordes prestados.

La colección activa y cualquier colección auxiliar deben identificarse explícitamente.

3. Construcción de acordes
3.1 Modelo conceptual

Un acorde se define mediante una combinación de propiedades independientes:

Fundamental.
Cualidad estructural.
Extensiones.
Suspensiones.
Notas añadidas.
Alteraciones.
Bajo efectivo.
Inversión.
Función aplicada y objetivo.
Procedencia modal, cuando corresponda.
Grafía de las notas y símbolo de presentación.

Estas propiedades deben conservarse por separado en la representación canónica. No deben reducirse a un único símbolo textual.

3.2 Tríadas
Cualidad	Intervalos
Mayor	[0, 4, 7]
Menor	[0, 3, 7]
Disminuida	[0, 3, 6]
Aumentada	[0, 4, 8]

La cualidad debe determinarse a partir de la estructura armónica resuelta, no únicamente de las mayúsculas o minúsculas del símbolo de entrada.

3.3 Acordes de séptima
Cualidad	Intervalos
Major seventh	[0, 4, 7, 11]
Dominant seventh	[0, 4, 7, 10]
Minor seventh	[0, 3, 7, 10]
Half-diminished seventh	[0, 3, 6, 10]
Fully diminished seventh	[0, 3, 6, 9]

El motor debe distinguir entre una séptima mayor, una séptima menor y una séptima disminuida.

No debe inferir una séptima por el simple hecho de que un acorde tenga una extensión añadida.

3.4 Extensiones y notas añadidas

La representación debe diferenciar entre extensiones estructurales y notas añadidas.

Ejemplo:

Cadd9: [0, 4, 7, 14].
C9: [0, 4, 7, 10, 14].
Cmaj9: [0, 4, 7, 11, 14].

Estos ejemplos expresan estructuras distintas y no deben normalizarse a un mismo acorde.

Las extensiones deben conservar su identidad interválica y sus alteraciones. Cuando una nota se representa por encima de la octava, el motor debe conservar la distancia de intervalo y calcular su clase de altura por separado.

3.5 Suspensiones
sus2: sustituye la tercera por una segunda mayor.
sus4: sustituye la tercera por una cuarta justa.

Intervalos:

sus2: [0, 2, 7].
sus4: [0, 5, 7].

La suspensión no debe conservar accidentalmente la tercera sustituida, salvo que una estructura explícita de entrada solicite una combinación adicional.

3.6 Alteraciones

Como mínimo, deben admitirse:

b5: quinta disminuida, 6 semitonos.
#5: quinta aumentada, 8 semitonos.
b9: novena menor, 13 semitonos.
#9: novena aumentada, 15 semitonos.

Las alteraciones deben modificar la nota estructural correspondiente sin introducir notas adicionales implícitas.

Las combinaciones de alteraciones deben ser deterministas, conservarse en la representación canónica y disponer de pruebas independientes.

4. Bajo, inversiones y cifrado
4.1 Bajo efectivo

El bajo efectivo es la nota armónica más grave del acorde realizado, no necesariamente su fundamental.

La representación debe distinguir entre:

Fundamental.
Nota de bajo.
Clase de altura del bajo.
Posición de inversión.
Intervalo del bajo respecto a la fundamental.
Grado de escala y alteración del bajo, si pueden determinarse.
4.2 Inversiones

Para tríadas:

Inversión	Bajo
Fundamental	Fundamental
Primera	Tercera
Segunda	Quinta

Para acordes de séptima:

Inversión	Bajo
Fundamental	Fundamental
Primera	Tercera
Segunda	Quinta
Tercera	Séptima

El cifrado debe corresponder a la inversión estructural real. Por ejemplo, las convenciones habituales de bajo cifrado para acordes de séptima son 7, 6/5, 4/3 y 4/2.

El parser debe admitir las variantes de notación soportadas por el producto sin confundirlas con la cualidad del acorde.

4.3 Validación

Una inversión declarada debe contrastarse con la estructura y el bajo efectivos.

Si los datos de entrada son incompatibles, el motor debe aplicar una política explícita de validación: corregirlos cuando exista una regla inequívoca o comunicar la inconsistencia. No debe declarar válida una inversión únicamente porque el campo contenga un número permitido.

5. Funciones armónicas
5.1 Acordes diatónicos

En una escala mayor, las cualidades de referencia son:

Grado	Tríada	Séptima diatónica
I	Mayor	Maj7
ii	Menor	m7
iii	Menor	m7
IV	Mayor	Maj7
V	Mayor	Dom7
vi	Menor	m7
vii°	Disminuida	Semidisminuida

Esta tabla es una referencia para la armonización diatónica en modo mayor. Los demás modos deben resolverse a partir de sus intervalos reales.

La función armónica, la cualidad estructural y el símbolo renderizado deben mantenerse como propiedades distintas.

5.2 Acordes aplicados

El motor debe representar los acordes aplicados con:

Función aplicada.
Grado objetivo.
Fundamental absoluta resuelta.
Cualidad estructural.
Relación con la tonalidad activa.

Ejemplos: V/ii, V7/V y vii°7/vi.

La raíz de una dominante aplicada puede calcularse a partir de la quinta justa sobre el objetivo, pero el cálculo final debe considerar el modo, la grafía de las notas y la cualidad solicitada.

La resolución inmediata al objetivo es una expectativa funcional, no una condición obligatoria para aceptar el acorde: el contexto musical puede contener resoluciones retrasadas o engañosas.

5.3 Acordes prestados y mezcla modal

El motor debe poder identificar acordes procedentes de un modo paralelo y conservar la procedencia cuando esté disponible.

La detección de un acorde compatible con otro modo no demuestra por sí sola que haya sido prestado de ese modo. La procedencia puede depender del contexto y debe distinguirse entre información explícita e inferencia.

5.4 Sustitución tritonal

La sustitución tritonal de una dominante con séptima utiliza una fundamental separada seis semitonos de la dominante original.

Para G7 y Db7, las estructuras de guía son:

G7: B y F.
Db7: F y Cb.

Ambos acordes comparten las clases de altura de las notas guía, aunque su grafía y función sean distintas.

En una resolución convencional a C, Db puede descender cromáticamente a C, mientras que G suele resolver a C por movimiento de quinta.

El motor debe distinguir la sustitución funcional de una mera coincidencia de clases de altura y preservar la grafía apropiada, por ejemplo Db7 en lugar de C#7 cuando el contexto exige la escritura de la subdominante napolitana o la sustitución tritonal.

6. Estabilidad melódica
6.1 Pertenencia al acorde

La estabilidad armónica básica de una nota se determina comparando su clase de altura con las clases de altura estructurales del acorde activo.

ChordMember⁡(p,C)  ⟺  pc⁡(p)∈PitchClasses⁡(C)

Esta condición identifica pertenencia al acorde, pero no determina por sí sola la estabilidad perceptiva completa.

6.2 Información contextual

Cuando existan datos suficientes, el análisis puede considerar:

Tiempo métrico.
Duración.
Posición respecto al ataque armónico.
Resolución melódica.
Tensiones aceptadas.
Función de la nota.

La salida debe distinguir entre pertenencia al acorde y una clasificación más amplia de estabilidad melódica.

7. Métrica y ritmo
7.1 Compases simples

En compases como 4/4 y 3/4, la jerarquía de acentos depende del numerador, el denominador y la agrupación métrica configurada.

En 4/4, el primer tiempo suele ser el principal y el tercero tiene un acento secundario.

7.2 Compases compuestos

En 6/8, la agrupación convencional suele organizarse en dos pulsos principales, cada uno subdividido en tres corcheas.

El motor debe representar la agrupación métrica por separado de la duración absoluta de los eventos.

7.3 Integridad del motor rítmico

El desarrollo de teoría armónica no debe modificar incidentalmente la lógica de duración, cuantización, subdivisión o agrupación rítmica.

Los cambios al motor rítmico requieren requisitos explícitos y pruebas de regresión independientes.

8. Modelo de datos y arquitectura
8.1 CanonicalChordIR

CanonicalChordIR es la representación canónica del acorde resuelto y debe ser reutilizada por todos los consumidores del motor.

Debe representar, directamente o mediante estructuras relacionadas:

Entrada original inmutable.
Contexto tonal.
Identidad armónica.
Funciones aplicadas y procedencia modal.
Intervalos y clases de altura reales.
Bajo e inversión validados.
Resultados de presentación.

Los nombres exactos de los campos deben ajustarse al modelo existente. No se deben crear campos duplicados para información que ya tiene una representación canónica equivalente.

8.2 Inmutabilidad y procedencia

La entrada original debe conservarse sin modificaciones destructivas.

El resultado resuelto debe permitir determinar qué información procede de la entrada, cuál fue calculada y cuál fue inferida.

La resolución debe ser determinista para la misma entrada, contexto y versión de las reglas.

8.3 Compatibilidad

Las interfaces públicas existentes, incluidas IntermediateChordModel y UniversalChord, deben mantener su compatibilidad mientras dure la transición.

Las nuevas funcionalidades deben integrarse en el flujo real de resolución. La existencia de un campo opcional no constituye por sí misma una implementación funcional.

9. Presentación visual
9.1 Colores por grado

La paleta de referencia es:

Grado	Color
1	Rojo
2	Naranja
3	Amarillo
4	Verde lima
5	Cian
6	Azul
7	Púrpura

Los valores concretos de color deben centralizarse en una configuración visual, sin duplicarse en los algoritmos de teoría musical.

9.2 Color del bajo

Cuando el producto adopte la convención de color por bajo, el color del bloque debe derivarse del grado de escala del bajo efectivo, no automáticamente del grado de la fundamental.

Si el bajo es cromático o no puede asignarse inequívocamente a un grado diatónico, el sistema debe aplicar una regla visual documentada que conserve la información de alteración.

9.3 Notas cromáticas

La representación de notas cromáticas mediante patrones, rellenos o combinaciones de colores es una regla de interfaz.

Debe consumir la información cromática y funcional ya resuelta. No debe modificar la identidad armónica del acorde.

10. Parsing y renderizado
10.1 Parsing

El parser debe interpretar la entrada sin perder distinciones entre:

Fundamental y bajo.
Cualidad y función.
Extensión y nota añadida.
Suspensión y tercera estructural.
Alteración y nota adicional.
Acorde aplicado y acorde independiente.
Entrada original y resultado inferido.

Las entradas no reconocidas o ambiguas deben generar un resultado explícito de validación, no una interpretación silenciosa potencialmente incorrecta.

10.2 Resolución

El motor de resolución debe producir la representación canónica antes de la presentación.

Todas las rutas de entrada soportadas deben converger en una lógica común de resolución siempre que su semántica lo permita.

10.3 Renderizado

Los renderizadores deben consumir la representación resuelta.

No deben recalcular intervalos, corregir cualidades armónicas por su cuenta ni volver a inferir el contexto tonal.

La notación enarmónica debe ser contextual y conservar la distinción entre clase de altura y nombre escrito de la nota.

11. Validación y pruebas
11.1 Pruebas matemáticas

Deben verificar, como mínimo:

Normalización de clases de altura.
Operaciones con desplazamientos positivos y negativos.
Offsets de los siete modos.
Construcción de intervalos.
Coherencia entre intervalos absolutos y clases de altura.
11.2 Pruebas de acordes

Deben cubrir:

Todas las cualidades admitidas.
Tríadas y tétradas diatónicas.
Acordes aumentados, semidisminuidos y totalmente disminuidos.
Inversiones y bajos.
Suspensiones.
add9, 9 y maj9.
Alteraciones simples y combinadas.
11.3 Pruebas funcionales

Deben incluir:

Dominantes secundarios y otros acordes aplicados admitidos.
Acordes prestados.
Sustituciones tritonales.
Resolución de funciones.
Casos enarmónicos sensibles al contexto.
11.4 Pruebas de integración

Cada requisito debe probarse en los flujos reales que correspondan:

Parsing.
Resolución canónica.
Síntesis.
Renderizado.
Interacción de usuario.

Las pruebas unitarias no sustituyen las pruebas de integración cuando una funcionalidad depende de varios subsistemas.

11.5 Regresión y build

Antes de declarar una fase terminada deben ejecutarse los comandos de pruebas y build establecidos por el repositorio.

Los resultados deben registrarse con sus salidas reales. Si un comando no se ejecutó, debe indicarse expresamente.

12. Matriz de trazabilidad

Cada requisito debe contar con un identificador estable.

La matriz debe registrar:

Campo	Descripción
Requirement ID	Identificador único
Specification	Regla normativa
Implementation	Archivo y función
Status	IMPLEMENTED, PARTIAL, MISSING, INCORRECT
Unit tests	Pruebas asociadas
Integration tests	Flujos verificados
Evidence	Resultados reproducibles
Notes	Discrepancias o limitaciones

Los estados permitidos son:

IMPLEMENTED: implementado e integrado, con pruebas satisfactorias.
PARTIAL: cubierto solo en parte.
MISSING: sin implementación.
INCORRECT: implementado, pero con comportamiento contrario a la especificación.

Un requisito no puede declararse IMPLEMENTED basándose únicamente en la existencia de una interfaz, un comentario o un tipo.

13. Protocolo de desarrollo

La implementación debe avanzar por fases aprobadas:

Fundamentos matemáticos, tipos y modos.
Construcción de acordes, extensiones y alteraciones.
Bajo, inversiones y cifrado.
Funciones aplicadas, mezcla modal y sustituciones.
Estabilidad melódica y análisis métrico.
Presentación visual.
Integración y regresión global.

Cada fase debe incluir:

Requisitos cubiertos.
Archivos modificados.
Pruebas añadidas.
Resultados de ejecución.
Requisitos pendientes.
Riesgos y decisiones técnicas.

No se debe continuar automáticamente a una fase posterior cuando el flujo de trabajo requiera aprobación explícita.

Los commits y pushes requieren autorización independiente y explícita.

14. Criterio final de conformidad

El motor será conforme con esta especificación cuando todos los requisitos normativos aprobados:

Estén implementados en el sistema real.
Produzcan resultados matemáticos y musicales correctos.
Conserven la información necesaria para interpretar el resultado.
Estén cubiertos por pruebas adecuadas.
Mantengan la compatibilidad acordada.
No introduzcan regresiones en los sistemas existentes.
Dispongan de evidencia verificable y trazabilidad documental.

La conformidad debe evaluarse requisito por requisito. Una suite de pruebas global satisfactoria no demuestra por sí sola que todas las reglas musicales estén correctamente implementadas.