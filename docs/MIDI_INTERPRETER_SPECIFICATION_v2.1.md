Correcciones normativas de la especificación del intérprete MIDI

Versión: 2.1
Tipo de revisión: Correcciones técnicas imprescindibles
Ámbito: SysEx, mapa de tempo, orden de eventos simultáneos y garantías del análisis musical.

1. Codificación y reconstrucción de eventos SysEx

Sustituir y ampliar el apartado 11.1.

1.1. Distinción entre almacenamiento SMF y transmisión MIDI

Los eventos SysEx almacenados en un Standard MIDI File no deben confundirse con los mensajes MIDI transmitidos directamente a un dispositivo.

El parser debe distinguir entre:

El evento codificado en el archivo.
El contenido SysEx almacenado en su payload.
El mensaje o fragmento de mensaje reconstruido para su eventual transmisión.

Los eventos F0 y F7 tienen reglas de almacenamiento específicas en SMF y no deben decodificarse mediante las reglas de los mensajes MIDI de canal.

1.2. Evento SysEx F0

Un evento que comienza con F0 tiene la siguiente estructura:

text
F0 + Length (VLQ) + Payload


La longitud indica el número de bytes almacenados en el payload.

El parser debe conservar el byte inicial F0 como tipo de evento, la longitud original y todos los bytes del payload.

El evento puede contener un mensaje SysEx completo o un fragmento que deba interpretarse dentro de una secuencia de transmisión.

No se debe añadir, eliminar ni modificar automáticamente el byte de terminación F7 durante la lectura.

1.3. Evento SysEx F7

Un evento que comienza con F7 tiene la estructura:

text
F7 + Length (VLQ) + Payload


Este evento puede utilizarse para almacenar una continuación de un mensaje SysEx, un fragmento de una transmisión o datos que deben interpretarse conforme a las reglas específicas de SMF.

El byte inicial F7 identifica el tipo de evento almacenado; no debe tratarse automáticamente como si fuese un byte literal del payload transmitido.

El parser debe conservar el tipo F7, la longitud original y los bytes almacenados sin inferir una interpretación que no esté respaldada por el contexto.

1.4. Reconstrucción y transmisión

El parser debe proporcionar una representación fiel de los eventos SysEx almacenados.

La reconstrucción de una secuencia transmisible debe realizarse en una capa independiente, que aplique las reglas de SMF y MIDI correspondientes.

Esa capa debe distinguir entre:

Evento SysEx completo.
Fragmento SysEx.
Continuación.
Evento de escape F7.
Secuencia incompleta o inválida.

No se deben concatenar automáticamente todos los payloads F0 y F7 de una pista. La reconstrucción debe respetar el orden, los límites de los eventos y las reglas aplicables al formato.

Si la secuencia es ambigua o está incompleta, se conservarán los datos originales y se emitirá un diagnóstico.

1.5. Pruebas obligatorias

Se deben añadir pruebas para:

Evento F0 con payload válido.
Evento F0 con payload vacío, cuando su codificación sea admisible.
Evento F0 truncado.
Evento F7 con payload válido.
Evento F7 utilizado como continuación.
Secuencias SysEx fragmentadas entre eventos.
Longitudes VLQ incorrectas.
Payloads que terminan o no terminan en F7.
Secuencias incompletas al final de una pista.
Preservación exacta del tipo, longitud y bytes almacenados.
Diferencia entre la representación SMF y la secuencia reconstruida para transmisión.

Los resultados deben verificar tanto la fidelidad de parsing como la corrección de la reconstrucción.

2. Política normativa para el mapa de tempo

Sustituir y ampliar los apartados 12.2 y 12.3.

2.1. Pista de tempo en SMF formato 1

En un archivo SMF formato 1, la primera pista se utiliza normalmente como pista de tempo y contiene los eventos de sincronización global, incluidos los cambios de tempo y, habitualmente, los cambios de compás.

El intérprete debe comprobar la ubicación de estos eventos y distinguir entre archivos conformes y archivos que contienen información temporal distribuida de manera no convencional.

La ubicación de un evento de tempo fuera de la primera pista debe generar un diagnóstico de conformidad.

No se debe descartar automáticamente el evento ni modificar el archivo original.

2.2. Modo estricto

El modo estricto debe aplicar las reglas de conformidad definidas por la especificación SMF.

Si un evento de tempo aparece en una ubicación no conforme, el parser debe:

Conservar el evento original.
Emitir un diagnóstico con el código de error o advertencia correspondiente.
Identificar la pista y el tick afectados.
Evitar asignar al evento una prioridad global no respaldada por la especificación.

Cuando la anomalía impida obtener un mapa de tempo conforme, el sistema debe informar de esa limitación.

2.3. Modo de compatibilidad

El modo de compatibilidad puede permitir la interpretación de archivos no conformes, pero debe utilizar una política determinista, configurable y documentada.

La política recomendada es:

