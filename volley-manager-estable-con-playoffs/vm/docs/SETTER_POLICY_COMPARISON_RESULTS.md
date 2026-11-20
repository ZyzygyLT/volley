# Resultados observados — comparación de distribución del colocador v1

## Ejecución reproducible

- Workflow: [CI run 44673572641](https://github.com/ZyzygyLT/volley/actions/runs/44673572641)
- Commit de la rama: `8459ec3b55a82d88643cf50be6a88e56a84d1ff4`
- Semilla base: `20261120`
- Contextos: 18 (seis rotaciones × tres calidades de recepción).
- Muestras del selector heredado: 2.000 por contexto, 36.000 en total.
- Resultado CI: tests, generación del informe y build completados correctamente.

## Resumen del informe

El baseline determinista seleccionó al jugador `p4` (atributo `atk` = 95) en los 18 contextos. Esto describe únicamente el roster y los candidatos de esta muestra; no demuestra que sea una decisión táctica universal ni que deba integrarse como política final.

| Recepción | Media de `legacyTopAttackShare` por rotación |
|---|---:|
| Perfecta | 30,42 % |
| Positiva | 30,17 % |
| Negativa | 37,27 % |
| **Media simple de los 18 contextos** | **32,62 %** |

La métrica indica qué fracción de las selecciones heredadas recayó en candidatos que compartían el máximo `atk` disponible. No es una tasa de éxito, eficiencia ofensiva ni calidad de decisión: no se simularon colocación, ejecución, bloqueo ni resultado del rally.

## Ataque propio del colocador

El selector heredado eligió al propio colocador en 9 contextos, todos cuando ocupaba primera línea:

| Recepción | Ataques propios del colocador | Sobre 6.000 muestras de los tres contextos de primera línea |
|---|---:|---:|
| Perfecta | 251 | 4,18 % |
| Positiva | 245 | 4,08 % |
| Negativa | 285 | 4,75 % |
| **Total** | **781** | **4,34 %** |

Las 781 selecciones representan el 2,17 % de las 36.000 muestras globales. El denominador del 4,34 % se limita a las 18.000 muestras de contextos en los que el colocador estaba en primera línea.

## Interpretación y límites

1. La selección heredada mezcla dos acciones conceptualmente diferentes: distribuir a un compañero y atacar de segundo toque con el colocador.
2. El baseline siempre elige el máximo `atk` de esta plantilla, pero no incorpora calidad de colocación, tempo, disponibilidad de carrera, bloqueo rival, engaño ni contexto del rally.
3. Una menor frecuencia de selección del máximo `atk` no demuestra que el selector heredado sea peor: sus pesos representan la lógica histórica del motor, no una política validada de colocación.
4. La recepción negativa muestra una media mayor de selecciones hacia el máximo `atk` en esta muestra; no debe interpretarse como adaptación táctica, ya que el experimento solo observa los pesos y candidatos existentes.
5. Los resultados no autorizan a cambiar probabilidades, pesos, estadísticas ni el motor de rally.

## Decisión técnica siguiente

Antes de integrar una política de distribución, el contrato debe separar explícitamente:

- **Acción del colocador:** colocar a un compañero o ejecutar un ataque de segundo toque.
- **Objetivo de colocación:** un candidato compañero elegible; nunca el propio colocador.
- **Ejecución:** calidad/precisión y tipo de colocación, una vez que el motor disponga de entradas suficientes.
- **Resolución:** ataque del compañero o acción ofensiva del colocador, con eventos y atribución estadística coherentes.

La primera tarea de implementación debe ser diseñar y probar ese contrato de acciones como módulo aislado. No se debe inferir una frecuencia de segundo toque a partir de estas 781 selecciones ni integrar todavía `setDecision.ts` en `rally.ts`.
