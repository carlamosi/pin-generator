import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Stamp,
  ArrowLeft,
  RotateCcw,
  ChevronRight,
  AlertCircle,
  Check,
  Globe2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeString } from "@/lib/pin-processing";
import {
  normalizePassportPage,
  detectStamps,
  computeSlotRect,
  rotateImage,
  transformCrop,
  SLOT_LAYOUT,
  type SlotDetection,
  type SlotState,
} from "@/lib/passport-cv";
import {
  recogniseStamp,
  type StampRecognitionResult,
  type RecognitionConfidence,
} from "@/lib/passport-recognition";
import {
  uploadPassportImage,
  getNextPassportPageNumber,
  upsertPassportPage,
  upsertPhysicalStamp,
  insertStampDesign,
  listStampDesigns,
  listStampingLocations,
  findOrCreateStampingLocation,
  resolveGeoForCity,
  findOrCreateCityFromGeo,
  listTrips,
  listCities,
  type StampDesign,
  type StampingLocation,
  type Trip,
  type City,
} from "@/lib/trips/trips-repo";

export const Route = createFileRoute("/passport/scan")({
  component: PassportScanPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanStep = "upload" | "review" | "identify";

interface IdentifyState {
  /** slot position being identified */
  slot: SlotDetection;
  recognition: StampRecognitionResult;
  rawCropDataUrl: string;

  // Editable fields (user overrides recognition)
  editLocationName: string; // Manual name of LEGO Store or location
  editTripId: string;       // Associated trip
  editStampedAt: string;
  editCode: string;

  /** "existing" = reuse design, "new" = create design */
  designMode: "existing" | "new";
  selectedDesignId: string | null;

  confirmed: boolean;
}

const CONFIDENCE_STYLE: Record<RecognitionConfidence, string> = {
  HIGH: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  LOW: "bg-red-500/15 text-red-400 border-red-500/30",
};

const CONFIDENCE_LABEL: Record<RecognitionConfidence, string> = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

const CATEGORIES = [
  "CITY", "YEAR", "STORE", "AIRPORT", "TERMINAL", "SPECIAL", "THEMED",
] as const;

// ---------------------------------------------------------------------------
// PageWithOverlays — SVG-based slot + bounding-box overlay
// ---------------------------------------------------------------------------

interface PageWithOverlaysProps {
  normalizedImage: string;
  detections: SlotDetection[];
  selectedSlot: number | null;
  onSelectSlot: (slot: number) => void;
}

/**
 * Renders the normalized passport page with two overlay layers:
 *   1. Fixed slot regions (deterministic, semi-transparent)
 *   2. Detected stamp bounding box for the selected slot (precise)
 *
 * We use a natural-size reference (naturalW × naturalH) so SVG coordinates
 * map 1-to-1 with the geometry in passport-cv.ts, then scale via viewBox.
 */
function PageWithOverlays({
  normalizedImage,
  detections,
  selectedSlot,
  onSelectSlot,
}: PageWithOverlaysProps) {
  const [naturalW, setNaturalW] = useState(800);
  const [naturalH, setNaturalH] = useState(1200);

  const detMap = new Map(detections.map((d) => [d.slot_position, d]));

  // Precompute all 6 slot rects at the natural page size
  const slotRects = SLOT_LAYOUT.map((slot) => ({
    id: slot.id,
    rect: computeSlotRect(slot, naturalW, naturalH),
  }));

  const selectedDet = selectedSlot ? detMap.get(selectedSlot) : null;

  return (
    <div className="relative w-full max-w-[400px] aspect-[8/12] rounded-lg overflow-hidden shadow-2xl">
      <img
        src={normalizedImage}
        alt="Passport Page"
        className="absolute inset-0 w-full h-full object-contain"
        onLoad={(e) => {
          const el = e.currentTarget;
          setNaturalW(el.naturalWidth);
          setNaturalH(el.naturalHeight);
        }}
      />
      {/* SVG overlay – same viewBox as the natural image size */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${naturalW} ${naturalH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ pointerEvents: "none" }}
      >
        {/* Layer 1: fixed slot regions */}
        {slotRects.map(({ id, rect }) => {
          const det = detMap.get(id);
          const isSelected = selectedSlot === id;
          const state = det?.state ?? "EMPTY";

          const strokeColor =
            state === "DETECTED" ? "#22c55e" :
            state === "UNCERTAIN" ? "#f59e0b" :
            "#6b7280";
          const fillColor =
            state === "DETECTED" ? "rgba(34,197,94,0.08)" :
            state === "UNCERTAIN" ? "rgba(245,158,11,0.12)" :
            "rgba(0,0,0,0)";

          return (
            <g key={id} style={{ pointerEvents: "all", cursor: "pointer" }}
               onClick={() => onSelectSlot(id)}>
              <rect
                x={rect.x} y={rect.y}
                width={rect.width} height={rect.height}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeDasharray={isSelected ? "none" : "6 4"}
                rx={4}
              />
              {/* Slot number badge */}
              <rect
                x={rect.x + 4} y={rect.y + 4}
                width={26} height={16}
                fill="rgba(0,0,0,0.55)" rx={3}
              />
              <text
                x={rect.x + 17} y={rect.y + 15}
                textAnchor="middle"
                fontSize={10}
                fontFamily="monospace"
                fill="white"
              >
                0{id}
              </text>
            </g>
          );
        })}

        {/* Layer 2: detected stamp contour for selected slot */}
        {selectedDet?.stampCircle ? (
          <circle
            cx={selectedDet.stampCircle.cx}
            cy={selectedDet.stampCircle.cy}
            r={selectedDet.stampCircle.radius}
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeDasharray="4 2"
            opacity={0.85}
          />
        ) : selectedDet?.boundingBox ? (
          <rect
            x={selectedDet.boundingBox.x}
            y={selectedDet.boundingBox.y}
            width={selectedDet.boundingBox.width}
            height={selectedDet.boundingBox.height}
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeDasharray="4 2"
            rx={2}
            opacity={0.85}
          />
        ) : null}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PassportScanPage() {
  const navigate = useNavigate();

  // ── Step 1: Upload & CV Detection ──────────────────────────────────────────
  const [step, setStep] = useState<ScanStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [normalizedImage, setNormalizedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [detections, setDetections] = useState<SlotDetection[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [isConfirmingPage, setIsConfirmingPage] = useState(false);

  // Page record created after slot review is confirmed
  const [savedPageId, setSavedPageId] = useState<string | null>(null);

  // Raw file stored for later upload
  const fileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 2: Recognition & Identification ──────────────────────────────────
  const [identifyQueue, setIdentifyQueue] = useState<IdentifyState[]>([]);
  const [identifyIndex, setIdentifyIndex] = useState(0);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [existingDesigns, setExistingDesigns] = useState<StampDesign[]>([]);
  const [existingLocations, setExistingLocations] = useState<StampingLocation[]>([]);
  const [existingCities, setExistingCities] = useState<City[]>([]);
  const [existingTrips, setExistingTrips] = useState<Trip[]>([]);

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png") {
      setProcessError("Solo se permiten archivos PNG.");
      return;
    }
    fileRef.current = f;
    setFile(f);
    setProcessError(null);
    processImage(f);
  };

  const processImage = async (f: File) => {
    setIsProcessing(true);
    setProcessError(null);
    try {
      const normalized = await normalizePassportPage(f);
      setNormalizedImage(normalized);
      const slots = await detectStamps(normalized);
      setDetections(slots);
      const firstActive = slots.find((d) => d.state !== "EMPTY")?.slot_position ?? 1;
      setSelectedSlot(firstActive);
      setStep("review");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setProcessError("Error al procesar la imagen: " + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const overrideState = (slotNumber: number, newState: SlotState) => {
    setDetections((prev) =>
      prev.map((d) =>
        d.slot_position === slotNumber
          ? { ...d, state: newState, _isManualOverride: true }
          : d
      )
    );
  };

  const reset = useCallback(() => {
    setFile(null);
    fileRef.current = null;
    setNormalizedImage(null);
    setDetections([]);
    setSelectedSlot(null);
    setProcessError(null);
    setSavedPageId(null);
    setIdentifyQueue([]);
    setIdentifyIndex(0);
    setStep("upload");
  }, []);

  // ── Confirm page: upload assets + create passport_page record ─────────────
  const handleConfirmPage = async () => {
    if (!normalizedImage || !fileRef.current) return;
    setIsConfirmingPage(true);
    setSaveError(null);
    try {
      const pageNum = await getNextPassportPageNumber();
      const ts = Date.now();

      await uploadPassportImage(fileRef.current, `pages/original_p${pageNum}_${ts}.png`);
      const normalizedUrl = await uploadPassportImage(
        normalizedImage,
        `pages/normalized_p${pageNum}_${ts}.png`
      );

      const pageRecord = await upsertPassportPage({
        page_number: pageNum,
        dimension_w_cm: 8.0,
        dimension_h_cm: 12.0,
        max_slots: 6,
        scanned_image_url: normalizedUrl,
        notes: `Escaneado ${new Date().toISOString().slice(0, 10)}`,
      });
      if (!pageRecord?.id) throw new Error("Error creando pagina");

      setSavedPageId(pageRecord.id);

      // Load reference data for recognition
      const [designs, locations, cities, trips] = await Promise.all([
        listStampDesigns(),
        listStampingLocations(),
        listCities(),
        listTrips().catch(() => [] as Trip[]),
      ]);
      setExistingDesigns(designs);
      setExistingLocations(locations);
      setExistingCities(cities);
      setExistingTrips(trips);

      // Build identify queue from non-EMPTY slots
      const activeSlots = detections.filter((d) => d.state !== "EMPTY");
      if (activeSlots.length === 0) {
        // Nothing to identify – go straight to passport
        navigate({ to: "/passport" });
        return;
      }

      // Run recognition for each slot
      setIsIdentifying(true);
      const queue: IdentifyState[] = [];
      for (const slot of activeSlots) {
        let rec: StampRecognitionResult;
        try {
          rec = await recogniseStamp(slot.cropDataUrl ?? "", designs, cities);
        } catch {
          rec = {
            visualHash: "",
            rawOcrText: "",
            ocrTokens: [],
            confidence: "LOW",
            existingDesign: null,
            isDuplicate: false,
            suggestedName: "",
            suggestedCategory: "SPECIAL",
            matchedCity: null,
          };
        }

        const useExisting = rec.existingDesign !== null;
        queue.push({
          slot,
          recognition: rec,
          rawCropDataUrl: slot.cropDataUrl ?? "",
          editName: rec.suggestedName,
          editCategory: rec.suggestedCategory,
          editCityId: rec.matchedCity?.id ?? "",
          editLocationName: rec.matchedCity ? `LEGO Store ${rec.matchedCity.name}` : "",
          editTripId: rec.matchedCity?.trip_id ?? "",
          editStampedAt: "",        // ALWAYS left empty by default
          editCode: "",
          designMode: useExisting ? "existing" : "new",
          selectedDesignId: rec.existingDesign?.id ?? null,
          confirmed: rec.confidence === "HIGH",  // HIGH is preselected but user still confirms
        });
      }
      setIdentifyQueue(queue);
      setIdentifyIndex(0);
      setIsIdentifying(false);
      setStep("identify");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError("Error al confirmar pagina: " + msg);
    } finally {
      setIsConfirmingPage(false);
    }
  };

  // ── Editing helpers ────────────────────────────────────────────────────────
  const updateCurrent = (patch: Partial<IdentifyState>) =>
    setIdentifyQueue((prev) =>
      prev.map((item, i) => (i === identifyIndex ? { ...item, ...patch } : item))
    );

  const current = identifyQueue[identifyIndex];

  // ── Final Save ─────────────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    if (!savedPageId) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const confirmedItems = identifyQueue.filter((item) => item.confirmed);
      for (const item of confirmedItems) {
        // Upload crop
        let cropUrl: string | null = null;
        if (item.slot.cropDataUrl) {
          const ts = Date.now();
          cropUrl = await uploadPassportImage(
            item.slot.cropDataUrl,
            `crops/crop_p${savedPageId}_s${item.slot.slot_position}_${ts}.png`
          );
        }

        let finalCityId = item.editCityId || null;
        if (!finalCityId && item.editName) {
          const autoCity = await findOrCreateCityFromGeo(item.editName);
          if (autoCity) finalCityId = autoCity.id;
        }

        // Create new stamp_design
        const nameSlug = normalizeString(item.editName.trim() || "stamp")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const code =
          item.editCode.trim() ||
          `${item.editCategory.toLowerCase()}-${nameSlug || "design"}-${Date.now()}`;

        const newDesign = await insertStampDesign({
          code,
          name: item.editName.trim() || "Sello sin identificar",
          category: item.editCategory,
          description: null,
          preview_image_url: cropUrl,
          represented_city_id: finalCityId,
          visual_hash: item.recognition.visualHash || null,
        });
        const designId = newDesign.id;

        // Find or create manual stamping location if entered
        let locationId: string | null = null;
        if (item.editLocationName && item.editLocationName.trim()) {
          const createdLoc = await findOrCreateStampingLocation(item.editLocationName, finalCityId);
          locationId = createdLoc?.id ?? null;
        }

        // Create physical_stamp record
        await upsertPhysicalStamp({
          stamp_design_id: designId,
          passport_page_id: savedPageId,
          slot_position: item.slot.slot_position,
          stamped_at: item.editStampedAt || new Date().toISOString().slice(0, 10),
          stamping_location_id: locationId,
          trip_id: item.editTripId || null,
          cutout_image_url: cropUrl,
          raw_image_url: item.slot.cropDataUrl ?? null,
          obtained_personally: true,
        });
      }

      navigate({ to: "/passport" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError("Error al guardar sellos: " + msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const confirmedCount = identifyQueue.filter((q) => q.confirmed).length;
  const totalCount = identifyQueue.length;
  const selectedDet = detections.find((d) => d.slot_position === selectedSlot);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16 pt-2">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/passport" })}
          className="h-8 w-8 text-muted-fg hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="h-6 w-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-xs font-bold font-mono">
          SC
        </span>
        <div>
          <h2 className="font-display font-bold text-2xl tracking-tight text-white">
            {step === "identify" ? "Identificar Sellos" : "Escanear Pasaporte"}
          </h2>
          <p className="text-muted-fg text-xs mt-0.5">
            {step === "upload" && "Carga una pagina en PNG para digitalizacion."}
            {step === "review" && "Revisa las 6 posiciones detectadas antes de continuar."}
            {step === "identify" &&
              `Sello ${identifyIndex + 1} de ${totalCount} — ${confirmedCount} confirmados`}
          </p>
        </div>
      </div>

      {/* ── STEP: UPLOAD ─────────────────────────────────────────────────── */}
      {step === "upload" && !isProcessing && (
        <div
          className="flex flex-col items-center justify-center py-24 px-4 border-2 border-dashed border-white/10 rounded-2xl bg-white/[0.02] cursor-pointer hover:border-white/20 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center text-muted-fg mb-4">
            <UploadCloud className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Subir Pagina de Pasaporte (PNG)
          </h3>
          <p className="text-sm text-muted-fg text-center max-w-md mb-2">
            Solo se admiten archivos PNG. El original no sera modificado.
          </p>
          <input
            type="file"
            accept="image/png"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          {processError && (
            <p className="text-red-400 text-sm mt-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {processError}
            </p>
          )}
        </div>
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
          <p className="text-muted-fg text-sm animate-pulse">
            Analizando pagina y detectando sellos…
          </p>
        </div>
      )}

      {/* ── STEP: REVIEW (slot detection) ─────────────────────────────────── */}
      {step === "review" && normalizedImage && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: page viewer */}
          <div className="lg:col-span-7 flex flex-col items-center space-y-4">
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-mono text-muted-fg uppercase tracking-wider">
                Pagina Normalizada
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-8 text-muted-fg hover:text-white text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
              </Button>
            </div>

            {/* Passport page with slot overlays — SVG-based, scale-aware */}
            <PageWithOverlays
              normalizedImage={normalizedImage}
              detections={detections}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
            />
          </div>

          {/* Right: inspector */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
              <h3 className="font-display font-semibold text-white text-sm border-b border-white/10 pb-3">
                Posicion 0{selectedSlot}
              </h3>

              {selectedDet && (
                <div className="space-y-4">
                  {/* Crop — tight boundary extract, not full slot */}
                  <div className="w-full aspect-[4/3] bg-[#FAF7EE] rounded-lg border border-black/10 flex items-center justify-center overflow-hidden">
                    {selectedDet.cropDataUrl ? (
                      <img
                        src={selectedDet.cropDataUrl}
                        alt={`Sello posicion ${selectedSlot}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-muted-fg">
                        <Stamp className="h-8 w-8 opacity-30 mb-1" />
                        <span className="text-xs font-mono">Sin recorte</span>
                      </div>
                    )}
                  </div>

                  {/* Three separate metrics */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-fg">Estado:</span>
                      <span className={cn(
                        "font-mono font-bold px-2 py-0.5 rounded",
                        selectedDet.state === "DETECTED" ? "bg-emerald-500/20 text-emerald-400" :
                        selectedDet.state === "UNCERTAIN" ? "bg-amber-500/20 text-amber-400" :
                        "bg-gray-500/20 text-gray-400"
                      )}>
                        {selectedDet.state}
                        {(selectedDet as unknown as { _isManualOverride?: boolean })._isManualOverride && " ●"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-fg">Confianza de contorno:</span>
                      <span className="font-mono text-white">{(selectedDet.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-fg">Cobertura de tinta:</span>
                      <span className="font-mono text-white">{(((selectedDet as SlotDetection & { inkCoverage?: number }).inkCoverage ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                    {selectedDet.boundingBox && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-fg">Contorno detectado:</span>
                        <span className="font-mono text-emerald-400 text-[10px]">
                          {selectedDet.boundingBox.width}×{selectedDet.boundingBox.height}px
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Manual overrides — three states */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <Button
                      variant={selectedDet.state === "EMPTY" ? "default" : "outline"}
                      className={cn("h-8 text-[10px]", selectedDet.state === "EMPTY" ? "bg-gray-600 hover:bg-gray-500" : "border-white/10")}
                      onClick={() => overrideState(selectedSlot!, "EMPTY")}
                    >
                      Vacio
                    </Button>
                    <Button
                      variant={selectedDet.state === "UNCERTAIN" ? "default" : "outline"}
                      className={cn("h-8 text-[10px]", selectedDet.state === "UNCERTAIN" ? "bg-amber-600 hover:bg-amber-500" : "border-white/10")}
                      onClick={() => overrideState(selectedSlot!, "UNCERTAIN")}
                    >
                      Incierto
                    </Button>
                    <Button
                      variant={selectedDet.state === "DETECTED" ? "default" : "outline"}
                      className={cn("h-8 text-[10px]", selectedDet.state === "DETECTED" ? "bg-emerald-600 hover:bg-emerald-500" : "border-white/10")}
                      onClick={() => overrideState(selectedSlot!, "DETECTED")}
                    >
                      Detectado
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm page */}
            <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5">
              <p className="text-xs text-emerald-400/80 mb-4 leading-relaxed">
                Revisa que los 6 espacios esten correctos. Al confirmar, se
                sube la pagina y se pasa a identificar los sellos detectados.
              </p>
              {saveError && (
                <p className="text-red-400 text-xs mb-3 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> {saveError}
                </p>
              )}
              <Button
                onClick={handleConfirmPage}
                disabled={isConfirmingPage || isIdentifying}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isConfirmingPage || isIdentifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isIdentifying ? "Identificando sellos…" : "Subiendo pagina…"}
                  </>
                ) : (
                  <>
                    Confirmar Pagina
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: IDENTIFY ────────────────────────────────────────────────── */}
      {step === "identify" && current && (
        <div className="space-y-6">
          {/* Top Stamp Queue Carousel & Quick Actions */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-muted-fg">
                  Cola de Identificación &bull; {confirmedCount} de {totalCount} confirmados
                </span>
                <h3 className="text-base font-bold text-white">
                  Revisando Sello 0{current.slot.slot_position} ({identifyIndex + 1} de {identifyQueue.length})
                </h3>
              </div>

              {/* Batch action */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIdentifyQueue((prev) =>
                      prev.map((item) => ({
                        ...item,
                        confirmed: true,
                      }))
                    );
                  }}
                  className="text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirmar todos ({identifyQueue.length})
                </Button>
              </div>
            </div>

            {/* Thumbnail cards strip */}
            <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {identifyQueue.map((item, i) => {
                const isActive = i === identifyIndex;
                const hasMatch = Boolean(item.recognition.matchedCity || item.recognition.existingDesign);
                return (
                  <div
                    key={item.slot.slot_position}
                    onClick={() => setIdentifyIndex(i)}
                    className={cn(
                      "flex-shrink-0 w-32 p-2 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col items-center text-center relative",
                      isActive
                        ? "border-amber-400/60 bg-amber-400/10 shadow-lg shadow-amber-400/5 ring-1 ring-amber-400/40"
                        : item.confirmed
                        ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    )}
                  >
                    {/* Status badge */}
                    <div className="absolute top-1.5 right-1.5">
                      {item.confirmed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-amber-400/60 block" />
                      )}
                    </div>

                    <div className="h-14 w-14 rounded-lg bg-[#FAF7EE] border border-black/10 flex items-center justify-center p-1 overflow-hidden my-1">
                      {item.slot.cropDataUrl ? (
                        <img
                          src={item.slot.cropDataUrl}
                          alt={`Slot ${item.slot.slot_position}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <Stamp className="h-6 w-6 text-[#A8A08C]" />
                      )}
                    </div>

                    <span className="text-[10px] font-mono font-bold text-white">
                      Posición 0{item.slot.slot_position}
                    </span>
                    <span className="text-[9px] text-muted-fg truncate max-w-full font-medium">
                      {item.editName || item.recognition.suggestedName || "Sin identificar"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main 2-Column Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Visual Crop, Rotation Controls & OCR */}
            <div className="lg:col-span-5 space-y-4">
              {/* Main Stamp Crop with Paper Texture */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col items-center">
                <div className="flex w-full items-center justify-between text-xs font-mono text-muted-fg mb-3">
                  <span>Recorte &bull; Posición 0{current.slot.slot_position}</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold border",
                      CONFIDENCE_STYLE[current.recognition.confidence]
                    )}
                  >
                    Confianza {CONFIDENCE_LABEL[current.recognition.confidence]}
                  </span>
                </div>

                <div
                  className="w-full aspect-square max-w-[260px] rounded-2xl p-4 flex items-center justify-center relative overflow-hidden shadow-xl"
                  style={{
                    backgroundColor: "#FAF7EE",
                    backgroundImage: "radial-gradient(#D6CEB8 0.75px, transparent 0.75px)",
                    backgroundSize: "12px 12px",
                    boxShadow: "inset 0 0 20px rgba(180,165,130,0.3), 0 10px 30px rgba(0,0,0,0.5)",
                  }}
                >
                  {current.slot.cropDataUrl ? (
                    <img
                      src={current.slot.cropDataUrl}
                      alt={`Sello 0${current.slot.slot_position}`}
                      className="max-w-full max-h-full object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
                    />
                  ) : (
                    <Stamp className="h-12 w-12 text-[#A8A08C]" />
                  )}
                </div>

                {/* Live Rotation & Zoom Controls */}
                <div className="w-full mt-4 pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-fg">Rotación:</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-white/10 text-white/80 hover:text-white px-2"
                        onClick={async () => {
                          if (!current.slot.cropDataUrl) return;
                          const rotated = await rotateImage(current.slot.cropDataUrl, -90);
                          updateCurrent({ slot: { ...current.slot, cropDataUrl: rotated } });
                        }}
                      >
                        -90°
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-white/10 text-white/80 hover:text-white px-2"
                        onClick={async () => {
                          if (!current.slot.cropDataUrl) return;
                          const rotated = await rotateImage(current.slot.cropDataUrl, -5);
                          updateCurrent({ slot: { ...current.slot, cropDataUrl: rotated } });
                        }}
                      >
                        ↺ -5°
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-white/10 text-white/80 hover:text-white px-2"
                        onClick={async () => {
                          if (!current.slot.cropDataUrl) return;
                          const rotated = await rotateImage(current.slot.cropDataUrl, 5);
                          updateCurrent({ slot: { ...current.slot, cropDataUrl: rotated } });
                        }}
                      >
                        ↻ +5°
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-white/10 text-white/80 hover:text-white px-2"
                        onClick={async () => {
                          if (!current.slot.cropDataUrl) return;
                          const rotated = await rotateImage(current.slot.cropDataUrl, 90);
                          updateCurrent({ slot: { ...current.slot, cropDataUrl: rotated } });
                        }}
                      >
                        +90°
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-mono text-muted-fg">Zoom & Recorte:</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-white/10 text-white/80 hover:text-white px-2"
                        onClick={async () => {
                          if (!current.slot.cropDataUrl) return;
                          const transformed = await transformCrop(current.slot.cropDataUrl, { rotation: 0, zoom: 0.9, panX: 0, panY: 0 });
                          updateCurrent({ slot: { ...current.slot, cropDataUrl: transformed } });
                        }}
                      >
                        Zoom -
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] border-white/10 text-white/80 hover:text-white px-2"
                        onClick={async () => {
                          if (!current.slot.cropDataUrl) return;
                          const transformed = await transformCrop(current.slot.cropDataUrl, { rotation: 0, zoom: 1.1, panX: 0, panY: 0 });
                          updateCurrent({ slot: { ...current.slot, cropDataUrl: transformed } });
                        }}
                      >
                        Zoom +
                      </Button>
                      {current.rawCropDataUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10 px-2"
                          onClick={() => {
                            updateCurrent({ slot: { ...current.slot, cropDataUrl: current.rawCropDataUrl } });
                          }}
                        >
                          Restablecer
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Clickable OCR Chips */}
              {current.recognition.ocrTokens.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                  <p className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">
                    Texto Detectado por OCR (Clic para autocompletar)
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {current.recognition.ocrTokens.map((tok, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          const formatted = tok.charAt(0).toUpperCase() + tok.slice(1);
                          updateCurrent({ editName: formatted });
                        }}
                        className="bg-white/5 hover:bg-amber-400/20 border border-white/10 hover:border-amber-400/40 text-white/80 hover:text-amber-300 text-xs font-mono px-2.5 py-1 rounded-lg transition-colors"
                        title="Usar este texto como nombre"
                      >
                        + {tok}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Clean Unified Form & Geo Tracking */}
            <div className="lg:col-span-7 space-y-5">
              {/* Form card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                <p className="text-xs font-mono text-muted-fg uppercase tracking-wider">
                  Detalles del Sello
                </p>

                <div className="space-y-4">
                  {/* Stamp Design Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-muted-fg font-medium">
                        Nombre del Sello / Ciudad
                      </label>
                      {current.recognition.matchedCity && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          Auto-detectado: {current.recognition.matchedCity.name}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={current.editName}
                      onChange={(e) => updateCurrent({ editName: e.target.value })}
                      placeholder="Ej: Copenhagen, 2026, Billund, Everyone is Awesome…"
                      className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                    />
                  </div>

                  {/* Category & City Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Category */}
                    <div>
                      <label className="text-xs text-muted-fg block mb-1.5 font-medium">Categoría</label>
                      <select
                        value={current.editCategory}
                        onChange={(e) => updateCurrent({ editCategory: e.target.value })}
                        className="w-full bg-[#18181b] text-white border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/25"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c} className="bg-[#18181b] text-white py-1.5">
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Represented city */}
                    <div>
                      <label className="text-xs text-muted-fg block mb-1.5 font-medium">
                        Ciudad Representada
                      </label>
                      <select
                        value={current.editCityId}
                        onChange={(e) => updateCurrent({ editCityId: e.target.value })}
                        className="w-full bg-[#18181b] text-white border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/25"
                      >
                        <option value="" className="bg-[#18181b] text-white py-1.5">— Sin ciudad específica —</option>
                        {existingCities.map((c) => (
                          <option key={c.id} value={c.id} className="bg-[#18181b] text-white py-1.5">
                            {c.name}, {c.country}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Auto-resolved Geo Tracker Card */}
                  {(() => {
                    const candidateCity = current.editName || current.recognition.matchedCity?.name || "";
                    const geo = resolveGeoForCity(candidateCity);
                    return (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                            <Globe2 className="h-3.5 w-3.5" /> Ubicación Geográfica Detectada
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] text-emerald-300 hover:bg-emerald-500/20 px-2"
                            onClick={async () => {
                              if (candidateCity) {
                                const created = await findOrCreateCityFromGeo(candidateCity);
                                if (created) {
                                  setExistingCities((prev) => {
                                    if (prev.some((c) => c.id === created.id)) return prev;
                                    return [...prev, created];
                                  });
                                  updateCurrent({ editCityId: created.id });
                                }
                              }
                            }}
                          >
                            Vincular País y Región
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-black/30 rounded-lg p-2">
                            <span className="text-[10px] text-muted-fg block">País</span>
                            <span className="font-semibold text-white truncate block">{geo.country}</span>
                          </div>
                          <div className="bg-black/30 rounded-lg p-2">
                            <span className="text-[10px] text-muted-fg block">Región</span>
                            <span className="font-semibold text-white truncate block">{geo.region}</span>
                          </div>
                          <div className="bg-black/30 rounded-lg p-2">
                            <span className="text-[10px] text-muted-fg block">Continente</span>
                            <span className="font-semibold text-white truncate block">{geo.continent}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Physical stamp details */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                <p className="text-xs font-mono text-muted-fg uppercase tracking-wider">
                  Datos del Estampado Físico
                </p>

                {/* Location Name */}
                <div>
                  <label className="text-xs text-muted-fg block mb-1.5 font-medium">
                    Nombre de la Tienda LEGO / Ubicación <span className="text-muted-fg/50">(manual)</span>
                  </label>
                  <input
                    type="text"
                    value={current.editLocationName}
                    onChange={(e) => updateCurrent({ editLocationName: e.target.value })}
                    placeholder="Ej: LEGO Store Copenhagen, Strøget…"
                    className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Trip Link */}
                  <div>
                    <label className="text-xs text-muted-fg block mb-1.5 font-medium">
                      Vincular con viaje <span className="text-muted-fg/50">(opcional)</span>
                    </label>
                    <select
                      value={current.editTripId}
                      onChange={(e) => updateCurrent({ editTripId: e.target.value })}
                      className="w-full bg-[#18181b] text-white border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/25"
                    >
                      <option value="" className="bg-[#18181b] text-white py-1.5">— Sin viaje asociado —</option>
                      {existingTrips.map((t) => (
                        <option key={t.id} value={t.id} className="bg-[#18181b] text-white py-1.5">
                          {t.name} ({t.description})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* stamped_at */}
                  <div>
                    <label className="text-xs text-muted-fg block mb-1.5 font-medium">
                      Fecha de estampado <span className="text-muted-fg/50">(opcional)</span>
                    </label>
                    <input
                      type="date"
                      value={current.editStampedAt}
                      onChange={(e) => updateCurrent({ editStampedAt: e.target.value })}
                      className="w-full bg-[#18181b] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/25"
                    />
                  </div>
                </div>
              </div>

              {/* Navigation & Confirmation Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/10 text-muted-fg hover:text-white text-xs h-11 rounded-xl"
                  onClick={() => {
                    updateCurrent({ confirmed: false });
                    if (identifyIndex < identifyQueue.length - 1) {
                      setIdentifyIndex((i) => i + 1);
                    }
                  }}
                >
                  Saltar / Sin Confirmar
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-2 h-11 rounded-xl font-semibold shadow-lg shadow-emerald-900/20"
                  onClick={() => {
                    updateCurrent({ confirmed: true });
                    if (identifyIndex < identifyQueue.length - 1) {
                      setIdentifyIndex((i) => i + 1);
                    }
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar y Siguiente
                </Button>
              </div>

              {/* Save All Bottom Banner */}
              {confirmedCount > 0 && (
                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-medium">
                      ✓ {confirmedCount} de {totalCount} sellos confirmados
                    </span>
                    <span className="text-muted-fg font-mono">
                      Página {identifyIndex + 1} de {identifyQueue.length}
                    </span>
                  </div>
                  {saveError && (
                    <p className="text-red-400 text-xs flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" /> {saveError}
                    </p>
                  )}
                  <Button
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-11 rounded-xl font-bold shadow-xl shadow-emerald-900/30"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando en Pasaporte…
                      </>
                    ) : (
                      `Guardar ${confirmedCount} ${confirmedCount === 1 ? "sello" : "sellos"} en el Pasaporte`
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