Recoger todos los eventos de tempo de las pistas.
Conservar su procedencia y orden original.
Clasificar los eventos de la primera pista como candidatos normativos.
Registrar por separado los eventos de tempo encontrados en otras pistas.
Construir el mapa efectivo utilizando la política de compatibilidad seleccionada.
Marcar el mapa resultante como derivado de una interpretación de compatibilidad cuando corresponda.

La implementación no debe presentar un mapa de compatibilidad como si fuera la única interpretación normativa del archivo.

2.4. Varios cambios de tempo en el mismo tick

Cuando existen varios eventos de tempo en el mismo tick, el parser debe conservarlos todos y mantener su orden original dentro de cada pista.

El mapa efectivo de tempo requiere una política explícita para resolver los cambios simultáneos.

La implementación debe:

Registrar todos los candidatos.
Aplicar la regla normativa cuando la especificación determine el resultado.
En los casos no resueltos por la especificación, utilizar una política determinista de compatibilidad o declarar el resultado ambiguo.
Registrar qué evento se ha utilizado para construir el mapa efectivo.
No eliminar los eventos que no hayan prevalecido.

La elección no debe depender accidentalmente del orden en que se procesen las pistas ni de una ordenación inestable.

2.5. Representación del mapa de tempo

El mapa debe conservar tanto los eventos originales como los segmentos temporales efectivos.

ts
type TempoEventReference = {
  trackIndex: number;
  absoluteTick: number;
  orderInTrack: number;
  microsecondsPerQuarter: number;
};

type TempoSegment = {
  startTick: number;
  endTick?: number;
  microsecondsPerQuarter: number;
  sourceEvents: TempoEventReference[];
  resolutionMode: "strict" | "compatibility";
};


La implementación puede ampliar estos tipos para registrar diagnósticos y conflictos.

2.6. Conversión a segundos

La conversión temporal debe utilizar el mapa efectivo, no una selección de eventos realizada de manera implícita.

Cuando exista un conflicto no resuelto, el sistema debe distinguir entre:

Tiempo calculado mediante un mapa normativo.
Tiempo calculado mediante una política de compatibilidad.
Tiempo no disponible por ambigüedad o invalidez temporal.

La precisión numérica de la conversión no elimina la incertidumbre sobre qué mapa de tempo corresponde aplicar.

2.7. Pruebas obligatorias
Cambios de tempo en la primera pista.
Eventos de tempo en pistas distintas de la primera.
Varios cambios de tempo en el mismo tick.
Cambios simultáneos con distinto orden original.
Archivos sin eventos Set Tempo.
Eventos Set Tempo con valor cero.
Diferencias entre modo estricto y modo de compatibilidad.
Conservación de todos los eventos originales.
Reproducibilidad del mapa efectivo entre ejecuciones.
3. Semántica y orden de eventos simultáneos

Sustituir y ampliar el apartado 13.2 de reconstrucción temporal y añadir las siguientes reglas al modelo de eventos.

3.1. Orden local y orden global

El parser debe preservar el orden original de los eventos dentro de cada pista.

Cada evento debe conservar:

Tick absoluto.
Delta-time original.
Índice de pista.
Índice de orden dentro de la pista.
Posición de origen en bytes, cuando esté disponible.
Tipo y datos originales.

La ordenación global por tick y pista es una representación útil para presentación y procesamiento, pero no debe considerarse una definición universal de la semántica de eventos simultáneos.

Los eventos de distintas pistas que comparten un tick no tienen necesariamente un orden relativo establecido por el archivo.

3.2. Identidad del evento

La implementación debe utilizar un identificador estable de evento o una combinación equivalente de pista, orden local y procedencia.

Este identificador debe permitir relacionar:

El evento original.
Su representación normalizada.
Las notas reconstruidas a partir de él.
Los resultados del análisis musical.
Los diagnósticos relacionados.

La ordenación de presentación no debe modificar la identidad ni la procedencia.

3.3. Operaciones que dependen del orden

Algunas operaciones requieren un orden de procesamiento definido.

Ejemplos:

Program Change y Note On en el mismo tick.
Bank Select y Program Change en el mismo tick.
Cambios de controlador y ataques de nota simultáneos.
Note Off y Note On del mismo pitch en el mismo tick.
Cambios de tempo simultáneos.
Mensajes de control que afectan a la interpretación de eventos posteriores.

El sistema debe distinguir entre:

El orden explícito dentro de una pista.
El orden de procesamiento elegido por la aplicación.
La semántica que puede deducirse normativamente.
La interpretación de compatibilidad cuando la semántica no queda determinada.
3.4. Política de procesamiento

El parser no debe reordenar eventos dentro de una pista.

Cuando la aplicación necesite procesar conjuntamente eventos simultáneos de varias pistas, debe utilizar una política explícita y documentada.

Esa política debe ser configurable cuando existan varias interpretaciones razonables y debe conservar los eventos originales.

Una política de procesamiento no debe presentarse como si fuese un hecho codificado en el archivo.

