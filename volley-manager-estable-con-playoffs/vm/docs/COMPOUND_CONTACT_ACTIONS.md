# Acciones compuestas y contactos simultáneos

## Objetivo y límites

Definir cómo representar hechos físicos del rally antes de convertirlos en golpes reglamentarios. Este documento amplía el contrato de `RALLY_CONTACT_SEQUENCE.md`; no cambia el motor, las probabilidades, el RNG, las estadísticas ni las partidas guardadas.

La unidad de registro no puede ser simplemente «un jugador tocó el balón». El reglamento distingue la acción de juego, los contactos físicos que ocurren durante ella y los golpes que se contabilizan para el equipo.

## Cuatro niveles que no deben confundirse

1. **Acción (`RallyAction`):** unidad de juego resuelta por la simulación, por ejemplo una recepción, una acción de bloqueo o un primer golpe con contactos corporales consecutivos.
2. **Contacto físico (`PhysicalContact`):** hecho de que un jugador o bloqueador toca el balón. Una acción puede contener uno o varios contactos.
3. **Grupo temporal (`ContactGroup`):** relación temporal entre contactos: simultáneos o consecutivos dentro de una misma acción. El orden global no basta para expresar simultaneidad.
4. **Golpe contabilizable (`TeamHit`):** resultado reglamentario derivado de la acción y su contexto. No se obtiene contando jugadores ni contactos sin interpretar la acción.

Un contacto físico no equivale necesariamente a un golpe contabilizable. Tampoco toda acción produce un golpe: el bloqueo es el caso evidente.

## Casos reglamentarios que el modelo debe poder expresar

| Situación | Hecho físico | Efecto en los golpes del equipo |
|---|---|---|
| Bloqueo individual | Uno o más contactos durante la acción de bloqueo | Cero; el bloqueo no consume uno de los tres golpes |
| Bloqueo colectivo | Contactos de uno o varios bloqueadores durante la misma acción | Cero; sigue siendo acción de bloqueo |
| Primer golpe del equipo, contactos consecutivos de varias partes del cuerpo durante la misma acción | Varios contactos físicos de un jugador | Un golpe del equipo |
| Dos compañeros tocan simultáneamente | Dos contactos de jugadores distintos | Dos golpes del equipo |
| Tres compañeros tocan simultáneamente | Tres contactos de jugadores distintos | Tres golpes del equipo |
| Dos adversarios tocan simultáneamente sobre la red y el balón sigue en juego | Contacto simultáneo entre equipos | El equipo que recibe el balón obtiene un nuevo derecho a tres golpes |
| Primer golpe después de un bloqueo propio | Contacto de cualquier jugador, incluido quien bloqueó | Puede ser el primer golpe de los tres; la prohibición de doble golpe consecutivo tiene esta excepción |

La misma cantidad de contactos puede producir resultados reglamentarios distintos según la acción y el contexto. Por eso no se debe inferir el número de golpes únicamente a partir de la longitud de una lista.

## Contrato conceptual propuesto

La siguiente forma es ilustrativa, no una API aprobada ni un tipo que deba implementarse literalmente todavía:

```ts
type ActionKind =
  | 'serve'
  | 'reception'
  | 'set'
  | 'attack'
  | 'defense'
  | 'cover'
  | 'free-ball'
  | 'block';

type TemporalRelation =
  | 'single'
  | 'simultaneous'
  | 'consecutive-within-action';

interface PhysicalContact {
  contactId: string;
  playerId: string;
  team: 0 | 1;
  bodyPart?: string;
}

interface ContactGroup {
  groupId: string;
  relation: TemporalRelation;
  contacts: PhysicalContact[];
}

interface RallyAction {
  actionId: string;
  rallyOrder: number;
  kind: ActionKind;
  actingTeam: 0 | 1;
  groups: ContactGroup[];
  context: {
    isFirstTeamAction?: boolean;
    isFirstActionAfterOwnBlock?: boolean;
    simultaneousOpponentContactOverNet?: boolean;
  };
}
```

El contrato real tendrá que decidir qué campos son hechos obligatorios, cuáles son derivados y cuáles deben rechazarse si la simulación no puede observarlos. Los booleanos ilustrativos no autorizan a inventar contexto: deberán provenir del estado explícito del rally o de la acción resuelta.

### Orden y simultaneidad

