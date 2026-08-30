import { supabase } from "../supabase";

export interface Trip {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  transport: "Avión" | "AVE/Tren" | "Coche" | string;
  description: "Vacaciones familiares" | "Competición" | "Congreso" | "Beca" | "Escapada" | string;
  notes: string | null;
  created_at: string;
}

export interface TripInsert {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  transport: string;
  description: string;
  notes?: string | null;
}

export interface City {
  id: string;
  trip_id: string | null;
  name: string;
  region: string | null;
  country: string;
  continent: string;
  start_date: string | null;
  end_date: string | null;
  note: string | null;
  has_pin: boolean;
  pin_code: string | null;
  created_at: string;
}

export interface Country {
  name: string;
  flag: string;
  continent: string;
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
}

export interface FullPin {
  id: string;
  trip_id: string | null;
  city_id: string | null;
  pin_id: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  acquisition_date: string | null;
  dimensions: { width_mm?: number; height_mm?: number; aspect_ratio?: number } | null;
  shape: string | null;
  original_image_url: string | null;
  transparent_image_url: string | null;
  finished_card_url: string | null;
  satellite_image_url: string | null;
  satellite_params: {
    lat?: number;
    lon?: number;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
    labelText?: string;
    fontScale?: number;
    watercolorSoftness?: number;
  } | null;
  nfc_uid: string | null;
  created_at: string;
}

// Queries
export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Trip[];
}

export async function insertTrip(trip: TripInsert): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .insert(trip)
    .select()
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function updateTrip(id: string, trip: Partial<TripInsert>): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .update(trip)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function deleteTrip(id: string): Promise<void> {
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) throw error;
}

export async function listCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from("cities")
    .select("*")
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as City[];
}

export async function listCountries(): Promise<Country[]> {
  const { data, error } = await supabase.from("countries").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as Country[];
}

export async function listAirports(): Promise<Airport[]> {
  const { data, error } = await supabase.from("airports").select("*").order("city");
  if (error) throw error;
  return (data ?? []) as Airport[];
}

export async function listAllPins(): Promise<FullPin[]> {
  const { data, error } = await supabase
    .from("pins")
    .select("*")
    .order("acquisition_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as FullPin[];
}

export async function upsertFullPin(pin: Partial<FullPin> & { id: string }): Promise<void> {
  const { error } = await supabase.from("pins").upsert(pin, { onConflict: "id" });
  if (error) throw error;
}
