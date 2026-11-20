# Secuencia de contactos y posesión del rally

## Objetivo

Definir un registro explícito y auditable de los contactos del balón para que futuras reglas tácticas y espaciales puedan conocer la secuencia real de juego.

Este contrato no modifica el motor actual. No crea contactos ficticios para completar huecos, no cambia probabilidades, resultados, RNG, estadísticas ni guardados. Especifica qué debe representar una futura implementación y qué información falta hoy.

## Diagnóstico del motor actual

En `src/engine/rally.ts`:

- El saque en juego y la recepción producen eventos.
- La selección de atacante y la resolución producen un evento `atk`.
- Si el ataque termina bloqueado, se registra `blk` y termina el rally.
- Si el ataque continúa, el motor decide entre continuidad/cobertura en el mismo lado o defensa/transición al otro lado.
- En la transición se registra `dig`, pero la continuidad/cobertura no identifica un contacto concreto.
- No existe un evento de colocación (`set`) ni un contador reglamentario de toques.
- `k1` y `k2` son fases abstractas, no número de toque ni secuencia de contactos.

Por tanto, los eventos actuales son adecuados para estadísticas agregadas, pero no permiten reconstruir todos los contactos reales del balón.

## Modelo conceptual

Un futuro registro debe distinguir tres conceptos que no son intercambiables:

1. **Contacto:** un jugador toca el balón. Tiene equipo, jugador, tipo de acción y orden temporal.
2. **Posesión/control de equipo:** identifica qué equipo puede realizar la siguiente acción de juego. No se deduce únicamente del último jugador que tocó el balón, porque el bloqueo puede devolverlo al equipo atacante.
3. **Toques reglamentarios del equipo:** cuenta los golpes del equipo para el límite de tres. El contacto de bloqueo no cuenta como uno de esos tres toques.

No se debe llamar «posesión» a una mera alternancia de equipos ni inferir un contacto de colocación cuando el motor solo ha elegido directamente un atacante.

## Contrato de un contacto

Cada contacto futuro deberá tener, como mínimo:

| Campo | Significado |
|---|---|
| `sequence` | Índice creciente y único dentro del rally |
| `team` | Equipo que realiza el contacto |
| `playerId` | Identidad del jugador que contacta |
| `action` | Acción tipada: saque, recepción, colocación, ataque, defensa, cobertura, toque de bloqueo u otra acción definida |
| `teamHitNumber` | Número de toque reglamentario del equipo, o ausencia explícita cuando no cuenta |
| `phase` | Fase de juego si el motor la conserva; no sustituye al orden de contacto |

El registro debe ser inmutable y estar ordenado. No debe depender de textos de interfaz ni de inferencias posteriores a partir de estadísticas.

## Reglas de secuencia que debe respetar

- El saque inicia el rally y no es uno de los tres golpes posteriores del equipo receptor.
- El equipo puede realizar hasta tres golpes reglamentarios antes de devolver el balón, salvo las excepciones reglamentarias aplicables.
- Un contacto de bloqueo no consume uno de los tres golpes del equipo. Después de bloquear, ese equipo conserva la posibilidad de realizar tres golpes.
- El jugador que acaba de bloquear puede volver a realizar el siguiente golpe.
- Una colocación es un contacto real y ocupa su lugar en la secuencia; no puede inventarse solo porque el motor haya seleccionado un atacante.
- Una defensa, recepción o cobertura solo se registra cuando el modelo ha determinado que ese jugador realizó el contacto.
- Un balón que toca el bloqueo puede volver al equipo atacante o permanecer jugable por el equipo defensor. El resultado debe especificar el equipo que continúa la jugada; no se debe inferir una alternancia automática por el mero hecho de que haya habido bloqueo.
- Los errores que terminan el rally deben conservar el punto de terminación y el equipo responsable sin fabricar contactos posteriores.

Las excepciones reglamentarias y los casos especiales (primer contacto del equipo, contactos múltiples en una misma acción, bloqueo colectivo, contactos simultáneos, invasiones y faltas) deberán formalizarse con reglas FIVB antes de habilitar validación reglamentaria completa.

## Estado de la secuencia

Una futura máquina de estados deberá mantener, como mínimo:

- equipo que debe realizar la siguiente acción;
- último equipo que realizó un contacto;
- número de golpes reglamentarios acumulados por cada equipo en la secuencia vigente;
- orden del último contacto;
- estado del rally: en juego o terminado;
- motivo y equipo responsable de terminación, cuando corresponda.

La transición debe recibir un evento explícito y devolver un estado nuevo o un error de validación. No debe mutar el estado anterior ni utilizar RNG.

El contador de golpes no puede reiniciarse simplemente porque cambia el equipo que toca el balón: debe reiniciarse de acuerdo con la continuidad real de la jugada y las reglas del bloqueo. Un toque de bloqueo requiere tratamiento específico.

## Separación entre registro y simulación

La arquitectura futura tendrá capas separadas:

1. **Resolución de acción:** determina qué acción ocurrió y quién la ejecutó.
2. **Registro de contacto:** añade el hecho al historial del rally.
3. **Reglas de secuencia:** valida el orden, los golpes y la continuidad.
4. **Resolución del punto:** determina ganador y motivo de terminación.
5. **Proyecciones:** estadísticas, narración, táctica y contexto espacial se derivan del registro sin modificarlo.

El registro no debe decidir por sí mismo si un ataque es exitoso ni generar acciones que la simulación no haya resuelto.

## Compatibilidad con el motor existente

La primera implementación deberá ser paralela y opt-in. Los eventos actuales `Ev` y `Trace` seguirán siendo la fuente de estadísticas existentes hasta que una migración independiente demuestre equivalencia.

No se debe convertir automáticamente:

- `atk` en una secuencia recepción–colocación–ataque;
- `dig` en todos los contactos defensivos;
- `k1`/`k2` en número de toque;
- `cont` en un contacto de cobertura identificado;
- `blk` en cualquier toque de bloqueo que mantenga el balón en juego.

Esas equivalencias no están justificadas por los datos actuales.

## Plan incremental

1. Caracterizar y documentar las transiciones que el motor sí resuelve hoy.
2. Definir tipos de contacto y estado de secuencia en un módulo aislado.
3. Implementar una función pura de validación de secuencias explícitas, con casos de bloqueo y reinicio de golpes.
4. Probar secuencias válidas, inválidas, límites de tres golpes, repetición de jugador tras bloqueo, terminación del rally e inmutabilidad.
5. Diseñar una evolución del simulador que resuelva la colocación y los contactos intermedios antes de emitirlos.
6. Integrar el registro solo cuando las acciones se determinen realmente, manteniendo las estadísticas actuales y comparando resultados con el motor de referencia.

## Criterio de aceptación

No conectar el registro al rally hasta que el motor pueda producir contactos reales para cada acción registrada, las transiciones estén respaldadas por reglas documentadas y los tests demuestren que ningún contacto se inventa ni se omite silenciosamente.

La primera versión del registro no se considerará un simulador reglamentario completo hasta cubrir las excepciones FIVB pertinentes.
