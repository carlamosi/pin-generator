import { PIN_CUTOUTS_BUCKET, supabase } from "../supabase";
import { Country as CscCountry, City as CscCity, State as CscState } from "country-state-city";

export function resolveGeoForCity(cityName: string): { country: string; region: string; continent: string } {
  const norm = cityName.trim().toLowerCase();

  if (norm.includes("copenh") || norm.includes("copenag")) {
    return { country: "Dinamarca", region: "Hovedstaden", continent: "Europa" };
  }
  if (norm.includes("billund")) {
    return { country: "Dinamarca", region: "Syddanmark", continent: "Europa" };
  }
  if (norm.includes("london") || norm.includes("londres")) {
    return { country: "Reino Unido", region: "Greater London", continent: "Europa" };
  }
  if (norm.includes("barcelona")) {
    return { country: "España", region: "Cataluña", continent: "Europa" };
  }
  if (norm.includes("madrid")) {
    return { country: "España", region: "Comunidad de Madrid", continent: "Europa" };
  }

  try {
    const allCscCities = CscCity.getAllCities();
    const match = allCscCities.find((c) => c.name.toLowerCase() === norm);
    if (match) {
      const countryObj = CscCountry.getCountryByCode(match.countryCode);
      const stateObj = match.stateCode ? CscState.getStateByCodeAndCountry(match.stateCode, match.countryCode) : null;
      return {
        country: countryObj?.name || match.countryCode,
        region: stateObj?.name || "General",
        continent: (countryObj as any)?.region || "Europa",
      };
    }
  } catch {
    // fallback
  }

  return { country: "Internacional", region: "General", continent: "Mundial" };
}

