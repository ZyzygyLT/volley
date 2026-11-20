# Atribuciones y licencias de los datos

Este proyecto **no copia código** de otros proyectos. Usa **cifras derivadas** (tasas, porcentajes, distribuciones) calculadas a partir de los siguientes conjuntos de datos y publicaciones, para calibrar el motor de simulación. No se redistribuyen los datos originales.

| Fuente | Licencia declarada | Uso |
|---|---|---|
| **PlusLiga masculina 2008-2023** — Kaggle, usuario kacpergregorowicz: https://www.kaggle.com/datasets/kacpergregorowicz/-mens-volleyball-plusliga-20082022 | CC0 | Tasas de saque, ataque, bloqueo y recepción, cómo terminan los rallies, ventaja de local y distribución de marcadores. Solo las temporadas 2020-21 a 2022-23 (628 partidos) tienen las columnas alineadas; las anteriores se descartaron |
| **VNL 2024 masculina** — Kaggle, usuario jonathanpmoyer: https://www.kaggle.com/datasets/jonathanpmoyer/vnl-2024-mens-stats | CC0 | Diferencias por posición, reparto de acciones, dispersión entre jugadores, edades (año de nacimiento) y estructura de edades |
| **González, González-Cabrera y Herrera (2024)**, «Rally-Based Performance Evaluation Model for Highly Competitive Volleyball», SportRχiv (preprint, **sin revisión por pares**): https://sportrxiv.org/index.php/server/preprint/view/452 | CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) | Perfiles por tipo de saque (conteos de su tabla 1, que a su vez cita a Ciuffarella et al. 2013), fases del rally, probabilidad de cambio de posesión y side-out. Se calcularon porcentajes a partir de sus conteos |
| Fórmula de competencia de la PlusLiga (Volleyball World): https://en.volleyballworld.com/news/competition-formula-men-polish-league-2024 | — | Formato de los playoffs: series al mejor de 3, final al mejor de 5, localía alterna (el cuadro de 4 equipos es una adaptación de diseño) |
| Reglamento de clasificación de competencias FIVB / Volleyball World | — | Puntos de liga (3-0 y 3-1: 3; 3-2: 2 y 1) y criterios de desempate; reglas de sustituciones (6 por set, el líbero no cuenta) |

Que quien subió los datos a Kaggle los declare CC0 **no garantiza** los derechos sobre los datos de origen (copiados de las webs de las ligas). Para un uso comercial conviene validarlo con un abogado.

## Software
- React y React DOM (licencia MIT), incluidos en la página empaquetada.
- esbuild y Playwright se usan solo para empaquetar y probar.

## Lo que NO viene de datos
Peso de cada habilidad, tipo de saque, táctica de riesgo, progresión de los jugadores, comportamiento de las computadoras en el mercado, precios, salarios y premios son decisiones de diseño del juego. Detalle en `CALIBRACION.md`.
