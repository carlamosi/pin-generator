import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Satellite, Sliders, MapPin, Download, Save, RefreshCw,
  Eye, Sparkles, Layers, FileArchive, Upload, ZoomIn,
  Move, Type, Compass, CheckCircle2, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinishedCard } from "@/components/FinishedCard";
import { listAllPins, type FullPin, upsertFullPin } from "@/lib/trips/trips-repo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generator/")({
  component: GeneratorPage,
});

const GENERATOR_BUCKET = "generator-zip";

function GeneratorPage() {
  const [pins, setPins] = useState<FullPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable card parameters
  const [zoom, setZoom] = useState<number>(14);
  const [lat, setLat] = useState<number>(40.4168);
  const [lon, setLon] = useState<number>(-3.7038);
  const [customCity, setCustomCity] = useState<string>("");
  const [customCountry, setCustomCountry] = useState<string>("");
  const [customPinCode, setCustomPinCode] = useState<string>("");
  const [pinScale, setPinScale] = useState<number>(100);

  // ZIP management
  const [zipUploading, setZipUploading] = useState(false);
  const [zipSuccess, setZipSuccess] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await listAllPins();
        setPins(data);
        if (data.length > 0) {
          selectPin(data[0]);
        }
      } catch {
        toast.error("Error al cargar pines");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selectPin = (pin: FullPin) => {
    setSelectedPinId(pin.id);
    setCustomCity(pin.city ?? "");
    setCustomCountry(pin.country ?? "");
    setCustomPinCode(pin.pin_id ?? "");
    setZoom(pin.satellite_params?.zoom ?? 14);
    if (pin.satellite_params?.lat && pin.satellite_params?.lon) {
      setLat(pin.satellite_params.lat);
      setLon(pin.satellite_params.lon);
    }
  };

  const currentPin = useMemo(() => {
    return pins.find((p) => p.id === selectedPinId);
  }, [pins, selectedPinId]);

  // Dynamic preview pin object with live parameter overrides
  const previewPin = useMemo<FullPin | null>(() => {
    if (!currentPin) return null;
    return {
      ...currentPin,
      city: customCity || currentPin.city,
      country: customCountry || currentPin.country,
      pin_id: customPinCode || currentPin.pin_id,
      satellite_params: {
        ...currentPin.satellite_params,
        zoom,
        lat,
        lon,
      },
    };
  }, [currentPin, customCity, customCountry, customPinCode, zoom, lat, lon]);

  const handleSaveParams = async () => {
    if (!currentPin) return;
    setSaving(true);
    try {
      const updatedParams = {
        zoom,
        lat,
        lon,
      };

      await upsertFullPin({
        id: currentPin.id,
        city: customCity,
        country: customCountry,
        pin_id: customPinCode,
        satellite_params: updatedParams,
      });

      setPins((prev) =>
        prev.map((p) =>
          p.id === currentPin.id
            ? {
                ...p,
                city: customCity,
                country: customCountry,
                pin_id: customPinCode,
                satellite_params: updatedParams,
              }
            : p
        )
      );

      toast.success("¡Cartulina satelital actualizada con éxito! ✓");
    } catch {
      toast.error("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleZipUpload = async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Solo se admiten archivos .zip");
      return;
    }
    setZipUploading(true);
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: "application/zip" });
      const { error } = await supabase.storage
        .from(GENERATOR_BUCKET)
        .upload("travel_pin_archive_generator.zip", blob, { upsert: true });
      if (error) throw error;
      setZipSuccess(true);
      toast.success("Script motor del generador actualizado en Supabase Storage ✓");
    } catch {
      toast.error("Error al subir el ZIP del generador");
    } finally {
      setZipUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-float-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Centro Satelital</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Personaliza visualmente el encuadre, zoom y datos de cada cartulina satelital en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 py-1 px-3">
            <Satellite className="h-3.5 w-3.5 text-primary" />
            <span>{pins.length} Cartulinas Disponibles</span>
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left 4 Cols: Live Finished Card Preview */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm flex flex-col items-center justify-center min-h-[460px]">
            <div className="flex items-center justify-between w-full mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vista Previa en Vivo (55 × 75 mm)
              </span>
              <Badge variant="secondary" className="text-[10px]">
                WYSIWYG
              </Badge>
            </div>

            {previewPin ? (
              <div className="w-64 max-w-full drop-shadow-2xl">
                <FinishedCard pin={previewPin} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-xs">Cargando previsualización...</p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground/70 text-center mt-4">
              Filtro acuarela (#F4F1E8), banderas y vectores de rumbo calculados automáticamente.
            </p>
          </div>
        </div>

        {/* Right 7 Cols: Interactive Controls */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm space-y-6">
            {/* Pin Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Seleccionar Pin a Editar
              </Label>
              <Select
                value={selectedPinId}
                onValueChange={(val) => {
                  const p = pins.find((x) => x.id === val);
                  if (p) selectPin(p);
                }}
              >
                <SelectTrigger className="h-10 text-sm font-medium">
                  <SelectValue placeholder="Elige un pin..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {pins.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-semibold">{p.city || "Sin ciudad"}</span> · {p.country} ({p.pin_id || "PIN"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="map" className="space-y-4">
              <TabsList className="bg-slate-100 p-1 rounded-xl w-full grid grid-cols-2">
                <TabsTrigger value="map" className="gap-2 text-xs">
                  <MapPin className="h-3.5 w-3.5" />
                  Encuadre y Zoom Satelital
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-2 text-xs">
                  <Type className="h-3.5 w-3.5" />
                  Tipografía y Etiquetas
                </TabsTrigger>
              </TabsList>

              {/* Map Zoom & Position */}
              <TabsContent value="map" className="space-y-5 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Nivel de Zoom Satelital</Label>
                    <Badge variant="secondary" className="font-mono text-xs">
                      Zoom {zoom} (
                      {zoom <= 12 ? "Área metropolitana" : zoom <= 14 ? "Distrito / Ciudad" : "Detalle monumento"})
                    </Badge>
                  </div>
                  <Slider
                    min={10}
                    max={18}
                    step={1}
                    value={[zoom]}
                    onValueChange={([v]) => setZoom(v)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Latitud</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                      className="text-xs font-mono h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Longitud</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                      className="text-xs font-mono h-9"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Text & Typography */}
              <TabsContent value="text" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nombre de la Ciudad (Tipografía Serif)</Label>
                  <Input
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="Ej: Madrid"
                    className="text-xs h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">País</Label>
                    <Input
                      value={customCountry}
                      onChange={(e) => setCustomCountry(e.target.value)}
                      placeholder="Ej: España"
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Código Identificador (Pin ID)</Label>
                    <Input
                      value={customPinCode}
                      onChange={(e) => setCustomPinCode(e.target.value)}
                      placeholder="Ej: MAD-2023-08"
                      className="text-xs font-mono h-9"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Action Save Button */}
            <Button
              onClick={handleSaveParams}
              disabled={saving || !currentPin}
              className="w-full gap-2 shadow-md h-10 font-medium"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Cambios en la Cartulina
            </Button>
          </div>

          {/* Generator Engine ZIP Sync */}
          <div className="bg-slate-50 rounded-2xl border border-border/50 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-white border border-border/40 flex items-center justify-center flex-shrink-0">
                <FileArchive className="h-4 w-4 text-slate-700" />
              </div>
              <div>
                <p className="text-xs font-semibold">Motor Satelital Python (ZIP)</p>
                <p className="text-[11px] text-muted-foreground">
                  Actualiza el archivo ZIP de generación masiva si tienes una nueva versión.
                </p>
              </div>
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => zipInputRef.current?.click()}
              disabled={zipUploading}
              className="text-xs gap-1.5 flex-shrink-0"
            >
              {zipUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {zipSuccess ? "Actualizado ✓" : "Subir ZIP"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
