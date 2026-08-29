-- Initial Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE trips (id uuid DEFAULT uuid_generate_v4() PRIMARY KEY, name text NOT NULL, country text NOT NULL, region text, start_date date, end_date date);
CREATE TABLE pins (id uuid DEFAULT uuid_generate_v4() PRIMARY KEY, trip_id uuid REFERENCES trips(id) ON DELETE CASCADE, city text, acquisition_date date, dimensions jsonb, original_image_url text, transparent_image_url text, satellite_image_url text, nfc_uid varchar UNIQUE, satellite_params jsonb);
