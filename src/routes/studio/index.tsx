import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Upload, Wand2, CheckCircle2, Loader2, Camera, FileArchive,
  RotateCcw, Save, Sparkles, Image as ImageIcon, Check,
  AlertCircle, RefreshCw, X, Layers,
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
  const [cvLoading, setCvLoading] = useState(true);

  // Mode: single / zip / camera
  const [studioMode, setStudioMode] = useState<"single" | "zip" | "camera">("single");

  // Single file states
  const [singleImage, setSingleImage] = useState<string | null>(null);
  const [singleName, setSingleName] = useState("");
  const [singleProcessing, setSingleProcessing] = useState(false);
  const [singleResult, setSingleResult] = useState<PinRow | null>(null);
  const [singleCity, setSingleCity] = useState("");
  const [singleCountry, setCustomCountry] = useState("");
  const [singleTripId, setSingleTripId] = useState("");
  const [singleSaving, setSingleSaving] = useState(false);

  // Batch ZIP states
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchTripId, setBatchTripId] = useState<string>("");

  // Camera states
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [tripsData, citiesData] = await Promise.all([listTrips(), listCities()]);
        setTrips(tripsData);
        setCities(citiesData);
      } catch (e) {
        console.error(e);
      }
    };
    init();

    loadOpenCV()
      .then(() => {
        setCvReady(true);
        setCvLoading(false);
      })
      .catch((e) => {
        console.error("Error loading OpenCV:", e);
        setCvLoading(false);
      });

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToImageDataUrl(file);
      setSingleImage(dataUrl);
      setSingleName(file.name);
      setSingleResult(null);

      const parsed = parseLocationFromFilename(file.name);
      if (parsed.city) {
        setSingleCity(parsed.city);
        const match = cities.find((c) => c.name.toLowerCase().includes(parsed.city!.toLowerCase()));
        if (match) {
          setCustomCountry(match.country);
          if (match.trip_id) setSingleTripId(match.trip_id);
        }
      }
    } catch {
      toast.error("Error al cargar la imagen");
    }
  };

  const processSingle = async () => {
    if (!singleImage || !cvReady) return;
    setSingleProcessing(true);
    try {
      const img = await loadImage(singleImage);
      const pinId = nanoid();
      const row = await processPinImage(img, singleName || "pin.jpg", pinId);
      setSingleResult(row);

      if (row.city && !singleCity) setSingleCity(row.city);
      if (row.country && !singleCountry) setCustomCountry(row.country);

      toast.success("Pin procesado con OpenCV con éxito ✓");
    } catch (e: any) {
      toast.error("Error en OpenCV: " + (e?.message || "Recorte fallido"));
    } finally {
      setSingleProcessing(false);
    }
  };

  const saveSinglePin = async () => {
    if (!singleResult) return;
    setSingleSaving(true);
    try {
      const pinId = singleResult.id;
      const cutoutData = singleResult.thumbnailDataUrl ?? singleResult.cutoutImageUrl ?? singleImage!;
      const cutoutUrl = await uploadCutout(pinId, cutoutData);

      const matchedCity = cities.find(
        (c) => c.name.toLowerCase() === (singleCity || singleResult.city || "").toLowerCase()
      );

      await supabase.from("pins").upsert({
        id: pinId,
        trip_id: singleTripId || matchedCity?.trip_id || null,
        city_id: matchedCity?.id || null,
        pin_id: matchedCity?.pin_code || `${(singleCity || singleResult.city || "PIN").slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
        city: singleCity || singleResult.city,
        country: singleCountry || singleResult.country,
        region: matchedCity?.region || singleResult.shape,
        dimensions: {
          width_mm: singleResult.widthMm,
          height_mm: singleResult.heightMm,
        },
        shape: singleResult.shape,
        transparent_image_url: cutoutUrl,
      }, { onConflict: "id" });

      toast.success("Pin guardado y catalogado en la base de datos ✓");
      setSingleResult(null);
      setSingleImage(null);
    } catch {
      toast.error("Error al guardar el pin");
    } finally {
      setSingleSaving(false);
    }
  };

  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("Descomprimiendo archivo ZIP...");
    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      const items: BatchItem[] = [];

      for (const [relativePath, zipEntry] of Object.entries(content.files)) {
        if (
          !zipEntry.dir &&
          /\.(jpe?g|png|webp)$/i.test(relativePath) &&
          !relativePath.startsWith("__MACOSX")
        ) {
          const blob = await zipEntry.async("blob");
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          const fileName = relativePath.split("/").pop() || relativePath;
          const parsed = parseLocationFromFilename(fileName);

          items.push({
            id: nanoid(),
            name: fileName,
            dataUrl,
            city: parsed.city,
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
                  city: matchedCity?.name || item.city || row.city,
                  country: matchedCity?.country || row.country,
                  widthMm: row.widthMm,
                  heightMm: row.heightMm,
                }
              : it
          )
        );
      } catch {
        setBatchItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "error" } : it))
        );
      }
    }
    setBatchProcessing(false);
    toast.success("Lote completado y sincronizado con Supabase ✓");
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      toast.error("No se pudo acceder a la cámara");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    setSingleImage(dataUrl);
    setSingleName(`camara_${Date.now()}.jpg`);
    setStudioMode("single");

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraActive(false);
    }
    toast.success("Fotografía capturada con éxito ✓");
  };

  return (
    <div className="space-y-8 animate-float-in max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono tracking-widest text-cyan uppercase bg-cyan/10 px-2.5 py-1 rounded-full border border-cyan/20">
              
            </span>
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white">
            El Estudio de Digitalización
          </h2>
          <p className="text-muted-fg text-sm mt-1 max-w-2xl">
            Sube imágenes individuales, paquetes masivos en formato ZIP o utiliza la cámara en vivo para calibrar el recorte y aislar tus pines físicos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className={cn("gap-2 py-1.5 px-3.5 font-mono text-xs", cvReady ? "bg-neon/15 text-neon border-neon/30 shadow-[0_0_16px_-4px_#00ffb2]" : "bg-amber-500/15 text-amber-300 border-amber-500/30")}>
            <span className={cn("h-2 w-2 rounded-full", cvReady ? "bg-neon animate-pulse" : "bg-amber-400")} />
            <span>{cvReady ? "OpenCV Listo" : "Cargando OpenCV..."}</span>
          </Badge>
        </div>
      </div>

      {/* Tabs Modes: Single / ZIP / Camera */}
      <Tabs value={studioMode} onValueChange={(v: any) => setStudioMode(v)} className="space-y-6">
        <TabsList className="bg-white/5 p-1 rounded-2xl w-full grid grid-cols-3 border border-white/10">
          <TabsTrigger value="single" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Upload className="h-3.5 w-3.5 text-cyan" />
            Foto Individual
          </TabsTrigger>
          <TabsTrigger value="zip" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <FileArchive className="h-3.5 w-3.5 text-violet" />
            Lote Masivo ZIP ({batchItems.length})
          </TabsTrigger>
          <TabsTrigger value="camera" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Camera className="h-3.5 w-3.5 text-coral" />
            Cámara Directa
          </TabsTrigger>
        </TabsList>

        {/* 1. SINGLE PHOTO TAB */}
        <TabsContent value="single" className="space-y-6">
          <div className="grid grid-cols-12 gap-8">
            {/* Left 6: Dropzone & Preview */}
            <div className="col-span-12 lg:col-span-6 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group min-h-[360px]",
                  singleImage
                    ? "border-white/20 bg-white/[0.02]"
                    : "border-white/10 hover:border-cyan/50 bg-white/[0.02] hover:bg-white/[0.05]"
                )}
              >
                {singleImage ? (
                  <img
                    src={singleImage}
                    alt="Pin cargado"
                    className="max-h-[300px] object-contain rounded-xl drop-shadow-2xl z-10"
                  />
                ) : (
                  <div className="flex flex-col items-center text-center space-y-3 z-10">
                    <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan group-hover:scale-110 transition-transform shadow-[0_0_24px_-4px_rgba(0,212,255,0.4)]">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-sm text-white">
                        Arrastra una foto o haz clic para seleccionarla
                      </p>
                      <p className="text-xs text-muted-fg font-mono mt-1">
                        Soporta JPG, PNG, WEBP (Fondo verde recomendado)
                      </p>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleSingleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={processSingle}
                  disabled={!singleImage || singleProcessing || !cvReady}
                  className="flex-1 bg-gradient-to-r from-violet to-cyan text-white font-semibold text-xs h-11 rounded-2xl shadow-[0_0_20px_-4px_rgba(108,99,255,0.5)] gap-2 hover:opacity-95"
                >
                  {singleProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {singleProcessing ? "Aislando con OpenCV..." : "Procesar y Aislar Pin"}
                </Button>
                {singleImage && (
                  <Button
                    variant="outline"
                    onClick={() => { setSingleImage(null); setSingleResult(null); }}
                    className="bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-2xl h-11 px-4"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Right 6: Cutout Result & Assignment */}
            <div className="col-span-12 lg:col-span-6 space-y-4">
              <div className="glass-strong rounded-3xl p-6 border border-white/15 min-h-[360px] flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <span className="font-display font-bold text-xs tracking-wider text-white uppercase">
                      RESULTADO AISLADO (TRANSPARENTE)
                    </span>
                    {singleResult && (
                      <Badge className="bg-neon/15 text-neon border-neon/30 text-[10px] font-mono">
                        {singleResult.widthMm} × {singleResult.heightMm} mm
                      </Badge>
                    )}
                  </div>

                  {singleResult ? (
                    <div className="space-y-4">
                      {/* Checkerboard display */}
                      <div className="checker-bg rounded-2xl h-44 flex items-center justify-center p-4 border border-white/10">
                        <img
                          src={singleResult.thumbnailDataUrl || singleResult.cutoutImageUrl || singleImage!}
                          alt="Recorte"
                          className="max-h-full object-contain filter drop-shadow-xl"
                        />
                      </div>

                      {/* Fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-muted-fg">Ciudad</Label>
                          <Input
                            value={singleCity}
                            onChange={(e) => setSingleCity(e.target.value)}
                            placeholder="Ej: Madrid"
                            className="bg-white/5 border-white/10 text-white rounded-xl text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-muted-fg">País</Label>
                          <Input
                            value={singleCountry}
                            onChange={(e) => setCustomCountry(e.target.value)}
                            placeholder="Ej: España"
                            className="bg-white/5 border-white/10 text-white rounded-xl text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-muted-fg">Asignar a Expedición / Viaje</Label>
                        <Select value={singleTripId} onValueChange={setSingleTripId}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl text-xs">
                            <SelectValue placeholder="Seleccionar viaje..." />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
                            {trips.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name} ({t.transport || "Viaje"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-fg">
                      <Sparkles className="h-8 w-8 mb-2 opacity-30 text-cyan" />
                      <p className="text-xs">El resultado del aislamiento aparecerá aquí tras procesar.</p>
                    </div>
                  )}
                </div>

                {singleResult && (
                  <Button
                    onClick={saveSinglePin}
                    disabled={singleSaving}
                    className="w-full mt-4 bg-neon hover:bg-neon/90 text-black font-semibold text-xs h-11 rounded-2xl shadow-[0_0_20px_-4px_#00ffb2]"
                  >
                    {singleSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Guardar Pin en el Álbum
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 2. BATCH ZIP TAB */}
        <TabsContent value="zip" className="space-y-6">
          <div className="glass-strong rounded-3xl p-6 border border-white/15 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                  Procesamiento por Lotes desde ZIP
                </h3>
                <p className="text-xs text-muted-fg mt-0.5">
                  Descomprime y procesa hasta 50 fotos en secuencia directamente en tu navegador.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={zipInputRef}
                  onChange={handleZipFileChange}
                  accept=".zip"
                  className="hidden"
                />
                <Button
                  onClick={() => zipInputRef.current?.click()}
                  variant="outline"
                  className="bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl text-xs font-semibold gap-2"
                >
                  <FileArchive className="h-4 w-4 text-violet" />
                  Cargar Archivo ZIP
                </Button>
                <Button
                  onClick={processBatchAll}
                  disabled={batchItems.length === 0 || batchProcessing || !cvReady}
                  className="bg-gradient-to-r from-violet to-cyan text-white font-semibold text-xs rounded-xl shadow-[0_0_20px_-4px_rgba(108,99,255,0.6)] gap-2"
                >
                  {batchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Procesar Todo el Lote ({batchItems.length})
                </Button>
              </div>
            </div>

            {batchItems.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {batchItems.map((item) => (
                  <div
                    key={item.id}
                    className="glass rounded-2xl p-3 border border-white/10 flex flex-col items-center space-y-2 relative overflow-hidden"
                  >
                    <div className="h-24 w-full rounded-xl checker-bg flex items-center justify-center p-2">
                      <img
                        src={item.cutoutUrl || item.dataUrl}
                        alt={item.name}
                        className="max-h-full object-contain"
                      />
                    </div>
                    <div className="w-full text-center">
                      <p className="text-xs font-semibold text-white truncate">{item.city || item.name}</p>
                      <Badge
                        className={cn(
                          "mt-1 text-[9px] font-mono px-2 py-0.5",
                          item.status === "done" && "bg-neon/15 text-neon border-neon/30",
                          item.status === "processing" && "bg-cyan/15 text-cyan border-cyan/30 animate-pulse",
                          item.status === "pending" && "bg-white/5 text-muted-fg border-white/10",
                          item.status === "error" && "bg-coral/15 text-coral border-coral/30"
                        )}
                      >
                        {item.status === "done" ? "✓ Listo" : item.status === "processing" ? "Procesando..." : item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-fg">
                <FileArchive className="h-10 w-10 mb-2 opacity-30 text-violet" />
                <p className="text-xs font-mono">Ningún archivo ZIP cargado todavía.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 3. CAMERA DIRECT TAB */}
        <TabsContent value="camera" className="space-y-6">
          <div className="glass-strong rounded-3xl p-6 border border-white/15 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h3 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                  Captura Directa con Cámara
                </h3>
                <p className="text-xs text-muted-fg mt-0.5">
                  Sitúa el pin sobre una superficie lisa o verde y pulsa capturar.
                </p>
              </div>

              {!cameraActive ? (
                <Button
                  onClick={startCamera}
                  className="bg-cyan hover:bg-cyan/90 text-black font-semibold text-xs rounded-xl shadow-[0_0_16px_-4px_#00d4ff] gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Activar Cámara
                </Button>
              ) : (
                <Button
                  onClick={capturePhoto}
                  className="bg-neon hover:bg-neon/90 text-black font-semibold text-xs rounded-xl shadow-[0_0_20px_-4px_#00ffb2] gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Capturar Pin
                </Button>
              )}
            </div>

            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-white/10">
              {cameraActive ? (
                <>
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  {/* Viewfinder crosshairs */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-dashed border-cyan/60 rounded-3xl shadow-[0_0_30px_rgba(0,212,255,0.3)] flex items-center justify-center">
                      <span className="text-[10px] font-mono text-cyan/70 bg-black/60 px-2 py-1 rounded-md">
                        Encuadra el pin aquí
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center text-center text-muted-fg space-y-2">
                  <Camera className="h-10 w-10 opacity-30 text-coral" />
                  <p className="text-xs">Pulsa &ldquo;Activar Cámara&rdquo; para comenzar.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

