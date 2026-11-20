# Hoja de ruta

Esta hoja de ruta ordena el trabajo para combinar manager y simulador sin desestabilizar lo existente.

## Fase 0 — Base reproducible

- [x] Definir una carpeta principal de aplicación.
- [x] Documentar límites entre motor, gestión e interfaz.
- [ ] Instalar dependencias desde un manifiesto versionado.
- [ ] Ejecutar typecheck, pruebas y build en un entorno limpio.
- [ ] Añadir integración continua para instalar, probar y compilar.

**Criterio de salida:** otra persona puede clonar el repositorio, instalar y ejecutar la aplicación siguiendo el README.

## Fase 1 — Auditoría y protección del comportamiento

- [ ] Ejecutar toda la suite existente y registrar resultados.
- [ ] Identificar pruebas duplicadas, frágiles o sin cobertura útil.
- [ ] Añadir pruebas de invariantes del motor y de reglas FIVB.
- [ ] Verificar migraciones de guardados desde versiones anteriores.
- [ ] Establecer reportes reproducibles de calibración.

**Criterio de salida:** conocemos qué funciona realmente y podemos detectar regresiones.

## Fase 2 — Partido táctico

- [ ] Formalizar el ciclo recepción → opciones del colocador → ataque.
- [ ] Añadir decisiones de distribución del colocador.
- [ ] Modelar tempos y combinaciones ofensivas.
- [ ] Modelar lectura y formación del bloqueo.
- [ ] Hacer más explícita la cobertura y la transición defensa-ataque.
- [ ] Exponer eventos comprensibles para narración y estadísticas.
- [x] Definir el contrato de acciones compuestas y contactos simultáneos.
- [x] Implementar validación local y derivación inicial de golpes, aisladas del rally.
- [x] Implementar una máquina de estados aislada para orden, golpes acumulados, equipo autorizado y terminación explícita.
- [x] Validar contra el estado el contexto del primer golpe del equipo; no confiar en una bandera externa.
- [x] Registrar la prohibición de golpes consecutivos del mismo jugador y la excepción del primer golpe posterior al bloqueo.
- [x] Admitir contactos consecutivos de uno o varios bloqueadores dentro de una misma acción de bloqueo.
- [ ] Completar las excepciones FIVB restantes y validar las transiciones contra hechos producidos por la simulación.

**Criterio de salida:** dos equipos con plantillas iguales pueden jugar distinto por sus decisiones tácticas, y los hechos del rally pueden expresarse sin inventar contactos.

## Fase 3 — Manager profundo

- [ ] Contratos, duración, renovaciones y expectativas.
- [ ] Entrenamiento con especialización y desarrollo por edad.
- [ ] Fatiga, lesiones y recuperación, introducidas después de definir un modelo verificable.
- [ ] Scouting con incertidumbre y presupuesto.
- [ ] Staff técnico y médico con efectos transparentes.
- [ ] Estrategia de temporada, objetivos y consecuencias económicas.

**Criterio de salida:** la gestión crea decisiones relevantes antes, durante y entre temporadas.

## Fase 4 — Competición y mundo

- [ ] Reglamentos configurables por competición.
- [ ] Ascensos/descensos o divisiones, si el diseño de liga lo requiere.
- [ ] Copas y calendario con congestión.
- [ ] Historial de clubes, jugadores y temporadas.
- [ ] IA de clubes con objetivos y presupuestos coherentes.

## Fase 5 — Experiencia y distribución

- [ ] Mejorar navegación, paneles y visualización táctica.
- [ ] Accesibilidad y pruebas de interfaz automatizadas.
- [ ] PWA y uso móvil.
- [ ] Evaluar Capacitor solo cuando la experiencia web esté estabilizada.
- [ ] Exportación/importación y copias de seguridad documentadas.

## Reglas para aceptar cambios

1. No romper partidas guardadas sin migración.
2. No cambiar fórmulas deportivas sin pruebas de regresión.
3. No mezclar reglas de dominio con componentes React.
4. No agregar complejidad táctica sin explicar qué decisión representa.
5. No declarar calibración o tests exitosos sin haberlos ejecutado.
