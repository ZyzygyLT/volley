# Volley Manager (base del proyecto)

## Crear el proyecto (los comandos exactos, sin versiones inventadas)
    npm create vite@latest volley-manager -- --template react-ts
    cd volley-manager
    npm install
    npm install -D vitest tsx @types/node
Luego copiá `src/engine/`, `src/game/`, `src/App.tsx` y `public/manifest.webmanifest` sobre el proyecto (reemplazá App.tsx),
agregá `"test": "vitest run"` a `scripts` en package.json, y ejecutá `npm test` y `npm run dev`.

## Estado honesto
- Motor puro y determinista (semilla). Lógica de reglas: sets a 25, 5º a 15, diferencia de 2, rotaciones.
- Calibrado con datos reales de voleibol masculino de élite (PlusLiga 2020-23 y VNL 2024; 47/47 objetivos y validaciones). Ver `CALIBRACION.md`; fuentes y licencias en `ATRIBUCIONES.md`.
- Plantillas de 7 jugadores (6 titulares + líbero), con posiciones calibradas con datos.
- Capa de gestión (`src/game/`): liga de 8 equipos a doble vuelta, plantel de 13 con alineación elegible, clasificación FIVB, estadísticas acumuladas y guardado (IndexedDB + exportar/importar JSON).
- Interfaz (`src/App.tsx`): pestañas Liga, Plantel, Partido (cancha en vivo, parciales y sustituciones FIVB), Mercado, Finanzas, Estadísticas (con historial de temporadas) y Guardar.
- Fase regular + **playoffs** (cuadro de 4, series al mejor de 3 y final al mejor de 5). Varias temporadas: premio por puesto final, historial, histórico de estadísticas; **edades, progresión, retiros, cantera y fichajes de las computadoras** (ver `CALIBRACION.md`).
- Economía (`src/game/economy.ts`): valores de **diseño**, no datos reales.
- Jugadores con tipo de saque y valoraciones propias; estadísticas individuales por partido y acumuladas (en memoria de la sesión; falta guardado en IndexedDB).
- No incluye: tiempos muertos, fatiga, finanzas, mercado de fichajes, 3D.
- Sin verificar por ejecución en este entorno (sin red para instalar dependencias): corré `npm test` primero.

## Calibración (hecha; detalle en CALIBRACION.md)
Fuentes a revisar y cuyas licencias hay que verificar antes de usar datos o código:
- Preprint "Rally-Based Performance Evaluation Model for Highly Competitive Volleyball" (sportRxiv).
- openvolley/volleysim y dpwynne/volleyWP (modelos y tasas por habilidad).
Objetivo: fijar métricas objetivo (side-out %, break-point %, kills, aces) y ajustar `params.ts` hasta cumplirlas.

## App móvil
Capacitor: `npm i @capacitor/core @capacitor/cli`, `npx cap init`, `npm run build`, `npx cap add android|ios`, `npx cap sync`.

## Comandos de calibración
    npx tsx scripts/calibrate-cli.ts report   # tabla de objetivos vs. modelo
    npx tsx scripts/calibrate-cli.ts fit      # reajusta intercepciones (luego copiar a params.ts)

## Una sola página HTML (para probar o publicar)
    node scripts/build-single.mjs dist/volley-manager.html     # empaqueta React + motor + liga con esbuild
    cd dist && python3 -m http.server 8765 &                   # servirla
    python3 scripts/ui-test.py                                 # 24 comprobaciones en Chromium (Playwright)
    python3 scripts/ui-test-season.py                          # 20 más: temporada completa, intersemana, historial, guardado
    python3 scripts/ui-test-extras.py                          # 19 más: ficha, equipos, filtros, resumen, autoguardado, Acerca de
    python3 scripts/ui-test-playoffs.py                        # 10 más: playoffs con partido en vivo, cuadro, campeón
`src/main.tsx` monta la aplicación (con manejo de errores); `src/styles.css` tiene los estilos (modo claro/oscuro y móvil).

## Pruebas sin Vitest
Con Vitest instalado: `npm test`. Sin él: `node scripts/vt/run.mjs src/game/game.test.ts src/game/fuzz.test.ts src/game/import-chaos.test.ts src/game/playoffs.test.ts src/engine/match.test.ts src/engine/calibrate.test.ts`
(ejecutor mínimo compatible; necesita esbuild).

### Compilación que falla a propósito (para probar el manejo de errores)
    printf "import { createRoot } from 'react-dom/client';\nimport { Boundary } from './App';\nfunction Bomb(): never { throw new Error('error de prueba'); }\ncreateRoot(document.getElementById('root')!).render(<Boundary><Bomb /></Boundary>);\n" > src/_crash_main.tsx
    ENTRY=src/_crash_main.tsx node scripts/build-single.mjs dist/crash.html && rm src/_crash_main.tsx
