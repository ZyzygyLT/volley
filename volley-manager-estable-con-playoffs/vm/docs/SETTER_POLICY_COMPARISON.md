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

## Resultados del experimento v2 — CI run 198

- Workflow: [CI run 44811637281](https://github.com/ZyzygyLT/volley/actions/runs/44811637281).
- Commit: `52945bde8397df953e3f28a8d50d102ed0b4dbcb`.
- 20 rosters sintéticos, semillas consecutivas desde `20261120`.
- 360 contextos (20 × 6 rotaciones × 3 calidades).
- 1.000 muestras históricas por contexto; 360.000 selecciones.

| Métrica | Resultado |
|---|---:|
| OH, selector heredado | 50,276 % |
| MB, selector heredado | 20,727 % |
| OP, selector heredado | 27,466 % |
| S, segundo toque heredado | 1,531 % |
| Primera línea, selector heredado | 74,703 % |
| Zaga, selector heredado | 25,297 % |
| Objetivo baseline OH | 81,667 % |
| Objetivo baseline MB | 15,000 % |
| Objetivo baseline OP | 3,333 % |
| Selecciones históricas que coinciden con máximo `atk` | 28,072 % |

El segundo toque del colocador representa el 3,062 % de las selecciones cuando está en primera línea. En zaga no aparece como opción de ataque en la lógica estructural actual.

Por recepción, la proporción histórica de segundo toque fue 1,389 % (perfecta), 1,402 % (positiva) y 1,802 % (negativa). La proporción de selecciones hacia un candidato con máximo `atk` fue 27,419 %, 27,168 % y 29,629 %, respectivamente.

La proporción de selecciones hacia el máximo `atk` varió entre rosters: mínimo 23,161 %, máximo 42,389 %. Esto confirma que el resultado depende de la plantilla sintética, además de los pesos y candidatos.

Estos valores describen el selector heredado y el baseline abstracto. No representan frecuencias reales de colocación ni justifican cambiar pesos o integrar la política.

