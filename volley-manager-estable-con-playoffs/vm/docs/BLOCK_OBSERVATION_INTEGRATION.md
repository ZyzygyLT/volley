# Diseño de integración de observaciones de bloqueo

## Decisión

Reutilizar los contratos aislados de contactos físicos y secuencia reglamentaria cuando exista una acción de bloqueo explícita, pero no tratarlos como si ya describieran el matchup atacante-bloqueo. No añadir todavía tipos de producción ni conectar estos módulos con `playRally`.

La siguiente evolución debe separar tres hechos que hoy no están unidos:

1. **Intento de bloqueo:** quién se comprometió a bloquear un ataque concreto, aunque no haya contacto con el balón.
2. **Contacto de bloqueo:** qué jugador o jugadores tocaron físicamente el balón durante la acción.
3. **Resultado del ataque:** si el ataque terminó en bloqueo, continuidad, error o punto.

Un contacto de bloqueo no prueba por sí solo qué atacante se estaba defendiendo ni qué jugadores intentaron bloquearlo. Un intento tampoco prueba que el balón haya sido tocado.

## Auditoría de contratos existentes

### `compoundContacts.ts`

Aporta piezas reutilizables:

- `CompoundRallyAction.kind === 'block'` identifica una acción de bloqueo ya descrita.
- `PhysicalContact` identifica jugador y equipo.
- `ContactGroup` distingue contactos individuales, simultáneos y consecutivos dentro de una acción.
- La validación admite varios bloqueadores del mismo equipo y contactos consecutivos de varios jugadores durante una acción de bloqueo.
- `deriveTeamHits` reconoce que el bloqueo no consume uno de los tres golpes.

Límites:

- La acción no contiene `attackId` ni `attackerId`.
- No registra quién intentó bloquear sin llegar a tocar el balón.
- No contiene carril, dirección, trayectoria ni posición espacial.
- `consecutive-within-action` expresa una relación temporal local, no sincronización de salto o lectura táctica.
- El contrato valida hechos de contacto; no decide el desenlace del ataque.

### `rallySequence.ts`

Aporta orden de contactos y posesiones explícitas, pero cada `RallyContact` representa un solo jugador/acción. No ofrece por sí mismo un grupo de bloqueo simultáneo ni vincula ese bloqueo con un ataque concreto.

### `setterSecondTouchGeometry.ts`

Es geometría explícita en metros para evaluar una situación reglamentaria del segundo toque del colocador. No debe reutilizarse como geometría de bloqueo: no define posiciones de atacantes y bloqueadores, carriles de ataque ni desplazamientos defensivos.

### `rally.ts`

El flujo actual resuelve el desenlace del ataque con el promedio de bloqueo de los tres delanteros defensores. Si el resultado ya es `blk`, selecciona después un único jugador para atribuir el evento estadístico. Por tanto, no hay observación previa de intento ni vínculo causal entre participantes y probabilidad.

Además, `rallyResultAdapter.ts` declara expresamente que adapta el desenlace y no fabrica `CompoundRallyAction` ni contactos. Mantener esa separación es correcto.

## Contrato conceptual futuro

Cuando exista un modelo que pueda producir los hechos, introducir una observación independiente del resultado, asociada a un identificador único de ataque. Como mínimo debe poder distinguir:

- identidad del ataque y del atacante;
- equipo defensor;
- participantes que intentaron bloquear;
- participantes que tocaron el balón, posiblemente ninguno;
- relación entre contactos efectivos: individual, simultánea o consecutiva, cuando se conozca;
- carril/objetivo de ataque, solo si el motor lo determina explícitamente;
- momento de la observación respecto de la resolución del ataque;
- procedencia del dato y estado de disponibilidad.

La observación debe permitir representar explícitamente «no observado» o «desconocido». Una lista vacía de contactos no debe interpretarse automáticamente como ausencia de intento, y una lista vacía de participantes no debe convertirse en bloqueo individual por defecto.

El contrato deberá referenciar los jugadores por ID y podrá reutilizar `PhysicalContact`/`ContactGroup` para los contactos efectivos. No duplicará esos conceptos con otro modelo de contactos. El intento, que puede existir sin contacto, necesita su propia representación.

## Orden de integración requerido

