# Modelo táctico del partido: diseño incremental

## Propósito

Evolucionar el rally probabilístico actual hacia un ciclo de voleibol reconocible, sin sustituir de golpe el motor ni romper el formato de los partidos guardados. Este documento define fronteras y decisiones; no introduce todavía nuevas probabilidades ni afirma que el modelo esté calibrado.

## Diagnóstico del comportamiento actual

En `src/engine/rally.ts` el flujo es:

1. Se resuelve el saque (error, ace o saque en juego).
2. Se elige un receptor según pesos por rol y se calcula una calidad continua `q`.
3. Se construye el contexto ofensivo y se selecciona un atacante mediante el sorteo ponderado histórico.
4. La calidad de recepción y la habilidad del colocador modifican la probabilidad de éxito, pero no determinan una distribución real.
5. El bloqueo se representa mediante promedios de los tres jugadores delanteros.
6. Si el ataque continúa, el rally alterna entre continuidad/cobertura y defensa/transición.

Por tanto, el motor ya tiene fases y eventos, pero todavía no representa una decisión explícita del colocador. La selección actual del atacante no equivale a una elección táctica de distribución.

## Ciclo objetivo

### Estado explícito de recepción (implementado)

`src/engine/reception.ts` clasifica la calidad continua usando exclusivamente `params.perfQ` y `params.posQ`, los mismos umbrales que ya utiliza `applyEvents` para las estadísticas: `perfect`, `positive` y `negative`. La función es pura y no cambia `q`, las probabilidades ni los resultados del rally. Una recepción marcada como error (por ejemplo, un ace) sigue siendo un evento distinto y no se fuerza dentro de estas tres categorías.

`src/engine/attackContext.ts` reúne el valor continuo de recepción, su categoría y las opciones de atacante construidas por `attackOptions.ts`. Es el contrato de entrada para la futura decisión del colocador. Conserva el valor original y los pesos actuales; no elige un atacante ni altera el rally. Importante: la elegibilidad actual aún usa el valor continuo histórico (`q < 0.5` para la penalización existente al central), no una regla táctica derivada de las tres categorías. También expone el colocador identificado por rol, su índice rotacional y si ocupa zaga o primera línea. Esa posición se recalcula desde la alineación actual (incluidas las rotaciones); si falta el colocador, el contexto lo representa como `null` en lugar de inventar una ubicación. Esto todavía no representa el segundo toque ni determina qué distribución puede ejecutar.

### Selección ponderada de compatibilidad (implementada; no es distribución táctica)

`src/engine/distribution.ts` extrae el sorteo que antes estaba inline en `rally.ts`. Recibe el contexto ofensivo y la función RNG, recorre las mismas opciones en el mismo orden y utiliza sus pesos históricos. La integración sustituye el bloque inline por esta función sin añadir una muestra aleatoria ni consumirla de otra manera: con las mismas entradas y semilla debe seleccionar el mismo atacante.

Esta extracción formaliza el comportamiento legado para que la futura política táctica pueda reemplazarlo de forma controlada. No simula que el colocador esté leyendo el bloqueo o eligiendo una combinación. La habilidad `set` tampoco influye en esta selección: actualmente sigue afectando genéricamente la probabilidad de kill a través de `setW`. No se han añadido tempos, familias, eventos ni multiplicadores nuevos.

## Ciclo objetivo

La evolución debe separar la decisión de la resolución:

`saque → recepción → evaluación de opciones → distribución → ataque → bloqueo/defensa → transición`

### 1. Recepción y estado del balón

La recepción produce un estado explícito derivado de `q`, sin perder el valor continuo que usa el motor actual. La clasificación debe respetar los umbrales documentados en `params.ts` (`perfQ` y `posQ`) y no inventar nuevos cortes.

La calidad condiciona qué opciones están disponibles:
- Recepción controlada: permite considerar el repertorio ofensivo completo que admita la rotación.
- Recepción positiva pero desplazada: reduce las opciones rápidas o dependientes de precisión.
- Recepción deficiente: prioriza opciones de seguridad y balones altos; no debe simularse como si el colocador tuviera todas las opciones.

Los nombres definitivos de los estados y sus reglas se fijarán en código y pruebas antes de calibrar sus efectos.

### 2. Opciones disponibles del colocador

La distribución debe recibir datos explícitos, no consultar la interfaz ni estado global:
- calidad y condición de la recepción;
- posición actual del colocador y si está en primera o segunda línea;
- jugadores disponibles y sus posiciones de rotación;
- rol y habilidades relevantes de cada atacante;
- repertorio ofensivo permitido por la calidad del balón;
- más adelante, lectura y formación del bloqueo rival.

La lista de opciones debe construirse antes de asignar pesos. Una opción ilegal o físicamente no disponible no puede entrar en el sorteo.

### 3. Decisión de distribución

El colocador elige entre opciones viables. La habilidad `set` debe influir en la calidad de la decisión (por ejemplo, precisión, ocultamiento o consistencia de distribución) y no ser únicamente un modificador genérico del porcentaje de kill.

La lógica debe distinguir:
- **elección táctica:** a quién y qué tipo de balón distribuir;
- **ejecución técnica:** precisión/tempo de la colocación;
- **resolución del ataque:** resultado frente al bloqueo y la defensa.

