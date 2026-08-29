## Cambios

### 1. Modelo y pipeline — `src/lib/pin-processing.ts`
- Ampliar `BentoSize` a `"1x1" | "1x2" | "2x1" | "2x2" | "3x2" | ""`.
- Añadir `isFuture: boolean` a `PinRow` (default `false`).
- Actualizar `computeBentoSizes` con 5 niveles:
  - `area ≤ p33` → `1x1`
  - `p33 < area ≤ p66` → `2x1` si `ar > 1.1`, `1x2` si `ar < 0.9`, si no `1x1`
  - `area > p66` y `0.8 ≤ ar ≤ 1.25` → `2x2`
  - `area > p66` y `ar > 1.25` → `3x2`
  - `area > p66` y `ar < 0.8` → `1x2` (fallback vertical)

### 2. Tabla, checkboxes y exportaciones — `src/routes/index.tsx`
- Inicializar `isFuture: false` en el constructor de fila.
- Añadir columna "Futuro" entre "Estuve aquí" y "Embajada". Orden final: Miniatura, Ciudad, País, Forma, Ancho (mm), Alto (mm), Proporción, Bento, Estuve aquí, Futuro, Embajada, Estado.
- Exclusividad mutua entre `visited` / `isFuture` / `isEmbassy`:
  - Al marcar uno de los tres → los otros dos se ponen `false` automáticamente.
  - Desmarcar solo afecta a ese campo (permite estado "todo false").
  - Se implementa en los `onChange` de los tres checkboxes.
- CSV y Excel export: incluir columna "Futuro" (`Sí`/`No`).

### 3. Vista Bento — `src/components/BentoView.tsx` (nuevo)
Componente puramente presentacional, lee `PinRow[]` por props. Sin modal, sin hover-overlay, sin indicador de estado.

**Layout**
- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`, `grid-auto-rows: 140px`, `grid-auto-flow: dense`, `gap: 16px`.
- Spans por `bentoSize`: `1x1` (1/1), `1x2` (col 1 / row 2), `2x1` (2/1), `2x2` (2/2), `3x2` (col 3 / row 2).
- Media query ≤ 480 px: `minmax(120px, 1fr)` y `3x2` cae visualmente a `span 2 / span 2` para no desbordar.

**Card (contenido único)**
Cada card muestra exactamente dos elementos apilados verticalmente, siempre visibles:
1. Arriba: "Ciudad, País" como texto plano estático (p. ej. "Kioto, Japón"), tipografía pequeña y confiada. Si falta Ciudad o País, se muestra el que exista; si faltan ambos, se muestra `—`.
2. Debajo: cutout PNG (`rawDataUrl`/`thumbnailDataUrl`) centrado con `object-fit: contain`.

**Estilo**
- Fondo off-white, esquinas redondeadas, `shadow-float` (misma sombra larga y suave del resto de la app), padding interno.
- Hover: `translateY(-4px)` con la sombra creciendo ligeramente — pura micro-interacción visual, no revela información nueva.
- Sin click handler, sin modal, sin overlay, sin indicador de estado en la esquina.

**Exclusiones**
- Se excluyen del grid las filas con `status === "error"` o sin cutout (`rawDataUrl` vacío).
- Bajo el grid, contador silencioso: `"{N} pines no incluidos por errores pendientes"` solo si `N > 0`.

### 4. Toggle de vista — `src/routes/index.tsx`
- Estado local `view: "tabla" | "bento"` (default `"tabla"`).
- Toggle segmentado en la cabecera: "Ver como tabla" / "Ver como bento".
- Render condicional; `rows` es compartido, no se pierde estado al alternar.

## Fuera de alcance
No se modifica pipeline OpenCV, IA de reconocimiento, ni `PinTable` más allá de la nueva columna y la lógica de exclusividad.

## Reporte al terminar
- (1) `src/lib/pin-processing.ts` — `BentoSize`, `PinRow.isFuture`, `computeBentoSizes` con `3x2`.
- (2) `src/routes/index.tsx` — columna "Futuro", exclusividad mutua, export CSV/XLSX, toggle de vista.
- (3) `src/components/BentoView.tsx` — nuevo componente, solo texto + cutout.