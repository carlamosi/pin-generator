import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Upload, Wand2, CheckCircle2, Loader2, Camera, FileArchive,
  RotateCcw, Save, Sparkles, Image as ImageIcon, Check,
  AlertCircle, RefreshCw, X, Layers, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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

  // Mode: camera / zip
  const [studioMode, setStudioMode] = useState<"camera" | "zip">("camera");

  // Single / Camera file states
  const [singleImage, setSingleImage] = useState<string | null>(null);
  const [singleName, setSingleName] = useState("");
  const [singleProcessing, setSingleProcessing] = useState(false);
  const [singleResult, setSingleResult] = useState<PinRow | null>(null);
  const [singleCity, setSingleCity] = useState("");
  const [singlePoi, setSinglePoi] = useState("");
  const [singleCountry, setCustomCountry] = useState("");
  const [singleTripId, setSingleTripId] = useState("");
  const [singleDate, setSingleDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [singleSaving, setSingleSaving] = useState(false);

  // Batch ZIP states
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchTripId, setBatchTripId] = useState<string>("");
  const [isDraggingZip, setIsDraggingZip] = useState(false);

  // Live Camera with Level Gauge & Crosshairs states
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [tiltAngle, setTiltAngle] = useState<{ gamma: number; beta: number }>({ gamma: 0, beta: 0 });

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

    // Device orientation listener for the camera level gauge
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        setTiltAngle({
          gamma: Math.round(e.gamma),
          beta: Math.round(e.beta),
        });
      }
    };

    if (typeof window !== "undefined" && window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
    };
  }, []);

  // Suggestion helpers: If user types "Dinamarca", suggest Copenhagen
  const SUGGESTED_CAPITALS: Record<string, { city: string; region: string }> = {
    "dinamarca": { city: "Copenhagen", region: "Hovedstaden" },
    "denmark": { city: "Copenhagen", region: "Hovedstaden" },
    "suecia": { city: "Estocolmo", region: "Stockholm" },
    "sweden": { city: "Stockholm", region: "Stockholm" },
    "noruega": { city: "Oslo", region: "Østlandet" },
    "norway": { city: "Oslo", region: "Østlandet" },
    "finlandia": { city: "Helsinki", region: "Uusimaa" },
    "finland": { city: "Helsinki", region: "Uusimaa" },
    "españa": { city: "Madrid", region: "Comunidad de Madrid" },
    "spain": { city: "Madrid", region: "Comunidad de Madrid" },
    "francia": { city: "París", region: "Île-de-France" },
    "france": { city: "Paris", region: "Île-de-France" },
    "italia": { city: "Roma", region: "Lacio" },
    "italy": { city: "Rome", region: "Lazio" },
    "alemania": { city: "Berlín", region: "Berlín" },
    "germany": { city: "Berlin", region: "Berlin" },
    "portugal": { city: "Lisboa", region: "Área Metropolitana de Lisboa" },
    "bélgica": { city: "Bruselas", region: "Región de Bruselas" },
    "belgica": { city: "Bruselas", region: "Región de Bruselas" },
    "belgium": { city: "Brussels", region: "Brussels Region" },
    "reino unido": { city: "Londres", region: "Gran Londres" },
    "united kingdom": { city: "London", region: "Greater London" },
    "países bajos": { city: "Ámsterdam", region: "Holanda Septentrional" },
    "paises bajos": { city: "Amsterdam", region: "Holanda Septentrional" },
    "netherlands": { city: "Amsterdam", region: "North Holland" },
    "holanda": { city: "Ámsterdam", region: "Holanda Septentrional" },
  };

  const handleCountryChange = (val: string) => {
    setCustomCountry(val);
    const key = val.trim().toLowerCase();
    if (SUGGESTED_CAPITALS[key] && !singleCity) {
      setSingleCity(SUGGESTED_CAPITALS[key].city);
    }
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1) {
      const file = files[0];
      e.target.value = "";
      try {
        const rawDataUrl = await fileToImageDataUrl(file);
        const squareDataUrl = await new Promise<string>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const sw = img.naturalWidth;
            const sh = img.naturalHeight;
            const size = Math.min(sw, sh);
            const sx = Math.max(0, Math.floor((sw - size) / 2));
            const sy = Math.max(0, Math.floor((sh - size) / 2));
            const dim = Math.min(size, 1200);
            const cnv = document.createElement("canvas");
            cnv.width = dim;
            cnv.height = dim;
            const ctx = cnv.getContext("2d");
            if (!ctx) { resolve(rawDataUrl); return; }
            ctx.drawImage(img, sx, sy, size, size, 0, 0, dim, dim);
            resolve(cnv.toDataURL("image/jpeg", 0.94));
          };
          img.onerror = () => reject(new Error("decode failed"));
          img.src = rawDataUrl;
        });

        setSingleImage(squareDataUrl);
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
    } else {
      const newItems: BatchItem[] = [];
      const toastId = toast.loading(`Cargando ${files.length} fotos de la galería...`);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const dataUrl = await fileToImageDataUrl(file);
          const parsed = parseLocationFromFilename(file.name);
          newItems.push({
            id: nanoid(),
            name: file.name,
            dataUrl,
            city: parsed.city,
            status: "pending",
          });
        } catch {}
      }
      e.target.value = "";
      toast.dismiss(toastId);
      if (newItems.length > 0) {
        setBatchItems(newItems);
        setStudioMode("zip");
        toast.success(`${newItems.length} imágenes listas en el lote de procesamiento ✓`);
      }
    }
  };

  const processSingle = async () => {
    if (!singleImage || !cvReady) return;
    setSingleProcessing(true);
    try {
      const img = await loadImage(singleImage);
      const res = await processPinImage(img, singleName || "pin.jpg");
      if (res.status === "ok") {
        const pinId = nanoid();
        const parsed = parseLocationFromFilename(singleName || "");
        const detectedCity = singleCity || res.location?.city || parsed.city || null;
        const detectedCountry = singleCountry || res.location?.country || null;

        const pinRow: PinRow = {
          id: pinId,
          originalName: singleName || "pin.jpg",
          status: "ok",
          thumbnailDataUrl: res.thumbnailDataUrl,
          city: detectedCity,
          country: detectedCountry,
          year: singleDate ? new Date(singleDate).getFullYear() : (parsed.year ? parseInt(parsed.year, 10) : null),
          month: singleDate ? new Date(singleDate).getMonth() + 1 : null,
          shape: res.shape,
          widthMm: res.widthMm,
          heightMm: res.heightMm,
          aspectRatio: res.aspectRatio,
          bentoSize: "",
          visualScale: 1.0,
          visited: true,
          isFuture: false,
          isEmbassy: false,
        };
        setSingleResult(pinRow);
        if (pinRow.city && !singleCity) setSingleCity(pinRow.city);
        if (pinRow.country && !singleCountry) {
          setCustomCountry(pinRow.country);
          const key = pinRow.country.trim().toLowerCase();
          if (SUGGESTED_CAPITALS[key] && !singleCity) {
            setSingleCity(SUGGESTED_CAPITALS[key].city);
          }
        }
        if (res.location?.city) {
          toast.success(`Pin procesado. Ubicación detectada por OCR: ${res.location.city} (${res.location.country}) ✓`);
        } else {
          toast.success("Pin procesado y fondo aislado con éxito ✓");
        }
      } else {
        toast.error("Revisión requerida: " + (res.note || "No se pudo procesar"));
      }
    } catch (e: any) {
      toast.error("Error al procesar pin: " + (e?.message || "Recorte fallido"));
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

      const cityName = (singleCity || singleResult.city || "Ciudad").trim();
      const countryName = (singleCountry || singleResult.country || "Desconocido").trim();

      // 1. Check or Auto-Create / Update the City in the database with has_pin = true and dates
      let matchedCity = cities.find(
        (c) => c.name.toLowerCase() === cityName.toLowerCase()
      );

      let cityId = matchedCity?.id;
      const pinPrefix = singlePoi ? `${singlePoi.slice(0, 4).toUpperCase()}` : cityName.slice(0, 3).toUpperCase();
      const pinCode = matchedCity?.pin_code && !singlePoi ? matchedCity.pin_code : `${pinPrefix}-${new Date().getFullYear()}`;

      if (!matchedCity) {
        const newCityId = nanoid();
        const { error: cityErr } = await supabase.from("cities").insert({
          id: newCityId,
          trip_id: singleTripId || null,
          name: cityName,
          region: singleResult.shape || null,
          country: countryName,
          continent: "Europa",
          start_date: singleDate || null,
          end_date: singleDate || null,
          has_pin: true,
          pin_code: pinCode,
        });
        if (!cityErr) {
          cityId = newCityId;
          listCities().then(setCities).catch(() => {});
        }
      } else {
        await supabase.from("cities").update({
          has_pin: true,
          trip_id: singleTripId || matchedCity.trip_id || null,
          start_date: matchedCity.start_date || singleDate || null,
        }).eq("id", matchedCity.id);
      }

      // 2. Save the Pin in the pins table
      await supabase.from("pins").upsert({
        id: pinId,
        trip_id: singleTripId || matchedCity?.trip_id || null,
        city_id: cityId || null,
        pin_id: pinCode,
        city: singlePoi ? `${cityName} · ${singlePoi}` : cityName,
        country: countryName,
        region: matchedCity?.region || singleResult.shape,
        acquisition_date: singleDate || new Date().toISOString().split("T")[0],
        dimensions: {
          width_mm: singleResult.widthMm,
          height_mm: singleResult.heightMm,
        },
        shape: singleResult.shape,
        transparent_image_url: cutoutUrl,
      }, { onConflict: "id" });

      toast.success(`Pin y ciudad (${cityName}) guardados en la base de datos ✓`);
      setSingleResult(null);
      setSingleImage(null);
      setSinglePoi("");
      setSingleCity("");
      setCustomCountry("");
      setSingleTripId("");
    } catch {
      toast.error("Error al guardar el pin");
    } finally {
      setSingleSaving(false);
    }
  };

  const processZipBlob = async (file: File | Blob) => {
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

  const handleZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processZipBlob(file);
  };

  const handleZipDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingZip(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".zip") && file.type !== "application/zip") {
      toast.error("Por favor arrastra un archivo comprimido .zip");
      return;
    }
    await processZipBlob(file);
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
        const res = await processPinImage(img, item.name);
        if (res.status !== "ok") {
          setBatchItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, status: "error" } : it))
          );
          continue;
        }
        const cutoutData = res.thumbnailDataUrl ?? item.dataUrl;
        const cutoutUrl = await uploadCutout(pinId, cutoutData);

        const matchedCity = cities.find(
          (c) =>
            (item.city && c.name.toLowerCase().includes(item.city.toLowerCase()))
        );

        const tripId = batchTripId || matchedCity?.trip_id || null;

        await supabase.from("pins").upsert({
          id: pinId,
          trip_id: tripId,
          city_id: matchedCity?.id || null,
          pin_id: matchedCity?.pin_code || `${(item.city || "PIN").slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
          city: matchedCity?.name || item.city || "Pin",
          country: matchedCity?.country || "Desconocido",
          region: matchedCity?.region || res.shape,
          dimensions: { width_mm: res.widthMm, height_mm: res.heightMm },
          shape: res.shape,
          transparent_image_url: cutoutUrl,
        }, { onConflict: "id" });

        setBatchItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "done",
                  cutoutUrl,
                  city: matchedCity?.name || item.city,
                  country: matchedCity?.country,
                  widthMm: res.widthMm,
                  heightMm: res.heightMm,
                  region: matchedCity?.region || undefined,
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
    setIsCameraModalOpen(true);
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }

      const constraints: any = {
        video: {
          facingMode: { ideal: "environment" },
          width: { min: 640, ideal: 1440, max: 1920 },
          height: { min: 640, ideal: 1440, max: 1920 },
          aspectRatio: { ideal: 1.0 },
          focusMode: { ideal: "continuous" },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setCameraActive(true);

      const track = stream.getVideoTracks()[0];
      if (track && typeof (track as any).applyConstraints === "function") {
        try {
          const capabilities = (track as any).getCapabilities ? (track as any).getCapabilities() : {};
          if (capabilities.focusMode?.includes("continuous")) {
            await (track as any).applyConstraints({ advanced: [{ focusMode: "continuous" }] });
          }
        } catch (focusErr) {
          console.warn("Focus mode apply error:", focusErr);
        }
      }

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.setAttribute("muted", "true");
          videoRef.current.play().catch((err) => {
            console.warn("Video play interrupted, retrying:", err);
            videoRef.current?.play();
          });
        }
      }, 80);
    } catch (err: any) {
      console.error("Camera access error:", err);
      toast.error(err?.name === "NotAllowedError" ? "Permiso de cámara denegado" : "Error al activar la cámara");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsCameraModalOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      toast.error("La cámara aún se está inicializando...");
      return;
    }

    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const squareSize = Math.min(vw, vh);
      const startX = Math.max(0, Math.floor((vw - squareSize) / 2));
      const startY = Math.max(0, Math.floor((vh - squareSize) / 2));

      const targetDim = Math.min(squareSize, 1200);
      const canvas = document.createElement("canvas");
      canvas.width = targetDim;
      canvas.height = targetDim;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, startX, startY, squareSize, squareSize, 0, 0, targetDim, targetDim);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.94);

      setSingleImage(dataUrl);
      setSingleName(`captura_camara_1x1_${Date.now()}.jpg`);
      setSingleResult(null);
      stopCamera();

      toast.success("Foto 1:1 nivelada capturada con éxito ✓");
    } catch (e: any) {
      toast.error("Error al capturar la foto: " + (e?.message || ""));
    }
  };

  // Tilt status
  const isLevel = Math.abs(tiltAngle.gamma) < 4 && (Math.abs(tiltAngle.beta) < 10 || Math.abs(tiltAngle.beta - 90) < 10);

  return (
    <div className="space-y-8 animate-float-in max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white">
            El Estudio de Digitalización
          </h2>
          <p className="text-muted-fg text-sm mt-1 max-w-2xl">
            Captura con cruceta y nivel, importa fotos o procesa paquetes masivos ZIP directamente en el navegador.
          </p>
        </div>
      </div>

      {/* Tabs Modes: Camera / ZIP */}
      <Tabs value={studioMode} onValueChange={(v: any) => setStudioMode(v)} className="space-y-6">
        <TabsList className="bg-white/5 p-1 rounded-2xl w-full grid grid-cols-2 border border-white/10 max-w-md">
          <TabsTrigger value="camera" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <Camera className="h-3.5 w-3.5 text-cyan" />
            Cámara
          </TabsTrigger>
          <TabsTrigger value="zip" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
            <FileArchive className="h-3.5 w-3.5 text-violet" />
            Lote Masivo ZIP ({batchItems.length})
          </TabsTrigger>
        </TabsList>

        {/* 1. CAMERA TAB */}
        <TabsContent value="camera" className="space-y-6">
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
                    className="max-h-[280px] object-contain rounded-xl drop-shadow-2xl z-10"
                  />
                ) : (
                  <div className="flex flex-col items-center text-center space-y-3 z-10 p-2">
                    <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-cyan group-hover:scale-110 transition-transform shadow-[0_0_24px_-4px_rgba(0,212,255,0.4)]">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-sm text-white">
                        Hacer Foto o Importar Pines
                      </p>
                      <p className="text-xs text-muted-fg font-mono mt-1">
                        Cámara en vivo con cruceta y nivel o galería (JPG, PNG, WEBP)
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        onClick={startCamera}
                        className="bg-cyan hover:bg-cyan/90 text-black font-semibold text-xs rounded-xl shadow-[0_0_16px_-4px_#00d4ff] gap-2 h-9 px-4"
                      >
                        <Camera className="h-4 w-4" />
                        Hacer Foto
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white/5 border-white/15 text-white hover:bg-white/10 text-xs rounded-xl h-9"
                      >
                        Galería (Múltiple)
                      </Button>
                    </div>
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFilesSelected}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={processSingle}
                  disabled={!singleImage || singleProcessing || !cvReady}
                  className="flex-1 bg-gradient-to-r from-violet to-cyan text-white font-semibold text-xs h-11 rounded-2xl shadow-[0_0_20px_-4px_rgba(108,99,255,0.5)] gap-2 hover:opacity-95"
                >
                  {singleProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {singleProcessing ? "Aislando con IA..." : "Procesar y Aislar Pin"}
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
                        ✓ Listo para Colección
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
                          <Label className="text-[11px] font-semibold text-muted-fg">País</Label>
                          <Input
                            value={singleCountry}
                            onChange={(e) => handleCountryChange(e.target.value)}
                            placeholder="Ej: Dinamarca"
                            className="bg-white/5 border-white/10 text-white rounded-xl text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] font-semibold text-muted-fg">Ciudad Base</Label>
                          <Input
                            value={singleCity}
                            onChange={(e) => setSingleCity(e.target.value)}
                            placeholder="Ej: Copenhagen"
                            className="bg-white/5 border-white/10 text-white rounded-xl text-xs"
                          />
                        </div>
                      </div>

                      {/* Fecha de Adquisición / Visita */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-muted-fg flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-cyan" />
                          Fecha del Viaje / Adquisición
                        </Label>
                        <Input
                          type="date"
                          value={singleDate}
                          onChange={(e) => setSingleDate(e.target.value)}
                          className="bg-white/5 border-white/10 text-white rounded-xl text-xs"
                        />
                      </div>

                      {/* Point of Interest / Landmark */}
                      <div className="space-y-1 p-3 rounded-xl bg-white/[0.02] border border-white/10">
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[11px] font-semibold text-cyan">Lugar de Interés / Monumento (Opcional)</Label>
                          <span className="text-[10px] text-muted-fg font-mono">Ej: Tivoli</span>
                        </div>
                        <Input
                          value={singlePoi}
                          onChange={(e) => setSinglePoi(e.target.value)}
                          placeholder="Ej: Jardines Tivoli / Palacio de Amalienborg"
                          className="bg-white/5 border-white/10 text-white rounded-xl text-xs h-9"
                        />
                        <p className="text-[10px] text-muted-fg mt-1">
                          Permite tener múltiples pines en la misma ciudad vinculados a atracciones específicas.
                        </p>
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
                  Arrastra o selecciona un archivo .zip para procesar múltiples fotos en secuencia.
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

            {/* Drag and Drop Zone for ZIP */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingZip(true); }}
              onDragLeave={() => setIsDraggingZip(false)}
              onDrop={handleZipDrop}
              onClick={() => zipInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 text-center",
                isDraggingZip
                  ? "border-violet bg-violet/10 scale-[1.01]"
                  : "border-white/10 hover:border-violet/40 bg-white/[0.01] hover:bg-white/[0.03]"
              )}
            >
              <FileArchive className="h-10 w-10 mb-2 text-violet opacity-80 animate-bounce" />
              <p className="text-sm font-semibold text-white">
                Arrastra tu archivo ZIP aquí o haz clic para explorar
              </p>
              <p className="text-xs text-muted-fg mt-1 font-mono">
                Soporta .zip con imágenes directas o subcarpetas
              </p>
            </div>

            {batchItems.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-4">
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
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Fullscreen 1:1 Live Camera Modal with Crosshairs & Spirit Level */}
      <Dialog open={isCameraModalOpen} onOpenChange={(open) => { if (!open) stopCamera(); }}>
        <DialogContent className="max-w-md bg-[#07070b]/95 border-white/15 p-6 rounded-3xl backdrop-blur-2xl text-white">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base font-display font-bold flex items-center justify-between">
              <span>Cámara Directa 1:1</span>
              <Badge
                className={cn(
                  "text-[10px] font-mono transition-colors",
                  isLevel ? "bg-neon/20 text-neon border-neon/40" : "bg-coral/20 text-coral border-coral/40"
                )}
              >
                {isLevel ? "✓ Nivelado (0°)" : `Inclinación: ${tiltAngle.gamma}°`}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 1:1 Viewfinder container */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square w-full flex items-center justify-center border border-white/15 shadow-2xl">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Viewfinder Overlay with Crosshairs & Level Line */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* 1:1 Corner Guides */}
                <div className="relative w-3/4 h-3/4">
                  <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan rounded-tl-lg" />
                  <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan rounded-br-lg" />

                  {/* Horizontal Level Line */}
                  <div
                    className={cn(
                      "absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 transition-transform duration-100",
                      isLevel ? "bg-neon shadow-[0_0_10px_#00ffb2]" : "bg-cyan/40"
                    )}
                    style={{ transform: `translateY(-50%) rotate(${Math.max(-45, Math.min(45, tiltAngle.gamma))}deg)` }}
                  />

                  {/* Vertical Crosshair Line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan/30 -translate-x-1/2" />

                  {/* Center Circle Target */}
                  <div
                    className={cn(
                      "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full border-2 transition-all duration-200 flex items-center justify-center",
                      isLevel
                        ? "border-neon bg-neon/15 shadow-[0_0_16px_#00ffb2]"
                        : "border-white/40 bg-black/40"
                    )}
                  >
                    <div className={cn("h-1.5 w-1.5 rounded-full", isLevel ? "bg-neon animate-ping" : "bg-white/60")} />
                  </div>
                </div>
              </div>

              {/* Angle Readout Overlay */}
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-mono text-white/80">
                Nivel: <span className={isLevel ? "text-neon font-bold" : "text-coral font-bold"}>{tiltAngle.gamma}°</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={stopCamera}
                className="flex-1 bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl text-xs h-11"
              >
                Cancelar
              </Button>
              <Button
                onClick={capturePhoto}
                className="flex-1 bg-neon hover:bg-neon/90 text-black font-semibold text-xs rounded-xl shadow-[0_0_20px_-4px_#00ffb2] gap-2 h-11"
              >
                <Camera className="h-4 w-4" />
                Capturar Pin 1:1
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

