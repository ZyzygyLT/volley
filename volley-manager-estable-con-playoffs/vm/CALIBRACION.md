# Calibración con datos reales — fuentes, método, resultados y límites

## Licencias: criterio aplicado
Un repositorio sin licencia **no** es de uso libre: por defecto rige el copyright (GitHub Docs; choosealicense.com). No se copió código de repositorios sin licencia ni propietarios. Se usaron **cifras** de datos con licencia abierta declarada como objetivos numéricos. No es asesoría legal: que quien subió los datos declare CC0 no garantiza los derechos de origen (copiados de webs de ligas); para uso comercial conviene validarlo.

## Datos usados
| Fuente | Licencia | Qué se usó |
|---|---|---|
| **PlusLiga masculina** (Kaggle) | CC0 | **628 de 2.639 partidos** (2020-21 a 2022-23) → 1.256 equipos-partido. Las temporadas 2008-2018 tienen **las columnas desplazadas** y se descartaron. Los marcadores (2.639 partidos) son válidos en todas |
| **VNL 2024 masculina** (Kaggle) | CC0 | 294 jugadores con posición: ataque, saque, recepción, bloqueo, defensa, colocación |
| Preprint SportRχiv (González et al., 2024) | CC BY 4.0, **sin revisión por pares** | Perfiles por tipo de saque, fases k1/k2, c≈0,8, side-out 0,65–0,70 |
| Reglamento de clasificación FIVB / Volleyball World | — | 3-0 y 3-1 suman 3; 3-2 suma 2 y la derrota 2-3 suma 1; desempate: puntos, partidos ganados, cociente de sets, cociente de puntos |

**Calidad:** en PlusLiga, Rec_Err = aces del rival (99,7 %), Sum = kills+bloqueos+aces (100 %), Att_Eff = (K−E−B)/Att (100 %). En VNL, Tot = Pt+Err+Att y p = Pt/Tot (100 %); allí el "error" de ataque incluye los bloqueados.

**Límite de identificación por posición:** VNL publica `Err` de ataque como agregado de errores y ataques bloqueados. No permite estimar por separado la tasa de error de ataque y la de bloqueo para cada rol. Por eso `eb.{rol}` se conserva como comparación diagnóstica, pero no ajusta `roleErr`, que solo modifica el error de ataque en el motor. Los valores iniciales de `roleErr` quedan provisionales hasta disponer de datos por posición con ambos desenlaces separados.
**Columna descartada:** `BP` de PlusLiga **no** es "puntos ganados al saque" (con esa definición el 29 % de los partidos tendría un ganador con menos de 75 puntos; la descripción del dataset dice "puntos en contraataque al saque propio"). Por eso el side-out no se mide con PlusLiga y se valida contra el preprint.

## Las tres fuentes coinciden
| Métrica | PlusLiga 2020-23 | VNL 2024 | Preprint |
|---|---|---|---|
| Ace por saque | 6,3 % | 5,9 % | ≈ 6 % |
| Error de saque | 18,2 % | 18,7 % | ≈ 17 % |
| Kill por ataque | 49,9 % | 49,1 % | k1 ≈ 50 % |
| Error + bloqueado por ataque | 15,1 % | 14,9 % | k1 ≈ 16 % |
| Recepción perfecta | 20,6 % | 20,0 % | — |

## Modelo
- Plantillas de 7 (6 titulares + **líbero**, que sustituye al central en la zaga; VNL: recibe el 28 % de los saques y hace el 25 % de las defensas).
- Diferencias por posición (VNL): volumen y eficacia de ataque (central 59 % de kill, opuesto 49 %, receptor 46 %), saque, recepción, reparto de bloqueos (central 48 %) y de defensas.
- Tipo de saque por posición derivado de VNL con los perfiles por tipo del preprint (opuesto y receptores casi siempre en salto potente; un central en salto y otro flotado).
- Umbrales de recepción "positiva" y "perfecta" fijados por cuantiles (46,6 % y 20,6 % de PlusLiga).
- **Errores de manejo** (toque de red, dobles, rotación): PlusLiga tiene un 2,4 % de rallies que terminan así (100 % − aces − errores de saque − kills − bloqueos − errores de ataque); se añadieron al motor y se atribuyen al colocador.
- **Sustituciones con las reglas FIVB** (verificadas en varias fuentes): 6 por set; el cambio de líbero no cuenta; un titular solo puede ser reemplazado una vez por set y el suplente solo puede ser cambiado por el titular al que sustituyó (vuelve a su posición). No se modelan los tiempos muertos: no hay datos de su efecto.
- Plantel de gestión de 13 jugadores (2 colocadores, 4 receptores, 3 centrales, 2 opuestos, 2 líberos) con alineación elegible.