3.5. Program Change y notas simultáneas

Si un Program Change y un Note On aparecen en el mismo tick:

Si ambos pertenecen a la misma pista, se conservará el orden original.
Si pertenecen a pistas distintas, no se asumirá automáticamente un orden relativo.
La resolución efectiva del programa para la visualización debe documentar cómo trata estos casos.
Si no puede determinarse el programa aplicable de forma fiable, el sistema debe mantener la ambigüedad en lugar de inventar una relación causal.

Los mensajes Bank Select MSB y LSB deben conservarse y evaluarse conjuntamente con Program Change, respetando el orden original y la política de procesamiento definida.

3.6. Note Off y Note On simultáneos

Cuando un Note Off y un Note On del mismo pitch coinciden en el mismo tick, el emparejamiento debe seguir la política documentada de reconstrucción de notas.

La política FIFO se mantiene como opción predeterminada para las notas activas de una misma combinación de pista, canal y pitch.

Sin embargo, los eventos de pistas distintas no deben emparejarse entre sí salvo que una función explícita de la aplicación establezca esa relación.

Las notas reconstruidas deben conservar las referencias a los eventos de inicio y cierre.

3.7. Reproducibilidad

El mismo archivo, procesado con la misma versión del intérprete y la misma configuración, debe producir el mismo resultado normalizado.

Los diagnósticos deben identificar los casos en los que la aplicación haya aplicado una política de compatibilidad.

Las pruebas deben incluir permutaciones de pistas, eventos simultáneos y cambios de programa, verificando que la semántica de los eventos dentro de cada pista no se altera.

4. Límites de la precisión del análisis musical

Sustituir y ampliar los apartados 16 y 23.

4.1. Separación de garantías

El sistema debe diferenciar explícitamente tres niveles de precisión:

Nivel A: fidelidad de parsing.

Garantiza que los bytes y eventos soportados se decodifican y preservan conforme a las reglas implementadas.

Nivel B: fidelidad temporal.

Garantiza que los ticks absolutos se reconstruyen correctamente y que la conversión a segundos utiliza el modo temporal y el mapa de tempo declarados.

Esta garantía está condicionada a la validez de la división temporal y a que el mapa de tempo pueda determinarse.

Nivel C: interpretación musical.

Incluye la detección de acordes, la estimación de tonalidad, la asignación de grados de escala y la inferencia de funciones armónicas.

Estos resultados son inferencias y no tienen la misma garantía de exactitud que la lectura de los eventos originales.

4.2. Ambigüedad armónica

Una colección de notas no determina necesariamente un único acorde.

La interpretación puede depender de:

Nota del bajo.
Inversión.
Notas mantenidas.
Notas de paso.
Distribución rítmica.
Métrica.
Tonalidad de referencia.
Contexto anterior y posterior.
Convenciones de escritura.
Intención musical que no esté representada en el archivo.

El analizador debe conservar varias hipótesis cuando existan interpretaciones plausibles.

No debe convertir una hipótesis preferida en un dato explícito del MIDI.

4.3. Confianza y abstención

El analizador debe poder devolver:

Resultado identificado con evidencia suficiente.
Resultado probable.
Varias alternativas plausibles.
Resultado desconocido.

La confianza debe evaluarse empíricamente.

No debe utilizarse una puntuación numérica como garantía de exactitud si no ha sido calibrada con un conjunto de referencia apropiado.

La ausencia de un resultado no constituye un error de parsing cuando la información musical es insuficiente.

4.4. Procedencia de las inferencias

Cada resultado musical debe permitir identificar:

Los eventos y notas utilizados.
El intervalo temporal analizado.
La tonalidad de referencia, si existe.
Las hipótesis alternativas.
El algoritmo o versión de análisis.
La confianza calculada.
Si el resultado fue inferido, introducido manualmente o derivado de metadatos explícitos.

Los resultados inferidos no deben sobrescribir la representación original.

4.5. Pruebas del análisis musical

La evaluación debe utilizar archivos con anotaciones de referencia y considerar:

Acordes con inversiones diferentes.
Colecciones de notas compatibles con más de un acorde.
Arpegios y acordes desplegados.
Notas de paso y adornos.
Notas mantenidas entre cambios armónicos.
Modulaciones.
Armaduras incorrectas o ausentes.
Piezas atonales o con centro tonal ambiguo.
MIDI obtenido mediante transcripción automática de audio.

Las métricas deben informar de la precisión y también de los casos en los que el sistema se abstiene de clasificar.

4.6. Garantía final

La garantía del intérprete se limita a la fidelidad de los datos soportados, la reconstrucción temporal bajo las condiciones declaradas y la transparencia de sus inferencias.

El sistema no garantiza una interpretación armónica única para todos los archivos.

Su obligación es preservar la información, calcular los tiempos conforme a las reglas aplicables y presentar las interpretaciones musicales como estimaciones revisables cuando no estén determinadas por el contenido del archivo.