// Data layer for the `pins` table + `pin-cutouts` storage bucket.
// Pure @supabase/supabase-js — no Lovable-specific calls. Portable to Vercel.
import { PIN_CUTOUTS_BUCKET, supabase } from "./supabase";
import type { PinRow } from "./pin-processing";

// -------- Row <-> DB mapping --------

type DbPinRow = {
  pin_id: string;
  city: string | null;
  country: string | null;
  shape: string | null;
  width_mm: number | null;
  height_mm: number | null;
  aspect_ratio: number | null;
  bento_size: string | null;
  visual_scale: number | null;
  visited: boolean;
  is_future: boolean;
  is_embassy: boolean;
  status: string | null;
  cutout_image_url: string | null;
  manual_order: number;
  year: number | null;
  month: number | null;
  created_at?: string;
};

export function rowToDb(row: PinRow, manualOrder: number, cutoutUrl: string | null): DbPinRow {
  return {
    pin_id: row.pinId!,
    city: row.city,
    country: row.country,
    shape: row.shape || null,
    width_mm: row.widthMm,
    height_mm: row.heightMm,
    aspect_ratio: row.aspectRatio,
    bento_size: row.bentoSize || null,
    visual_scale: row.visualScale,
    visited: row.visited,
    is_future: row.isFuture,
    is_embassy: row.isEmbassy,
    status: row.status,
    cutout_image_url: cutoutUrl ?? row.cutoutImageUrl ?? null,
    manual_order: manualOrder,
    year: row.year ?? null,
    month: row.month ?? null,
  };
}

export function dbToRow(db: DbPinRow): PinRow {
  return {
    id: db.pin_id,
    pinId: db.pin_id,
    originalName: db.pin_id,
    status: (db.status as PinRow["status"]) ?? "ok",
    city: db.city,
    country: db.country,
    shape: (db.shape as PinRow["shape"]) ?? "",
    widthMm: db.width_mm,
    heightMm: db.height_mm,
    aspectRatio: db.aspect_ratio,
    bentoSize: (db.bento_size as PinRow["bentoSize"]) ?? "",
    visualScale: db.visual_scale ?? 1,
    visited: db.visited,
    isFuture: db.is_future,
    isEmbassy: db.is_embassy,
    cutoutImageUrl: db.cutout_image_url ?? undefined,
    thumbnailDataUrl: db.cutout_image_url ?? undefined,
    manualOrder: db.manual_order,
    year: db.year ?? null,
    month: db.month ?? null,
  };
}


// -------- Queries --------

export async function listPins(): Promise<PinRow[]> {
  const { data, error } = await supabase
    .from("pins")
    .select("*")
    .order("manual_order", { ascending: true });
  if (error) {
    console.error("[pins-repo] listPins failed", error);
    throw error;
  }
  const rows = (data ?? []).map((d) => dbToRow(d as DbPinRow));
  console.log("[pins-repo] listPins fetched", rows.length, "pins");
  return rows;
}

// Retry-once helper: if the DB is missing the `month` column (older schema
// versions), strip it and retry so the rest of the update still persists.
// Logged loudly so it's obvious the migration in `supabase/README.md` is
// still pending.
function stripMonth<T extends { month?: unknown }>(row: T): Omit<T, "month"> {
  const { month: _drop, ...rest } = row;
  return rest;
}

function isMissingMonthColumn(error: { code?: string; message?: string }): boolean {
  return (
    (error.code === "PGRST204" || error.code === "42703") &&
    typeof error.message === "string" &&
    error.message.toLowerCase().includes("month")
  );
}

export async function upsertPin(row: DbPinRow): Promise<void> {
  console.log("[pins-repo] upsert", row.pin_id, {
    visited: row.visited,
    is_future: row.is_future,
    is_embassy: row.is_embassy,
    month: row.month,
  });
  const { error } = await supabase.from("pins").upsert(row, { onConflict: "pin_id" });
  if (!error) return;
  if (isMissingMonthColumn(error)) {
    console.warn(
      "[pins-repo] `month` column missing on pins table — retrying without it. Run the migration in supabase/README.md.",
    );
    const { error: retryErr } = await supabase
      .from("pins")
      .upsert(stripMonth(row), { onConflict: "pin_id" });
    if (retryErr) {
      console.error("[pins-repo] upsert retry failed", row.pin_id, retryErr);
      throw retryErr;
    }
    return;
  }
  console.error("[pins-repo] upsert failed", row.pin_id, error);
  throw error;
}

export async function upsertMany(rows: DbPinRow[]): Promise<void> {
  if (!rows.length) return;
  console.log("[pins-repo] upsertMany", rows.length);
  const { error } = await supabase.from("pins").upsert(rows, { onConflict: "pin_id" });
  if (!error) return;
  if (isMissingMonthColumn(error)) {
    console.warn(
      "[pins-repo] `month` column missing on pins table — retrying bulk upsert without it.",
    );
    const { error: retryErr } = await supabase
      .from("pins")
      .upsert(rows.map(stripMonth), { onConflict: "pin_id" });
    if (retryErr) {
      console.error("[pins-repo] bulk upsert retry failed", retryErr);
      throw retryErr;
    }
    return;
  }
  console.error("[pins-repo] bulk upsert failed", error);
  throw error;
}


export async function deletePin(pinId: string): Promise<void> {
  const { error } = await supabase.from("pins").delete().eq("pin_id", pinId);
  if (error) throw error;
}

export async function deleteAllPins(): Promise<void> {
  // Delete storage first (best-effort), then table rows.
  const { data: list } = await supabase.storage.from(PIN_CUTOUTS_BUCKET).list("", { limit: 1000 });
  if (list && list.length) {
    const paths = list.map((f) => f.name);
    await supabase.storage.from(PIN_CUTOUTS_BUCKET).remove(paths);
  }
  const { error } = await supabase.from("pins").delete().neq("pin_id", "");
  if (error) throw error;
}

export async function deleteCutout(pinId: string): Promise<void> {
  await supabase.storage.from(PIN_CUTOUTS_BUCKET).remove([`${pinId}.png`]);
}

// -------- Storage --------

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mimeMatch = /data:(.*?);base64/.exec(meta);
  const mime = mimeMatch?.[1] ?? "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function uploadCutout(pinId: string, dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${pinId}.png`;
  const { error } = await supabase.storage
    .from(PIN_CUTOUTS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/png" });
  if (error) throw error;
  const { data } = supabase.storage.from(PIN_CUTOUTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Re-upload from an already-fetched public URL (used for undo-after-delete).
export async function reuploadCutoutFromUrl(pinId: string, url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    const { error } = await supabase.storage
      .from(PIN_CUTOUTS_BUCKET)
      .upload(`${pinId}.png`, blob, { upsert: true, contentType: "image/png" });
    if (error) throw error;
    const { data } = supabase.storage.from(PIN_CUTOUTS_BUCKET).getPublicUrl(`${pinId}.png`);
    return data.publicUrl;
  } catch (e) {
    console.warn("[pins-repo] reupload failed", e);
    return url;
  }
}


// -------- Debounced per-row upsert --------

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleUpsert(row: DbPinRow, delayMs = 300): void {
  const key = row.pin_id;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pending.delete(key);
    upsertPin(row).catch((e) => console.error("[pins-repo] upsert failed", key, e));
  }, delayMs);
  pending.set(key, timer);
}

export async function flushPending(): Promise<void> {
  const timers = Array.from(pending.values());
  timers.forEach((t) => clearTimeout(t));
  pending.clear();
}
