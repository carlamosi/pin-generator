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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  normalizePassportPage,
  detectStamps,
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
  listCities,
  type StampDesign,
  type StampingLocation,
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

  // Editable fields (user overrides recognition)
  editName: string;
  editCategory: string;
  editCityId: string;
  editLocationId: string;
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

  // Reference data loaded once
  const [existingDesigns, setExistingDesigns] = useState<StampDesign[]>([]);
  const [existingLocations, setExistingLocations] = useState<StampingLocation[]>([]);
  const [existingCities, setExistingCities] = useState<City[]>([]);

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
      const [designs, locations, cities] = await Promise.all([
        listStampDesigns(),
        listStampingLocations(),
        listCities(),
      ]);
      setExistingDesigns(designs);
      setExistingLocations(locations);
      setExistingCities(cities);

      // Build identify queue from DETECTED slots
      const detectedSlots = detections.filter((d) => d.state === "DETECTED");
      if (detectedSlots.length === 0) {
        // Nothing to identify – go straight to passport
        navigate({ to: "/passport" });
        return;
      }

      // Run recognition for each slot
      setIsIdentifying(true);
      const queue: IdentifyState[] = [];
      for (const slot of detectedSlots) {
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
          editName: rec.suggestedName,
          editCategory: rec.suggestedCategory,
          editCityId: rec.matchedCity?.id ?? "",
          editLocationId: "",
          editStampedAt: "",        // ALWAYS left empty by default
          editCode: "",
          designMode: useExisting ? "existing" : "new",
          selectedDesignId: rec.existingDesign?.id ?? null,
          confirmed: rec.confidence === "HIGH",  // HIGH is preselected but user must still confirm
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
      for (const item of identifyQueue) {
        // Upload crop
        let cropUrl: string | null = null;
        if (item.slot.cropDataUrl) {
          const ts = Date.now();
          cropUrl = await uploadPassportImage(
            item.slot.cropDataUrl,
            `crops/crop_p${savedPageId}_s${item.slot.slot_position}_${ts}.png`
          );
        }

        let designId: string;

        if (item.designMode === "existing" && item.selectedDesignId) {
          designId = item.selectedDesignId;
        } else {
          // Create new stamp_design
          const code =
            item.editCode.trim() ||
            `${item.editCategory.toLowerCase()}-${item.editName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}-${Date.now()}`;

          const newDesign = await insertStampDesign({
            code,
            name: item.editName.trim() || "Sello sin identificar",
            category: item.editCategory,
            description: null,
            preview_image_url: cropUrl,
            represented_city_id: item.editCityId || null,
            visual_hash: item.recognition.visualHash || null,
          });
          designId = newDesign.id;
        }

        // Create physical_stamp record
        await upsertPhysicalStamp({
          stamp_design_id: designId,
          passport_page_id: savedPageId,
          slot_position: item.slot.slot_position,
          stamped_at: item.editStampedAt || new Date().toISOString().slice(0, 10),
          stamping_location_id: item.editLocationId || null,
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

            {/* Passport page with slot overlays */}
            <div className="relative w-full max-w-[400px] aspect-[8/12] rounded-lg overflow-hidden shadow-2xl">
              <img
                src={normalizedImage}
                alt="Passport Page"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 p-[10%] gap-[2%] pointer-events-none">
                {detections.map((det) => {
                  const isSelected = selectedSlot === det.slot_position;
                  const borderCol =
                    det.state === "DETECTED"
                      ? "border-emerald-500"
                      : det.state === "UNCERTAIN"
                      ? "border-amber-500"
                      : "border-gray-400/50";
                  return (
                    <div
                      key={det.slot_position}
                      onClick={() => setSelectedSlot(det.slot_position)}
                      className={cn(
                        "relative border-2 border-dashed rounded-md cursor-pointer pointer-events-auto transition-all duration-150",
                        borderCol,
                        isSelected ? "border-solid scale-[1.03] shadow-lg" : "hover:border-white/40",
                        det.state === "DETECTED" && "bg-emerald-500/10",
                        det.state === "UNCERTAIN" && "bg-amber-500/20"
                      )}
                    >
                      <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-mono px-1 rounded-sm">
                        0{det.slot_position}
                      </div>
                      <div className="absolute bottom-1 right-1">
                        {det.state === "DETECTED" && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 drop-shadow" />
                        )}
                        {det.state === "UNCERTAIN" && (
                          <HelpCircle className="h-4 w-4 text-amber-500 drop-shadow" />
                        )}
                        {det.state === "EMPTY" && (
                          <XCircle className="h-4 w-4 text-gray-400 drop-shadow" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: inspector */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
              <h3 className="font-display font-semibold text-white text-sm border-b border-white/10 pb-3">
                Posicion 0{selectedSlot}
              </h3>

              {selectedDet && (
                <div className="space-y-5">
                  {/* Crop */}
                  <div className="w-full aspect-[4/3] bg-white/5 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">
                    {selectedDet.cropDataUrl ? (
                      <img
                        src={selectedDet.cropDataUrl}
                        alt={`Slot ${selectedSlot}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-muted-fg">
                        <Stamp className="h-8 w-8 opacity-30 mb-1" />
                        <span className="text-xs font-mono">Vacio</span>
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-fg">Estado:</span>
                    <span
                      className={cn(
                        "font-mono font-bold px-2 py-0.5 rounded text-xs",
                        selectedDet.state === "DETECTED"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : selectedDet.state === "UNCERTAIN"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-gray-500/20 text-gray-400"
                      )}
                    >
                      {selectedDet.state}
                      {(selectedDet as unknown as { _isManualOverride?: boolean })
                        ._isManualOverride && " (Manual)"}
                    </span>
                  </div>

                  {/* Override */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Button
                      variant={selectedDet.state === "EMPTY" ? "default" : "outline"}
                      className={cn(
                        "h-9 text-xs",
                        selectedDet.state === "EMPTY"
                          ? "bg-gray-600 hover:bg-gray-500"
                          : "border-white/10"
                      )}
                      onClick={() => overrideState(selectedSlot!, "EMPTY")}
                    >
                      Marcar Vacio
                    </Button>
                    <Button
                      variant={selectedDet.state === "DETECTED" ? "default" : "outline"}
                      className={cn(
                        "h-9 text-xs",
                        selectedDet.state === "DETECTED"
                          ? "bg-emerald-600 hover:bg-emerald-500"
                          : "border-white/10"
                      )}
                      onClick={() => overrideState(selectedSlot!, "DETECTED")}
                    >
                      Marcar Detectado
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Crop + queue indicator */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {/* Crop preview */}
            <div className="w-full aspect-[4/3] bg-white/5 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden">
              {current.slot.cropDataUrl ? (
                <img
                  src={current.slot.cropDataUrl}
                  alt={`Slot ${current.slot.slot_position}`}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <Stamp className="h-12 w-12 text-muted-fg opacity-30" />
              )}
            </div>

            {/* Queue pills */}
            <div className="flex gap-2 flex-wrap">
              {identifyQueue.map((item, i) => (
                <button
                  key={item.slot.slot_position}
                  onClick={() => setIdentifyIndex(i)}
                  className={cn(
                    "h-8 px-3 rounded-lg text-xs font-mono border transition-all",
                    i === identifyIndex
                      ? "border-white/30 bg-white/10 text-white"
                      : item.confirmed
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/10 bg-white/[0.02] text-muted-fg"
                  )}
                >
                  0{item.slot.slot_position}
                  {item.confirmed && <Check className="inline h-3 w-3 ml-1" />}
                </button>
              ))}
            </div>

            {/* Confidence */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-fg text-xs">Confianza de reconocimiento:</span>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded text-xs font-mono font-bold border",
                  CONFIDENCE_STYLE[current.recognition.confidence]
                )}
              >
                {CONFIDENCE_LABEL[current.recognition.confidence]}
              </span>
            </div>

            {/* Raw OCR tokens */}
            {current.recognition.ocrTokens.length > 0 && (
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-1.5">
                <p className="text-[10px] font-mono text-muted-fg uppercase tracking-wider mb-2">
                  Texto OCR extraido
                </p>
                {current.recognition.ocrTokens.map((tok, i) => (
                  <span
                    key={i}
                    className="inline-block bg-white/5 border border-white/10 text-white/70 text-xs font-mono px-2 py-0.5 rounded mr-1 mb-1"
                  >
                    {tok}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: Identification form */}
          <div className="lg:col-span-7 space-y-5">
            {/* Duplicate warning */}
            {current.recognition.isDuplicate && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-300 flex gap-3 items-start">
                <HelpCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Esta imagen es visualmente muy similar a{" "}
                  <strong>{current.recognition.existingDesign?.name}</strong>. Revisa si
                  es un sello ya en tu coleccion.
                </span>
              </div>
            )}

            {/* Design mode selector */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <p className="text-xs font-mono text-muted-fg uppercase tracking-wider">
                Diseno de Sello
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => updateCurrent({ designMode: "existing" })}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs border transition-all",
                    current.designMode === "existing"
                      ? "bg-white/10 border-white/20 text-white"
                      : "bg-transparent border-white/5 text-muted-fg hover:border-white/10"
                  )}
                >
                  Reutilizar Diseno Existente
                </button>
                <button
                  onClick={() => updateCurrent({ designMode: "new" })}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs border transition-all",
                    current.designMode === "new"
                      ? "bg-white/10 border-white/20 text-white"
                      : "bg-transparent border-white/5 text-muted-fg hover:border-white/10"
                  )}
                >
                  Nuevo Diseno
                </button>
              </div>

              {current.designMode === "existing" ? (
                <div className="space-y-2">
                  <label className="text-xs text-muted-fg">Seleccionar diseno existente</label>
                  <select
                    value={current.selectedDesignId ?? ""}
                    onChange={(e) =>
                      updateCurrent({ selectedDesignId: e.target.value || null })
                    }
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                  >
                    <option value="">— Seleccionar —</option>
                    {existingDesigns.map((d) => (
                      <option key={d.id} value={d.id}>
                        [{d.category}] {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Name */}
                  <div>
                    <label className="text-xs text-muted-fg block mb-1">
                      Nombre del diseno
                    </label>
                    <input
                      type="text"
                      value={current.editName}
                      onChange={(e) => updateCurrent({ editName: e.target.value })}
                      placeholder="Ej: Copenhagen, 2026, Everyone is Awesome…"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                    />
                  </div>
                  {/* Category */}
                  <div>
                    <label className="text-xs text-muted-fg block mb-1">Categoria</label>
                    <select
                      value={current.editCategory}
                      onChange={(e) => updateCurrent({ editCategory: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* Represented city */}
                  <div>
                    <label className="text-xs text-muted-fg block mb-1">
                      Ciudad representada{" "}
                      <span className="text-muted-fg/50">(opcional)</span>
                    </label>
                    <select
                      value={current.editCityId}
                      onChange={(e) => updateCurrent({ editCityId: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                    >
                      <option value="">— Sin ciudad especifica —</option>
                      {existingCities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}, {c.country}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Physical stamp details */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <p className="text-xs font-mono text-muted-fg uppercase tracking-wider">
                Sello Fisico
              </p>
              {/* Location */}
              <div>
                <label className="text-xs text-muted-fg block mb-1">
                  Lugar de estampado{" "}
                  <span className="text-muted-fg/50">(opcional)</span>
                </label>
                <select
                  value={current.editLocationId}
                  onChange={(e) => updateCurrent({ editLocationId: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                >
                  <option value="">— Sin ubicacion registrada —</option>
                  {existingLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.city_name ? `, ${l.city_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {/* stamped_at */}
              <div>
                <label className="text-xs text-muted-fg block mb-1">
                  Fecha de estampado (stamped_at){" "}
                  <span className="text-muted-fg/50">YYYY-MM-DD — dejar vacio si desconocida</span>
                </label>
                <input
                  type="date"
                  value={current.editStampedAt}
                  onChange={(e) => updateCurrent({ editStampedAt: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            {/* Confirm this stamp */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-white/10 text-muted-fg hover:text-white text-xs"
                onClick={() =>
                  updateCurrent({ confirmed: false })
                }
              >
                Dejar sin confirmar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-2"
                onClick={() => {
                  updateCurrent({ confirmed: true });
                  if (identifyIndex < identifyQueue.length - 1) {
                    setIdentifyIndex((i) => i + 1);
                  }
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmar Sello
              </Button>
            </div>

            {/* Save all */}
            {confirmedCount > 0 && (
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-2xl p-5">
                <p className="text-xs text-emerald-400/80 mb-3 leading-relaxed">
                  {confirmedCount} de {totalCount} sellos confirmados. Puedes
                  guardar cuando hayas revisado todos los que desees.
                </p>
                {saveError && (
                  <p className="text-red-400 text-xs mb-3 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> {saveError}
                  </p>
                )}
                <Button
                  onClick={handleSaveAll}
                  disabled={isSaving}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando…
                    </>
                  ) : (
                    `Guardar ${confirmedCount} ${confirmedCount === 1 ? "sello" : "sellos"} en la coleccion`
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
