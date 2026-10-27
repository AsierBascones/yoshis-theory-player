IMPLEMENTACIÓN: MIDI IMPORT & HOOKTHEORY TRANSLATION ENGINE
1. Objetivo

Implementar en el proyecto un sistema completo de importación, interpretación y traducción de archivos MIDI a la representación musical interna de la aplicación, utilizando nuestro lenguaje musical inspirado en Hooktheory.

El sistema debe permitir importar un archivo .mid o .midi, analizar su contenido musical y transformarlo en una estructura editable que pueda visualizarse en el Piano Roll, las pistas melódicas, los bloques armónicos y los instrumentos existentes.

No se trata únicamente de leer eventos MIDI. El objetivo es reconstruir, hasta donde permitan los datos, la estructura musical que representan.

Antes de modificar código, inspecciona el repositorio y documenta la arquitectura actual, los modelos de datos, el sistema de importación, el transporte, la representación temporal y las funciones de teoría musical existentes.

2. Reglas obligatorias de integración
Lee y respeta docs/HOOKTHEORY_ENGINE_SPEC.md.
Lee docs/HOOKTHEORY_IMPLEMENTATION_PLAN.md y comprueba qué requisitos ya están implementados.
Reutiliza CanonicalChordIR, src/types/music.ts y src/utils/theoryEngine.ts siempre que corresponda.
Reutiliza el motor rítmico existente. No reescribas ni modifiques src/utils/rhythmEngine.ts salvo que una necesidad concreta, justificada y aprobada lo haga imprescindible.
Reutiliza el sistema de estado, las estructuras de canciones, pistas, secciones y notas ya existentes.
No crees un segundo motor armónico paralelo ni una representación incompatible con la aplicación.
No inventes grados, acordes, tonalidades o inversiones cuando la información sea ambigua.
Mantén separados el análisis musical, la lectura MIDI y la conversión a los modelos internos de la aplicación.

Primero entrega un informe de arquitectura y un plan de implementación con los archivos que pretendes crear o modificar. No empieces por reescribir la aplicación.

3. Arquitectura requerida

Implementa el sistema mediante las siguientes capas, adaptándolas a las convenciones reales del repositorio.

Capa A. MIDI Parser

Responsabilidad: leer archivos MIDI estándar y reconstruir sus eventos.

Debe gestionar:

Formatos MIDI 0 y 1, y detectar explícitamente las limitaciones de cualquier formato no soportado.
Resolución temporal, ticks por negra y tempo.
Compás y eventos de cambio de tempo cuando estén presentes.
Pistas, canales e instrumentos MIDI.
Note On y Note Off, incluyendo Note On con velocidad cero.
Altura, octava, velocidad, duración y posición temporal de cada nota.
Notas simultáneas, acordes, silencios y solapamientos.
Eventos de control y metadatos relevantes, preservando los datos que no se puedan interpretar musicalmente.
Archivos malformados, pistas vacías y notas sin cierre explícito, con manejo seguro de errores.

No asumas que un archivo contiene una única melodía, una única tonalidad ni una pista de acordes separada.

Evalúa primero si el proyecto ya tiene una biblioteca MIDI o una dependencia adecuada. Si se necesita una nueva, justifica la elección y verifica su compatibilidad con el entorno y las licencias del proyecto.

Capa B. Representación Musical Intermedia (IR)

Crea una representación intermedia independiente de la notación Hooktheory.

Debe preservar, como mínimo:

Pistas y su identidad.
Notas con pitch MIDI, pitch class, octava, inicio, duración y velocidad.
Simultaneidad y solapamientos.
Tempo, compás y resolución temporal.
Instrumento y canal cuando existan.
Notas originales y su procedencia.
Metadatos de análisis con un grado de confianza separado de los datos originales.

Conserva la temporalidad original en ticks o en una unidad equivalente exacta. No cuantices ni alteres el ritmo de forma irreversible durante la importación.

La IR debe permitir distinguir entre datos originales del MIDI y propiedades inferidas por el analizador.

Capa C. Análisis Tonal y Armónico

Implementa un analizador que transforme la IR en hipótesis musicales fundamentadas.

Debe contemplar:

Tonalidad

