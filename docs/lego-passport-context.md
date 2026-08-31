# LEGO Travel Passport — Context & Repository Reconnaissance

## Current Architecture
- **Framework & Routing**: React 19 + TypeScript + Vite 8 + TanStack Router (file-based routing via `@tanstack/react-router`, `@tanstack/react-start`) + TanStack Query 5.
- **Styling & UI**: Tailwind CSS v4, Lucide React icons, Radix UI primitives, Sonner (notifications), Glassmorphism dark theme (`bg-[#060609]`).
- **Backend & Database**: External Supabase project (`@supabase/supabase-js`) with direct client instanced in `src/lib/supabase.ts`.
- **Navigation & Layout**: Collapsible sidebar navigation in `src/components/AppSidebar.tsx` mounted inside root shell `src/routes/__root.tsx`.

## Reusable Code & Existing Capabilities
- **OpenCV.js**: `@techstark/opencv-js` with lazy UMD loader, diagnostic state tracking, and contour/chroma segmentation pipeline in `src/lib/pin-processing.ts`.
- **Tesseract.js**: Multilingual OCR (`eng`, `spa`, `cat`) integrated in `src/lib/pin-processing.ts`.
- **Image & Background Processing**: `@imgly/background-removal` for AI neural foreground extraction, `heic2any` for mobile photo conversion, canvas 2D transformations.
- **ZIP Processing**: `jszip` v3.10.1 for reading/exporting archives in batch studio flows.
- **XLSX Processing**: `xlsx` (SheetJS) v0.18.5 installed in `package.json` (used in trip migrations).
- **Physical Layout & Packing**: `src/lib/print-layout.ts` for real-dimension physical layout calculations (A4, cm scale, gap packing).
- **Geo & Location Matching**: `country-state-city` offline lookup + OpenStreetMap Nominatim fallback in `src/lib/pin-processing.ts` and known city coordinates mapping.

## Existing Database Entities
- **Trips** (`trips` table): `id`, `name`, `country`, `region`, `start_date`, `end_date`, `transport`, `description`, `notes`.
- **Cities** (`cities` table): `id`, `trip_id`, `name`, `region`, `country`, `continent`, `start_date`, `end_date`, `note`, `has_pin`, `pin_code`.
- **Countries** (`countries` table): `name`, `flag`, `continent`.
- **Airports** (`airports` table): `iata`, `name`, `city`, `country`.
- **Pins** (`pins` table): `id`, `pin_id`, `trip_id`, `city_id`, `city`, `country`, `region`, `acquisition_date`, `dimensions`, `shape`, `original_image_url`, `transparent_image_url`, `finished_card_url`, `satellite_image_url`, `satellite_params`, `nfc_uid`, `status`, `bento_size`, `visual_scale`, `visited`, `is_future`, `is_embassy`, `manual_order`, `year`, `month`.
- **Storage Buckets**: `pin-cutouts`, `generator-zip`.

## Existing Dependencies
- Core: `react` (19.2.0), `@tanstack/react-router` (1.170.16), `@tanstack/react-query` (5.101.1), `@supabase/supabase-js` (2.110.7).
- CV / OCR / Image: `@techstark/opencv-js` (5.0.0-release.1), `tesseract.js` (7.0.0), `@imgly/background-removal` (1.7.0), `heic2any` (0.0.4).
- Files & Parsing: `jszip` (3.10.1), `xlsx` (0.18.5), `nanoid` (6.0.0), `zod` (3.24.2).
- Geo & Charts: `country-state-city` (3.2.1), `d3-geo` (3.1.1), `topojson-client` (3.1.0), `world-atlas` (2.0.2), `recharts` (2.15.4).
- UI Components: `@radix-ui/*`, `@dnd-kit/*`, `lucide-react`, `sonner`, `tailwindcss` (4.2.1).

## Relevant Files
- `package.json`: Project dependencies and build scripts.
- `src/lib/supabase.ts`: Supabase client and storage configuration.
- `src/lib/trips/trips-repo.ts`: Queries and types for trips, cities, and pins.
- `src/lib/pins-repo.ts`: Pin persistence and Supabase storage uploads.
- `src/lib/pin-processing.ts`: OpenCV, Tesseract OCR, and @imgly background removal pipeline.
- `src/lib/print-layout.ts`: Physical print geometry engine.
- `src/components/AppSidebar.tsx`: Global sidebar navigation.
- `src/routes/__root.tsx`: Main layout and providers.

## LEGO Data Structure & Domain Model
The domain model strictly separates physical artifacts from visit history and design definitions:

1. **`stamp_design`**: Abstract design/motif owned at most once.
   - `id` (UUID)
   - `code` / `slug` (e.g. `copenhagen-city`, `lego-store-tivoli`, `pride-month-2026`)
   - `name` (e.g. "Copenhagen", "LEGO Store Tivoli Gardens", "Everyone is Awesome")
   - `category` (Extensible: `CITY`, `YEAR`, `STORE`, `AIRPORT`, `TERMINAL`, `SPECIAL`, `THEMED`, etc.)
   - `description` / `theme`
   - `preview_image_url`
2. **`physical_stamp`**: Actual digitized impression placed on a physical passport page.
   - `id` (UUID)
   - `stamp_design_id` (FK `stamp_design.id`)
   - `passport_page_id` (FK `passport_page.id` nullable if unplaced)
   - `slot_position` (1 to 6 on standard physical passport page)
   - `stamped_at` (Date when ink was applied, independent of `visited_at`)
   - `stamping_location_id` (FK `stamping_location.id` nullable)
   - `cutout_image_url` / `raw_image_url`
   - `obtained_personally` (boolean: true, only self-obtained stamps count)
3. **`stamping_location`**: Physical store, airport desk, or venue where stamp was acquired.
   - `id` (UUID)
   - `name` (e.g. "LEGO Store Copenhagen", "Copenhagen Airport T2")
   - `location_type` (`STORE`, `AIRPORT`, `VENUE`, `POPUP`, `OTHER`)
   - `city_id` / `city_name`
   - `country`
   - `latitude` / `longitude`
4. **`passport_page`**: Physical page unit (8 × 12 cm portrait).
   - `id` (UUID)
   - `page_number` (integer)
   - `dimension_w_cm` = 8.0, `dimension_h_cm` = 12.0
   - `max_slots` = 6 (normally 2 columns × 3 rows)
   - `scanned_image_url` (optional photo of full page)
   - `notes` (partially filled pages are completely valid)
5. **Relationship with Trips & Cities**:
   - `city_visit` / `trip`: Independent timestamps. Stamping event (`stamped_at`) is distinct from city visit event (`visited_at`).
   - Stamp design may link optionally to a `city_id` / `trip_id` without forcing a 1:1 dependency (many stamps are themed, annual, or airport/terminal specific).

## Important Constraints
- **Physical page dimensions**: Exactly 8 × 12 cm, portrait orientation.
- **Page capacity**: Standard grid of 6 stamp positions (slots 1..6); partially filled pages are fully valid and must be supported.
- **Uniqueness**: The user owns each stamp design at most once (`stamp_design` uniqueness in collection).
- **Personal provenance**: Only stamps personally obtained count (`obtained_personally = true`).
- **Extensible categories**: Must support `CITY`, `YEAR`, `STORE`, `AIRPORT`, `TERMINAL`, `SPECIAL`, `THEMED`, and future arbitrary tags.
- **Independence of events**: `stamped_at` and `visited_at` must remain decoupled.
- **Geographic preservation**: Store coordinates and country/city relations even if the map UI is out of current scope.
- **Zero new external dependencies**: Leverage existing OpenCV.js, Tesseract.js, @imgly/background-removal, JSZip, and Tailwind CSS.

## Implementation Risks
- **CV / Stamp Extraction on Scanned Passport Pages**: Complex multi-stamp segmentation if users upload a full 6-slot passport page with overlapping or faint ink marks. Fallback manual cropping/slot assignment UI will be crucial.
- **External Supabase DDL Management**: The Supabase instance is external and not auto-migrated by CI; all schema additions must provide copy-pasteable idempotent SQL scripts with backward-compatible client fallbacks.
- **Client-side Memory & WASM Initialization**: Simultaneous OpenCV + Tesseract + @imgly background removal in browser memory requires strict cleanup of canvas and Mat objects to prevent tab crashes.

## Recommended Phase Order
1. **Phase 1 — Schema & Database Foundation**: Create Supabase migration for `passport_pages`, `stamp_designs`, `physical_stamps`, and `stamping_locations` with RLS and repository methods.
2. **Phase 2 — Ingestion & Studio Pipeline**: Extend studio route/tabs with passport scanning mode (segmenting 8 × 12 cm pages or individual stamp cutouts via OpenCV/@imgly/Tesseract).
3. **Phase 3 — Passport Visualizer & Album UI**: Build realistic 8 × 12 cm portrait page renderer with 6-slot grid, supporting partial pages and slot drag-and-drop.
4. **Phase 4 — Stamp Catalog & Taxonomy**: Stamp design explorer with extensible categories (`CITY`, `STORE`, `AIRPORT`, `THEMED`, `SPECIAL`), metadata editor, and link to trips/cities.
5. **Phase 5 — Export & Print Engine**: 8 × 12 cm passport page print preview and high-resolution export.
