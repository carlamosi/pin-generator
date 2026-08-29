import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { customAlphabet } from "nanoid";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Trash2, MoreVertical, RotateCcw } from "lucide-react";
import { COUNTRIES_ES } from "@/lib/countries-es";
import { lookupCountryForCity } from "@/lib/cityCountryMap";
import {
  computeBentoLayout,
  fileToImageDataUrl,
  getOpenCVDiagnostic,
  labelToLocation,
  loadImage,
  loadOpenCV,
  parseFilenameLabel,
  processPinImage,
  slugifyForPinId,
  STEP_LABEL_ES,
  StepError,
  subscribeOpenCVDiagnostic,
  type PinRow,
  type PinStatus,
} from "@/lib/pin-processing";
import { BentoView } from "@/components/BentoView";
import { PrintPreview } from "@/components/PrintPreview";
import {
  deleteAllPins,
  deleteCutout,
  deletePin,
  listPins,
  reuploadCutoutFromUrl,
  rowToDb,
  scheduleUpsert,
  upsertMany,
  upsertPin,
  uploadCutout,
} from "@/lib/pins-repo";

// 4-char suffix from a URL-safe alphabet (no ambiguous chars).
const pinSuffix = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 4);

const MONTHS_ES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pin Digitizer — Cataloga tu colección de pins" },
      {
        name: "description",
        content:
          "Sube fotos de tus pins de viaje sobre fondo blanco y obtén medidas, forma y ubicación automáticas.",
      },
    ],
  }),
  component: PinDigitizerPage,
});

const IMAGE_EXT = /\.(jpe?g|png|heic|heif)$/i;

async function normalizeToJpegBlob(file: File | Blob, name: string): Promise<Blob> {
  const isHeic = /\.(heic|heif)$/i.test(name);
  if (!isHeic) return file;
  const mod = await import("heic2any");
  const heic2any = (mod as any).default ?? mod;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}

function newPinRow(partial: Partial<PinRow> & Pick<PinRow, "id" | "originalName" | "status">): PinRow {
  return {
    city: null,
    country: null,
    year: null,
    month: null,
    shape: "",
    widthMm: null,
    heightMm: null,
    aspectRatio: null,
    bentoSize: "",
    visualScale: 1,
    visited: false,
    isFuture: false,
    isEmbassy: false,
    ...partial,
  };
}


