# Volley Manager

Manager de voleibol con un motor de simulación rally a rally. El proyecto combina dos capas que deben evolucionar juntas:

- **Simulación deportiva:** saque, recepción, ataque, bloqueo, defensa, rotaciones, sustituciones y estadísticas.
- **Gestión deportiva:** club, plantilla, alineaciones, mercado, finanzas, liga, temporadas y playoffs.

El objetivo es que las decisiones de gestión influyan en el rendimiento y que los partidos se resuelvan con un modelo deportivo coherente, reproducible y progresivamente más táctico.

## Proyecto principal

La versión activa para desarrollo es:

[`volley-manager-estable-con-playoffs/vm`](./volley-manager-estable-con-playoffs/vm/)

La carpeta `volley-manager-base` y los HTML/ZIP históricos se conservan como referencias y prototipos. No son el punto de entrada recomendado para nuevas funcionalidades.

## Estado y alcance

La aplicación actual incluye liga de 8 equipos, fase regular a doble vuelta, clasificación, planteles, alineaciones, mercado de agentes libres, finanzas, estadísticas, guardado local, varias temporadas y playoffs. El motor simula rallies con probabilidades calibradas contra conjuntos de datos masculinos de élite; la documentación de calibración explica fuentes, decisiones de diseño y límites.

**Importante:** la calibración de tasas agregadas no equivale todavía a una simulación táctica completa. La toma de decisiones del colocador, los sistemas ofensivos, la lectura del bloqueo, la fatiga, las lesiones y los tiempos muertos son áreas de evolución, no capacidades que debamos dar por terminadas.

## Requisitos

- Node.js 22 LTS recomendado (Node.js 20.19+ también puede ser compatible con Vite 7).
- npm incluido con Node.js.

## Desarrollo local

Desde esta carpeta:

```powershell
cd volley-manager-estable-con-playoffs/vm
npm ci
npm run dev
```

## Validación y compilación

```powershell
npm test
npm run build
npm run preview
```

Para generar el HTML autocontenido heredado:

```powershell
npm run build:single
```

El proyecto incluye scripts de prueba adicionales para temporadas y recorridos de interfaz. Consultá el README de la aplicación antes de ejecutarlos; algunos requieren Python, Chromium o Playwright.

## Documentación

- [Guía de desarrollo](./volley-manager-estable-con-playoffs/vm/README.md)
- [Arquitectura y límites del modelo](./docs/ARCHITECTURE.md)
- [Hoja de ruta](./docs/ROADMAP.md)
- [Calibración](./volley-manager-estable-con-playoffs/vm/CALIBRACION.md)
- [Atribuciones y licencias](./volley-manager-estable-con-playoffs/vm/ATRIBUCIONES.md)

## Principios de evolución

1. Preservar el motor y las partidas guardadas existentes.
2. Mantener la simulación determinista por semilla.
3. Separar reglas deportivas, modelo probabilístico, gestión y presentación.
4. Añadir pruebas antes de cambiar reglas o fórmulas.
5. Distinguir siempre datos observados, inferencias y parámetros de diseño.
6. No introducir dependencias o servicios pagos como requisito del juego base.

## Licencia

MIT. Revisá también las atribuciones y licencias de los conjuntos de datos y fuentes utilizados.