Estimación de tonalidad y modo.
Evaluación de tonalidades candidatas y puntuaciones de confianza.
Uso de armadura y metadatos MIDI cuando sean fiables, sin asumir que siempre son correctos.
Posibilidad de que la tonalidad sea desconocida, ambigua o cambie durante la pieza.

Melodía

Identificación de líneas melódicas por pista y registro.
Conversión de alturas absolutas a grados relativos a la tonalidad.
Representación de alteraciones cromáticas y octavas.
Detección contextual de notas de acorde, notas de paso, bordaduras y otras funciones melódicas cuando exista evidencia suficiente.
Conservación de la distinción entre pertenencia al acorde y estabilidad perceptiva.

Armonía

Agrupación temporal de notas simultáneas o armónicamente relacionadas.
Inferencia de acordes, fundamentales, cualidades, extensiones e inversiones.
Distinción entre fundamental y bajo efectivo.
Reconocimiento de acordes slash, suspensiones, acordes añadidos y alteraciones cuando los datos permitan distinguirlos.
Evaluación de progresiones y continuidad armónica.
Detección de dominantes secundarios, acordes prestados y posibles sustituciones tritonales cuando haya evidencia suficiente.

No interpretes automáticamente cada grupo simultáneo de notas como un acorde independiente: los arpegios, las notas sostenidas, las anticipaciones y el solapamiento entre voces pueden producir falsas detecciones.

Cuando varias interpretaciones sean posibles, conserva candidatos alternativos, confianza y justificación. No fuerces una única respuesta.

Capa D. Adaptador Hooktheory

Implementa una capa que convierta el análisis musical a los modelos de la aplicación.

Debe generar estructuras compatibles con:

CanonicalChordIR.
Los tipos musicales de src/types/music.ts.
Los modelos existentes de canciones, secciones, pistas, acordes y notas.
La notación relativa de grados de escala.
Las cualidades y extensiones de acordes definidas en HOOKTHEORY_ENGINE_SPEC.md.
Los metadatos de inversión, bajo efectivo, préstamos modales y acordes aplicados.
Los colores armónicos derivados del grado del bajo efectivo conforme a la especificación.

La conversión a grados debe usar la tonalidad y el modo correspondientes a cada segmento musical, no una suposición global invariable.

Conserva el pitch MIDI original para que la representación relativa no destruya información sobre octavas, alturas absolutas o alteraciones.

El adaptador debe utilizar el motor de teoría existente para resolver las reglas que ya estén implementadas, sin duplicarlas.

Capa E. Integración con la aplicación

Integra el resultado con el flujo real de importación y edición.

Después de importar un MIDI, el usuario debe poder:

Visualizar sus notas en el Piano Roll.
Identificar las pistas y sus instrumentos.
Visualizar los acordes inferidos y sus grados relativos.
Consultar la tonalidad detectada y la confianza del análisis.
Diferenciar los datos originales de las inferencias del sistema.
Corregir manualmente la tonalidad, los acordes, las inversiones y la segmentación.
Reanalizar la pieza después de corregir los parámetros relevantes.
Conservar los datos originales y evitar pérdidas irreversibles durante la edición.

Respeta la selección de acordes, el transporte, el estado de reproducción, los colores y las convenciones visuales existentes.

La importación debe ofrecer una previsualización antes de modificar la canción activa. Si el usuario cancela o la importación falla, no debe perderse el contenido actual.

4. Requisitos de precisión musical

El sistema no debe confundir:

Fundamental del acorde con nota del bajo.
Acorde en inversión con otro acorde cuya fundamental coincide con el bajo.
add9 con 9.
V/ii con ii/V.
Notas simultáneas con acordes inequívocos.
Grados cromáticos con grados diatónicos.
Acordes prestados con acordes diatónicos de otra tonalidad global.
Información explícita del archivo con inferencias algorítmicas.

En particular, valida expresamente la interpretación de acordes aplicados, como V/ii, utilizando el significado formal de la especificación del proyecto.

Si el MIDI no contiene información suficiente para determinar una propiedad, no la inventes. Conserva la información original y presenta la inferencia como provisional.

5. Estrategia de implementación

Divide el trabajo en fases verificables.