1. El motor genera una identidad de ataque y conserva la identidad del atacante.
2. Antes de resolver el desenlace, produce el intento/observación de bloqueo si el modelo defensivo realmente dispone de esos hechos.
3. El evaluador de probabilidades recibe únicamente los datos observados y validados para ese ataque.
4. El resultado se resuelve con el generador aleatorio existente, sin sortear retroactivamente a los participantes.
5. Si hubo contacto de bloqueo, se registra la acción física y se atribuyen estadísticas según una política explícita para bloqueos individuales y colectivos.
6. Si no hay observación suficiente, se mantiene el comportamiento agregado actual; no se inventan carriles, asignaciones, parejas ni ratings de matchup.

Este orden evita que un resultado `blk` determine retrospectivamente quién supuestamente condicionó el ataque.

## Condiciones para implementar

No comenzar la integración hasta que se cumplan todas:

- Existe una fuente explícita para decidir qué jugadores participan en el intento, o un modelo espacial/táctico documentado que lo genere.
- Existe una relación estable entre intento, ataque y contactos efectivos.
- Está definida la semántica de bloqueo individual, doble y triple, incluida la atribución estadística.
- La ausencia de observación conserva el camino probabilístico legado sin cambios.
- Hay tests de determinismo, no mutación, identidad, bloqueo sin contacto, contacto colectivo, ausencia de carril y ausencia de observación.
- Las comparaciones controladas demuestran exactamente qué datos modifican el cálculo.
- Cualquier parámetro nuevo se calibra con datos empíricos o se etiqueta como hipótesis de diseño.

## No objetivos de esta fase

- No modificar `playRally`, `evaluateAttackOutcome`, `params.ts` ni el consumo de RNG.
- No inferir emparejamientos a partir de roles o índices rotacionales.
- No tratar los tres delanteros como un bloqueo triple automático.
- No convertir el bloqueador estadístico sorteado después del resultado en participante real.
- No interpretar la geometría del segundo toque del colocador como geometría de bloqueo.
- No conectar todavía `compoundContacts` o `rallySequence` al flujo de producción.

## Conclusión

El repositorio ya tiene un contrato útil para describir contactos colectivos de bloqueo una vez conocidos, pero no un modelo del intento defensivo ni un vínculo con el ataque. La ruta de menor riesgo es ampliar la simulación táctica para producir esa observación antes del desenlace y reutilizar los contratos de contacto existentes solo para los hechos físicos que realmente representan. Hasta entonces, el modelo probabilístico agregado debe permanecer intacto.


## Qué permite afirmar la alineación actual (y qué no)

La estructura de `Team.lineup` documenta una asignación rotacional concreta:

- `lineup[0]`: zona 1 (saque);
- `lineup[1]`: zona 6;
- `lineup[2]`: zona 5;
- `lineup[3]`: zona 4;
- `lineup[4]`: zona 3;
- `lineup[5]`: zona 2.

Por tanto, `rally.ts` puede identificar los tres jugadores que están en primera línea en cada rotación. Eso permite construir, en una fase futura, un **conjunto de candidatos reglamentariamente disponibles** para un intento de bloqueo. No identifica quién salta, quién toma al atacante ni quién cierra un espacio.

Hay además dos límites relevantes:

- `effective(team)` sustituye al central de zaga por el líbero para recepción/defensa. No debe usarse como fuente de participantes del bloqueo: el bloqueo corresponde a jugadores delanteros y la lista de candidatos debe derivarse de la alineación y de las reglas de elegibilidad, no de la zaga efectiva.
- `AttackOption.slot` y `AttackOption.zone` identifican la posición rotacional y la distinción primera línea/zaga del atacante. No son carriles de ataque, coordenadas de salto ni dirección de golpeo.

En consecuencia, la información actual permite conocer **quién podría estar disponible para bloquear**, pero no **quién participó realmente**. Elegir automáticamente uno, dos o tres jugadores de ese conjunto sería una nueva política táctica, no una observación derivada del código existente.

## Próxima unidad de modelado recomendada

Antes de implementar una política de selección, separar el problema en dos etapas:

1. **Elegibilidad:** derivar de la rotación los jugadores que pueden participar en el bloqueo, sin RNG y sin asignarles un atacante.
2. **Asignación/intento:** representar quién se compromete contra un ataque concreto, únicamente cuando exista una regla táctica explícita (por ejemplo, sistema de bloqueo definido) o datos observados que permitan establecerlo.

La primera etapa puede probarse con las seis rotaciones y con sustituciones/libero. La segunda no debe inferirse de la elegibilidad, de los roles nominales ni del resultado del ataque. Tampoco debe cambiar todavía las probabilidades.