- `rallyOrder` ordena acciones resueltas, no contactos individuales.
- `groupId` agrupa contactos simultáneos o consecutivos dentro de una misma acción.
- Los contactos simultáneos no deben recibir un orden artificial entre sí.
- Los contactos consecutivos dentro de una misma acción deben conservar su relación temporal, pero no convertirse automáticamente en acciones distintas.
- No usar timestamps de reloj como sustituto de una relación temporal explícita; la simulación puede operar en pasos discretos.

### Derivación de golpes

Una capa reglamentaria pura deberá convertir acciones y grupos de contactos en cero, uno o varios golpes contabilizables. La derivación deberá considerar, como mínimo:

- tipo de acción y si es bloqueo;
- relación temporal entre contactos;
- cantidad e identidad de jugadores implicados;
- si es el primer golpe del equipo;
- si se trata del primer golpe después del bloqueo propio;
- contacto simultáneo de adversarios sobre la red y continuidad del balón.

El número de golpe no debe venir asignado por el productor de eventos como dato autoritativo. Debe calcularse y validarse a partir de los hechos y del estado previo. Si faltan hechos necesarios, el validador debe devolver un resultado indeterminado/error explícito, no elegir una interpretación por defecto.

## Responsabilidades futuras

Mantener funciones puras y responsabilidades separadas:

1. **Normalización de hechos:** comprobar estructura, identidades y relaciones temporales, sin decidir reglas.
2. **Derivación de golpes:** convertir acciones físicas en golpes contabilizables según las reglas aplicables.
3. **Regla de jugador consecutivo:** evaluar si el mismo jugador puede realizar el siguiente golpe, aplicando excepciones documentadas.
4. **Transición del equipo que continúa:** determinar quién tiene el derecho a la siguiente acción, incluyendo bloqueo y contacto simultáneo adversario.
5. **Validación de terminación:** comprobar que un rally terminado no acepte acciones posteriores y conservar el motivo de terminación.

Estas funciones no deben compartir mutaciones ocultas ni usar RNG. El orden de evaluación y sus entradas deben quedar explícitos.

## Hechos que debe proporcionar la simulación

La capa reglamentaria no puede reconstruir hechos que el motor no resuelve. Para cada acción, el productor deberá suministrar explícitamente:

- equipo y jugadores que intervinieron;
- tipo de acción realmente ejecutada;
- contactos físicos observados y su agrupación temporal;
- si fueron simultáneos o consecutivos dentro de la misma acción;
- contexto reglamentario relevante que el estado pueda demostrar;
- resultado de la acción y equipo que puede continuar;
- si el balón siguió en juego o el rally terminó, y por qué.

No se debe deducir que hubo colocación porque el motor eligió un atacante, que hubo defensa porque el rally continuó, ni que el equipo cambió porque el último contacto fue de un adversario. La simulación debe resolver esos hechos antes de registrarlos.

## Fuera de alcance de este contrato

No pretende resolver todavía:

- legalidad completa del bloqueo, invasión, penetración o contacto con la red;
- contactos fuera de las antenas y trayectoria espacial del balón;
- faltas de ataque, rotación, posición o restricciones específicas del líbero;
- doble contacto y retención en todas sus interpretaciones arbitrales;
- evaluación de trayectorias, alturas y posiciones físicas;
- probabilidades de ejecución, lectura de bloqueo o decisiones tácticas.

Cada regla adicional requerirá fuente reglamentaria, hechos observables, contrato y tests propios. La referencia primaria para este alcance es FIVB, *Official Volleyball Rules 2025–2028*, especialmente reglas 9.1–9.2.3 y 14.2–14.4: https://www.fivb.com/volleyball/the-game/official-volleyball-rules/.

## Compatibilidad y estrategia de implementación

- Mantener `rallySequence.ts` como validador de secuencia normalizada y simplificada; no reinterpretar silenciosamente sus entradas actuales.
- Crear el modelo compuesto como módulo aislado y opt-in cuando el contrato esté revisado.
- No adaptar automáticamente los eventos históricos `atk`, `dig`, `cont`, `blk`, `k1` o `k2` a contactos físicos.
- No conectar el modelo a `rally.ts` hasta que la simulación produzca los hechos requeridos.
- Comparar cualquier futura proyección con las estadísticas y resultados del motor de referencia antes de considerar una migración.

## Criterio de aceptación

El modelo podrá implementarse cuando cada caso de la tabla tenga ejemplos válidos e inválidos, el orden temporal no imponga secuencias ficticias, los golpes se deriven de hechos explícitos y los casos sin información suficiente fallen de forma visible. La implementación inicial deberá limitarse a tipos, normalización y validadores puros con tests; no modificará la simulación existente.
