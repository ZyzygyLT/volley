# Legalidad del segundo toque ofensivo del colocador

## Fuente reglamentaria

Reglas Oficiales de Voleibol FIVB 2025-2028:
- Regla 13.1: definición y características del golpe de ataque.
- Regla 13.2.1: jugador delantero.
- Reglas 13.2.2 y 13.2.3: restricciones del jugador zaguero.
- Regla 13.2.4: ataque sobre el saque adversario.
- Regla 13.3: faltas del golpe de ataque.

Documento oficial en español:
https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-SP-v02.pdf

## Reglas representadas

1. Un contacto que dirige el balón al adversario es un golpe de ataque, aunque sea el segundo toque del equipo.
2. Un jugador delantero puede completar el golpe a cualquier altura, dentro de su propio espacio de juego.
3. Un jugador zaguero puede atacar desde detrás de la zona de frente si despega sin tocar ni cruzar la línea de ataque. Puede aterrizar en la zona de frente después del golpe.
4. Un jugador zaguero que despega desde la zona de frente solo puede completar el ataque si, al contacto, una parte del balón está por debajo del borde superior de la red.
5. Ningún jugador puede completar un ataque sobre el saque adversario cuando el balón está en zona de frente y completamente más alto que el borde superior de la red.

## Geometría explícita

`src/engine/setterSecondTouchGeometry.ts` convierte hechos espaciales en el contrato reglamentario:

- Coordenadas en metros del campo propio: `x` lateral y `depth` desde el plano de la red hacia la línea de fondo.
- La línea de ataque está a 3 m de la red.
- El despegue debe estar estrictamente detrás de los 3 m para clasificarse como zona de zaguero; tocar la línea cuenta como zona de frente.
- El balón situado en la línea de ataque se clasifica en zona de frente.
- Se compara el borde inferior del balón con la altura de red recibida como parámetro. Solo si el borde inferior supera la red, el balón está completamente por encima.
- La altura de red no se fija a una sola categoría: la competición la suministra (por ejemplo, 2,43 m o 2,24 m).

La pertenencia al espacio de juego propio sigue siendo un dato explícito. No se infiere solo con el rectángulo de 18 × 9 m porque el espacio de juego incluye la zona libre y el espacio aéreo correspondiente.

## Contratos implementados

- `src/engine/setterSecondTouch.ts`: `evaluateSetterSecondTouch(situation)`, evaluador reglamentario puro.
- `src/engine/setterSecondTouchGeometry.ts`: `buildSetterSecondTouchSituation(input)`, conversor geométrico.
- Tests independientes para reglas y límites geométricos.

## Límites importantes

- La geometría aún no forma parte del estado del rally: el motor actual no genera posiciones físicas, saltos, trayectorias ni alturas.
- Los puntos pueden describir la zona libre; el módulo no pretende validar límites de cancha.
- No se evalúan doble contacto, retención, invasión, toque de red ni oportunidad táctica.
- No se calcula la probabilidad de que el colocador elija atacar.
- Ninguno de estos módulos está conectado a `rally.ts`; no altera eventos, estadísticas, RNG ni guardados.

## Próximo requisito antes de integrar

Diseñar un modelo espacial del rally completo sería una ampliación considerable. Antes de hacerlo, conviene decidir si el motor incorporará posiciones continuas para todos los jugadores y el balón, o si la simulación conservará su abstracción probabilística y solo añadirá un contexto espacial acotado para acciones que lo necesiten. No debe inventarse una ubicación física a partir de la rotación.
