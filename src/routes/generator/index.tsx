import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Satellite, Sliders, MapPin, Download, Save, RefreshCw,
  Sparkles, Layers, FileArchive, Upload, ZoomIn, Type,
  Compass, CheckCircle2, Loader2,
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

  const selectPin = (p: FullPin) => {
    setSelectedPinId(p.id);
    setZoom(p.satellite_params?.zoom ?? 14);
    setLat(p.satellite_params?.lat ?? 40.4168);
    setLon(p.satellite_params?.lon ?? -3.7038);
    setCustomCity(p.city ?? "");
    setCustomCountry(p.country ?? "");
    setCustomPinCode(p.pin_id ?? "");
  };

  const selectedPin = useMemo(() => {
    return pins.find((p) => p.id === selectedPinId) ?? null;
  }, [pins, selectedPinId]);

  const previewPin = useMemo<FullPin | null>(() => {
    if (!selectedPin) return null;
    return {
      ...selectedPin,
      city: customCity || selectedPin.city,
      country: customCountry || selectedPin.country,
      pin_id: customPinCode || selectedPin.pin_id,
      satellite_params: {
        zoom,
        lat,
        lon,
      },
    };
  }, [selectedPin, customCity, customCountry, customPinCode, zoom, lat, lon]);

  const handleSaveCard = async () => {
    if (!selectedPin) return;
    setSaving(true);
    try {
      await upsertFullPin({
        id: selectedPin.id,
        city: customCity,
        country: customCountry,
        pin_id: customPinCode,
        satellite_params: { zoom, lat, lon },
      });
      setPins((prev) =>
        prev.map((p) =>
          p.id === selectedPin.id
            ? {
                ...p,
                city: customCity,
                country: customCountry,
                pin_id: customPinCode,
                satellite_params: { zoom, lat, lon },
              }
            : p
        )
      );
      toast.success("Parámetros de la cartulina satelital guardados en la nube ✓");
    } catch {
      toast.error("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipUploading(true);
    setZipSuccess(false);

    try {
      const fileName = `generator-build-${Date.now()}.zip`;
      const { error } = await supabase.storage
        .from(GENERATOR_BUCKET)
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      setZipSuccess(true);
      toast.success("Archivo ZIP subido al almacenamiento del generador");
    } catch (err: any) {
      toast.error(err?.message || "Error al subir ZIP");
    } finally {
      setZipUploading(false);
    }
  };

  return (
    <div className="space-y-8 animate-float-in max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono tracking-widest text-neon uppercase bg-neon/10 px-2.5 py-1 rounded-full border border-neon/20">
              Editor Satelital Interactivo · WYSIWYG
            </span>
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white">
            Centro Satelital
          </h2>
          <p className="text-muted-fg text-sm mt-1 max-w-2xl">
            Ajusta encuadre, zoom y coordenadas satelitales en vivo. Observa en tiempo real cómo queda la cartulina física (#F4F1E8) antes de imprimir.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSaveCard}
            disabled={saving || !selectedPin}
            className="bg-gradient-to-r from-neon to-cyan text-black font-semibold text-xs px-5 h-11 rounded-2xl shadow-[0_0_24px_-4px_rgba(0,255,178,0.6)] gap-2 hover:opacity-95 transition-opacity"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Cartulina
          </Button>
        </div>
      </div>

      {/* Main Workspace Layout: 5 Cols Preview + 7 Cols Controls */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left 5 Cols: Live Card Showcase Mount */}
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <div className="glass-strong rounded-3xl p-6 border border-white/15 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-6 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-neon shadow-[0_0_8px_#00ffb2]" />
                <span className="font-display font-bold text-xs tracking-wider text-white uppercase">
                  VISTA WYSIWYG (55 × 75 mm)
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono bg-white/5 border-white/10 text-cyan">
                Zoom {zoom}x
              </Badge>
            </div>

            {previewPin ? (
              <div className="w-64 max-w-full drop-shadow-2xl">
                <FinishedCard pin={previewPin} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-fg">
                <Loader2 className="h-8 w-8 animate-spin mb-2 text-cyan" />
                <p className="text-xs">Cargando previsualización...</p>
              </div>
            )}

            <p className="text-[11px] font-mono text-muted-fg/70 text-center mt-6">
              Filtro acuarela (#F4F1E8), banderas y vectores de rumbo calculados automáticamente desde Terrassa.
            </p>
          </div>
        </div>

        {/* Right 7 Cols: Interactive Controls */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          <div className="glass-strong rounded-3xl p-6 border border-white/15 space-y-6">
            {/* Pin Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
                Seleccionar Pin a Personalizar
              </Label>
              <Select
                value={selectedPinId}
                onValueChange={(val) => {
                  const p = pins.find((x) => x.id === val);
                  if (p) selectPin(p);
                }}
              >
                <SelectTrigger className="h-11 text-xs font-medium bg-white/5 border-white/10 text-white rounded-xl">
                  <SelectValue placeholder="Elige un pin..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a14] border-white/15 text-white max-h-64">
                  {pins.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-semibold text-white">{p.city || "Sin ciudad"}</span> · {p.country} ({p.pin_id || "PIN"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tabs defaultValue="map" className="space-y-6">
              <TabsList className="bg-white/5 p-1 rounded-2xl w-full grid grid-cols-2 border border-white/10">
                <TabsTrigger value="map" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  <MapPin className="h-3.5 w-3.5 text-cyan" />
                  Encuadre y Zoom Satelital
                </TabsTrigger>
                <TabsTrigger value="text" className="gap-2 text-xs font-semibold rounded-xl text-muted-fg data-[state=active]:bg-white/10 data-[state=active]:text-white">
                  <Type className="h-3.5 w-3.5 text-violet" />
                  Tipografía y Etiquetas
                </TabsTrigger>
              </TabsList>

              {/* Map Zoom & Position */}
              <TabsContent value="map" className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-white/90">Nivel de Zoom Satelital</Label>
                    <span className="font-mono text-xs text-cyan font-bold bg-cyan/10 px-2 py-0.5 rounded-md border border-cyan/20">
                      {zoom} / 18
                    </span>
                  </div>
                  <Slider
                    min={10}
                    max={18}
                    step={1}
                    value={[zoom]}
                    onValueChange={([v]) => setZoom(v)}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-muted-fg">
                    <span>10 (Región)</span>
                    <span>14 (Ciudad)</span>
                    <span>18 (Monumento)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-fg">Latitud</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                      className="font-mono text-xs bg-white/5 border-white/10 text-white rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-fg">Longitud</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(parseFloat(e.target.value) || 0)}
                      className="font-mono text-xs bg-white/5 border-white/10 text-white rounded-xl"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Typography and Labeling */}
              <TabsContent value="text" className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-fg">Nombre de la Ciudad</Label>
                  <Input
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    placeholder="Ej: Copenhague"
                    className="bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-fg">País</Label>
                    <Input
                      value={customCountry}
                      onChange={(e) => setCustomCountry(e.target.value)}
                      placeholder="Ej: Dinamarca"
                      className="bg-white/5 border-white/10 text-white rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-fg">Código de Pin</Label>
                    <Input
                      value={customPinCode}
                      onChange={(e) => setCustomPinCode(e.target.value)}
                      placeholder="Ej: CPH-2024-04"
                      className="font-mono text-xs bg-white/5 border-white/10 text-white rounded-xl"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Generator ZIP Storage Card */}
          <div className="glass rounded-3xl p-6 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-cyan" />
                <h3 className="font-display font-semibold text-xs text-white uppercase tracking-wider">
                  Almacenamiento ZIP de Salida
                </h3>
              </div>
              {zipSuccess && (
                <Badge className="bg-neon/15 text-neon border-neon/30 text-[10px] font-mono">
                  Sincronizado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-fg leading-relaxed">
              Guarda tus plantillas de tarjetas o paquetes compilados en el bucket público de Supabase para distribución o exportación a imprenta.
            </p>
            <input
              type="file"
              ref={zipInputRef}
              accept=".zip"
              className="hidden"
              onChange={handleZipUpload}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => zipInputRef.current?.click()}
              disabled={zipUploading}
              className="text-xs font-semibold gap-2 bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl"
            >
              {zipUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {zipUploading ? "Subiendo ZIP..." : "Subir archivo ZIP a Supabase"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
