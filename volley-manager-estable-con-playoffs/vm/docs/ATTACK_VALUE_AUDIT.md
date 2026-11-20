# Auditoría del informe de valor esperado de ataque

## Alcance

Auditoría del informe generado por `npm run attack-value:report` en CI run 198:

- 20 pares de plantillas sintéticas generadas con `makeSquads`.
- 720 contextos: seis rotaciones × tres calidades de recepción × dos fases (`k1`/`k2`).
- 2.880 evaluaciones de candidatos.
- Solo objetivos compañeros; excluye el segundo toque del colocador.
- No cambia `rally.ts`, no consume RNG y no simula partidos.

El informe calcula el valor esperado inmediato a partir de `evaluateAttackOutcome`. No es una medición empírica de puntos ni una validación deportiva.

## Resultado observado

| Métrica | Media |
|---|---:|
| Política heredada ponderada | 0,366940 |
| Mejor candidato según valor esperado actual | 0,458557 |
| Diferencia analítica | +0,091617 |

Distribución de objetivos:

| Rol | Selector ponderado | Máximo valor esperado |
|---|---:|---:|
| OH | 51,191 % | 2,917 % |
| MB | 20,977 % | 97,083 % |
| OP | 27,832 % | 0 % |

La política experimental elige centrales en casi todos los contextos. No debe interpretarse como evidencia de que los centrales deban recibir el 97 % de las colocaciones.

## Causa identificada: dependencia de parámetros por rol

El informe ejecuta ablaciones contrafactuales, neutralizando parámetros por separado y en conjunto:

| Ablación | Valor esperado medio | OH elegidos | MB elegidos | OP elegidos |
|---|---:|---:|---:|---:|
| Ninguna (modelo actual) | 0,458557 | 2,917 % | 97,083 % | 0 % |
| `roleKill` neutral | 0,416781 | 74,583 % | 22,917 % | 2,500 % |
| `roleErr` neutral | 0,436740 | 7,500 % | 85,000 % | 7,500 % |
| `atkSkillScale` neutral | 0,465026 | 2,917 % | 97,083 % | 0 % |
| Las tres neutralizadas | 0,422437 | 82,917 % | 14,583 % | 2,500 % |

La inversión de la selección al neutralizar `roleKill` muestra que la preferencia por MB está dominada por los términos de rendimiento por rol del modelo, no por una lectura contextual del colocador.

Los promedios de desenlace por rol del mismo informe son:

| Rol | Valor esperado | Kill | Error | Bloqueo |
|---|---:|---:|---:|---:|
| OH | 0,339031 | 48,588 % | 5,790 % | 8,896 % |
| MB | 0,458533 | 57,785 % | 3,036 % | 8,896 % |
| OP | 0,335093 | 49,557 % | 7,152 % | 8,896 % |

La probabilidad de bloqueo es prácticamente idéntica entre roles porque el modelo aplica un promedio de bloqueo del equipo rival; no compara atacante, zona, rotación del bloqueo ni emparejamientos individuales. El informe también usa una calidad de colocador común para todos los candidatos y no modela tempo, disponibilidad de carrera o precisión de la colocación.

## Riesgo de calibración

En `params.ts`, `roleErr` está marcado expresamente como provisional porque la fuente VNL no separa errores de ataque y bloqueos por posición. La auditoría de calibración previa identificó que esa fuente combina ambos resultados, mientras que `attackOutcome.ts` aplica `roleErr` únicamente a la probabilidad de error.

Por tanto, trasladar ese término a la decisión del colocador amplifica una diferencia por rol que no está respaldada por una separación limpia de eventos. No se debe ajustar `roleErr` para forzar una distribución deseada: primero hacen falta datos por rol que separen error y bloqueo o una decisión de diseño documentada y sometida a sensibilidad.

## Decisión técnica

1. No integrar `selectBestExpectedAttack` como política del colocador.
2. No cambiar `roleKill`, `roleErr`, `atkSkillScale` ni los pesos heredados a partir de este informe.
3. Mantener separadas la decisión de distribuir, el segundo toque y la resolución del ataque.
4. Antes de una política táctica, incorporar contexto de bloqueo por atacante/zona, disponibilidad de ataque y calidad de colocación.
5. Validar cualquier cambio con datos separados por resultado y con regresión multi-semilla de partidos, estadísticas y guardados.

## Referencia reproducible

- CI: [run 44811637281](https://github.com/ZyzygyLT/volley/actions/runs/44811637281).
- El informe completo se imprime en el log del job `validate`, paso `Generate expected attack value report`.
- Los resultados son reproducibles para las semillas y parámetros versionados en ese commit; no son una calibración externa.
