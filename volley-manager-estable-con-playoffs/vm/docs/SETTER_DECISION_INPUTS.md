# Entradas para la decisión del colocador

## Propósito

Fijar qué información puede usar una futura política de distribución sin añadir atributos duplicados, coeficientes arbitrarios ni cambiar el rally actual. Este documento es un inventario de implementación, no un modelo táctico calibrado.

## Datos que ya existen

| Entrada | Ubicación | Qué permite describir | Qué no demuestra por sí sola |
|---|---|---|---|
| Identidad y rol | `Player.id`, `Player.role` | Quién es el jugador y si es S, OH, MB, OP o L | Calidad táctica de la opción |
| Habilidad de ataque | `Player.atk` | Valoración individual de ataque | Eficacia específica por tempo, trayectoria o emparejamiento |
| Habilidad del colocador | `Player.set` | Valoración técnica existente del colocador | Calidad de decisión, precisión de cada colocación o velocidad del balón |
| Posición rotacional | índice de `lineup` | Zona actual y fila del jugador | Distancia real al punto de colocación o trayectoria de carrera |
| Recepción | `receptionValue`, `receptionQuality` en `AttackContext` | Valor continuo y categoría perfect/positive/negative | Ubicación exacta del pase, altura, velocidad o tiempo disponible |
| Opciones estructurales | `AttackContext.options`, `buildSetTargets` | Atacantes admitidos por la abstracción actual | Repertorio completo de ataques ejecutables |
| Bloqueo rival | `Player.blk` y primera línea rival | Valoraciones de bloqueo disponibles | Quién llega a bloquear a cada atacante, lectura, cierre o matchup |

## Observaciones verificadas en el código

- `Player` ya contiene `set`, `atk`, `blk`, `def`, `rec` y `role`. No se debe crear otro campo equivalente sin una necesidad demostrada.
- `rally.ts` usa actualmente la habilidad `set` como modificador genérico de la probabilidad de kill mediante `setW`. No interviene en la elección del atacante.
- `buildAttackContext` conserva el valor continuo de recepción y su clasificación. La elegibilidad heredada de `buildAttackOptions` sigue usando el valor continuo para su penalización al central; no debe confundirse esa regla histórica con una política nueva.
- `buildSetTargets` extrae candidatos distintos del colocador, sin asignarles pesos.
- La resolución actual promedia el bloqueo de los tres jugadores delanteros rivales. No existe una evaluación individual del bloqueo contra cada candidato.
- La posición del colocador se deriva de la alineación actual. El motor no modela el punto físico del segundo toque.

## Información que falta antes de una decisión táctica real

1. **Estado espacial del pase:** ubicación y desplazamiento del primer toque, no solo una calidad escalar.
2. **Repertorio por situación:** qué tempos y familias de ataque son ejecutables con esa recepción y esa rotación.
3. **Disponibilidad temporal del atacante:** carrera, separación, sincronización y posibilidad real de llegar al balón.
4. **Bloqueo contextual:** bloqueadores que pueden llegar a cada opción, sus posiciones, lectura y emparejamiento.
5. **Calidad de ejecución:** separar la elección del objetivo de la precisión/tempo de la colocación.
6. **Calidad de decisión:** una definición distinta de la habilidad técnica `set`, si el diseño y la evidencia justifican representarla.

No se deben simular estas variables con valores inventados ni inferirlas directamente de `atk`, `set` o `blk`.

## Contrato propuesto para la siguiente implementación

La primera evaluación de candidatos debe ser descriptiva y pura, no una puntuación probabilística. Cada candidato debe poder exponer:

- referencia al jugador;
- rol;
- slot y zona;
- valoración de ataque existente;
- familia de ataque, solo cuando esa familia esté formalmente implementada;
- restricciones o motivos de indisponibilidad, cuando existan reglas explícitas.

La decisión posterior debe ser otra función, con entradas explícitas y RNG inyectado si se requiere aleatoriedad. No debe reutilizar `AttackOption.weight`: esos pesos pertenecen a la selección histórica de atacante, no a la distribución del colocador.

## Criterios para habilitar la integración

- La elegibilidad debe poder probarse para las seis rotaciones y para cada estado de recepción definido.
- Ningún candidato puede ser añadido si no está disponible o no cumple los requisitos de su familia de ataque.
- La habilidad `set` no debe cambiar silenciosamente de significado.
- La elección táctica y la ejecución técnica deben producir resultados distinguibles y trazables.
- La nueva política debe probar determinismo, atribuciones, estadísticas y comparación contra el comportamiento legado.
- No cambiar el formato de guardado ni integrar la política en `rally.ts` hasta cerrar esos contratos.

## Fuera de alcance

Este inventario no define pesos, probabilidades, umbrales nuevos, tempos concretos, combinaciones ni reglas de matchup. Tampoco afirma que los datos actuales permitan reconstruir una decisión real de un colocador profesional.