## Resultados (`npm test` / `scripts/calibrate-cli.ts report`): 47 de 47
41 métricas comparadas con objetivos (nivel de liga PlusLiga + diferencias por posición VNL; las métricas VNL `error+bloqueado` por rol son diagnósticas y no se usan para ajustar `roleErr`) y **6 de validación independiente**: side-out 68,2 % (preprint 65–70 %), ataques por rally 1,14 (PlusLiga 1,13), rallies por set 44,9 (PlusLiga 45,0) y la **composición del final de los rallies** (ver abajo). Tolerancias elegidas por el autor del proyecto.

### Cómo terminan los rallies (validación independiente de las tasas por acción)
| Final del rally | PlusLiga (106.556 rallies) | Motor |
|---|---|---|
| Ace | 6,3 % | 6,2 % |
| Error de saque | 18,2 % | 18,0 % |
| Kill | 56,2 % | 56,4 % |
| Bloqueo | 9,4 % | 9,5 % |
| Error de ataque | 7,6 % | 7,5 % |
| Otros errores | 2,4 % | 2,4 % |

## Validaciones adicionales (no usadas para ajustar)
**1. Variabilidad real entre equipos-partido** (desviación típica en pp, descontando el ruido de muestreo), PlusLiga vs motor: ace 1,4 vs 1,7; error de saque 1,8 vs 1,9; recepción perfecta 4,3 vs 5,2; kill 4,3 vs 4,6; error de ataque 0,6 vs 0,8; bloqueado 1,6 vs 1,0. *(Esta comprobación detectó que antes el motor era ~2× más variable en error de saque, recepción y error de ataque; se corrigió reduciendo pendientes y la aleatoriedad en la composición de tipos de saque.)*
**2. De tasas a victorias** (regresión logística de ganar sobre diferencias de tasas; 628 partidos reales vs 2.500 simulados; coeficiente por punto porcentual): ace 0,303 vs 0,362; error de saque −0,223 vs −0,208; recepción perfecta 0,023 vs 0,006; kill 0,325 vs 0,359; error de ataque −0,341 vs −0,256; bloqueado −0,298 vs −0,252. **Los seis dentro de 1,5 errores estándar de PlusLiga.** Acierto al predecir el ganador: 92,5 % real vs 91,3 % motor. *(Con el motor sin errores de manejo, ace y kill pesaban 30–40 % más que en la liga real: esos errores eran la pieza que faltaba.)*
**3. Marcadores en una liga** (`TEAM_SD`=3,6; 1.300 partidos, ±1,4 pp): 3-0 / 3-1 / 3-2 = 41,1 / 34,9 / 24,0 % vs PlusLiga (2.639 partidos) 41,8 / 34,1 / 24,0 %; rallies por set 45,1.
**4. Dispersión entre jugadores** (desv. típica real de la tasa, motor vs VNL): kill receptor 4,5 vs 5,3; kill opuesto 4,6 vs 4,5; kill central 2,5 vs 2,5; recepción perfecta líbero 5,4 vs 5,0 y receptor 4,6 vs 3,4. Aces por posición: opuesto 2,1 vs 3,6; central 2,6 vs 1,6; colocador 3,2 vs 1,9 (muestras pequeñas).
**5. Fases:** k1 kill 53,1 % y k2 42,4 % (preprint ≈ 50 % y 42–47 %; k1 queda algo alto porque PlusLiga exige 49,9 % en total).

## Peso de cada habilidad (+10 puntos a los 7 jugadores; equipos iguales; 400 partidos, ≈ ±2,5 pp; base 49 %)
Ataque 66,5 % · Defensa 66,3 % · Saque 61,8 % · Bloqueo 61,0 % · Recepción 57,8 % · Colocación 56,0 % · Consistencia 53,8 %.
Las pendientes (puntos de valoración → probabilidad) son decisiones de diseño: **no** salen de los datos. La variabilidad entre equipos y la regresión de victorias las acotan, pero no las fijan.

## Tipo de saque y táctica de riesgo (diseño)
- `pressure`=4: a nivel de rally el sacador gana potente 31,7 %, flotado en salto 31,9 %, flotado de pie 30,6 %. Supuesto: los equipos de élite usan el potente en ≈70 % de los saques, así que se asume que compensa su error con peor recepción rival.
- `useRisk`=0,045: la táctica de riesgo tiene un óptimo suave en 50 % (31,1 / 31,3 / 31,6 / 31,4 / 31,3 % para riesgo 0 / 25 / 50 / 75 / 100): importa poco.

