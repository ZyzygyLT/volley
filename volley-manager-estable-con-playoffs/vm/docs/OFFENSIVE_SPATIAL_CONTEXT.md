# Contexto espacial mínimo para acciones ofensivas

## Decisión

Mantener el motor actual como simulación probabilística por fases. No introducir todavía una simulación física de seis jugadores, saltos y trayectorias. Cuando una regla o una decisión táctica necesite geometría, exigir un contexto espacial explícito y acotado para esa acción.

Este documento define el contrato conceptual y la procedencia de sus datos. No añade posiciones ficticias, no cambia el rally y no habilita todavía el segundo toque del colocador.

## Qué conoce hoy el motor

Durante `playRally`, el motor dispone de:

- Las alineaciones de ambos equipos y sus roles.
- El jugador que saca y el tipo de saque.
- El receptor seleccionado y una calidad numérica de recepción.
- La fase abstracta `k1` o `k2`.
- El jugador elegido como atacante y el colocador identificado por rol.
- Eventos abstractos de saque, recepción, ataque, bloqueo y defensa.

La alineación permite conocer la fila reglamentaria de rotación de un jugador en ese momento. No permite conocer dónde está físicamente al despegar, dónde está el balón al contacto, la altura del balón ni si el contacto se produce dentro del espacio de juego propio.

La calidad de recepción tampoco es una coordenada, una trayectoria ni una medida de altura.

## Datos que faltan para evaluar una acción espacial

Para evaluar el segundo toque del colocador con `buildSetterSecondTouchSituation` hacen falta, como mínimo:

| Dato | Fuente necesaria | ¿Disponible hoy? |
|---|---|---|
| Fila reglamentaria del colocador | Alineación vigente y posición de rotación | Sí, derivable de la alineación |
| Punto de despegue | Posicionamiento/movimiento del jugador | No |
| Punto de contacto del balón | Estado espacial del balón en el instante de contacto | No |
| Borde inferior del balón | Estado vertical del balón | No |
| Altura de red | Configuración de la competición | No consta en el contrato del rally |
| Origen del balón (saque rival u otro) | Historial de contactos y posesión | Parcial; el rally conoce el saque inicial, pero no mantiene procedencia por contacto |
| Contacto dentro del espacio propio | Geometría de cancha, lado y espacio aéreo | No |

No completar los datos ausentes con valores por defecto, promedios, coordenadas centrales o inferencias desde la posición de rotación.

## Contrato mínimo propuesto

Cuando exista un proveedor espacial real, el contexto de una acción ofensiva deberá reunir:

1. **Identidad y momento:** equipo en posesión, jugador que contacta y número/orden de toque del equipo.
2. **Estado reglamentario:** fila del jugador según rotación y configuración aplicable de la competición.
3. **Geometría del contacto:** punto de despegue y punto de contacto expresados en el sistema de coordenadas documentado por `setterSecondTouchGeometry.ts`.
4. **Estado del balón:** altura inferior al contacto y procedencia del balón.
5. **Relación espacial:** confirmación calculada de que el contacto pertenece al espacio de juego propio.

La geometría de la acción debe ser un dato de entrada verificable, no una consecuencia inventada de `slot`, `role` o `receptionQuality`. El contexto debe ser inmutable durante la evaluación y distinguir entre dato conocido, dato no disponible y dato inválido. Si falta un dato requerido, la regla espacial no se evalúa: no se presume legalidad.

## Separación de responsabilidades

- **Proveedor espacial:** genera posiciones y estado del balón a partir de un modelo de movimiento o de una fuente de simulación validada.
- **Adaptador reglamentario:** convierte esos datos a `SetterSecondTouchSituation` usando `buildSetterSecondTouchSituation`.
- **Evaluador:** `evaluateSetterSecondTouch` decide únicamente la legalidad cubierta por sus reglas.
- **Decisión táctica:** otro módulo decidirá si el colocador intenta el segundo toque. La legalidad no implica que sea una opción inteligente ni probable.
- **Resolución técnica:** un módulo posterior resolverá ejecución y resultado, sin confundir legalidad con éxito.

