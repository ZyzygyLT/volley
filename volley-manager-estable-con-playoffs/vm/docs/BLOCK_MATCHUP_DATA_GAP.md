# Auditoría de datos para matchup atacante-bloqueo

## Decisión

No introducir todavía un modificador de probabilidad de bloqueo por atacante, zona, pareja o matchup. El estado que produce `playRally` no identifica el bloqueo que realmente se enfrenta al atacante. Aplicar ahora un factor por rol, slot o promedio de bloqueo produciría una apariencia de contexto táctico sin disponer de ese hecho.

El modelo de desenlace permanece intacto y la selección individual del bloqueador sigue siendo posterior al resultado `blk`.

## Qué existe hoy

En `attackOptions.ts`, cada candidato ofensivo conserva:

- jugador atacante;
- índice `slot` en la alineación;
- fila rotacional `front` o `backrow`;
- clase de opción heredada;
- peso del selector.

En `rally.ts`, para resolver el ataque:

1. Se obtiene la alineación defensora y su alineación efectiva.
2. Se calcula `averageOpponentBlock` como la media de `blk` de los tres jugadores en primera línea (`def.slice(3)`).
3. Se calcula `averageOpponentDefense` desde los tres jugadores de zaga de la alineación efectiva.
4. `evaluateAttackOutcome` recibe esos promedios, fase, recepción, habilidad del colocador y parámetros.
5. Solo si el desenlace ya salió `blk`, se sortea un jugador de primera línea con peso `blkWeight[role] * (blk / 70)` y se registra el evento individual `blk`.

Por tanto, el promedio de bloqueo influye en la probabilidad agregada del ataque, pero no determina qué bloqueador o pareja se enfrenta al atacante. El bloqueador registrado no interviene en la probabilidad que acaba de resolverse.

## Matriz de disponibilidad

| Dato | Estado | Observación |
|---|---|---|
| Identidad y rating de ataque del atacante | Disponible | `Player.id`, `role`, `atk` |
| Índice y fila rotacional del atacante | Disponible en `AttackOption` | No es la trayectoria ni el carril del ataque |
| Identidad y rating de bloqueo de los tres jugadores delanteros | Disponible | Alineación defensora, `blk` |
| Roles y pesos de selección de bloqueador | Disponible | `blkWeight` |
| Bloqueador que se atribuye tras un bloqueo exitoso | Disponible solo después del resultado | Se elige por sorteo ponderado |
| Bloqueador(es) que participaron en el intento | No disponible | No hay asignación ni compromiso del bloqueo |
| Bloqueo individual, doble o triple | No disponible | El evento `blk` atribuye un único jugador |
| Emparejamiento atacante-bloqueador | No disponible | No existe una relación entre los jugadores antes de resolver |
| Carril o dirección del ataque | No disponible | `slot` representa rotación, no destino del balón |
| Posición real de atacante y bloqueadores al salto | No disponible | No existe proveedor espacial |
| Tiempo, tempo y sincronización del bloqueo | No disponible | No hay secuencia de aproximaciones ni contactos |
| Lectura, asignación o compromiso del bloqueador | No disponible | No se modela decisión defensiva táctica |

## Consecuencia técnica

No es válido inferir:

- que el central de primera línea bloquea al central atacante;
- que el jugador de zona 4 bloquea al atacante de zona 4;
- que los tres jugadores delanteros forman un bloqueo triple;
- que el bloqueador elegido al registrar `blk` fue quien condicionó el ataque;
- que la fila rotacional del atacante identifica el carril de ataque;
- que el promedio de `blk` representa la calidad de una pareja concreta.

Tampoco debe agregarse un multiplicador por `role` o `slot` como sustituto de estos datos: la auditoría de valor esperado ya mostró que los modificadores por rol pueden dominar la política de selección.

## Contrato de datos para una futura evaluación

Cuando el motor produzca observaciones defensivas explícitas, la evaluación podrá recibir un contexto inmutable separado del desenlace:

- atacante identificado y opción ofensiva;
- carril/objetivo de ataque, si el motor lo determina;
- conjunto de bloqueadores participantes, con identidad y rating;
- tipo de acción defensiva (sin bloqueo, bloqueo individual, doble o triple);
- asignación o compromiso de cada bloqueador, si el modelo lo resuelve;
- procedencia de cada dato y estado explícito de ausencia.

La función pura de matchup deberá rechazar o marcar como no evaluable un contexto incompleto. No debe convertir ausencia de datos en bloqueo individual, promedio, asignación por rol ni posición fija.

La primera versión debe comparar escenarios controlados con los mismos jugadores y ratings, variar únicamente los hechos defensivos observados y reportar sensibilidad. Los parámetros que conviertan matchup en probabilidad requerirán datos empíricos separados por atacante, bloqueador y situación, o deberán etiquetarse inequívocamente como hipótesis de diseño.

## Pruebas y no-regresión requeridas antes de integración

1. Igual contexto produce igual resultado y no consume RNG.
2. El evaluador no muta jugadores, opciones ni observaciones.
3. Un contexto sin bloqueadores identificados no inventa una pareja.
4. Un bloqueo individual, doble y triple solo se distinguen si el estado de entrada los declara.
5. Cambiar una identidad o rating solo afecta al cálculo si el contrato define explícitamente esa dependencia.
6. El evaluador no cambia `playRally`, sus probabilidades, estadísticas, guardados ni consumo de RNG.
7. Un informe de sensibilidad deja claro que no es calibración ni validación deportiva.

## Próximo paso válido

Antes de calcular matchup hay que decidir y modelar qué observación defensiva produce el motor: quién participa en el bloqueo, qué atacante/carril está defendiendo y cuándo se toma esa decisión. Si no se incorpora todavía esa capa de estado, el siguiente trabajo útil es recopilar datos empíricos de bloqueo por situación y mantener el modelo probabilístico actual sin cambios.

## Alcance

Este documento es una auditoría de disponibilidad y un contrato de evolución. No modifica `attackOutcome.ts`, `rally.ts`, `params.ts`, los resultados de partidos ni las estadísticas.