## Playoffs
Al terminar la doble vuelta clasifican los 4 mejores: semifinales 1°-4° y 2°-3° **al mejor de 3**, final **al mejor de 5** y partido por el bronce **al mejor de 3**. El mejor clasificado de la fase regular es local en el primer partido y la localía **alterna después de cada partido**; la ventaja de local se aplica igual que en la liga.
- **Origen:** las series al mejor de 3, la final al mejor de 5 y la localía alterna están tomadas de la fórmula de la PlusLiga publicada por Volleyball World (https://en.volleyballworld.com/news/competition-formula-men-polish-league-2024). La PlusLiga clasifica a 8 equipos y los formatos cambiaron entre temporadas; **el cuadro de 4 equipos es una adaptación de diseño** al tamaño de esta liga.
- **Diseño del juego:** premios y finanzas de playoffs (entradas de $ 40.000 por partido en casa y el premio por victoria; los salarios ya se pagaron en la fase regular). El premio de fin de temporada ahora se paga según la **posición final** (campeón, finalista, bronce, cuarto y luego la fase regular).
- **Estadísticas:** los partidos de playoffs suman a las estadísticas de la temporada y al histórico, pero no a la clasificación de la fase regular.
- **Pruebas:** 8 pruebas específicas (cuadro 1°-4° y 2°-3°, victorias necesarias, sin partidos de más, localía alterna, final entre ganadores y bronce entre perdedores, ranking final coherente, determinismo, partido en vivo = simulado, finanzas, guardado a mitad de playoffs, migración v4 → v5) y la prueba aleatoria y la de importación corrompida incluyen estados de playoffs. En Chromium: 10 comprobaciones (`scripts/ui-test-playoffs.py`).

## Auditoría y mejoras (última ronda)
Se revisó todo el proyecto con herramientas y se corrigió lo encontrado. Cada punto indica cómo se detectó.
| Hallazgo | Cómo se detectó | Qué se hizo |
|---|---|---|
| El motor hacía que el equipo local **siempre sacara primero** en los sets 1, 3 y 5 (artefacto: ganaba el 52,4 % sin ninguna ventaja) | Medir el reparto local/visitante con ventaja 0 | Sorteo determinista del primer saque (set 1 y 5) y alternancia; con ventaja 0 el reparto es 50,6 % |
| **Ventaja de local**: el equipo listado primero en PlusLiga gana el **54,2 %** (± 1,0; 4,4 errores estándar sobre 50 %) y el 53,4 % de los sets; el 98,3 % de los pares aparece en ambos órdenes (por eso se infiere que es el local; es una inferencia) | Datos de PlusLiga no usados hasta ahora | `HOME_BOOST` = +0,8 puntos de valoración al local: 54,6 % de victorias y 53,6 % de sets en simulación |
| Los **colocadores no atacaban**; en VNL hacen el 1,7 % de los ataques con 40,7 % de kill | Datos de VNL por posición | El colocador ataca en la red; sus objetivos se añadieron a la calibración (47 de 47) y no suma asistencia en su propio ataque |
| **Importar partidas corrompidas**: 121 de 1.500 mutaciones al azar (8 %) pasaban la validación y rompían el juego o el importador | Prueba con archivos de guardado alterados al azar | Validación estructural completa (tipos, rangos, calendario exacto, estadísticas, tamaños; tope de 3 MB). Resultado: **0 fallos en 4.000 mutaciones**, también como prueba permanente |
| Liberos jóvenes de la cantera con ataque y bloqueo **negativos** (valores no usados) | La validación nueva los rechazó | Se acotan a ≥ 0 al generarlos y al cargar partidas viejas |
| El archivo de pruebas **importaba dos veces** la misma función y tenía errores de tipos; el CLI usaba `process`, que la plantilla de Vite no tipa | Compilar con las opciones estrictas de la plantilla de Vite (`noUnused*`, `verbatimModuleSyntax`, `erasableSyntaxOnly`) | Corregido; el CLI se movió a `scripts/` |
| Aumento del nivel (+3) y de jugadores de 80 o más (10 → 18) en 30 temporadas | Simulaciones largas | Regresión a la media del 6 % anual (diseño): nivel 72,2 → 72,5; jugadores de 80 o más 10,0 → 11,0; diferencias entre equipos estables (media 2,33) |
| Sin manejo de errores de dibujo (pantalla en blanco) y sin información de fuentes en el juego | Revisión de la interfaz | `Boundary` con mensaje y recarga (probado con una compilación que falla a propósito) y pestaña "Acerca de" con fuentes, licencias y siglas; `ATRIBUCIONES.md` |
**Revisado sin hallazgos:** rendimiento (14,5 ms por partido en Node; 88 ms en el navegador para un partido completo; partida guardada de 41–49 KB tras 10 temporadas) y accesibilidad básica (ningún control sin nombre accesible; idioma `es`).

## Capa de gestión e interfaz
- **Liga:** 8 equipos a doble vuelta (método del círculo), clasificación con puntos FIVB y desempate completo (puntos, victorias, cociente de sets, cociente de puntos). Se puede elegir el equipo antes de la primera jornada.
- **Partido:** cancha en vivo con rotaciones, parciales por set, sustituciones con las reglas FIVB, estadísticas por jugador y acumuladas.
- **Plantel y mercado:** hasta 16 jugadores con edad, alineación elegible y validación; agentes libres con filtro por posición, orden (valoración, precio, edad) y "solo los que puedo pagar"; fichar y vender (bloqueado mientras hay un partido en curso; con la temporada terminada el usuario ficha antes que las computadoras).
- **Ventaja de local, primer saque por sorteo y ataque del colocador** (ver Auditoría).
- **Ojear:** ficha de cada jugador (edad, saque, siete valoraciones, valor, estadísticas históricas) y vista del plantel de cualquier equipo con sus titulares.
- **Resumen del partido:** totales por equipo, parciales y mejor jugador. La valoración del mejor jugador es una **heurística de juego propia** (puntos propios − ½ errores − ¼ ataques bloqueados + 0,2 asistencias + 0,1 defensas), no una métrica oficial.
- **Autoguardado:** después de cada cambio; al volver a abrir se ofrece continuar o empezar de cero.
- **Finanzas:** presupuesto, patrocinio, entradas, premios y salarios por jornada, con libro de cuentas por temporada.
- **Temporadas:** fase regular, **playoffs** (ver abajo), premio según el puesto final, historial, histórico de estadísticas e **intersemana**.
- **Guardado:** 3 ranuras en IndexedDB, copia de seguridad en texto y exportar/importar JSON, con validación y migración de versiones (v1 → v5).
- **Economía = diseño, no datos.** Precios, salarios, patrocinio, entradas y premios (`src/game/economy.ts`).

## Edades, progresión, retiros y fichajes de las computadoras (`src/game/ages.ts`, `offseason.ts`)
| Pieza | De dónde sale |
|---|---|
| **Edades iniciales** por posición (colocador 29,1 · líbero 28,2 · central 27,9 · opuesto 27,2 · receptor 26,9; desv. típica 4,3–5,2; rango 18–40) | **Dato:** `Birth_Year` de VNL 2024 (303 jugadores) |
| **Riesgo anual de retiro** logístico (a0 = 38,5; s = 2,75): 4 % a los 30, 12 % a los 33, 22 % a los 35, 37 % a los 37, 55 % a los 39 | **Ajuste:** se eligió para que la pirámide de edades en estado estacionario (entradas de 18–22 años) reproduzca la de VNL: edad media 27,6 (VNL 27,7) y 10,7 % de mayores de 35 (10,6 %). Supone una liga estacionaria y que salir de la selección equivale a retirarse |
| **Forma de la curva de progresión** (los jóvenes mejoran, pico a los 25–29, declive desde los 30; más tarde en colocadores y líberos; lo físico declina antes que lo técnico) | **Literatura y datos con efectos pequeños:** el pico del voleibol se ubica en 22–26 años y más tarde en colocadores y líberos (revisión de la literatura citada en Frontiers/PMC); en VNL 2024 los mayores reciben mejor (+0,28 pp/año) y sacan con menos errores (−0,30 pp/año), con efectos pequeños en ataque (±1–2 pp), en un corte transversal con sesgo de selección |
| **Magnitudes** (+2,0 a +1,0 puntos por año hasta los 24, 0 entre 25 y 29, −0,8 a −1,6 desde los 30; variación individual 1,2–1,5) | **Diseño:** no hay datos longitudinales abiertos de voleibol |
| **Fichajes de las computadoras** (cubren necesidades, mejoran con agentes libres si superan en ≥ 5 puntos al peor titular, 60.000 de presupuesto más el premio, los peor clasificados eligen primero) y **cantera** (jóvenes de 18–22 años, con la fuerza propia del club) | **Diseño**, ajustado con simulaciones de 25–30 temporadas para que el nivel y las diferencias entre equipos se mantengan |

**Estabilidad de la liga a largo plazo** (30 temporadas, 6 simulaciones, equipos de la computadora): nivel medio de los planteles 72,2 → 72,5; edad media 27,7 → 27,1 (VNL 27,7); desviación de la fuerza entre equipos 2,45 → 2,12 (media de todas las temporadas 2,33); jugadores de 80 o más 10,0 → 11,0. Sin la regresión a la media, los de 80 o más subían a 18; sin la calibración inicial, el nivel subía ~3 puntos y la paridad se compactaba.

## Pruebas ejecutadas
- **65 pruebas de los archivos de Vitest** (`*.test.ts`), ejecutadas en Node con un ejecutor mínimo compatible (`scripts/vt/run.mjs`; no pude instalar Vitest): calendario, puntos FIVB, determinismo, partido manual = simulado, guardado y migraciones, sustituciones, economía, cierre de temporada, edades, retiros, progresión, planteles válidos tras la intersemana, estabilidad a 10 temporadas, coherencia jugador/equipo y calibración contra los datos reales. Incluyen una **prueba aleatoria** (12 partidas × 30 acciones al azar con fichajes, ventas, alineaciones, partidos con cambios y cierre de temporada) y la de **importación corrompida** (800 mutaciones por ejecución).
- **75 comprobaciones de interfaz en Chromium** (`scripts/ui-test.py`, `scripts/ui-test-season.py`, `scripts/ui-test-extras.py`, `scripts/ui-test-playoffs.py`), sin errores de consola: incluyen una temporada completa, el cobro del premio, fichar con la temporada terminada, las edades, la evolución del plantel, las noticias tras dos intersemanas, la ficha, los filtros, el resumen y el autoguardado, y el guardado que **sobrevive a recargar la página**. Revisado en modo claro, oscuro y móvil.
- **Límites de la interfaz:** la descarga de archivos puede no funcionar en páginas publicadas (por eso existe la copia en texto); las computadoras solo fichan agentes libres (no hay traspasos entre equipos); no hay tiempos muertos, fatiga, lesiones ni contratos.

## Búsqueda de datos partido a partido por jugador (para fijar el peso de cada habilidad con datos)
No encontré ningún conjunto **abierto y descargable** con estadísticas por jugador y partido de voleibol masculino de élite. Lo que hay:
| Opción | Qué ofrece | Estado |
|---|---|---|
| `provolleyballr` (R, MIT + archivo de licencia) | Extrae por web scraping estadísticas por equipo y partido y por jugador y temporada de ligas profesionales femeninas de Norteamérica (AU, LOVB, MLV) | Licencia del paquete verificada; los derechos de los datos de origen no. Requiere ejecutarlo con red |
| `ncaavolleyballr` (R) | Estadísticas por jugador y partido y jugada a jugada de la NCAA (femenino y masculino) | Licencia del paquete y términos del sitio no verificados; el propio autor avisa de que el sitio se volvió inestable para extraer |
| `volleystats` (Python, CLI) | Extrae estadísticas de partidos de sitios de federaciones (incluye la federación argentina, `feva`) | Licencia y términos no verificados |
| Kaggle VNL 2025 (305 jugadores), VNL 2023 masculina, VNL 2024 femenina, VNL 2021-2023 (ambos sexos, ZakirPasha) | Totales o promedios por jugador y temporada, copiados de volleyballworld.com | Sin detalle por partido; la licencia no se vio en las páginas. Servirían para **datos femeninos** y para validar en otras temporadas |
| NCAA División I femenino 2022-23 (Kaggle) | 334 equipos, tasas por set | Universitario, no élite |
| Repositorios académicos (Zenodo, Figshare, Mendeley, Dryad) | Búsqueda sin resultados útiles: solo un conjunto de 2020 sin relación (práctica de un curso) y datos de visión por computadora | — |
Ninguna se ejecutó aquí (sin red en el entorno).

## Límites
1. Solo voleibol masculino de élite; el femenino necesita sus propios datos.
2. PlusLiga no permite medir el side-out ni separar k1/k2; eso viene del preprint (sin revisión por pares).
3. **Sin respaldo en datos:** pendientes de habilidad, `pressure`, `useRisk` y el peso de cada habilidad en ganar. ace y kill pesan algo más en el motor que en la liga real.
4. El colocador no ataca, los centrales no reciben y faltan tiempos muertos y fatiga. El árbitro y el calendario de la liga real no se modelan. Las asistencias del motor (cada kill con colocador) no son comparables con `Sf_Set` de VNL (47 % de los kills).
5. La interfaz de React y el almacenamiento IndexedDB no se ejecutaron en este entorno (sin red para instalar dependencias ni navegador).
