# Acciones compuestas y contactos simultáneos

## Objetivo y límites

Definir cómo representar hechos físicos del rally antes de convertirlos en golpes reglamentarios. El reglamento distingue la acción de juego, los contactos físicos que ocurren durante ella y los golpes que se contabilizan para el equipo.

Este módulo es opt-in y aislado. No modifica `rally.ts`, probabilidades, RNG, estadísticas ni guardados.

## Cuatro niveles

1. **Acción (`CompoundRallyAction`):** unidad de juego resuelta, por ejemplo una recepción o una acción de bloqueo.
2. **Contacto físico (`PhysicalContact`):** un jugador toca el balón. Una acción puede contener varios contactos.
3. **Grupo temporal (`ContactGroup`):** contactos simultáneos o consecutivos dentro de una acción.
4. **Golpe contabilizable (`TeamHit`):** resultado reglamentario derivado; no se obtiene contando contactos sin interpretar su contexto.

Un contacto físico no equivale necesariamente a un golpe. El bloqueo, por ejemplo, no consume uno de los tres golpes.

## Casos reglamentarios

| Situación | Efecto |
|---|---|
| Acción de bloqueo, individual o colectiva | Cero golpes contabilizables |
| Primer golpe del equipo, contactos consecutivos de varias partes del cuerpo durante la misma acción | Un golpe |
| Dos compañeros tocan simultáneamente | Dos golpes |
| Tres compañeros tocan simultáneamente | Tres golpes |
| Adversarios tocan simultáneamente sobre la red y el balón sigue en juego | El equipo que recibe obtiene un nuevo derecho a tres golpes |
| Primer golpe después del bloqueo propio | Puede hacerlo cualquier jugador, incluido quien bloqueó |

Fuentes: FIVB, *Official Volleyball Rules 2025–2028*, reglas 9.1–9.2.3 y 14.2–14.4. [Página oficial de reglas FIVB](https://www.fivb.com/volleyball/the-game/official-volleyball-rules/).

## Contrato implementado

En `src/engine/compoundContacts.ts`:

- `CompoundRallyAction` agrupa una acción identificada, su orden, equipo, tipo, grupos temporales y contexto reglamentario explícito.
- `PhysicalContact` identifica jugador y equipo; la parte corporal es opcional y descriptiva.
- `ContactGroup` usa `single`, `simultaneous` o `consecutive-within-action`.
- `validateCompoundAction` comprueba la estructura y la coherencia local sin inventar contactos.
- `deriveTeamHits` deriva golpes para una acción ya validada: bloqueo = cero; contacto simultáneo de compañeros = uno por contacto; primer golpe con contactos corporales consecutivos del mismo jugador = uno.
- El contacto simultáneo de adversarios sobre la red se representa como una señal explícita de reinicio del derecho a tres golpes. El módulo no determina qué equipo recibe ni actualiza el estado del rally.
- `canPlayerMakeNextHit` comprueba la restricción local de jugador consecutivo y la excepción explícita del primer golpe después del bloqueo propio.

El modelo usa hechos explícitos. No deduce el primer golpe, la continuidad del balón, el equipo receptor ni la posesión. Si falta contexto requerido o la combinación no está soportada, devuelve incidencias y no una interpretación silenciosa.

## Orden y simultaneidad

- `rallyOrder` ordena acciones, no contactos individuales.
- Los contactos simultáneos comparten un grupo; no se les inventa un orden interno.
- Los contactos consecutivos de una misma acción permanecen agrupados.
- No se usan timestamps de reloj como sustituto de relaciones temporales.

## Alcance actual y limitaciones

El módulo implementa solo el contrato local descrito arriba. No es todavía un árbitro reglamentario completo ni una máquina de estados del rally.

En particular, aún no resuelve:

- transición de posesión/equipo que continúa ni acumulación global de golpes;
- qué equipo recibe el balón tras un contacto simultáneo adversario sobre la red;
- validación completa de doble golpe, retención y todas las excepciones del primer contacto;
- legalidad del bloqueo, invasión, penetración o contacto con la red;
- contactos fuera de las antenas, trayectorias y posiciones espaciales;
- faltas de ataque, rotación, posición o restricciones específicas del líbero;
- evaluación probabilística de ejecución, lectura del bloqueo o decisiones tácticas.

La función de jugador consecutivo solo recibe el contexto explícito de primer golpe post-bloqueo. No infiere ese contexto ni cubre todas las excepciones arbitrales.

## Hechos que deberá proporcionar la simulación

Para cada acción futura, el productor deberá suministrar explícitamente:

- equipo y jugadores que intervinieron;
- tipo de acción realmente ejecutada;
- contactos físicos observados y agrupación temporal;
- si fueron simultáneos o consecutivos dentro de la misma acción;
- contexto reglamentario que el estado pueda demostrar;
- resultado y equipo que puede continuar;
- si el balón siguió en juego o el rally terminó, y por qué.

No se debe deducir una colocación porque el motor eligió un atacante, una defensa porque el rally continuó ni un cambio de equipo por el último contacto.

## Compatibilidad

- Mantener `rallySequence.ts` como validador de secuencia normalizada y simplificada.
- No adaptar automáticamente `atk`, `dig`, `cont`, `blk`, `k1` o `k2` a contactos físicos.
- No conectar este módulo a `rally.ts` hasta que el motor produzca los hechos necesarios.
- Cualquier transición global futura deberá ser otra función pura, con estado explícito y tests de reglas FIVB.

## Criterio para avanzar

Antes de integrar el modelo, completar una máquina de estados que derive golpes acumulados y equipo que continúa, cubrir las excepciones reglamentarias aplicables y demostrar con tests que los eventos se producen a partir de acciones realmente resueltas. El registro actual no sustituye ni altera las estadísticas existentes.
