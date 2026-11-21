# Arquitectura de Volley Manager

## 1. Dirección del producto

Volley Manager combina un **manager de club** con un **simulador deportivo**. Ninguna de las dos partes debe ser un minijuego accesorio:

- La gestión construye el contexto competitivo: plantilla, roles, presupuesto, desarrollo, alineación y planificación.
- El motor deportivo convierte ese contexto en un partido: acciones, decisiones, rallies, rotaciones, sustituciones y estadísticas.
- Los resultados alimentan la clasificación, la economía, el desarrollo y la historia del club.

## 2. Estructura actual

La aplicación principal vive en `volley-manager-estable-con-playoffs/vm`.

| Área | Responsabilidad actual |
|---|---|
| `src/engine/` | Reglas y estado del partido, rallies, jugadores, probabilidades, eventos y estadísticas. |
| `src/game/` | Liga, calendario, plantillas, alineaciones, mercado, economía, temporadas, playoffs y guardado. |
| `src/App.tsx` | Interfaz React y coordinación de flujos de usuario. |
| `src/styles.css` | Presentación adaptable. |
| `scripts/` | Calibración, empaquetado y herramientas de prueba. |
| `public/` | Recursos estáticos y manifiesto de la aplicación. |

## 3. Límites que debemos preservar

### Motor deportivo

El motor debe seguir siendo independiente de React y del navegador. Sus entradas deben ser explícitas y sus resultados reproducibles a partir de una semilla. El estado de partido debe cambiar mediante transiciones controladas, sin mutaciones accidentales compartidas.

La simulación actual usa probabilidades para resolver acciones y fases del rally. Es una base útil y calibrada, pero todavía no representa todas las decisiones tácticas reales.

### Gestión

La gestión debe depender de contratos claros del motor, no de detalles internos de la interfaz. Las reglas de calendario, clasificación, mercado, economía y progresión deben poder probarse sin renderizar React.

### Interfaz

React presenta el estado y solicita acciones. No debe convertirse en el lugar donde se implementan reglas deportivas o económicas. La interfaz puede evolucionar sin alterar el formato de las partidas guardadas.

### Persistencia

Los datos guardados deben conservar una versión de esquema explícita. Todo cambio incompatible requiere una migración probada y compatibilidad con partidas anteriores. Exportar e importar debe seguir siendo una vía de respaldo independiente del almacenamiento del navegador.

## 4. Modelo objetivo por capas

La evolución recomendada, sin reescritura inmediata, es:

1. **Domain / rules:** tipos y reglas puras de voleibol y competición.
2. **Match simulation:** fases del rally, selección de acciones, decisiones tácticas, resolución probabilística y eventos.
3. **Club management:** plantilla, contratos, entrenamiento, scouting, economía y decisiones de temporada.
4. **Competition:** calendario, clasificación, torneos, playoffs y reglamentos configurables.
5. **Application services:** casos de uso que conectan gestión, partidos, competición y persistencia.
6. **Presentation:** interfaz web y futura adaptación móvil.

No mover archivos en bloque solo para que coincidan con este esquema. Extraer módulos cuando exista una frontera funcional clara y pruebas que protejan el comportamiento anterior.

## 5. Evolución del realismo deportivo

Prioridad de desarrollo del motor:

- Representar la calidad de recepción como condición para las opciones de ataque.
- Incorporar decisiones del colocador: distribución, tempo, jugador objetivo y ajuste al bloqueo.
- Diferenciar ataques de primer tiempo, combinaciones, bolas altas y ataques de zaguero.
- Modelar lectura, formación y eficacia del bloqueo, además de cobertura y defensa.
- Introducir fatiga y estado físico de manera gradual, con impacto medible y pruebas.
- Incorporar tiempos muertos y ajustes tácticos como decisiones del entrenador.
- Mantener la trazabilidad: cada punto debe poder explicarse mediante eventos del rally.

Las nuevas variables no deben agregarse como modificadores arbitrarios. Cada una necesita definición, rango, efecto esperado, pruebas y, cuando existan datos adecuados, calibración.

## 6. Datos, calibración y transparencia

Cada parámetro debe documentarse como uno de estos tipos:

- **Observado:** calculado directamente de una fuente identificada.
- **Inferido:** deducido con supuestos explícitos.
- **Diseño:** elegido para producir una experiencia de juego.

No presentar un parámetro de diseño como si estuviera científicamente estimado. Mantener las limitaciones y las licencias de datos visibles.

## 7. Calidad técnica

- Pruebas unitarias de reglas y funciones puras.
- Pruebas de integración de partido, temporada, playoffs y persistencia.
- Pruebas de propiedades: determinismo, invariantes de puntuación, límites de plantilla y validez de guardados.
- Pruebas de regresión de calibración con tolerancias documentadas.
- Build reproducible y revisión de dependencias.
- Cambios pequeños, revisables y compatibles con los datos existentes.
