import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Satellite, Upload, Play, Download, Sliders, FileArchive,
  Loader2, CheckCircle2, Info, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generator/")({
  component: GeneratorPage,
});

interface SatelliteParams {
  zoom: number;
  offsetX: number;
  offsetY: number;
  labelText: string;
  fontScale: number;
}

const DEFAULT_PARAMS: SatelliteParams = {
  zoom: 15,
  offsetX: 0,
  offsetY: 0,
  labelText: "{city}, {country}",
  fontScale: 1.0,
};

const GENERATOR_BUCKET = "generator-zip";

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Badge variant="secondary" className="font-mono text-xs">
          {value}{unit}
        </Badge>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

function GeneratorPage() {
  const [params, setParams] = useState<SatelliteParams>(DEFAULT_PARAMS);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipUploading, setZipUploading] = useState(false);
  const [zipUploaded, setZipUploaded] = useState(false);
  const [pendingPins, setPendingPins] = useState<number>(0);
  const [loadingPins, setLoadingPins] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof SatelliteParams>(k: K, v: SatelliteParams[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const load = async () => {
      setLoadingPins(true);
      const { count } = await supabase
        .from("pins")
        .select("id", { count: "exact", head: true })
        .is("satellite_image_url", null);
      setPendingPins(count ?? 0);
      setLoadingPins(false);
    };
    load();
  }, []);

  const handleZipUpload = async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Solo se aceptan archivos .zip");
      return;
    }
    setZipFile(file);
    setZipUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "application/zip" });
      const { error } = await supabase.storage
        .from(GENERATOR_BUCKET)
        .upload("travel_pin_archive_generator.zip", blob, {
          upsert: true,
          contentType: "application/zip",
        });
      if (error) throw error;
      setZipUploaded(true);
      toast.success("ZIP del generador actualizado ✓");
    } catch (e) {
      toast.error("Error al subir el ZIP");
    } finally {
      setZipUploading(false);
    }
  };

  const handleSaveParams = async () => {
    // Save params as JSON to Supabase Storage for Python to read
    const blob = new Blob([JSON.stringify(params, null, 2)], { type: "application/json" });
    const { error } = await supabase.storage
      .from(GENERATOR_BUCKET)
      .upload("generator_params.json", blob, { upsert: true, contentType: "application/json" });
    if (error) {
      toast.error("Error al guardar parámetros");
    } else {
      toast.success("Parámetros guardados ✓ El generador los usará la próxima vez.");
    }
  };

  const resetParams = () => {
    setParams(DEFAULT_PARAMS);
    toast.info("Parámetros restablecidos");
  };

  return (
    <div className="p-6 space-y-6 animate-float-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Centro Satelital</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Configura y lanza el generador de imágenes satelitales. Sin tocar una sola línea de código.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loadingPins ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Badge variant={pendingPins > 0 ? "destructive" : "secondary"} className="gap-1.5">
              <Satellite className="h-3 w-3" />
              {pendingPins} pines pendientes
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left: Parameters */}
        <div className="col-span-3 space-y-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Parámetros de Generación</h3>
              </div>
              <Button size="sm" variant="ghost" onClick={resetParams} className="gap-1.5 text-xs text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                Restablecer
              </Button>
            </div>

            <Separator />

            <ParamSlider
              label="Nivel de Zoom"
              value={params.zoom}
              min={8}
              max={20}
              step={1}
              onChange={(v) => set("zoom", v)}
            />

            <div className="grid grid-cols-2 gap-4">
              <ParamSlider
                label="Offset X"
                value={params.offsetX}
                min={-500}
                max={500}
                step={10}
                unit="px"
                onChange={(v) => set("offsetX", v)}
              />
              <ParamSlider
                label="Offset Y"
                value={params.offsetY}
                min={-500}
                max={500}
                step={10}
                unit="px"
                onChange={(v) => set("offsetY", v)}
              />
            </div>

            <ParamSlider
              label="Escala de texto"
              value={params.fontScale}
              min={0.5}
              max={3.0}
              step={0.1}
              onChange={(v) => set("fontScale", v)}
            />

            <div className="space-y-2">
              <Label htmlFor="labelText">Texto de la etiqueta</Label>
              <Input
                id="labelText"
                value={params.labelText}
                onChange={(e) => set("labelText", e.target.value)}
                placeholder="{city}, {country}"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Variables disponibles: <code className="bg-slate-100 px-1 rounded text-xs">{"{city}"}</code>, <code className="bg-slate-100 px-1 rounded text-xs">{"{country}"}</code>, <code className="bg-slate-100 px-1 rounded text-xs">{"{date}"}</code>
              </p>
            </div>

            <Button onClick={handleSaveParams} className="w-full gap-2 shadow-md">
              <Download className="h-4 w-4" />
              Guardar parámetros en la nube
            </Button>
          </div>
        </div>

        {/* Right: ZIP Manager + Info */}
        <div className="col-span-2 space-y-4">
          {/* ZIP Upload */}
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Script del generador</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Sube o reemplaza el ZIP con la nueva versión del generador. Se guarda en Supabase Storage para que lo puedas descargar cuando lo necesites.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleZipUpload(f);
              }}
            />

            <div
              className={cn(
                "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200",
                !zipUploaded && "border-border/50 hover:border-primary/40 hover:bg-primary/5",
                zipUploaded && "border-emerald-300 bg-emerald-50"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              {zipUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Subiendo ZIP...</p>
                </div>
              ) : zipUploaded ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <p className="text-sm text-emerald-700 font-medium">{zipFile?.name}</p>
                  <p className="text-xs text-muted-foreground">Click para reemplazar</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Subir ZIP</p>
                  <p className="text-xs text-muted-foreground">travel_pin_archive_generator.zip</p>
                </div>
              )}
            </div>
          </div>

          {/* How to run */}
          <div className="bg-slate-50 rounded-2xl border border-border/50 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-muted-foreground">Cómo ejecutar</h3>
            </div>
            <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
              <li>Guarda los parámetros en la nube usando el botón de arriba.</li>
              <li>Descarga el ZIP desde Supabase Storage si actualizaste el script.</li>
              <li>En tu PC, ejecuta: <code className="bg-white px-1.5 py-0.5 rounded border text-slate-700">python generate.py</code></li>
              <li>El script leerá los parámetros automáticamente y procesará los pines pendientes.</li>
            </ol>
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3">
              <p className="text-xs text-amber-800 font-medium">
                🚀 Próximamente: Ejecución en la nube con un solo clic mediante Supabase Edge Functions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
