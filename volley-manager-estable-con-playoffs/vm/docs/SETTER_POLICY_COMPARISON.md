# Comparación aislada de políticas de selección del colocador

## Propósito

Comparar el selector ponderado histórico con el baseline determinista v1 en la capa de elección del objetivo, sin cambiar el comportamiento de los partidos.

## Experimento v1: roster único

El primer experimento cubrió:
- 6 rotaciones, con el colocador en cada slot.
- 3 calidades de recepción representativas: perfecta, positiva y negativa.
- 18 contextos.
- 2.000 muestras del selector histórico por contexto (36.000 selecciones históricas).
- El baseline se evalúa una vez por contexto: el candidato disponible con mayor `atk`; empate por orden de candidatos.

Sus resultados históricos se conservan en `SETTER_POLICY_COMPARISON_RESULTS.md`. Son una caracterización de una sola plantilla, no una muestra de rendimiento deportivo.

## Experimento v2: robustez entre rosters generados

El script `scripts/set-policy-report.ts` amplía la observación a:
- 20 rosters deterministas generados por `makeSquads`, con semillas consecutivas desde `20261120`.
- Las mismas 6 rotaciones y 3 calidades de recepción por roster (360 contextos).
- 1.000 muestras del selector histórico por contexto (360.000 selecciones).
- Una corriente RNG reproducible e independiente por contexto.
- El baseline determinista evaluado una vez por contexto.

El informe agrega:
- proporción de selecciones históricas por rol y zona;
- proporción de objetivos elegidos por el baseline según rol;
- frecuencia de segundo toque del colocador sobre todas las selecciones y, por separado, cuando está en primera línea;
- proporción de selecciones históricas dirigidas a un candidato con el máximo atributo `atk`;
- rango y media de esta última métrica entre los 20 rosters;
- desglose por calidad de recepción.

Los rosters son sintéticos y generados por el propio juego. La ampliación permite comprobar si las observaciones del experimento v1 dependen de una plantilla concreta; no equivale a datos de partidos reales ni a una calibración externa.

## Métricas y límites de interpretación

El selector histórico puede incluir al colocador como atacante en primera línea. Ese resultado se conserva como categoría separada: no es una colocación a un compañero.

La proporción de selecciones al máximo `atk` no mide eficacia, calidad de decisión ni probabilidad de punto. Tampoco lo hacen las frecuencias por rol o zona. No se simulan aquí la ejecución de la colocación, tempo, carrera, bloqueo contextual ni resultado del ataque.

Los pesos históricos siguen siendo una regla heredada del motor; no se reinterpretan como preferencias reales de un colocador. El baseline de máximo `atk` sigue siendo una referencia determinista, no la política táctica final.

## Criterio de integración

No integrar una nueva política en `rally.ts` a partir de estos informes solamente. Antes se necesita:
1. separar la acción de distribuir de la acción de segundo toque;
2. definir las condiciones espaciales y reglamentarias para que el segundo toque sea ejecutable;
3. modelar la ejecución de la colocación sin reutilizar `setW` como probabilidad de distribución;
4. introducir datos contextuales del bloqueo y de los atacantes realmente disponibles;
5. comparar resultados de partido multi-semilla y comprobar estadísticas, determinismo y compatibilidad de guardados.

Hasta entonces, los experimentos son observacionales y el motor de partidos permanece sin cambios.
