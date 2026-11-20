# Política de distribución del colocador — versión 1

## Estado

Implementación aislada disponible en `setDecision.ts`, con pruebas unitarias. No integrada en `rally.ts`.
Es una referencia determinista de ingeniería, no una política calibrada ni una representación validada de decisiones reales de colocadores.

## Objetivo

Introducir una decisión explícita del colocador entre atacantes estructuralmente disponibles, manteniendo separadas:

1. la elección táctica del objetivo;
2. la ejecución técnica de la colocación;
3. la resolución del ataque.

La política debe ser pura, determinista con la misma entrada y semilla, y no debe modificar equipos, alineaciones, estadísticas ni guardados.

## Decisiones de diseño

### 1. No simular familias que el motor no representa

La versión 1 no asignará etiquetas de primer tiempo, bola alta, pipe, combinación, ataque rápido ni dump. La rotación y el rol no bastan para demostrar que una carrera o combinación está disponible. Los candidatos actuales son objetivos abstractos, no ataques completos.

### 2. Recepción como restricción, no como ficción espacial

Se utilizarán las categorías existentes `perfect`, `positive` y `negative`, derivadas de los umbrales actuales. No se inventará una ubicación del pase ni se deducirá una trayectoria a partir de la calidad escalar.

- `perfect`: el modelo puede considerar todos los objetivos estructurales elegibles.
- `positive`: mantiene los objetivos estructurales actuales; la política puede expresar una preferencia conservadora, pero no declarar ilegal una opción sin una regla implementada.
- `negative`: mantiene la elegibilidad estructural heredada; no se afirmará que existe una bola alta de seguridad porque el motor aún no representa altura ni tempo.

La recepción negativa no debe convertir automáticamente al central en ilegal: esa restricción requeriría modelar el tipo de colocación y sus requisitos.

### 3. Candidatos y atributos

La política recibirá perfiles descriptivos existentes: jugador, rol, slot, zona y atributo `atk`. No reutilizará `AttackOption.weight`, porque esos pesos describen el muestreo heredado de atacantes, no la distribución del colocador.

La habilidad `set` no se utilizará todavía como calidad de decisión ni como precisión de colocación. En el motor actual tiene un efecto genérico sobre la probabilidad de kill; cambiar su significado exige una fase posterior y una comparación específica.

### 4. Primera política: referencia neutral

La primera implementación será una política de referencia neutral:
- solo elegirá entre candidatos estructuralmente disponibles;
- no favorecerá artificialmente un rol ni inventará ventajas de central, punta u opuesto;
- elegirá el candidato con mayor atributo `atk` como baseline determinista y explícito; esto no significa que un colocador real siempre deba elegir al mejor atacante;
- en empate conservará el primer candidato en el orden recibido;
- no convertirá `atk` en una probabilidad deportiva ni consumirá RNG.

Esta referencia permitirá medir el efecto de introducir una elección explícita sin mezclarla con supuestos tácticos no observables.

### 5. Evolución táctica posterior

Las preferencias por rol, tempos y calidad de recepción se incorporarán cuando existan contratos para:
- ubicación/estado espacial del pase;
- repertorio de ataques ejecutables;
- disponibilidad y sincronización de carreras;
- calidad/precisión de la colocación;
- bloqueo contextual por atacante y zona.

Los coeficientes de preferencia serán parámetros marcados como `[DISEÑO]`, no datos. No se fijarán valores definitivos sin calibración o una decisión de diseño explícita acompañada de análisis de sensibilidad.

## Contrato de implementación

La función `decideSetTarget`:
- recibe perfiles construidos desde `AttackContext`;
- devuelve el candidato elegido y un motivo/código de decisión;
- no muta ninguna entrada;
- falla de forma explícita si no hay candidatos;
- no consume RNG si la política es determinista;
- no escribe eventos ni modifica el rally en esta etapa.

## Pruebas implementadas

El módulo aislado y sus pruebas cubren: máximo `atk`, desempate estable por orden, error sin candidatos, determinismo, ausencia de mutación y pertenencia del resultado al conjunto de entrada. Los tests de perfiles/objetivos cubren además la exclusión del colocador y la estructura de candidatos.

## Pruebas requeridas para completar la fase

1. No elige al colocador como atacante de colocación.
2. Nunca devuelve un jugador que no esté entre los candidatos.
3. Funciona con las seis rotaciones.
4. Respeta el conjunto de candidatos de la recepción sin inventar restricciones.
5. Maneja ausencia de candidatos de forma explícita.
6. No muta contexto ni jugadores.
7. Repite el resultado con las mismas entradas.
8. Distingue la decisión táctica del sorteo histórico.

## Integración y regresión

La nueva política se implementará inicialmente como módulo aislado y se probará sin modificar `rally.ts`. La integración requerirá una fase posterior con:
- evento tipado de distribución;
- atribución correcta de asistencia;
- conservación de estadísticas;
- comparación multi-semilla con el selector legado;
- justificación documentada de cada cambio en resultados agregados.

No se cambia el formato de guardado ni se elimina el selector histórico en esta fase.

## Fuera de alcance

Tempos, combinaciones, pipe, ataques de zaguero diferenciados, setter dump, precisión de colocación, lectura de bloqueo, emparejamientos, fatiga, lesiones y tácticas del entrenador.