Fase 1 — Auditoría y diseño

Inspeccionar el código y los modelos existentes.
Identificar bibliotecas y flujos de importación disponibles.
Proponer los módulos y contratos de datos.
Documentar decisiones, riesgos y archivos afectados.

Fase 2 — Parser e IR

Implementar la lectura MIDI.
Añadir pruebas con fixtures MIDI reales y sintéticos.
Verificar temporalidad, emparejamiento de notas, pistas y metadatos.
Asegurar que la importación no modifica todavía la canción activa.

Fase 3 — Análisis tonal y armónico

Implementar detección de tonalidad y candidatos.
Inferir melodías, agrupaciones armónicas y acordes.
Reutilizar el motor teórico existente.
Exponer confianza, ambigüedad y procedencia.

Fase 4 — Adaptador e integración

Convertir la IR a los modelos internos.
Integrar la previsualización y la confirmación de importación.
Conectar el resultado con Piano Roll, pistas y transporte.
Añadir edición manual y reanálisis.

Fase 5 — Validación integral

Ejecutar las pruebas unitarias, de integración y de regresión.
Ejecutar compilación, lint y las comprobaciones de tipos disponibles.
Probar la importación en la aplicación real.
Documentar los formatos soportados, las limitaciones y los resultados observados.

No declares una fase completada si solo compila o si únicamente pasan pruebas unitarias.

6. Pruebas obligatorias

Crea pruebas reproducibles que cubran:

Una melodía monofónica sencilla.
Una progresión de acordes en posición fundamental.
Acordes con primera, segunda y tercera inversión.
Acordes slash.
add9 frente a 9.
Dominantes secundarios, incluyendo V/ii y su distinción respecto a ii/V.
Notas cromáticas y acordes prestados.
Arpegios que no deben clasificarse automáticamente como acordes simultáneos.
Notas solapadas entre pistas.
Cambios de tempo y compás.
Silencios, síncopas y ritmos no cuantizados.
Varias pistas melódicas y armónicas.
Archivos vacíos, corruptos o incompletos.
Importación cancelada sin pérdida de la canción activa.
Conversión a IR y vuelta a MIDI conservando las propiedades que la representación soporte.

Incluye fixtures MIDI mínimos y verificables, no solo mocks de funciones internas.

Comprueba por separado:

La fidelidad de lectura MIDI.
La precisión de las inferencias musicales.
La compatibilidad con los modelos existentes.
El comportamiento visual y la interacción real.

No utilices un número elevado de pruebas como sustituto de validar la calidad de las inferencias.

7. Restricciones de seguridad y control de cambios
No hagas commit ni push sin autorización explícita.
No sobrescribas cambios locales existentes.
Inspecciona git status antes de comenzar y antes de finalizar.
Mantén los cambios aislados y documentados.
No modifiques rhythmEngine.ts sin justificación y aprobación.
No afirmes que una prueba, compilación o validación visual se ha ejecutado si no se ha ejecutado realmente.
No afirmes que la aplicación funciona visualmente basándote únicamente en pruebas unitarias o en una compilación exitosa.
8. Criterios de aceptación

La implementación se considerará aceptada únicamente cuando:

Los archivos MIDI compatibles puedan importarse sin perder sus eventos musicales originales.
La IR preserve correctamente notas, duraciones, pistas, simultaneidad y temporalidad.
El análisis genere hipótesis tonales y armónicas explicables, con confianza y tratamiento de ambigüedades.
El adaptador genere estructuras compatibles con el motor y los modelos actuales.
Los acordes, inversiones, bajos efectivos y grados relativos se interpreten coherentemente con la especificación.
La importación se integre en la interfaz y permita revisar y corregir los resultados.
Las pruebas automatizadas y las comprobaciones de compilación pasen.
Se haya realizado una validación funcional en la aplicación y se documenten sus resultados.
Los cambios existentes no relacionados con MIDI permanezcan intactos.
Se entregue un informe final con archivos modificados, pruebas ejecutadas, limitaciones pendientes y riesgos residuales.

Primera acción solicitada: realiza la auditoría del repositorio y presenta el plan técnico concreto antes de empezar a implementar. No hagas commit ni push.