# Evaluación del valor esperado del ataque

## Propósito

La comparación del selector del colocador mostró que elegir siempre el mayor atributo `atk` concentra el baseline en puntas. El paso siguiente es comprobar si una elección basada en el desenlace que el propio motor ya calcula produce una distribución diferente.

## Implementación aislada

- `src/engine/attackOutcome.ts` calcula las probabilidades de kill, error, bloqueo y continuidad con las mismas ecuaciones que utilizaba `rally.ts`.
- `src/engine/attackDecision.ts` evalúa las opciones disponibles y selecciona la de mayor valor esperado inmediato.
- `scripts/attack-value-report.ts` compara analíticamente esta política con el promedio ponderado del selector histórico.

El valor esperado se define como:

```text
P(kill) - P(error) - P(block)
```

Un kill suma un punto, un error o bloqueo concede el punto al rival y una continuidad no decide el punto. Las probabilidades efectivas respetan el orden de resolución del motor: error, bloqueo y kill. Si la suma de probabilidades excede uno, la continuidad se reduce a cero y el kill ocupa únicamente la probabilidad restante.

## Comparación

El informe utiliza:
- 20 rosters sintéticos reproducibles;
- seis rotaciones;
- tres calidades de recepción;
- fases K1 y K2;
- solo objetivos compañeros, dejando el segundo toque del colocador como acción separada.

El selector histórico se resume mediante el valor esperado medio de sus objetivos, ponderado por los pesos heredados. La política experimental selecciona el candidato con mayor valor esperado bajo las ecuaciones actuales.

## Diagnóstico por posición

El informe también desglosa, para cada rol atacante elegible (OH, MB y OP), el número de evaluaciones y las medias de valor esperado, kill, error y bloqueo, separando además las evaluaciones de primera línea y zaga. Este desglose sirve para detectar si una política aparentemente mejor está explotando una diferencia de parámetros por rol en vez de una ventaja táctica contextual.

Una concentración extrema de selecciones en una posición se considera una señal para investigar, no una recomendación deportiva. En particular, el bonus `roleKill` es una diferencia agregada por rol y no describe el emparejamiento concreto entre un atacante y los bloqueadores que tiene enfrente.

## Límites

Esto no demuestra cuál es la mejor decisión en voleibol real. Es una optimización interna al modelo actual, y hereda sus supuestos y errores.

En particular:
- el bloqueo rival se representa mediante un promedio del equipo, no por emparejamiento contra cada atacante;
- no hay información sobre la calidad ni precisión de la colocación;
- no se modelan tempo, carrera disponible, combinaciones, lectura del bloqueo ni cobertura;
- el atributo `set` afecta por ahora la probabilidad general de kill del equipo, no la precisión individual de cada colocación.

El nuevo selector no está conectado a `rally.ts`. El motor de partidos conserva el selector histórico. La refactorización de las ecuaciones de desenlace comparte el mismo cálculo entre el rally y el evaluador, sin añadir muestras RNG ni cambiar el orden de resolución.

## Criterio para el paso siguiente

Si la comparación muestra una mejora bajo el modelo, el paso posterior no será activarla directamente: primero habrá que incorporar un contexto de bloqueo por zona/atacante y separar la calidad de colocación del efecto general de `set`. Después se podrá realizar una simulación A/B multi-semilla de partidos completos.
