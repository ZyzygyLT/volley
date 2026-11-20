# Volley Manager

Manager de voleibol con simulación rally a rally. La aplicación combina gestión de club, competición y simulación deportiva.

## Requisitos

- Node.js 20.19+ (recomendado Node.js 22 LTS).
- npm.

## Instalación y desarrollo

Desde esta carpeta:

```powershell
npm ci
npm run dev
```

Vite mostrará la dirección local para abrir la aplicación.

## Validación

```powershell
npm test
npm run build
npm run preview
```

- `npm test`: ejecuta la suite Vitest.
- `npm run build`: comprueba TypeScript y genera la versión web en `dist/`.
- `npm run preview`: sirve localmente la compilación.

Para generar el HTML autocontenido heredado:

```powershell
npm run build:single
```

## Estructura principal

- `src/engine/`: reglas y motor deportivo, rallies, jugadores, parámetros y estadísticas.
- `src/game/`: liga, plantillas, alineaciones, economía, temporadas, playoffs y persistencia.
- `src/App.tsx`: interfaz React.
- `src/styles.css`: estilos adaptables.
- `scripts/`: calibración, empaquetado y herramientas auxiliares.
- `public/`: recursos estáticos.

## Qué incluye actualmente

- Motor determinista por semilla, con reglas de sets, rotaciones y sustituciones.
- Liga de 8 equipos a doble vuelta, calendario y clasificación FIVB.
- Plantillas, alineaciones, mercado de agentes libres, presupuesto y salarios.
- Estadísticas individuales y de equipo.
- Temporadas, progresión por edad, retiros, cantera y fichajes de equipos controlados por IA.
- Playoffs: semifinales al mejor de 3, final al mejor de 5 y partido por el bronce.
- Guardado local mediante IndexedDB, ranuras, exportación/importación JSON y migraciones.

## Calibración y límites del modelo

La calibración documentada usa datos masculinos de élite (PlusLiga 2020–2023 y VNL 2024), además de un preprint para algunas referencias de fases del rally. Consultá [CALIBRACION.md](./CALIBRACION.md) y [ATRIBUCIONES.md](./ATRIBUCIONES.md).

La calibración de tasas agregadas no significa que el juego ya reproduzca toda la táctica del voleibol. La distribución del colocador, las combinaciones ofensivas, la lectura del bloqueo, la fatiga, las lesiones y los tiempos muertos siguen siendo áreas de desarrollo. Los pesos de habilidades y varios parámetros económicos son decisiones de diseño.

## Scripts auxiliares

```powershell
npm run calibration:report
npm run calibration:fit
```

El repositorio también conserva pruebas auxiliares de interfaz y temporada en `scripts/`. Algunas requieren Python, Chromium o Playwright y deben ejecutarse según las instrucciones de cada script.

## App móvil

La estructura web permite evaluar una futura integración con Capacitor. No es requisito para desarrollar ni ejecutar la versión web actual.

## Principios de desarrollo

1. Mantener la simulación independiente de React.
2. Preservar determinismo y compatibilidad de partidas guardadas.
3. Probar cambios de reglas y fórmulas antes de integrarlos.
4. Diferenciar datos observados, inferencias y parámetros de diseño.
5. Preferir cambios pequeños sobre reescrituras generales.