export async function findOrCreateCityFromGeo(cityName: string): Promise<City | null> {
  if (!cityName || !cityName.trim()) return null;
  const trimmed = cityName.trim();

  const { data: existing } = await supabase
    .from("cities")
    .select("*")
    .ilike("name", trimmed)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0] as City;
  }

  const geo = resolveGeoForCity(trimmed);
  const cityId = `city-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recordToSave: Partial<City> & { id: string; name: string } = {
    id: cityId,
    name: trimmed,
    country: geo.country,
    region: geo.region,
    continent: geo.continent,
    trip_id: null,
    start_date: null,
    end_date: null,
    notes: "Auto-detectado por escáner de pasaporte",
  };

  const { data, error } = await supabase
    .from("cities")
    .insert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] findOrCreateCityFromGeo fallback:", error);
    return recordToSave as City;
  }
  return data as City;
}

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

// ---------------------------------------------------------------------------
// LocalStorage helpers for 100% resilience across network / RLS
// ---------------------------------------------------------------------------
function getLocalItems<T>(key: string): T[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalItem<T extends { id: string }>(key: string, item: T): void {
  try {
    if (typeof window === "undefined") return;
    const existing = getLocalItems<T>(key);
    const idx = existing.findIndex((e) => e.id === item.id);
    if (idx >= 0) existing[idx] = item;
    else existing.push(item);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {}
}

export async function listPassportPages(): Promise<PassportPage[]> {
  const local = getLocalItems<PassportPage>("lego_passport_pages");
  const { data, error } = await supabase
    .from("passport_pages")
    .select("*")
    .order("page_number", { ascending: true });

  if (error || !data || data.length === 0) {
    if (error) console.warn("[lego-passport] listPassportPages fallback to local:", error);
    return local;
  }

  // Merge Supabase + local
  const map = new Map<string, PassportPage>();
  for (const p of local) map.set(p.id, p);
  for (const p of data as PassportPage[]) map.set(p.id, p);
  return Array.from(map.values()).sort((a, b) => a.page_number - b.page_number);
}

export async function listStampDesigns(): Promise<StampDesign[]> {
  const local = getLocalItems<StampDesign>("lego_stamp_designs");
  const { data, error } = await supabase
    .from("stamp_designs")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data || data.length === 0) {
    if (error) console.warn("[lego-passport] listStampDesigns fallback to local:", error);
    return local;
  }

  const map = new Map<string, StampDesign>();
  for (const d of local) map.set(d.id, d);
  for (const d of data as StampDesign[]) map.set(d.id, d);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
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
  const recordToSave = {
    ...design,
    id: designId,
    description: design.description ?? null,
    preview_image_url: design.preview_image_url ?? null,
    represented_city_id: design.represented_city_id ?? null,
    visual_hash: design.visual_hash ?? null,
    created_at: new Date().toISOString(),
  } as StampDesign;

  saveLocalItem("lego_stamp_designs", recordToSave);

  const { data, error } = await supabase
    .from("stamp_designs")
    .insert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] insertStampDesign DB warning/fallback:", error);
    return recordToSave;
  }
  return data as StampDesign;
}

export async function listStampingLocations(): Promise<StampingLocation[]> {
  const local = getLocalItems<StampingLocation>("lego_stamping_locations");
  const { data, error } = await supabase
    .from("stamping_locations")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data || data.length === 0) {
    return local;
  }

  const map = new Map<string, StampingLocation>();
  for (const l of local) map.set(l.id, l);
  for (const l of data as StampingLocation[]) map.set(l.id, l);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function findOrCreateStampingLocation(name: string, cityId?: string | null): Promise<StampingLocation | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  const { data: existing } = await supabase
    .from("stamping_locations")
    .select("*")
    .ilike("name", trimmed)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0] as StampingLocation;
  }

  const locId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recordToSave = {
    id: locId,
    name: trimmed,
    location_type: "LEGO Store",
    city_id: cityId || null,
  };

  saveLocalItem("lego_stamping_locations", recordToSave as unknown as StampingLocation);

  const { data, error } = await supabase
    .from("stamping_locations")
    .insert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] findOrCreateStampingLocation fallback:", error);
    return recordToSave as unknown as StampingLocation;
  }
  return data as StampingLocation;
}

export async function listPhysicalStamps(): Promise<FullPhysicalStamp[]> {
  const local = getLocalItems<FullPhysicalStamp>("lego_physical_stamps");

  const { data, error } = await supabase
    .from("physical_stamps")
    .select(`
      *,
      design:stamp_designs(*),
      location:stamping_locations(*),
      trip:trips(*)
    `)
    .order("stamped_at", { ascending: true });

  if (error || !data || data.length === 0) {
    const { data: rawData } = await supabase
      .from("physical_stamps")
      .select("*")
      .order("stamped_at", { ascending: true });

    if (rawData && rawData.length > 0) {
      const map = new Map<string, FullPhysicalStamp>();
      for (const s of local) map.set(s.id, s);
      for (const s of rawData as FullPhysicalStamp[]) map.set(s.id, s);
      return Array.from(map.values());
    }
    return local;
  }

  const map = new Map<string, FullPhysicalStamp>();
  for (const s of local) map.set(s.id, s);
  for (const s of data as FullPhysicalStamp[]) map.set(s.id, s);
  return Array.from(map.values());
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
  } as PassportPage;

  saveLocalItem("lego_passport_pages", recordToSave);

  const { data, error } = await supabase
    .from("passport_pages")
    .upsert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] upsertPassportPage DB fallback:", error);
    return recordToSave;
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
  } as PhysicalStamp;

  saveLocalItem("lego_physical_stamps", recordToSave as FullPhysicalStamp);

  const { data, error } = await supabase
    .from("physical_stamps")
    .upsert(recordToSave)
    .select()
    .single();

  if (error) {
    console.warn("[lego-passport] upsertPhysicalStamp DB fallback:", error);
    return recordToSave;
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
      const fallbackBucket = (typeof PIN_CUTOUTS_BUCKET !== "undefined" && PIN_CUTOUTS_BUCKET) ? PIN_CUTOUTS_BUCKET : "pin-cutouts";
      console.warn(`[lego-passport] Storage bucket '${targetBucket}' not found. Falling back to '${fallbackBucket}'.`);
      targetBucket = fallbackBucket;
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
