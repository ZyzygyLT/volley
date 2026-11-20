# Legalidad del segundo toque ofensivo del colocador

## Fuente reglamentaria

Reglas Oficiales de Voleibol FIVB 2025-2028, edición vigente:
- Regla 13.1: definición y características del golpe de ataque.
- Regla 13.2.1: jugador delantero.
- Reglas 13.2.2 y 13.2.3: restricciones del jugador zaguero.
- Regla 13.2.4: ataque sobre el saque adversario.
- Regla 13.3: faltas del golpe de ataque.

Documento oficial en español:
https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-SP-v02.pdf

## Reglas representadas

1. Un contacto que dirige el balón al adversario es un golpe de ataque, aunque sea el segundo toque del equipo.
2. Un jugador delantero puede completar el golpe a cualquier altura, siempre que el contacto se realice dentro de su propio espacio de juego.
3. Un jugador zaguero puede atacar desde detrás de la zona de frente si despega sin tocar ni cruzar la línea de ataque. Puede aterrizar en la zona de frente después del golpe.
4. Un jugador zaguero que despega desde la zona de frente solo puede completar el ataque si, al contacto, una parte del balón está por debajo del borde superior de la red.
5. Ningún jugador puede completar un ataque sobre el saque adversario cuando el balón está en zona de frente y completamente por encima del borde superior de la red.

## Implementación aislada

`src/engine/setterSecondTouch.ts` implementa `evaluateSetterSecondTouch(situation)`.

El llamador debe aportar explícitamente:
- fila rotacional del colocador;
- zona de despegue respecto de la línea de ataque;
- zona del balón al contacto;
- altura del balón al contacto;
- si el balón procede directamente del saque rival;
- si el contacto está dentro del espacio de juego propio.

El evaluador devuelve una decisión legal/ilegal con un motivo estable. No consume RNG ni modifica el partido.

## Límites importantes

- `takeoffZone: 'back'` significa que el despegue se produjo detrás de la línea de ataque; no se deduce de la fila rotacional.
- La fila rotacional y la ubicación física son conceptos distintos.
- No se simulan todavía coordenadas, salto, trayectoria, altura real ni contacto.
- No se evalúan doble contacto, retención, invasión, toque de red ni oportunidad táctica.
- No se calcula la probabilidad de que el colocador elija atacar.
- El módulo no está conectado a `rally.ts` ni altera eventos, estadísticas, RNG o guardados.

## Próximo requisito antes de integrar

El motor actual solo conserva la calidad de recepción como valor escalar y la fila rotacional del colocador. No representa la ubicación del balón ni el punto de despegue. Para integrar una decisión real, habrá que definir una representación espacial mínima y coherente del rally, o declarar con claridad una abstracción de diseño. No se debe inferir la legalidad a partir de `setterRow` solamente.