No se asignarán multiplicadores definitivos hasta disponer de evidencia o de una decisión de diseño explícitamente identificada y probada.

### 4. Tipos de ataque y restricciones

El modelo debe poder representar, de forma incremental:
- primer tiempo del central;
- ataque de punta y opuesto;
- bola alta de seguridad;
- ataque de zaguero;
- combinaciones ofensivas, cuando las opciones y sus requisitos estén formalizados.

Cada tipo tendrá requisitos de disponibilidad y un evento identificable. No se deben habilitar combinaciones solo por sorteo si no existen los jugadores y condiciones que las hacen posibles.

### 5. Resolución frente al bloqueo

La resolución debe recibir la opción elegida y el contexto del bloqueo. En una fase posterior podrá considerar:
- atacante y zona de ataque;
- número y calidad de bloqueadores que llegan a tiempo;
- lectura del colocador y del atacante;
- calidad/tempo de la colocación;
- habilidad de bloqueo y compatibilidad de emparejamientos.

La media de bloqueo actual se conservará como referencia de regresión hasta que el nuevo modelo tenga pruebas y calibración suficientes.

## Contratos propuestos

La primera implementación táctica debe extraer funciones puras con contratos pequeños:

- construir opciones de ataque legales a partir de rotación y recepción;
- localizar al colocador y describir su zona rotacional actual;
- calcular atributos observables de cada opción;
- elegir una distribución con el generador aleatorio recibido como argumento;
- devolver una decisión explicable (opción elegida y motivo/categoría);
- resolver el ataque por separado.

No se debe introducir una dependencia de React, navegador, almacenamiento o RNG global.

## Eventos y estadísticas

Los eventos deben permitir reconstruir lo ocurrido sin deducirlo de textos narrativos. La evolución prevista es añadir eventos tipados para distribución y tipo de ataque, manteniendo compatibilidad con los consumidores actuales de `Ev` y `applyEvents`. Antes de modificar el tipo compartido se deben localizar y probar todos sus consumidores.

Cada punto debe seguir siendo atribuible y explicable. Una asistencia solo se acredita cuando corresponde según la acción real; un ataque del colocador no debe recibir una asistencia propia.

## Secuencia de implementación

1. **Caracterización:** pruebas del contrato del rally, determinismo, orden de eventos y validez de atribuciones. No cambia la simulación.
2. **Estado y contexto ofensivo:** clasificar la recepción con umbrales existentes, extraer opciones de ataque según rotación y reunir ambas piezas en `AttackContext`. Implementado como funciones puras; todavía no altera la selección ni el resultado del rally.
3. **Selección de compatibilidad:** extraer e integrar el sorteo ponderado histórico en `distribution.ts`, con pruebas de intervalos y consumo RNG. Implementado; no equivale todavía a una decisión táctica del colocador.
4. **Distribución táctica real:** definir objetivos/familias disponibles, política de selección y uso justificable de la habilidad `set`; añadir eventos solo cuando el contrato esté probado.
5. **Tipos de ataque:** añadir tempos y ataques de zaguero/primer tiempo de forma incremental.
6. **Bloqueo contextual:** sustituir promedios únicamente cuando el nuevo contexto esté probado.
7. **Calibración y regresión:** comparar muchas semillas con el motor de referencia y con objetivos observados; documentar qué métricas se mantienen, cuáles cambian y por qué.

## Criterios de aceptación

- Misma semilla y mismas entradas producen el mismo rally.
- La selección de compatibilidad conserva el orden, pesos y consumo RNG del comportamiento anterior.
- No aparecen opciones ilegales para la rotación o la calidad de recepción.
- El colocador solo distribuye a atacantes disponibles.
- Las decisiones tácticas quedan reflejadas en eventos tipados.
- La suma de eventos sigue cuadrando con las estadísticas de partido y jugador.
- Los cambios no alteran el esquema de guardado.
- Las métricas agregadas se comparan con el modelo de referencia y con las fuentes; no se declara calibración por superar únicamente pruebas unitarias.

## Fuera de alcance de esta primera etapa

Fatiga, lesiones, tiempos muertos, tácticas de entrenador, scouting y nuevas variables de habilidades. Se abordarán después de estabilizar el ciclo recepción–distribución–ataque.

## Objetivos de colocación: contrato inicial

El módulo `src/engine/setTargets.ts` separa los objetivos de una colocación de la selección histórica de atacante. Solo expone opciones etiquetadas como `hitter-attack`, excluyendo al colocador. Conserva jugador, slot y zona rotacional, pero deliberadamente no asigna pesos: los pesos actuales representan la selección heredada de atacante y no probabilidades de distribución del colocador.

Este contrato todavía no simula una colocación real. No decide entre central, punta u opuesto; tampoco representa calidad del pase, tempo, combinación, velocidad/altura de la colocación, lectura del bloqueo ni ataque propio del colocador. El rally sigue usando sin cambios `selectAttackTarget`, incluido el caso heredado del colocador en primera línea. La integración táctica queda pendiente de definir y validar un modelo de decisión y sus eventos.
