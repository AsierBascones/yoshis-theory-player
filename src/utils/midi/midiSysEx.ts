/**
 * midiSysEx.ts
 * Capa independiente de fidelidad y reconstrucción lógica de eventos SysEx (Sección 11.1).
 * Implementa las reglas normativas de MIDI_INTERPRETER_SPECIFICATION_v2.1:
 * - Distingue estrictamente entre almacenamiento SMF y transmisión MIDI física/lógica.
 * - Respeta los bytes originales sin añadir, eliminar o forzar terminadores 0xF7.
 * - Clasifica secuencias en: complete, fragment, continuation, escape, incomplete e invalid.
 * - No concatena indiscriminadamente eventos entre pistas ni inventa secuencias transmisibles ante ambigüedad.
 */

import type {
  MidiSysExEventIR,
  SysExInterpretation,
  SysExInterpretationType,
  SysExDiagnostic,
} from '../../types/midiIR';

/**
 * Reconstruye secuencias lógicas de mensajes SysEx a partir de eventos almacenados en el SMF.
 * Opera de forma independiente para cada pista respetando el orden original y las reglas SMF 1.0.
 */
export function reconstructSysExSequences(
  events: ReadonlyArray<MidiSysExEventIR>
): SysExInterpretation[] {
  if (!events || events.length === 0) return [];

  const results: SysExInterpretation[] = [];

  // Agrupar eventos por pista para no mezclar secuencias entre pistas distintas
  const trackGroups = new Map<number, MidiSysExEventIR[]>();
  for (const ev of events) {
    const list = trackGroups.get(ev.trackIndex) || [];
    list.push(ev);
    trackGroups.set(ev.trackIndex, list);
  }

  for (const [trackIndex, trackEvents] of trackGroups.entries()) {
    // Ordenar estrictamente por orden local original en la pista
    const sorted = [...trackEvents].sort((a, b) => a.orderInTrack - b.orderInTrack);

    let currentFragmentChain: MidiSysExEventIR[] = [];
    let currentFragmentDiagnostics: SysExDiagnostic[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const diagnostics: SysExDiagnostic[] = [];

      // Diagnóstico de payload vacío
      if (ev.payload.length === 0) {
        diagnostics.push({
          code: 'SYSEX_EMPTY_PAYLOAD',
          message: `Evento SysEx ${ev.eventType} con payload vacío (0 bytes)`,
          severity: 'warning',
          trackIndex,
          eventId: ev.id,
          byteOffset: ev.byteOffset,
        });
      }

      // Diagnóstico de longitud declarada vs longitud real de bytes
      if (ev.payload.length < ev.declaredLength) {
        diagnostics.push({
          code: 'SYSEX_TRUNCATED_PAYLOAD',
          message: `Payload SysEx truncado: declarados ${ev.declaredLength} bytes, pero solo hay ${ev.payload.length} bytes`,
          severity: 'error',
          trackIndex,
          eventId: ev.id,
          byteOffset: ev.byteOffset,
        });
      }

      if (ev.eventType === 'F0') {
        // Si ya había una cadena fragmentada abierta sin cerrar, diagnosticarla como incompleta
        if (currentFragmentChain.length > 0) {
          results.push({
            type: 'incomplete',
            sourceEvents: [...currentFragmentChain],
            isTransmittable: false,
            diagnostics: [
              ...currentFragmentDiagnostics,
              {
                code: 'SYSEX_OVERLAPPING_FRAGMENTS',
                message:
                  'Nuevo evento SysEx F0 recibido mientras existía una secuencia fragmentada pendiente sin cerrar',
                severity: 'error',
                trackIndex,
                eventId: ev.id,
                byteOffset: ev.byteOffset,
              },
            ],
          });
          currentFragmentChain = [];
          currentFragmentDiagnostics = [];
        }

        if (ev.endsWithF7) {
          // Mensaje SysEx completo en un único evento SMF: F0 + Payload
          const reconstructed = new Uint8Array(1 + ev.payload.length);
          reconstructed[0] = 0xf0;
          reconstructed.set(ev.payload, 1);

          results.push({
            type: 'complete',
            sourceEvents: [ev],
            reconstructedBytes: reconstructed,
            isTransmittable: true,
            diagnostics,
          });
        } else {
          // Fragmento inicial F0 que espera continuaciones F7
          currentFragmentChain.push(ev);
          currentFragmentDiagnostics.push(...diagnostics);
        }
      } else if (ev.eventType === 'F7') {
        if (currentFragmentChain.length > 0) {
          // Continuación legítima de fragmento anterior
          currentFragmentChain.push(ev);
          currentFragmentDiagnostics.push(...diagnostics);

          if (ev.endsWithF7) {
            // Se cierra la secuencia fragmentada con éxito
            const totalLen =
              1 + currentFragmentChain.reduce((sum, e) => sum + e.payload.length, 0);
            const reconstructed = new Uint8Array(totalLen);
            reconstructed[0] = 0xf0;

            let offset = 1;
            for (const chainEv of currentFragmentChain) {
              reconstructed.set(chainEv.payload, offset);
              offset += chainEv.payload.length;
            }

            results.push({
              type: 'complete',
              sourceEvents: [...currentFragmentChain],
              reconstructedBytes: reconstructed,
              isTransmittable: true,
              diagnostics: [...currentFragmentDiagnostics],
            });
            currentFragmentChain = [];
            currentFragmentDiagnostics = [];
          } else {
            // Continúa abierta esperando más fragmentos
          }
        } else {
          // Evento F7 sin fragmento previo: Escape sequence (SMF Spec 1.0)
          // Los eventos F7 de escape transmiten su payload directamente
          const escapeBytes = new Uint8Array(ev.payload);

          results.push({
            type: 'escape',
            sourceEvents: [ev],
            reconstructedBytes: escapeBytes,
            isTransmittable: true,
            diagnostics,
          });
        }
      }
    }

    // Si al final de la pista quedó una cadena abierta sin F7 final
    if (currentFragmentChain.length > 0) {
      results.push({
        type: 'incomplete',
        sourceEvents: [...currentFragmentChain],
        isTransmittable: false,
        diagnostics: [
          ...currentFragmentDiagnostics,
          {
            code: 'SYSEX_UNTERMINATED_AT_EOT',
            message:
              'Secuencia SysEx no terminada: final de pista alcanzado sin byte de cierre F7',
            severity: 'error',
            trackIndex,
            eventId: currentFragmentChain[currentFragmentChain.length - 1].id,
          },
        ],
      });
    }
  }

  return results;
}