function StatusBadge({ status }: { status: PinStatus }) {
  const map = {
    ok: { text: "OK", cls: "bg-[color:var(--success)]/12 text-[color:var(--success)]" },
    review: {
      text: "Revisar manualmente",
      cls: "bg-[color:var(--warning)]/18 text-[color:oklch(0.45_0.12_70)]",
    },
    error: {
      text: "Error",
      cls: "bg-[color:var(--destructive)]/12 text-[color:var(--destructive)]",
    },
  } as const;
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-tight ${s.cls}`}
    >
      {s.text}
    </span>
  );
}

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

// Recompute bentoSize + visualScale for the entire list on every mutation.
function withBento(rows: PinRow[]): PinRow[] {
  const layout = computeBentoLayout(rows);
  return rows.map((r, i) => {
    const { bentoSize, visualScale } = layout[i];
    if (r.bentoSize === bentoSize && r.visualScale === visualScale) return r;
    return { ...r, bentoSize, visualScale };
  });
}


// Serialize the fields we persist so we can detect real changes across
// mutations and skip no-op upserts.
function persistedSignature(r: PinRow, order: number): string {
  return JSON.stringify([
    r.pinId, r.city, r.country, r.year, r.month, r.shape, r.widthMm, r.heightMm,
    r.aspectRatio, r.bentoSize, r.visualScale, r.visited, r.isFuture,
    r.isEmbassy, r.status, r.cutoutImageUrl ?? null, order,
  ]);
}


function PinDigitizerPage() {
  const [rows, setRows] = useState<PinRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [view, setView] = useState<"tabla" | "bento" | "impresion">("tabla");
  const [wipeOpen, setWipeOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [engineState, setEngineState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineDiagnostic, setEngineDiagnostic] = useState(getOpenCVDiagnostic);
  const [engineElapsed, setEngineElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Snapshot of last persisted signatures per pinId (for diffing).
  const persistedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => subscribeOpenCVDiagnostic(setEngineDiagnostic), []);

  useEffect(() => {
    if (!engineDiagnostic.startedAt || engineDiagnostic.status !== "loading") return;
    const tick = () => setEngineElapsed((Date.now() - engineDiagnostic.startedAt!) / 1000);
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [engineDiagnostic.startedAt, engineDiagnostic.status]);

  useEffect(() => {
    setEngineState("loading");
    loadOpenCV()
      .then(() => setEngineState("ready"))
      .catch((e: Error) => {
        console.error("[opencv] failed to load", e);
        setEngineError(e.message ?? String(e));
        setEngineState("failed");
      });
  }, []);

  // Hydrate from Supabase on mount.
  useEffect(() => {
    let cancelled = false;
    listPins()
      .then((dbRows) => {
        if (cancelled) return;
        const ordered = dbRows.map((r, i) => ({ ...r, manualOrder: i }));
        setRows(ordered);
        // Prime persisted snapshot so hydration doesn't re-upsert everything.
        const snap = new Map<string, string>();
        ordered.forEach((r, i) => {
          if (r.pinId) snap.set(r.pinId, persistedSignature(r, i));
        });
        persistedRef.current = snap;
      })
      .catch((e) => console.error("[pins-repo] initial load failed", e))
      .finally(() => setHydrated(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist any diff whenever rows change (debounced per row).
  useEffect(() => {
    if (!hydrated) return;
    const snap = persistedRef.current;
    const nextSnap = new Map<string, string>();
    const bulkChanged: PinRow[] = [];
    rows.forEach((r, i) => {
      if (!r.pinId) return; // never persist rows that failed before assigning an id
      const sig = persistedSignature(r, i);
      nextSnap.set(r.pinId, sig);
      if (snap.get(r.pinId) !== sig) bulkChanged.push({ ...r, manualOrder: i });
    });
    persistedRef.current = nextSnap;
    if (bulkChanged.length === 0) return;
    if (bulkChanged.length > 3) {
      // Batch large diffs (reorder, bento recompute across many rows).
      upsertMany(
        bulkChanged.map((r, idx) => rowToDb(r, r.manualOrder ?? idx, r.cutoutImageUrl ?? null)),
      ).catch((e) => console.error("[pins-repo] bulk upsert failed", e));
    } else {
      // Debounce per-row for rapid single-field edits.
      bulkChanged.forEach((r) =>
        scheduleUpsert(rowToDb(r, r.manualOrder ?? 0, r.cutoutImageUrl ?? null)),
      );
    }
  }, [rows, hydrated]);

  // Recompute bento (bentoSize + visualScale) across ALL rows on every change.
  const applyBento = useCallback((rows: PinRow[]): PinRow[] => {
    const layout = computeBentoLayout(rows);
    return rows.map((r, i) => {
      const { bentoSize, visualScale } = layout[i];
      if (r.bentoSize === bentoSize && r.visualScale === visualScale) return r;
      return { ...r, bentoSize, visualScale };
    });
  }, []);

  const visibleRows = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status !== "ok")),
    [rows, filter],
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<PinRow>) => {
      setRows((prev) => applyBento(prev.map((r) => (r.id === id ? { ...r, ...patch } : r))));
    },
    [applyBento],
  );

  const reorderRows = useCallback((nextOrder: PinRow[]) => {
    setRows(nextOrder.map((r, i) => ({ ...r, manualOrder: i })));
  }, []);

  // Mutually exclusive status flags: checking one clears the other two.
  const setStatusFlag = useCallback(
    (id: string, field: "visited" | "isFuture" | "isEmbassy", checked: boolean) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          if (!checked) return { ...r, [field]: false };
          return { ...r, visited: false, isFuture: false, isEmbassy: false, [field]: true };
        }),
      );
    },
    [],
  );

  // ---------- Destructive actions with undo ----------

  const deleteRow = useCallback(
    (id: string) => {
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === id);
        if (idx < 0) return prev;
        const removed = prev[idx];
        const next = prev.filter((r) => r.id !== id);

        // Optimistically remove from Supabase; keep snapshot for undo.
        const savedUrl = removed.cutoutImageUrl;
        let undone = false;

        if (removed.pinId) {
          // Delay Supabase deletion so undo within the toast window is a no-op.
          const timer = setTimeout(() => {
            if (undone) return;
            deletePin(removed.pinId!).catch((e) => console.error("[delete] pin", e));
            deleteCutout(removed.pinId!).catch((e) => console.error("[delete] cutout", e));
          }, 5000);

          toast("Pin eliminado", {
            description: removed.city ?? removed.country ?? removed.originalName,
            duration: 5000,
            action: {
              label: "Deshacer",
              onClick: async () => {
                undone = true;
                clearTimeout(timer);
                // Restore row and (best-effort) storage.
                let restoredUrl = savedUrl;
                if (removed.pinId && savedUrl) {
                  restoredUrl = await reuploadCutoutFromUrl(removed.pinId, savedUrl);
                }
                setRows((cur) => {
                  const copy = [...cur];
                  const restored: PinRow = { ...removed, cutoutImageUrl: restoredUrl };
                  copy.splice(Math.min(idx, copy.length), 0, restored);
                  return withBento(copy.map((r, i) => ({ ...r, manualOrder: i })));
                });
              },
            },
          });
        }
        return withBento(next.map((r, i) => ({ ...r, manualOrder: i })));
      });
    },
    [],
  );

  const resetOrder = useCallback(() => {
    // Sort by originalName as a stable "original processing order" proxy —
    // ids start with `${Date.now()}-${i}-...` so timestamp order == creation order.
    setRows((prev) => {
      const sorted = [...prev].sort((a, b) => a.id.localeCompare(b.id));
      return withBento(sorted.map((r, i) => ({ ...r, manualOrder: i })));
    });
    toast.success("Orden del bento restablecido");
  }, []);

  const wipeEverything = useCallback(async () => {
    try {
      await deleteAllPins();
      setRows([]);
      toast.success("Colección eliminada");
    } catch (e) {
      toast.error("No se pudo eliminar la colección");
      console.error(e);
    }
  }, []);




  const handleFiles = useCallback(
    async (files: File[]) => {
      if (busy) return;
      setBusy(true);
      setProgress(null);

      try {
        await loadOpenCV();
        setEngineState("ready");
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        setEngineError(msg);
        setEngineState("failed");
        setBusy(false);
        return;
      }

      const imageEntries: { name: string; blob: Blob }[] = [];
      const zipErrors: { name: string; error: string }[] = [];
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
          try {
            const zip = await JSZip.loadAsync(f);
            const entries = Object.values(zip.files).filter(
              (e) => !e.dir && IMAGE_EXT.test(e.name) && !e.name.startsWith("__MACOSX/"),
            );
            for (const e of entries) {
              const blob = await e.async("blob");
              if (blob.size === 0) continue;
              imageEntries.push({ name: e.name.split("/").pop() || e.name, blob });
            }
          } catch (e) {
            zipErrors.push({ name: f.name, error: (e as Error).message ?? String(e) });
          }
        } else if (IMAGE_EXT.test(f.name)) {
          imageEntries.push({ name: f.name, blob: f });
        }
      }

      const zipRows: PinRow[] = zipErrors.map((z, i) =>
        newPinRow({
          id: `${Date.now()}-zip-${i}-${z.name}`,
          originalName: z.name,
          status: "error",
          step: "zip",
          note: STEP_LABEL_ES.zip,
          detail: z.error,
        }),
      );

      if (imageEntries.length === 0 && zipRows.length === 0) {
        setBusy(false);
        return;
      }

      // Seed rows — city/country come from FILENAME (no AI). Append at the end.
      const baseOrder = rows.reduce((m, r) => Math.max(m, r.manualOrder ?? -1), -1) + 1;
      const seeded: PinRow[] = imageEntries.map((e, i) => {
        const label = parseFilenameLabel(e.name);
        const loc = labelToLocation(label, COUNTRIES_ES);
        // Best-effort auto-fill of País from a curated city→country table.
        // Only applies once at ingestion, never overrides manual edits later.
        const autoCountry = loc.country ?? lookupCountryForCity(loc.city);
        return newPinRow({
          id: `${Date.now()}-${i}-${e.name}`,
          originalName: e.name,
          status: "review",
          city: loc.city,
          country: autoCountry,
          manualOrder: baseOrder + zipRows.length + i,
        });
      });
      setRows((prev) => withBento([...prev, ...zipRows, ...seeded]));


      for (let i = 0; i < imageEntries.length; i++) {
        const entry = imageEntries[i];
        const row = seeded[i];
        setProgress({ current: i + 1, total: imageEntries.length });

        let jpegBlob: Blob;
        try {
          jpegBlob = await normalizeToJpegBlob(entry.blob, entry.name);
        } catch (e) {
          updateRow(row.id, {
            status: "error", step: "heic",
            note: STEP_LABEL_ES.heic, detail: (e as Error).message ?? String(e),
          });
          continue;
        }

        let dataUrl: string;
        try {
          dataUrl = await fileToImageDataUrl(jpegBlob);
        } catch (e) {
          updateRow(row.id, {
            status: "error", step: "heic",
            note: STEP_LABEL_ES.heic, detail: `FileReader: ${(e as Error).message}`,
          });
          continue;
        }
        updateRow(row.id, { rawDataUrl: dataUrl });

        let img: HTMLImageElement;
        try {
          img = await loadImage(dataUrl);
        } catch (e) {
          updateRow(row.id, {
            status: "error", step: "heic",
            note: STEP_LABEL_ES.heic, detail: (e as Error).message ?? String(e),
          });
          continue;
        }

        try {
          const result = await processPinImage(img, entry.name);
          if (result.status === "review") {
            updateRow(row.id, { status: "review", note: result.note });
            continue;
          }
          const pinId = `${slugifyForPinId(row.city, row.country, entry.name)}-${pinSuffix()}`;

          // Upload cutout to Supabase Storage → get public URL.
          let cutoutImageUrl: string | undefined;
          try {
            cutoutImageUrl = await uploadCutout(pinId, result.thumbnailDataUrl);
          } catch (e) {
            console.error("[pins-repo] upload cutout failed", e);
          }

          updateRow(row.id, {
            pinId,
            status: "ok",
            thumbnailDataUrl: result.thumbnailDataUrl,
            cutoutImageUrl,
            shape: result.shape,
            widthMm: result.widthMm,
            heightMm: result.heightMm,
            aspectRatio: result.aspectRatio,
            note: undefined, detail: undefined, step: undefined,
          });
        } catch (err) {
          if (err instanceof StepError) {
            updateRow(row.id, {
              status: "error", step: err.step,
              note: `${STEP_LABEL_ES[err.step]}: ${err.message}`,
              detail: err.message,
            });
          } else {
            const msg = (err as Error).message ?? String(err);
            updateRow(row.id, {
              status: "error", step: "unknown",
              note: `${STEP_LABEL_ES.unknown}: ${msg}`,
              detail: msg,
            });
          }
        }
      }

      setBusy(false);
      setProgress(null);
    },
    [busy, updateRow, rows],
  );


  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFiles(files);
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFiles(files);
    e.target.value = "";
  };

  const yesNo = (b: boolean) => (b ? "Sí" : "No");

  const copyCsv = async () => {
    const header = [
      "Ciudad", "País", "Año", "Mes", "Forma", "Ancho (mm)", "Alto (mm)",
      "Proporción", "Bento", "Estuve aquí", "Futuro", "Embajada", "Estado", "Archivo",
    ];
    const escape = (v: unknown) => {
      const s = v == null || v === "" ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    rows.forEach((r) => {
      lines.push(
        [
          escape(r.city),
          escape(r.country),
          escape(r.year),
          escape(r.month ? MONTHS_ES_FULL[r.month - 1] : ""),
          escape(r.shape),
          escape(r.widthMm),
          escape(r.heightMm),
          escape(r.aspectRatio),
          escape(r.bentoSize),
          escape(yesNo(r.visited)),
          escape(yesNo(r.isFuture)),
          escape(yesNo(r.isEmbassy)),
          escape(
            r.status === "ok" ? "OK" : r.status === "review" ? "Revisar manualmente" : "Error",
          ),
          escape(r.originalName),
        ].join(","),
      );
    });
    await navigator.clipboard.writeText(lines.join("\n"));
  };

  const downloadXlsx = () => {
    const data = rows.map((r) => ({
      Ciudad: r.city ?? "",
      País: r.country ?? "",
      Año: r.year ?? "",
      Mes: r.month ? MONTHS_ES_FULL[r.month - 1] : "",
      Forma: r.shape,
      "Ancho (mm)": r.widthMm ?? "",
      "Alto (mm)": r.heightMm ?? "",
      Proporción: r.aspectRatio ?? "",
      Bento: r.bentoSize,
      "Estuve aquí": yesNo(r.visited),
      Futuro: yesNo(r.isFuture),
      Embajada: yesNo(r.isEmbassy),
      Estado:
        r.status === "ok" ? "OK" : r.status === "review" ? "Revisar manualmente" : "Error",
      Archivo: r.originalName,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pins");
    XLSX.writeFile(wb, "pin-digitizer.xlsx");
  };


  const downloadCutouts = async () => {
    const zip = new JSZip();
    rows.forEach((r) => {
      if (!r.thumbnailDataUrl || !r.pinId) return;
      const base64 = r.thumbnailDataUrl.split(",")[1];
      zip.file(`${r.pinId}.png`, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pin-cutouts.zip";
    a.click();
    URL.revokeObjectURL(url);
  };


  const hasRows = rows.length > 0;

  return (
    <main className="min-h-screen bg-background pb-32">
      <datalist id="countries-es">
        {COUNTRIES_ES.map((c) => (
          <option key={c.code} value={c.name} />
        ))}
      </datalist>
      <div className="mx-auto max-w-6xl px-6 pt-14 sm:pt-20">

        <header className="mb-12 sm:mb-16">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Pin Digitizer
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Cataloga tu colección de pins con precisión milimétrica.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Sube tus fotos y obtén automáticamente miniatura recortada,
            medidas reales, forma y ubicación de cada pin.
          </p>
        </header>

        {engineState !== "ready" && (
          <div
            className={`mb-6 flex items-center gap-3 rounded-2xl bg-surface-elevated px-5 py-3 text-[13px] ${
              engineState === "failed" ? "text-[color:var(--destructive)]" : "text-muted-foreground"
            }`}
            style={{ boxShadow: "var(--shadow-press)" }}
          >
            {engineState === "failed" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[color:var(--destructive)]" />
                <span>
                  No se pudo cargar el motor de procesamiento (OpenCV.js): {engineError}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                <span>
                  Cargando… {engineElapsed.toFixed(1)}s · {engineDiagnostic.stage}
                </span>
              </>
            )}
          </div>
        )}

        {!hasRows && (
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative overflow-hidden rounded-[28px] bg-surface-elevated p-10 transition-all duration-300 sm:p-16 ${
              dragOver ? "scale-[1.005]" : ""
            }`}
            style={{ boxShadow: "var(--shadow-float)" }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-foreground"
                style={{ boxShadow: "var(--shadow-press)" }}
              >
                <UploadIcon />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Sube tus fotos de pins
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Arrastra un archivo <span className="font-medium text-foreground">.zip</span>{" "}
                o fotos individuales <span className="font-medium text-foreground">.HEIC</span>,{" "}
                <span className="font-medium text-foreground">.JPG</span> o{" "}
                <span className="font-medium text-foreground">.PNG</span>.
              </p>

              <button
                onClick={() => inputRef.current?.click()}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                style={{ boxShadow: "var(--shadow-press)" }}
              >
                Subir archivo ZIP
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".zip,.jpg,.jpeg,.png,.heic,.heif"
                onChange={onSelect}
                className="hidden"
              />

              <ol className="mt-14 grid w-full max-w-2xl gap-6 text-left sm:grid-cols-3">
                {[
                  "Fondo blanco limpio, sin arrugas ni pliegues.",
                  "Moneda de 1 € a la izquierda, pin a la derecha.",
                  "El nombre del archivo será la ciudad o país.",
                ].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {t}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {hasRows && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                  style={{ boxShadow: "var(--shadow-press)" }}
                >
                  <UploadIcon />
                  Añadir más
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".zip,.jpg,.jpeg,.png,.heic,.heif"
                  onChange={onSelect}
                  className="hidden"
                />

                <div
                  className="inline-flex rounded-full bg-secondary p-1 text-[13px]"
                  style={{ boxShadow: "var(--shadow-press)" }}
                >
                  {(["all", "issues"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${
                        filter === f
                          ? "bg-surface-elevated text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f === "all" ? "Todos" : "Sólo con incidencias"}
                    </button>
                  ))}
                </div>

                <div
                  className="inline-flex rounded-full bg-secondary p-1 text-[13px]"
                  style={{ boxShadow: "var(--shadow-press)" }}
                >
                  {(["tabla", "bento", "impresion"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${
                        view === v
                          ? "bg-surface-elevated text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v === "tabla" ? "Tabla" : v === "bento" ? "Bento" : "Tamaño real"}
                    </button>
                  ))}
                </div>

                {busy && progress && (
                  <span className="text-[13px] text-muted-foreground">
                    Procesando {progress.current} de {progress.total}...
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={copyCsv}
                  className="rounded-full bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-all hover:bg-secondary/70 active:scale-[0.98]"
                >
                  Copiar como CSV
                </button>
                <button
                  onClick={downloadXlsx}
                  className="rounded-full bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-all hover:bg-secondary/70 active:scale-[0.98]"
                >
                  Descargar Excel
                </button>
                <button
                  onClick={downloadCutouts}
                  className="rounded-full bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-all hover:bg-secondary/70 active:scale-[0.98]"
                >
                  Descargar recortes (.zip)
                </button>
                <OverflowMenu
                  onResetOrder={() => {
                    if (window.confirm("¿Restablecer el orden original del bento?")) resetOrder();
                  }}
                  onWipe={() => setWipeOpen(true)}
                />
              </div>
            </div>

            {view === "tabla" ? (
              <div
                className="table-scroll-shadow overflow-hidden rounded-[24px] bg-surface-elevated"
                style={{ boxShadow: "var(--shadow-float)" }}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm" style={{ tableLayout: "fixed", minWidth: 1100 }}>
                    <colgroup>
                      <col style={{ width: 76 }} />
                      <col />
                      <col />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 84 }} />
                      <col style={{ width: 72 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 68 }} />
                      <col style={{ width: 78 }} />
                      {filter === "issues" && <col style={{ width: 240 }} />}
                      <col style={{ width: 52 }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-4 font-medium">Miniatura</th>
                        <th className="px-3 py-4 font-medium">Ciudad</th>
                        <th className="px-3 py-4 font-medium">País</th>
                        <th className="px-3 py-4 font-medium">Año</th>
                        <th className="px-3 py-4 font-medium">Mes</th>
                        <th className="px-3 py-4 font-medium">Forma</th>
                        <th className="px-3 py-4 font-medium">Ancho</th>
                        <th className="px-3 py-4 font-medium">Alto</th>
                        <th className="px-3 py-4 font-medium">Prop.</th>
                        <th className="px-3 py-4 font-medium">Bento</th>
                        <th className="px-3 py-4 font-medium">Visita</th>
                        <th className="px-3 py-4 font-medium">Fut.</th>
                        <th className="px-3 py-4 font-medium">Emb.</th>
                        {filter === "issues" && <th className="px-5 py-4 font-medium">Estado</th>}
                        <th className="px-3 py-4" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => (
                        <PinTableRow
                          key={r.id}
                          row={r}
                          showStatus={filter === "issues"}
                          onChange={(patch) => updateRow(r.id, patch)}
                          onStatusFlag={(field, checked) => setStatusFlag(r.id, field, checked)}
                          onDelete={() => deleteRow(r.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : view === "bento" ? (
              <BentoView rows={rows} onReorder={reorderRows} />
            ) : (
              <PrintPreview rows={rows} onReorder={reorderRows} />
            )}
          </>
        )}

        {wipeOpen && (
          <WipeDialog
            onCancel={() => setWipeOpen(false)}
            onConfirm={async () => {
              setWipeOpen(false);
              await wipeEverything();
            }}
          />
        )}
      </div>
    </main>
  );
}


function fmtMm(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} mm`;
}

function PinTableRow({
  row,
  showStatus,
  onChange,
  onStatusFlag,
  onDelete,
}: {
  row: PinRow;
  showStatus: boolean;
  onChange: (patch: Partial<PinRow>) => void;
  onStatusFlag: (field: "visited" | "isFuture" | "isEmbassy", checked: boolean) => void;
  onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const borderCls =
    row.status === "review"
      ? "border-l-[3px] border-l-[color:var(--warning)]"
      : row.status === "error"
        ? "border-l-[3px] border-l-[color:var(--destructive)]"
        : "border-l-[3px] border-l-transparent";

  return (
    <tr
      className={`animate-float-in border-b border-border last:border-0 transition-colors hover:bg-secondary/40 ${borderCls}`}
    >
      <td className="px-5 py-4">
        <div
          className="checker-bg flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl"
          style={{ boxShadow: "var(--shadow-press)" }}
          title={row.status !== "ok" ? row.note ?? "" : undefined}
        >
          {row.thumbnailDataUrl ? (
            <img src={row.thumbnailDataUrl} alt={row.originalName} className="h-full w-full object-contain" />
          ) : row.rawDataUrl ? (
            <img src={row.rawDataUrl} alt={row.originalName} className="h-full w-full object-cover opacity-70" />
          ) : (
            <div className="h-full w-full animate-pulse bg-secondary" />
          )}
        </div>
      </td>
      <EditableCell
        value={row.city ?? ""}
        onChange={(v) => onChange({ city: v || null })}
        placeholder="p. ej. Nueva York"
      />
      <CountryCell
        value={row.country ?? ""}
        onChange={(name) => onChange({ country: name || null })}
      />
      <td className="px-3 py-4 align-top">
        <input
          type="number"
          inputMode="numeric"
          min={1900}
          max={2100}
          value={row.year ?? ""}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) return onChange({ year: null });
            const n = parseInt(raw, 10);
            onChange({ year: Number.isFinite(n) ? n : null });
          }}
          placeholder="—"
          className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-secondary focus:bg-secondary focus:ring-2 focus:ring-ring/40"
          aria-label="Año del viaje"
        />
      </td>
      <td className="px-3 py-4 align-top">
        <select
          value={row.month ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ month: v ? parseInt(v, 10) : null });
          }}
          className="w-full cursor-pointer rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none transition-colors hover:bg-secondary focus:bg-secondary focus:ring-2 focus:ring-ring/40"
          aria-label="Mes del viaje"
        >
          <option value="">—</option>
          {MONTHS_ES_FULL.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </td>
      <EditableCell value={row.shape} onChange={(v) => onChange({ shape: v as any })} />

      <td className="px-3 py-4 align-top text-sm tabular-nums text-foreground">
        {row.status === "ok" ? fmtMm(row.widthMm) : "—"}
      </td>
      <td className="px-3 py-4 align-top text-sm tabular-nums text-foreground">
        {row.status === "ok" ? fmtMm(row.heightMm) : "—"}
      </td>
      <td className="px-3 py-4 align-top text-sm tabular-nums text-foreground">
        {row.aspectRatio != null ? row.aspectRatio.toFixed(2) : "—"}
      </td>
      <td className="px-3 py-4 align-top text-sm text-foreground">{row.bentoSize || "—"}</td>
      <td className="px-3 py-4 align-top">
        <input
          type="checkbox"
          checked={row.visited}
          onChange={(e) => onStatusFlag("visited", e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[color:var(--primary)]"
          aria-label="Estuve aquí"
        />
      </td>
      <td className="px-3 py-4 align-top">
        <input
          type="checkbox"
          checked={row.isFuture}
          onChange={(e) => onStatusFlag("isFuture", e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[color:var(--primary)]"
          aria-label="Futuro"
        />
      </td>
      <td className="px-3 py-4 align-top">
        <input
          type="checkbox"
          checked={row.isEmbassy}
          onChange={(e) => onStatusFlag("isEmbassy", e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[color:var(--primary)]"
          aria-label="Embajada"
        />
      </td>
      {showStatus && (
        <td className="px-5 py-4 align-top">
          <div className="flex max-w-[260px] flex-col gap-1.5">
            <StatusBadge status={row.status} />
            {row.note && (
              <span className="text-[11px] leading-snug text-muted-foreground" title={row.detail ?? row.note}>
                {row.note}
              </span>
            )}
            {row.detail && row.detail !== row.note && (
              <details className="text-[10px] leading-snug text-muted-foreground/80">
                <summary className="cursor-pointer select-none hover:text-foreground">
                  Ver detalle técnico
                </summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/60 p-2 font-mono">
                  {row.detail}
                </pre>
              </details>
            )}
          </div>
        </td>
      )}
      <td className="px-2 py-4 align-top text-right">
        {confirmDel ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={onDelete}
              className="rounded-md bg-[color:var(--destructive)] px-2 py-1 text-[11px] font-medium text-white transition-colors hover:brightness-110"
              aria-label="Confirmar eliminación"
            >
              Sí
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/70"
              aria-label="Cancelar"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-[color:var(--destructive)]/10 hover:text-[color:var(--destructive)] group-hover:opacity-100 focus:opacity-100"
            style={{ opacity: 0.5 }}
            aria-label="Eliminar pin"
            title="Eliminar pin"
          >
            <TrashIcon />
          </button>
        )}
      </td>
    </tr>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function OverflowMenu({ onResetOrder, onWipe }: { onResetOrder: () => void; onWipe: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-secondary px-3 py-2 text-[13px] font-medium text-foreground transition-all hover:bg-secondary/70 active:scale-[0.98]"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        •••
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl bg-surface-elevated py-1.5 text-[13px]"
          style={{ boxShadow: "var(--shadow-float)" }}
        >
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onResetOrder(); }}
            className="block w-full px-4 py-2 text-left text-foreground transition-colors hover:bg-secondary"
          >
            Restablecer orden
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onWipe(); }}
            className="block w-full px-4 py-2 text-left font-medium text-[color:var(--destructive)] transition-colors hover:bg-[color:var(--destructive)]/10"
          >
            Eliminar todo…
          </button>
        </div>
      )}
    </div>
  );
}

function WipeDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const [text, setText] = useState("");
  const armed = text.trim().toUpperCase() === "ELIMINAR";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-surface-elevated p-7"
        style={{ boxShadow: "var(--shadow-float)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">Eliminar toda la colección</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Se borrarán todos los pins y sus imágenes. Esta acción no se puede deshacer.
        </p>
        <label className="mt-5 block text-[12px] font-medium text-muted-foreground">
          Escribe <span className="font-semibold text-foreground">ELIMINAR</span> para confirmar
        </label>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-2 w-full rounded-xl bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-[color:var(--destructive)]/40"
          placeholder="ELIMINAR"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full bg-secondary px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed}
            className="rounded-full bg-[color:var(--destructive)] px-4 py-2 text-[13px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-40"
          >
            Eliminar todo
          </button>
        </div>
      </div>
    </div>
  );
}


function EditableCell({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <td className="px-3 py-4 align-top">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        className={`w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-secondary focus:bg-secondary focus:ring-2 focus:ring-ring/40 ${
          className ?? ""
        }`}
      />
    </td>
  );
}

function CountryCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <td className="px-3 py-4 align-top">
      <input
        list="countries-es"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="p. ej. Japón"
        className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-secondary focus:bg-secondary focus:ring-2 focus:ring-ring/40"
      />
    </td>
  );
}
