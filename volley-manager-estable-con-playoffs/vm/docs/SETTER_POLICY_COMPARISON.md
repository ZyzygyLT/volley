# Comparación aislada de políticas de selección del objetivo

## Propósito

Comparar el selector ponderado histórico con el baseline determinista v1 en la capa de elección del objetivo, sin cambiar el comportamiento de los partidos.

## Diseño del experimento

- 6 rotaciones, con el colocador en cada slot.
- 3 calidades de recepción representativas: perfecta, positiva y negativa.
- 18 contextos en total.
- 2.000 muestras del selector histórico por contexto (36.000 selecciones históricas).
- El baseline se evalúa una vez por contexto: el candidato disponible con mayor `atk`; empate por orden de candidatos.
- Semilla independiente y reproducible por contexto.

El harness está en `src/engine/setPolicyComparison.ts` y sus pruebas en `src/engine/setPolicyComparison.test.ts`.

## Métricas registradas

Por contexto, el informe devuelve:

- calidad de recepción y slot del colocador;
- objetivo elegido por el baseline y su atributo `atk`;
- frecuencia histórica por jugador;
- número de ataques propios del colocador seleccionados por el motor histórico;
- proporción de selecciones históricas dirigidas a candidatos con el máximo `atk` disponible.

El selector histórico puede incluir el ataque propio del colocador en primera línea. Ese resultado se conserva como categoría separada en el recuento: no es candidato a una colocación a un compañero y no debe confundirse con una selección del baseline.

## Límites de interpretación

Esta comparación no simula la ejecución del ataque, el bloqueo, la probabilidad de punto ni el resultado de un rally. Mide únicamente diferencias entre mecanismos de selección. No demuestra que el baseline sea tácticamente superior ni que el selector histórico sea una distribución realista de un colocador.

El atributo `atk` de los jugadores y los pesos del selector histórico son los valores actuales del motor; no se recalibran en este experimento. La selección del baseline es deliberadamente determinista y no usa la recepción para inventar restricciones espaciales.

## Criterio de integración

No integrar en `rally.ts` a partir de esta comparación solamente. Antes se debe revisar el informe de los 18 contextos, decidir si el ataque propio del colocador se modelará como acción separada y diseñar una ejecución de colocación que no reutilice de forma engañosa el `setW` actual. Cualquier integración requerirá después regresión multi-semilla de partidos, estadísticas y compatibilidad de guardados.
