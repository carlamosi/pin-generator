import { supabase } from "../supabase";

export interface Trip {
  id: string;
  name: string;
  country: string;
  region: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface TripInsert {
  name: string;
  country: string;
  region?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

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

export function getCountriesFromTrips(trips: Trip[]): string[] {
  return [...new Set(trips.map((t) => t.country).filter(Boolean))];
}