No mezclar estos pasos en `rally.ts` hasta que cada uno tenga contrato, datos de entrada y pruebas propios.

## Secuencia recomendada

1. Preservar el motor actual y su comportamiento determinista.
2. Definir la configuración de cancha/competición (incluida la altura de red) como dato explícito, sin fijar un único valor global.
3. Decidir si se implementará un proveedor espacial acotado para el balón y los jugadores implicados en una acción, o un modelo continuo completo. No implementar ambos enfoques en paralelo.
4. Construir un proveedor mínimo solo cuando exista una regla de movimiento defendible y testeable. La primera versión debe poder explicar de dónde sale cada coordenada.
5. Añadir pruebas de procedencia, ausencia de datos, límites geométricos y determinismo.
6. Solo entonces conectar una acción espacial al rally, conservando una ruta de compatibilidad para las jugadas que aún no tengan contexto espacial.

## Fuera de alcance

Este contrato no define velocidades, aceleraciones, altura de salto, tiempos de vuelo, trayectorias, ubicaciones iniciales ni probabilidades de ataque. Tampoco convierte `k1`/`k2` en conteo de toques: son fases abstractas del motor actual. Esos valores requieren diseño y validación independientes.

## Criterio para avanzar

No integrar una regla espacial hasta que podamos producir todos sus datos requeridos sin inventarlos, explicar su procedencia y probar los casos límite. Hasta entonces, el evaluador FIVB permanece aislado y el rally conserva exactamente su modelo actual.


## Decisión de arquitectura del proveedor

Se evaluaron tres enfoques:

| Enfoque | Ventaja | Problema | Decisión |
|---|---|---|---|
| Deducir posiciones desde la rotación y los roles | Muy barato | Confunde posición inicial reglamentaria con ubicación durante la jugada | Rechazado |
| Simular continuamente a los doce jugadores y el balón | Puede representar desplazamientos y trayectorias | Exige reglas de movimiento, parámetros físicos y calibración que el proyecto aún no tiene | Pospuesto |
| Contexto espacial local por acción, alimentado por hechos explícitos | Limita el alcance y permite introducir reglas espaciales gradualmente | Necesita un proveedor válido para cada hecho; no puede inventarlos | Elegido como arquitectura objetivo |

### Alcance de la primera versión futura

El primer proveedor no será un motor físico completo. Será un adaptador de hechos espaciales para una acción concreta. Solo podrá producir un contexto cuando disponga de datos explícitos para todos los campos obligatorios.

No se aceptará como proveedor una función que genere coordenadas pseudoaleatorias, posiciones promedio o ubicaciones fijas por rol/slot. Tampoco se permitirá que la calidad de recepción determine por sí sola dónde o a qué altura está el balón.

### Condición para implementarlo

Antes de escribir el proveedor deben existir reglas de origen para:

- cómo se obtiene la posición de despegue del jugador;
- cómo se obtiene la posición y altura del balón en el contacto;
- cómo se conserva la procedencia del balón entre contactos;
- cómo se determina el espacio de juego propio;
- cómo se configura la altura de red de la competición.

Si alguna de estas fuentes no existe, el proveedor debe devolver explícitamente «no disponible» y la regla espacial no debe ejecutarse.

### Consecuencia para el roadmap

El siguiente trabajo no es añadir coordenadas al rally. Es definir el modelo de contactos y posesión que hoy falta entre recepción, colocación y ataque. El motor actual comprime esa secuencia en una resolución probabilística; mientras siga así, no hay una fuente honesta para generar la geometría del segundo toque. La evolución debe empezar por representar la secuencia de contactos sin cambiar todavía las probabilidades ni los resultados.
