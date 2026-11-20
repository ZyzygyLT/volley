# Secuencia de contactos y posesión del rally

## Objetivo

Definir un registro explícito y auditable de los contactos del balón para que futuras reglas tácticas y espaciales puedan conocer la secuencia real de juego.

Este contrato no modifica el motor actual. El módulo aislado `src/engine/rallySequence.ts` ya define el tipo `RallyContact` y valida invariantes estructurales. No crea contactos ficticios para completar huecos, no cambia probabilidades, resultados, RNG, estadísticas ni guardados.

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

Cada `RallyContact` tiene estos campos:

| Campo | Significado |
|---|---|
| `sequence` | Índice creciente y único dentro del rally |
| `team` | Equipo que realiza el contacto |
| `playerId` | Identidad del jugador que contacta |
| `action` | Acción tipada: saque, recepción, colocación, ataque, defensa, cobertura, toque de bloqueo u otra acción definida |
| `teamHitNumber` | Número de toque reglamentario del equipo, o ausencia explícita cuando no cuenta |
| `phase` | Fase de juego si el motor la conserva; no sustituye al orden de contacto |

El registro debe ser inmutable y estar ordenado. No debe depender de textos de interfaz ni de inferencias posteriores a partir de estadísticas. En el validador aislado actual, cada evento contabilizable representa un golpe lógico ya normalizado, no cada contacto físico del balón. `validateContactSequence` exige secuencia consecutiva desde 1, identidad de jugador, equipo 0/1, posesiones contiguas y de un solo equipo, máximo de tres golpes contabilizables por posesión, bloqueo como primer contacto de la posesión bloqueadora y saque único al inicio.

## Reglas de secuencia que debe respetar

- El saque inicia el rally y no es uno de los tres golpes posteriores del equipo receptor.
- El equipo puede realizar hasta tres golpes reglamentarios antes de devolver el balón, salvo las excepciones reglamentarias aplicables.
- Un contacto de bloqueo no consume uno de los tres golpes del equipo. Después de bloquear, ese equipo conserva la posibilidad de realizar tres golpes.
- El jugador que acaba de bloquear puede volver a realizar el siguiente golpe.
- Una colocación es un contacto real y ocupa su lugar en la secuencia; no puede inventarse solo porque el motor haya seleccionado un atacante.
- Una defensa, recepción o cobertura solo se registra cuando el modelo ha determinado que ese jugador realizó el contacto.
- Un balón que toca el bloqueo puede volver al equipo atacante o permanecer jugable por el equipo defensor. El resultado debe especificar el equipo que continúa la jugada; no se debe inferir una alternancia automática por el mero hecho de que haya habido bloqueo.
- Los errores que terminan el rally deben conservar el punto de terminación y el equipo responsable sin fabricar contactos posteriores.

### Precisiones FIVB 2025–2028 que condicionan el contrato

La edición vigente distingue contacto físico, golpe del equipo y acción:

- Regla 9.1: el equipo dispone de hasta tres golpes, además del bloqueo.
- Regla 9.1.1: un jugador no puede golpear dos veces consecutivas, salvo las excepciones reglamentarias.
- Regla 9.1.2.1: contactos simultáneos de dos o tres compañeros cuentan como dos o tres golpes; el bloqueo es excepción.
- Regla 9.1.2.2: si dos adversarios tocan simultáneamente el balón por encima de la red y este sigue en juego, el equipo que lo recibe dispone de otros tres golpes.
- Regla 9.2.3.1 y 14.2: durante una misma acción de bloqueo se permiten contactos consecutivos rápidos y continuos de uno o varios bloqueadores.
- Regla 9.2.3.2: en el primer golpe del equipo, el balón puede tocar consecutivamente varias partes del cuerpo durante una misma acción.
- Regla 14.4.1: el contacto de bloqueo no cuenta como golpe del equipo; después del bloqueo el equipo dispone de tres golpes.
- Regla 14.4.2: el primer golpe después del bloqueo puede realizarlo cualquier jugador, incluido el bloqueador.

Fuente primaria: FIVB, *Official Volleyball Rules 2025–2028*, reglas 9.1–9.2.3 y 14.2–14.4. Disponible en [la página oficial de reglas FIVB](https://www.fivb.com/volleyball/the-game/official-volleyball-rules/).

Estas reglas muestran que una secuencia de contactos físicos no equivale directamente a una secuencia de golpes contabilizables. El modelo completo necesitará identificar la acción que agrupa contactos consecutivos, distinguir contactos simultáneos y representar el resultado de un toque simultáneo entre adversarios sobre la red. El esquema actual, con un entero `sequence` único y un evento por jugador, todavía no representa esos casos.

La máquina de estados paralela también conserva los jugadores que participaron en la última acción **por equipo**, no solo los del equipo que tenía el turno. Esto es necesario cuando una acción simultánea sobre la red incluye jugadores de ambos lados: el siguiente contacto del equipo receptor debe poder comprobarse contra los jugadores que ya tocaron el balón en esa misma acción. Esta memoria no decide qué equipo recibe el balón; sigue siendo obligatorio que la resolución externa indique `nextTeam` y, para la excepción FIVB, `receivingTeam`.

**Alcance del validador aislado actual:** `validateContactSequence` valida una secuencia normalizada y simplificada: cada evento contabilizable representa un golpe de equipo ya resuelto, y los eventos `block` representan el bloqueo como acción no contabilizable. No debe recibir contactos físicos individuales de una misma acción como si cada uno fuera un golpe separado. Tampoco valida contactos simultáneos, doble contacto, legalidad del bloqueo, jugador que puede tocar consecutivamente ni reinicio de los tres golpes tras contactos simultáneos sobre la red.

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

Cuando el punto termina, la máquina de estados exige además una causa explícita: `fault` con el equipo responsable de la falta, o `winning-action` con el equipo que produjo la acción ganadora. Conserva esa causa junto al ganador del punto y rechaza combinaciones contradictorias (por ejemplo, declarar ganador al mismo equipo responsable de una falta). La clasificación es deliberadamente general: no inventa si el error fue de saque, ataque, red, rotación u otra infracción; esa especificidad solo puede venir de la resolución real del motor. La validación actual no implementa todavía esa máquina de estados: comprueba la estructura y el límite de golpes dentro de los identificadores de posesión que le proporciona la simulación.

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
2. [x] Definir tipos de contacto y validador estructural en un módulo aislado.
3. [x] Validar orden, identidad, equipo, posesiones contiguas, límite de tres golpes, bloqueo y saque.
4. [x] Contrastar el alcance con las reglas FIVB 2025–2028 y documentar las excepciones no representables por el esquema actual.
5. [ ] Ampliar el contrato para acciones compuestas y contactos simultáneos, sin confundir contactos físicos con golpes contabilizables.
6. Diseñar una evolución del simulador que resuelva la colocación y los contactos intermedios antes de emitirlos.
7. Integrar el registro solo cuando las acciones se determinen realmente, manteniendo las estadísticas actuales y comparando resultados con el motor de referencia.

## Criterio de aceptación

No conectar el registro al rally hasta que el motor pueda producir contactos reales para cada acción registrada, las transiciones estén respaldadas por reglas documentadas y los tests demuestren que ningún contacto se inventa ni se omite silenciosamente. El validador actual no demuestra por sí solo que las posesiones asignadas sean correctas ni que toda la secuencia cumpla el reglamento FIVB.

La primera versión del registro no se considerará un simulador reglamentario completo hasta cubrir las excepciones FIVB pertinentes.
