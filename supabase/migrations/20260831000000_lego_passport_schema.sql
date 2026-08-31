-- 20260831000000_lego_passport_schema.sql

-- 1. stamp_designs
CREATE TABLE IF NOT EXISTS stamp_designs (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    code varchar UNIQUE NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    preview_image_url text,
    represented_city_id uuid REFERENCES cities(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. stamping_locations
CREATE TABLE IF NOT EXISTS stamping_locations (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    location_type text NOT NULL,
    city_id uuid REFERENCES cities(id) ON DELETE SET NULL,
    city_name text,
    country text,
    latitude numeric,
    longitude numeric,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. passport_pages
CREATE TABLE IF NOT EXISTS passport_pages (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    page_number integer NOT NULL UNIQUE,
    dimension_w_cm numeric DEFAULT 8.0 NOT NULL,
    dimension_h_cm numeric DEFAULT 12.0 NOT NULL,
    max_slots integer DEFAULT 6 NOT NULL,
    scanned_image_url text,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 4. physical_stamps
CREATE TABLE IF NOT EXISTS physical_stamps (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    stamp_design_id uuid NOT NULL REFERENCES stamp_designs(id) ON DELETE RESTRICT UNIQUE,
    passport_page_id uuid REFERENCES passport_pages(id) ON DELETE SET NULL,
    slot_position integer,
    stamped_at date NOT NULL,
    stamping_location_id uuid REFERENCES stamping_locations(id) ON DELETE SET NULL,
    trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
    cutout_image_url text,
    raw_image_url text,
    obtained_personally boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(passport_page_id, slot_position),
    CHECK (slot_position IS NULL OR (slot_position >= 1 AND slot_position <= 6))
);
