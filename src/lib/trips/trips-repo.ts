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
export interface StampDesign {
  id: string;
  code: string;
  name: string;
  category: 'CITY' | 'YEAR' | 'STORE' | 'AIRPORT' | 'TERMINAL' | 'SPECIAL' | 'THEMED' | string;
  description: string | null;
  preview_image_url: string | null;
  represented_city_id: string | null;
  visual_hash: string | null;
  created_at: string;
}

export interface StampingLocation {
  id: string;
  name: string;
  location_type: 'STORE' | 'AIRPORT' | 'VENUE' | 'POPUP' | 'OTHER' | string;
  city_id: string | null;
  city_name: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface PassportPage {
  id: string;
  page_number: number;
  dimension_w_cm: number;
  dimension_h_cm: number;
  max_slots: number;
  scanned_image_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface PhysicalStamp {
  id: string;
  stamp_design_id: string;
  passport_page_id: string | null;
  slot_position: number | null;
  stamped_at: string;
  stamping_location_id: string | null;
  trip_id: string | null;
  cutout_image_url: string | null;
  raw_image_url: string | null;
  obtained_personally: boolean;
  created_at: string;
}
// LEGO Travel Passport Queries & Mutations

export interface FullPhysicalStamp extends PhysicalStamp {
  design?: StampDesign | null;
  location?: StampingLocation | null;
  trip?: Trip | null;
  represented_city?: City | null;
}

export interface PassportPageWithStamps extends PassportPage {
  stamps: FullPhysicalStamp[];
}

export async function listPassportPages(): Promise<PassportPage[]> {
  const { data, error } = await supabase
    .from("passport_pages")
    .select("*")
    .order("page_number", { ascending: true });
  if (error) {
    console.warn("[lego-passport] listPassportPages fallback/error:", error);
    return [];
  }
  return (data ?? []) as PassportPage[];
}

export async function listStampDesigns(): Promise<StampDesign[]> {
  const { data, error } = await supabase
    .from("stamp_designs")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    console.warn("[lego-passport] listStampDesigns fallback/error:", error);
    return [];
  }
  return (data ?? []) as StampDesign[];
}

export interface StampDesignInsert {
  code: string;
  name: string;
  category: string;
  description?: string | null;
  preview_image_url?: string | null;
  represented_city_id?: string | null;
  visual_hash?: string | null;
}

export async function insertStampDesign(design: StampDesignInsert): Promise<StampDesign> {
  const designId = `design-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recordToSave = { ...design, id: designId };

  const { data, error } = await supabase
    .from("stamp_designs")
    .insert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] insertStampDesign DB warning/fallback:", error);
    return { ...recordToSave, description: design.description ?? null, preview_image_url: design.preview_image_url ?? null, represented_city_id: design.represented_city_id ?? null, visual_hash: design.visual_hash ?? null, created_at: new Date().toISOString() } as StampDesign;
  }
  return data as StampDesign;
}

export async function listStampingLocations(): Promise<StampingLocation[]> {
  const { data, error } = await supabase
    .from("stamping_locations")
    .select("*")
    .order("name", { ascending: true });
  if (error) {
    console.warn("[lego-passport] listStampingLocations fallback/error:", error);
    return [];
  }
  return (data ?? []) as StampingLocation[];
}

export async function listPhysicalStamps(): Promise<FullPhysicalStamp[]> {
  const { data, error } = await supabase
    .from("physical_stamps")
    .select(`
      *,
      design:stamp_designs(*),
      location:stamping_locations(*),
      trip:trips(*)
    `)
    .order("stamped_at", { ascending: true });

  if (error) {
    console.warn("[lego-passport] listPhysicalStamps joined select failed, trying raw select:", error);
    const { data: rawData, error: rawErr } = await supabase
      .from("physical_stamps")
      .select("*")
      .order("stamped_at", { ascending: true });
    if (rawErr) {
      console.warn("[lego-passport] listPhysicalStamps raw select fallback/error:", rawErr);
      return [];
    }
    return (rawData ?? []) as FullPhysicalStamp[];
  }
  return (data ?? []) as FullPhysicalStamp[];
}

export async function upsertPassportPage(page: Partial<PassportPage> & { id?: string; page_number: number }): Promise<PassportPage | null> {
  const pageId = page.id || `page-${page.page_number}-${Date.now()}`;
  const recordToSave = {
    dimension_w_cm: 8.0,
    dimension_h_cm: 12.0,
    max_slots: 6,
    scanned_image_url: null,
    notes: null,
    ...page,
    id: pageId,
    created_at: page.created_at || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("passport_pages")
    .upsert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] upsertPassportPage DB fallback:", error);
    return recordToSave as PassportPage;
  }
  return data as PassportPage;
}

export async function upsertPhysicalStamp(stamp: Partial<PhysicalStamp> & { id?: string }): Promise<PhysicalStamp | null> {
  const stampId = stamp.id || `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recordToSave = {
    obtained_personally: true,
    ...stamp,
    id: stampId,
    created_at: stamp.created_at || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("physical_stamps")
    .upsert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] upsertPhysicalStamp DB fallback:", error);
    return recordToSave as PhysicalStamp;
  }
  return data as PhysicalStamp;
}

export async function uploadPassportImage(fileOrDataUrl: File | string, path: string): Promise<string> {
  let fileBody: File | Blob | Uint8Array;
  
  if (typeof fileOrDataUrl === "string") {
    const res = await fetch(fileOrDataUrl);
    fileBody = await res.blob();
  } else {
    fileBody = fileOrDataUrl;
  }

  // Primary target bucket: 'passport-scans'
  let targetBucket = "passport-scans";
  let uploadPath = path;

  let { error } = await supabase.storage
    .from(targetBucket)
    .upload(uploadPath, fileBody, {
      cacheControl: "3600",
      upsert: true,
    });

  // Fallback if 'passport-scans' bucket is missing on Supabase project (404 / Bucket not found)
  if (error) {
    const errMsg = (error.message || "").toLowerCase();
    const isBucketNotFound = errMsg.includes("bucket not found") || (error as any).statusCode === "404" || (error as any).status === 404;

    if (isBucketNotFound) {
      console.warn(`[lego-passport] Storage bucket '${targetBucket}' not found. Falling back to '${PIN_CUTOUTS_BUCKET}'.`);
      targetBucket = PIN_CUTOUTS_BUCKET;
      uploadPath = `passport-scans/${path}`;

      const retryRes = await supabase.storage
        .from(targetBucket)
        .upload(uploadPath, fileBody, {
          cacheControl: "3600",
          upsert: true,
        });

      error = retryRes.error;
    }
  }

  if (error) {
    console.error(`[lego-passport] uploadPassportImage failed in bucket '${targetBucket}':`, error);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from(targetBucket)
    .getPublicUrl(uploadPath);

  return publicUrlData.publicUrl;
}

export async function getNextPassportPageNumber(): Promise<number> {
  const { data, error } = await supabase
    .from("passport_pages")
    .select("page_number")
    .order("page_number", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return 1;
  }
  return data[0].page_number + 1;
}
