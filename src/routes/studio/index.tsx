import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Upload, Wand2, CheckCircle2, Loader2, Camera, FileArchive,
  RotateCcw, Save, Link2, Sparkles, Image as ImageIcon,
  Check, AlertCircle, RefreshCw, X, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTrips, listCities, type Trip, type City } from "@/lib/trips/trips-repo";
import {
  processPinImage, loadOpenCV, loadImage, fileToImageDataUrl,
  type PinRow,
} from "@/lib/pin-processing";
import { uploadCutout } from "@/lib/pins-repo";
import { customAlphabet } from "nanoid";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/studio/")({
  component: StudioPage,
});

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

interface BatchItem {
  id: string;
  name: string;
  dataUrl: string;
  cutoutUrl?: string;
  city?: string;
  country?: string;
  region?: string;
  widthMm?: number;
  heightMm?: number;
  status: "pending" | "processing" | "done" | "error";
  tripId?: string;
  cityId?: string;
}

function parseLocationFromFilename(filename: string): { city?: string; year?: string } {
  const clean = filename.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
  const yearMatch = clean.match(/\b(20\d\d)\b/);
  const year = yearMatch ? yearMatch[1] : undefined;
  const nameWithoutYear = clean.replace(/\b20\d\d\b/g, "").trim();
  const words = nameWithoutYear.split(" ").filter((w) => w.length > 2);
  const city = words.length > 0 ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : undefined;
  return { city, year };
}

function StudioPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [cvReady, setCvReady] = useState(false);

  // Single mode state
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singlePreview, setSinglePreview] = useState<string | null>(null);
  const [singleCutout, setSingleCutout] = useState<string | null>(null);
  const [singleRow, setSingleRow] = useState<PinRow | null>(null);
  const [singleTripId, setSingleTripId] = useState<string>("");
  const [singleCityId, setSingleCityId] = useState<string>("");
  const [singleProcessing, setSingleProcessing] = useState(false);
  const [singleSaving, setSingleSaving] = useState(false);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Batch ZIP state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchTripId, setBatchTripId] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOpenCV().then(() => setCvReady(true)).catch(() => {});
    listTrips().then(setTrips).catch(() => {});
    listCities().then(setCities).catch(() => {});
  }, []);

  // 1. SINGLE FILE HANDLERS
  const handleSingleFile = async (f: File) => {
    setSingleFile(f);
    setSingleCutout(null);
    setSingleRow(null);
    const dataUrl = await fileToImageDataUrl(f);
    setSinglePreview(dataUrl);

    // Auto infer location
    const { city, year } = parseLocationFromFilename(f.name);
    if (city) {
      const matchCity = cities.find((c) => c.name.toLowerCase().includes(city.toLowerCase()));
      if (matchCity) {
        setSingleCityId(matchCity.id);
        if (matchCity.trip_id) setSingleTripId(matchCity.trip_id);
      }
    }
  };

  const processSingle = async () => {
    if (!singlePreview || !cvReady || !singleFile) return;
    setSingleProcessing(true);
    try {
      const img = await loadImage(singlePreview);
      const pinId = nanoid();
      const row = await processPinImage(img, singleFile.name, pinId);
      setSingleRow(row);
      setSingleCutout(row.thumbnailDataUrl ?? row.cutoutImageUrl ?? singlePreview);
      toast.success("Fondo eliminado y medidas extraídas con éxito ✓");
    } catch {
      toast.error("Error al procesar la imagen con OpenCV");
    } finally {
      setSingleProcessing(false);
    }
  };

  const saveSingle = async () => {
    if (!singleRow || !singleCutout) return;
    setSingleSaving(true);
    try {
      const pinId = singleRow.pinId ?? nanoid();
      const cutoutUrl = await uploadCutout(pinId, singleCutout);

      const matchedCity = cities.find((c) => c.id === singleCityId);
      const tripId = singleTripId || matchedCity?.trip_id || null;

      await supabase.from("pins").upsert({
        id: pinId,
        trip_id: tripId,
        city_id: singleCityId || null,
        pin_id: matchedCity?.pin_code || (singleRow.city ? `${singleRow.city.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}` : `PIN-${nanoid(4)}`),
        city: matchedCity?.name || singleRow.city,
        country: matchedCity?.country || singleRow.country,
        region: matchedCity?.region || singleRow.shape,
        acquisition_date: matchedCity?.start_date || new Date().toISOString().split("T")[0],
        dimensions: {
          width_mm: singleRow.widthMm,
          height_mm: singleRow.heightMm,
          aspect_ratio: singleRow.aspectRatio,
        },
        shape: singleRow.shape,
        transparent_image_url: cutoutUrl,
      }, { onConflict: "id" });

      toast.success("¡Pin guardado en la base de datos con éxito! ✓");
      setSingleFile(null);
      setSinglePreview(null);
      setSingleCutout(null);
      setSingleRow(null);
    } catch (e) {
      toast.error("Error al guardar el pin en Supabase");
    } finally {
      setSingleSaving(false);
    }
  };

  // 2. CAMERA HANDLERS
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      toast.error("No se pudo acceder a la cámara. Revisa los permisos.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    stopCamera();

    // Convert dataUrl to File
    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `pin_camera_${Date.now()}.jpg`, { type: "image/jpeg" });
        handleSingleFile(file);
      });
  };

  // 3. BATCH ZIP HANDLERS
  const handleZipUpload = async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Por favor sube un archivo con formato .zip");
      return;
    }
    const toastId = toast.loading("Descomprimiendo archivo ZIP...");
    try {
      const zip = await JSZip.loadAsync(file);
      const items: BatchItem[] = [];
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && /\.(png|jpe?g|webp|heic)$/i.test(relativePath)) {
          const blob = await zipEntry.async("blob");
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const { city } = parseLocationFromFilename(relativePath);
          items.push({
            id: nanoid(),
            name: relativePath.split("/").pop() ?? relativePath,
            dataUrl,
            city,
            status: "pending",
          });
        }
      }
      toast.dismiss(toastId);
      if (items.length === 0) {
        toast.error("No se encontraron imágenes válidas dentro del ZIP");
        return;
      }
      setBatchItems(items);
      toast.success(`${items.length} imágenes extraídas del ZIP ✓`);
    } catch {
      toast.dismiss(toastId);
      toast.error("Error al leer el archivo ZIP");
    }
  };

  const processBatchAll = async () => {
    if (!cvReady || batchItems.length === 0) return;
    setBatchProcessing(true);
    let successCount = 0;

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      if (item.status === "done") continue;

      setBatchItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "processing" } : it))
      );

      try {
        const img = await loadImage(item.dataUrl);
        const pinId = nanoid();
        const row = await processPinImage(img, item.name, pinId);
        const cutoutData = row.thumbnailDataUrl ?? row.cutoutImageUrl ?? item.dataUrl;
        const cutoutUrl = await uploadCutout(pinId, cutoutData);

        const matchedCity = cities.find(
          (c) =>
            (item.city && c.name.toLowerCase().includes(item.city.toLowerCase())) ||
            (row.city && c.name.toLowerCase().includes(row.city.toLowerCase()))
        );

        const tripId = batchTripId || matchedCity?.trip_id || null;

        await supabase.from("pins").upsert({
          id: pinId,
          trip_id: tripId,
          city_id: matchedCity?.id || null,
          pin_id: matchedCity?.pin_code || `${(item.city || row.city || "PIN").slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
          city: matchedCity?.name || item.city || row.city,
          country: matchedCity?.country || row.country,
          region: matchedCity?.region || row.shape,
          dimensions: { width_mm: row.widthMm, height_mm: row.heightMm },
          shape: row.shape,
          transparent_image_url: cutoutUrl,
        }, { onConflict: "id" });

        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "done",
                  cutoutUrl,
                  widthMm: row.widthMm ?? undefined,
                  heightMm: row.heightMm ?? undefined,
                  city: matchedCity?.name || it.city || row.city || undefined,
                  country: matchedCity?.country || row.country || undefined,
                }
              : it
          )
        );
        successCount++;
      } catch {
        setBatchItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "error" } : it))
        );
      }
    }

    setBatchProcessing(false);
    toast.success(`Lote completado: ${successCount} pines procesados y guardados ✓`);
  };

  return (
    <div className="p-6 space-y-6 animate-float-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">El Estudio</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Procesa tus pines individuales o en lote ZIP, elimina fondos y vincúlalos automáticamente a tus viajes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={cvReady ? "secondary" : "outline"} className="gap-1.5 text-xs py-1 px-2.5">
            <span className={cn("h-2 w-2 rounded-full", cvReady ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
            {cvReady ? "Motor OpenCV Activo" : "Cargando OpenCV..."}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="single" className="space-y-6">
        <TabsList className="bg-slate-100/80 p-1 rounded-xl">
          <TabsTrigger value="single" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Wand2 className="h-4 w-4" />
            Foto Individual
          </TabsTrigger>
          <TabsTrigger value="zip" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <FileArchive className="h-4 w-4" />
            Lote ZIP ({batchItems.length})
          </TabsTrigger>
          <TabsTrigger value="camera" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Camera className="h-4 w-4" />
            Cámara Directa
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: INDIVIDUAL PHOTO */}
        <TabsContent value="single" className="space-y-6">
          <div className="grid grid-cols-5 gap-6">
            {/* Drop Zone */}
            <div className="col-span-3 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleSingleFile(f);
                }}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-300 min-h-80 overflow-hidden",
                  !singlePreview && "border-border/60 hover:border-primary/40 hover:bg-primary/5 bg-slate-50",
                  singlePreview && "border-transparent bg-white shadow-sm"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSingleFile(f);
                  }}
                />

                {!singlePreview ? (
                  <div className="text-center space-y-3 p-8">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                      <Upload className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-base">Arrastra tu foto de pin aquí</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Soporta PNG, JPG, WEBP, HEIC — fondo verde o blanco para mejor calibración
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="pointer-events-none">
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Elegir archivo
                    </Button>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-6 min-h-80 checker-bg rounded-3xl">
                    <img
                      src={singleCutout ?? singlePreview}
                      alt="Pin preview"
                      className="max-h-72 max-w-full object-contain rounded-xl drop-shadow-2xl transition-all duration-500"
                    />
                  </div>
                )}
              </div>

              {singlePreview && (
                <div className="flex gap-3">
                  <Button
                    onClick={processSingle}
                    disabled={!cvReady || singleProcessing || !!singleCutout}
                    className="flex-1 gap-2 shadow-md"
                  >
                    {singleProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {singleCutout ? "Pin Procesado ✓" : "Quitar fondo y calibrar"}
                  </Button>
                  <Button
                    onClick={() => {
                      setSingleFile(null);
                      setSinglePreview(null);
                      setSingleCutout(null);
                      setSingleRow(null);
                    }}
                    size="icon"
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Sidebar Meta & Trip Linker */}
            <div className="col-span-2 space-y-4">
              {/* Detected info */}
              {singleRow && (
                <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 space-y-3 animate-float-in">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Medidas y Calibración
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {singleRow.shape || "Pin"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] text-muted-foreground">Ancho</p>
                      <p className="text-lg font-bold text-slate-800">{singleRow.widthMm} mm</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl">
                      <p className="text-[10px] text-muted-foreground">Alto</p>
                      <p className="text-lg font-bold text-slate-800">{singleRow.heightMm} mm</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Trip & City Linker */}
              <div className="bg-white rounded-2xl border border-border/50 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Vincular a tu Colección</h3>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ciudad de tu Excel</Label>
                    <Select value={singleCityId} onValueChange={(val) => {
                      setSingleCityId(val);
                      const matched = cities.find((c) => c.id === val);
                      if (matched?.trip_id) setSingleTripId(matched.trip_id);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar ciudad..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.country})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Viaje Asociado</Label>
                    <Select value={singleTripId} onValueChange={setSingleTripId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar viaje..." />
                      </SelectTrigger>
                      <SelectContent>
                        {trips.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} {t.start_date && `(${new Date(t.start_date).getFullYear()})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={saveSingle}
                  disabled={singleSaving || !singleCutout}
                  className="w-full gap-2 shadow-md mt-2"
                >
                  {singleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar Pin en Supabase
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: BATCH ZIP */}
        <TabsContent value="zip" className="space-y-6">
          <div className="bg-white rounded-3xl border border-border/50 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Procesamiento Masivo por ZIP</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sube un archivo ZIP con tus fotos de pines y se procesarán automáticamente una a una.
                </p>
              </div>
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleZipUpload(f);
                }}
              />
              <Button onClick={() => zipInputRef.current?.click()} variant="outline" className="gap-2">
                <FileArchive className="h-4 w-4" />
                {batchItems.length > 0 ? "Cambiar ZIP" : "Cargar Archivo ZIP"}
              </Button>
            </div>

            {batchItems.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <Select value={batchTripId} onValueChange={setBatchTripId}>
                      <SelectTrigger className="w-64 bg-white">
                        <SelectValue placeholder="Asignar viaje general..." />
                      </SelectTrigger>
                      <SelectContent>
                        {trips.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground font-medium">
                      {batchItems.filter((i) => i.status === "done").length} de {batchItems.length} procesados
                    </span>
                  </div>
                  <Button
                    onClick={processBatchAll}
                    disabled={batchProcessing || !cvReady}
                    className="gap-2 shadow-md"
                  >
                    {batchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Procesar Todos los Pines
                  </Button>
                </div>

                {/* Batch Grid */}
                <div className="grid grid-cols-6 gap-4 max-h-[500px] overflow-y-auto p-1">
                  {batchItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-50 rounded-2xl border border-border/50 p-3 flex flex-col justify-between aspect-[3/4] relative overflow-hidden"
                    >
                      <div className="checker-bg rounded-xl flex-1 flex items-center justify-center p-2 overflow-hidden">
                        <img
                          src={item.cutoutUrl ?? item.dataUrl}
                          alt={item.name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="pt-2">
                        <p className="text-[11px] font-semibold truncate">{item.city || item.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px] text-muted-foreground">{item.widthMm ? `${item.widthMm}×${item.heightMm}mm` : "Pendiente"}</span>
                          {item.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                          {item.status === "processing" && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
                          {item.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: CAMERA CAPTURE */}
        <TabsContent value="camera" className="space-y-6">
          <div className="bg-white rounded-3xl border border-border/50 p-6 shadow-sm flex flex-col items-center justify-center min-h-96">
            {!cameraActive ? (
              <div className="text-center space-y-4 py-12">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Camera className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Captura directa desde tu cámara</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Coloca tu pin sobre un fondo verde o blanco liso y bien iluminado para una calibración perfecta.
                  </p>
                </div>
                <Button onClick={startCamera} className="gap-2 shadow-md">
                  <Camera className="h-4 w-4" />
                  Activar Cámara
                </Button>
              </div>
            ) : (
              <div className="space-y-4 w-full max-w-lg flex flex-col items-center">
                <div className="relative rounded-2xl overflow-hidden border-2 border-primary/40 bg-black aspect-[4/3] w-full flex items-center justify-center">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  {/* Framing Crosshair Guide */}
                  <div className="absolute inset-8 border border-dashed border-white/60 rounded-xl pointer-events-none flex items-center justify-center">
                    <div className="h-4 w-4 border-t-2 border-l-2 border-white absolute top-2 left-2" />
                    <div className="h-4 w-4 border-t-2 border-r-2 border-white absolute top-2 right-2" />
                    <div className="h-4 w-4 border-b-2 border-l-2 border-white absolute bottom-2 left-2" />
                    <div className="h-4 w-4 border-b-2 border-r-2 border-white absolute bottom-2 right-2" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={capturePhoto} size="lg" className="gap-2 shadow-lg px-8">
                    <Camera className="h-5 w-5" />
                    Tomar Foto
                  </Button>
                  <Button onClick={stopCamera} variant="outline" size="lg">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
