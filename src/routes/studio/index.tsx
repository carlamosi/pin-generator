import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, Wand2, CheckCircle2, Loader2, Image as ImageIcon,
  RotateCcw, Save, Link2, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTrips, type Trip } from "@/lib/trips/trips-repo";
import {
  processPinImage, loadOpenCV, loadImage, fileToImageDataUrl,
  type PinRow,
} from "@/lib/pin-processing";
import {
  rowToDb, upsertPin, uploadCutout,
} from "@/lib/pins-repo";
import { customAlphabet } from "nanoid";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/studio/")({
  component: StudioPage,
});

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

type StepState = "idle" | "processing" | "done" | "error";

function StepIndicator({ step, state, label }: { step: number; state: StepState; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-300",
        state === "idle" && "bg-slate-100 text-slate-400",
        state === "processing" && "bg-primary/20 text-primary ring-2 ring-primary/30",
        state === "done" && "bg-emerald-500 text-white",
        state === "error" && "bg-red-500 text-white",
      )}>
        {state === "done" ? <CheckCircle2 className="h-4 w-4" /> :
          state === "processing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
          step}
      </div>
      <span className={cn("text-sm", state === "done" && "text-emerald-700 font-medium", state === "idle" && "text-muted-foreground")}>{label}</span>
    </div>
  );
}

function StudioPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cutout, setCutout] = useState<string | null>(null);
  const [pinRow, setPinRow] = useState<PinRow | null>(null);
  const [stepBg, setStepBg] = useState<StepState>("idle");
  const [stepMeasure, setStepMeasure] = useState<StepState>("idle");
  const [stepSave, setStepSave] = useState<StepState>("idle");
  const [saving, setSaving] = useState(false);
  const [overrideName, setOverrideName] = useState("");
  const [cvReady, setCvReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOpenCV().then(() => setCvReady(true)).catch(() => {});
    listTrips().then(setTrips).catch(() => {});
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    handleFile(f);
  }, []);

  const handleFile = async (f: File) => {
    setFile(f);
    setPreview(null);
    setCutout(null);
    setPinRow(null);
    setStepBg("idle");
    setStepMeasure("idle");
    setStepSave("idle");
    const dataUrl = await fileToImageDataUrl(f);
    setPreview(dataUrl);
  };

  const handleProcess = async () => {
    if (!file || !preview || !cvReady) return;
    setStepBg("processing");
    setStepMeasure("idle");
    try {
      const img = await loadImage(preview);
      const pinId = nanoid();
      const row = await processPinImage(img, file.name, pinId);
      setStepBg("done");
      setStepMeasure("processing");
      await new Promise((r) => setTimeout(r, 300));
      setStepMeasure("done");
      setCutout(row.thumbnailDataUrl ?? row.cutoutImageUrl ?? preview);
      setPinRow(row);
    } catch (e) {
      setStepBg("error");
      toast.error("Error al procesar la imagen");
    }
  };

  const handleSave = async () => {
    if (!pinRow || !selectedTripId) {
      toast.error("Selecciona un viaje antes de guardar");
      return;
    }
    setSaving(true);
    setStepSave("processing");
    try {
      const pinId = pinRow.pinId ?? nanoid();
      let cutoutUrl: string | null = null;
      if (pinRow.thumbnailDataUrl) {
        cutoutUrl = await uploadCutout(pinId, pinRow.thumbnailDataUrl);
      }

      // Also upsert into our new "pins" relational table (trip-linked)
      await supabase.from("pins").upsert({
        id: pinId,
        trip_id: selectedTripId,
        city: pinRow.city,
        acquisition_date: new Date().toISOString().split("T")[0],
        dimensions: { width_mm: pinRow.widthMm, height_mm: pinRow.heightMm },
        original_image_url: null,
        transparent_image_url: cutoutUrl,
      }, { onConflict: "id" });

      // Also persist into legacy pins table for BentoView compatibility
      const dbRow = rowToDb(pinRow, 0, cutoutUrl);
      await upsertPin({ ...dbRow, pin_id: pinId });

      setStepSave("done");
      toast.success(`Pin guardado y vinculado al viaje ✓`);
    } catch (e) {
      setStepSave("error");
      toast.error("Error al guardar el pin");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCutout(null);
    setPinRow(null);
    setStepBg("idle");
    setStepMeasure("idle");
    setStepSave("idle");
    setOverrideName("");
  };

  return (
    <div className="p-6 space-y-6 animate-float-in">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">El Estudio</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Sube tu pin, extrae el recorte limpio y vincúlalo a un viaje en un solo flujo.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left: Upload + Steps */}
        <div className="col-span-3 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-300 min-h-72 overflow-hidden",
              !preview && "border-border/60 hover:border-primary/40 hover:bg-primary/5 bg-slate-50",
              preview && "border-transparent bg-white shadow-sm"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {!preview ? (
              <div className="text-center space-y-3 p-8">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Arrastra tu foto aquí</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, HEIC — fondo verde o blanco recomendado</p>
                </div>
                <Button size="sm" variant="outline" className="pointer-events-none">
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Elegir archivo
                </Button>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center p-4 min-h-72 checker-bg rounded-3xl">
                <img
                  src={cutout ?? preview}
                  className="max-h-64 max-w-full object-contain rounded-xl drop-shadow-xl transition-all duration-500"
                  alt="Pin preview"
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {preview && (
            <div className="flex gap-3">
              <Button
                onClick={handleProcess}
                disabled={!cvReady || stepBg === "processing" || stepBg === "done"}
                className="flex-1 gap-2 shadow-md"
              >
                {stepBg === "processing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {stepBg === "done" ? "Procesado ✓" : "Procesar pin"}
              </Button>
              <Button onClick={reset} size="icon" variant="outline">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: Panel */}
        <div className="col-span-2 space-y-4">
          {/* Progress steps */}
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Progreso</p>
            <div className="space-y-3">
              <StepIndicator step={1} state={preview ? "done" : "idle"} label="Imagen cargada" />
              <StepIndicator step={2} state={stepBg} label="Fondo eliminado" />
              <StepIndicator step={3} state={stepMeasure} label="Medidas extraídas" />
              <StepIndicator step={4} state={stepSave} label="Guardado en Supabase" />
            </div>
          </div>

          {/* Pin metadata */}
          {pinRow && (
            <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 space-y-3 animate-float-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Metadatos detectados</p>
              <div className="space-y-2 text-sm">
                {[
                  ["Ciudad", pinRow.city ?? "—"],
                  ["País", pinRow.country ?? "—"],
                  ["Ancho", pinRow.widthMm ? `${pinRow.widthMm} mm` : "—"],
                  ["Alto", pinRow.heightMm ? `${pinRow.heightMm} mm` : "—"],
                  ["Forma", pinRow.shape ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <Badge variant="secondary" className="font-normal text-xs">{v}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trip Linker */}
          {pinRow && (
            <div className="bg-white rounded-2xl border-2 border-primary/20 shadow-sm p-5 space-y-3 animate-float-in">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Vincular a viaje</p>
              </div>
              <Select value={selectedTripId} onValueChange={setSelectedTripId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un viaje..." />
                </SelectTrigger>
                <SelectContent>
                  {trips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-medium">{t.name}</span>
                      {t.start_date && (
                        <span className="ml-2 text-muted-foreground text-xs">
                          ({new Date(t.start_date).getFullYear()})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleSave}
                disabled={saving || !selectedTripId || stepSave === "done"}
                className="w-full gap-2"
                variant={stepSave === "done" ? "outline" : "default"}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {stepSave === "done" ? "Pin guardado ✓" : "Guardar pin"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
