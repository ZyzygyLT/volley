# Contrato de acciones ofensivas del colocador

## Objetivo

Separar dos acciones que el selector heredado mezclaba:

1. **Distribución:** el colocador envía la pelota a un compañero elegible.
2. **Segundo toque:** el colocador puede ser considerado como atacante.

Esta separación es estructural. No define todavía cuándo conviene atacar, qué frecuencia debe tener, ni cómo se ejecuta técnicamente.

## Implementación aislada

`src/engine/setterActionOptions.ts` expone `buildSetterActionOptions(context)` y el tipo discriminado `SetterActionOption`.

- `distribution`: contiene al colocador y un objetivo compañero derivado de `buildSetTargets`.
- `setter-second-touch-candidate`: representa al colocador como candidato a una acción de segundo toque.

Si no se identifica al colocador, no se generan opciones. El orden de los objetivos de distribución conserva el orden de elegibilidad ya caracterizado.

## Lo que este contrato NO afirma

- Que el segundo toque sea legal o ejecutable en toda situación. La posición del colocador por sí sola no basta para juzgar la legalidad: faltan trayectoria, contacto, salto y relación con la línea de ataque.
- Que el segundo toque tenga una probabilidad concreta o deba aparecer con cierta frecuencia.
- Que la distribución deba elegir al jugador con mayor `atk`.
- Que el atributo `set` ya represente calidad de decisión o precisión de colocación.
- Que exista un tempo, combinación, lectura de bloqueo o sistema ofensivo implementado.

## Límites de integración

El módulo no se importa desde `rally.ts`. No consume RNG, no modifica jugadores, contexto, rally ni estadísticas, y no cambia los pesos del selector heredado.

Antes de integrarlo se necesita definir y probar, por separado:

1. Condiciones reglamentarias y geométricas para permitir el segundo toque ofensivo.
2. Criterio de decisión entre distribuir y atacar, respaldado por datos o identificado explícitamente como parámetro de diseño.
3. Modelo de ejecución: calidad de pase, desplazamiento, tempo, precisión y compatibilidad del atacante.
4. Resolución del ataque y eventos/estadísticas, sin reutilizar `setW` como si fuera una probabilidad de distribución.
5. Regresión multi-semilla de partidos, estadísticas y guardados.

## Criterio de aceptación de esta etapa

El contrato debe distinguir ambas familias de acción, excluir al colocador de los objetivos de distribución, mantener el orden de candidatos, comportarse sin colocador identificado y no alterar el motor actual. Las pruebas unitarias de `setterActionOptions.test.ts` cubren esos invariantes.
