import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookImage, Wifi, ChevronLeft, ChevronRight,
  Search, Tag, Check, Radio, Edit3, Trash2, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { listAllPins, type FullPin, upsertFullPin } from "@/lib/trips/trips-repo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
});

const PINS_PER_PAGE = 12;

function CollectionPage() {
  const [pins, setPins] = useState<FullPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  // Edit / Inspection Modal
  const [inspectPin, setInspectPin] = useState<FullPin | null>(null);
  const [editCity, setEditCity] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editPinId, setEditPinId] = useState("");
  const [nfcInput, setNfcInput] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const pinsData = await listAllPins().catch(() => []);
      setPins(pinsData ?? []);
    } catch {
      toast.error("Error al consultar la base de datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPinModal = (pin: FullPin) => {
    setInspectPin(pin);
    setEditCity(pin.city ?? "");
    setEditCountry(pin.country ?? "");
    setEditRegion(pin.region ?? "");
    setEditPinId(pin.pin_id ?? "");
    setNfcInput(pin.nfc_uid ?? "");
  };

  const filteredPins = useMemo(() => {
    return (pins ?? [])
      .filter((p) => {
        if (!p) return false;
        if (search) {
          const s = search.toLowerCase();
          const matchCity = p.city?.toLowerCase().includes(s);
          const matchCountry = p.country?.toLowerCase().includes(s);
          const matchId = p.pin_id?.toLowerCase().includes(s);
          if (!matchCity && !matchCountry && !matchId) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = a.acquisition_date ? new Date(a.acquisition_date).getTime() : 0;
        const dateB = b.acquisition_date ? new Date(b.acquisition_date).getTime() : 0;
        return dateA - dateB;
      });
  }, [pins, search]);

  const totalPages = Math.max(1, Math.ceil(filteredPins.length / PINS_PER_PAGE));
  const currentBatch = filteredPins.slice(page * PINS_PER_PAGE, (page + 1) * PINS_PER_PAGE);
  const nfcCount = pins.filter((p) => p.nfc_uid).length;

  const handleUpdatePin = async () => {
    if (!inspectPin) return;
    setSavingPin(true);
    try {
      await upsertFullPin({
        id: inspectPin.id,
        city: editCity.trim() || null,
        country: editCountry.trim() || null,
        region: editRegion.trim() || null,
        pin_id: editPinId.trim() || null,
        nfc_uid: nfcInput.trim() || null,
      });

      setPins((prev) =>
        prev.map((p) =>
          p.id === inspectPin.id
            ? {
                ...p,
                city: editCity.trim() || null,
                country: editCountry.trim() || null,
                region: editRegion.trim() || null,
                pin_id: editPinId.trim() || null,
                nfc_uid: nfcInput.trim() || null,
              }
            : p
        )
      );

      toast.success("Pin actualizado en Supabase ✓");
      setInspectPin(null);
    } catch {
      toast.error("Error al actualizar los datos");
    } finally {
      setSavingPin(false);
    }
  };

  const handleDeletePin = async (id: string) => {
    if (!confirm("¿Eliminar este pin de la colección y de la base de datos?")) return;
    try {
      const { error } = await supabase.from("pins").delete().eq("id", id);
      if (error) throw error;
      setPins((prev) => prev.filter((p) => p.id !== id));
      toast.success("Pin eliminado de la base de datos");
      setInspectPin(null);
    } catch {
      toast.error("Error al eliminar el pin");
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-white">
            Álbum Físico
          </h2>
          <p className="text-muted-fg text-xs mt-1 leading-relaxed">
            Hojas físicas de 12 cartulinas (3 columnas × 4 filas) ordenadas cronológicamente con sincronización en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className="bg-white/5 text-white border-white/15 gap-2 py-1.5 px-3 font-mono text-xs">
            <BookImage className="h-3.5 w-3.5 text-cyan" />
            <span>Página {page + 1} de {totalPages}</span>
          </Badge>
          <Badge className="bg-neon/15 text-neon border-neon/30 gap-2 py-1.5 px-3 font-mono text-xs shadow-[0_0_12px_-3px_#00ffb2]">
            <Wifi className="h-3.5 w-3.5" />
            <span>{nfcCount} / {pins.length} NFC</span>
          </Badge>
        </div>
      </div>

      {/* Control Bar: Clean Search */}
      <div className="glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
          <Input
            placeholder="Buscar ciudad, lugar o código..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl focus-visible:ring-violet"
          />
        </div>

        <span className="text-xs font-mono text-muted-fg">
          12 cartulinas por hoja (3 × 4)
        </span>
      </div>

      {/* Sheet Container: 3 Columns x 4 Rows = 12 Pins */}
      <div className="glass rounded-3xl p-6 relative border border-white/15 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-cyan shadow-[0_0_8px_#00d4ff]" />
            <span className="font-display font-bold text-xs tracking-wider text-white uppercase">
              HOJA {page + 1} · {currentBatch.length} CARTULINAS
            </span>
          </div>
          <span className="text-xs font-mono text-muted-fg">
            {filteredPins.length} cartulinas registradas
          </span>
        </div>

        {/* Grid 3 Columns x 4 Rows = 12 Slots */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {Array.from({ length: 12 }).map((_, slotIndex) => {
            const pin = currentBatch[slotIndex];
            if (!pin) {
              return (
                <div
                  key={`empty-${slotIndex}`}
                  className="rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-6 bg-white/[0.01] transition-colors"
                  style={{ aspectRatio: "55 / 75" }}
                >
                  <Tag className="h-6 w-6 text-muted-fg/30 mb-2" />
                  <span className="text-[11px] text-muted-fg/50 font-mono">
                    Ranura {slotIndex + 1}
                  </span>
                </div>
              );
            }

            const absoluteIndex = page * PINS_PER_PAGE + slotIndex + 1;
            const formattedIndex = String(absoluteIndex).padStart(3, "0");
            const hasNfc = !!pin.nfc_uid;

            return (
              <div
                key={pin.id}
                onClick={() => openPinModal(pin)}
                className={cn(
                  "group relative cursor-pointer flex flex-col justify-between rounded-2xl p-5 transition-all duration-200",
                  "bg-white/[0.03] border hover:bg-white/[0.07] hover:-translate-y-1 hover:shadow-xl",
                  hasNfc
                    ? "border-white/15 hover:border-cyan/50 shadow-[0_6px_24px_-6px_rgba(0,212,255,0.15)]"
                    : "border-white/10 hover:border-violet/40"
                )}
                style={{ aspectRatio: "55 / 75" }}
              >
                {/* Top: Number & NFC Indicator */}
                <div className="flex items-start justify-between">
                  <span className={cn(
                    "text-xs font-mono p-1.5 rounded-lg transition-colors",
                    hasNfc ? "text-cyan bg-cyan/10 border border-cyan/20" : "text-muted-fg bg-white/5"
                  )}>
                    <Wifi className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-mono text-xs font-semibold text-white/80 group-hover:text-white">
                    {formattedIndex} / ∞
                  </span>
                </div>

                {/* Middle: Centered Transparent Pin Cutout */}
                <div className="my-auto flex items-center justify-center py-2 h-32 w-full">
                  {pin.transparent_image_url ? (
                    <img
                      src={pin.transparent_image_url}
                      alt={pin.city || "Pin"}
                      className="max-h-28 max-w-[85%] object-contain filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-300 pointer-events-none select-none"
                      style={{ transform: "none" }}
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full border border-dashed border-white/15 flex items-center justify-center bg-white/[0.02]">
                      <Tag className="h-6 w-6 text-muted-fg/40" />
                    </div>
                  )}
                </div>

                {/* Bottom: Big City & Country */}
                <div className="space-y-1 border-t border-white/10 pt-3">
                  <p className="font-display font-bold text-base text-white truncate leading-tight group-hover:text-cyan transition-colors">
                    {pin.city || "Sin ciudad"}
                  </p>
                  <p className="text-xs text-muted-fg truncate">
                    {pin.country || "Desconocido"} {pin.region ? `· ${pin.region}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="gap-2 text-xs font-mono bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl"
            >
              <ChevronLeft className="h-4 w-4" />
              Página Anterior
            </Button>

            <span className="text-xs font-mono font-semibold text-cyan">
              Página {page + 1} de {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="gap-2 text-xs font-mono bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl"
            >
              Página Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Edit & NFC Modal */}
      <Dialog open={!!inspectPin} onOpenChange={(open) => !open && setInspectPin(null)}>
        <DialogContent className="max-w-lg bg-[#09090e] border-white/15 text-white rounded-2xl p-6 shadow-2xl">
          {inspectPin && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="font-display text-base font-bold flex items-center justify-between">
                  <span>Modificar Cartulina / Pin</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePin(inspectPin.id)}
                    className="h-8 px-2 text-coral hover:bg-coral/10 hover:text-coral rounded-lg gap-1.5 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                </DialogTitle>
              </DialogHeader>

              {/* Pin Image Preview */}
              <div className="glass rounded-xl p-4 flex flex-col items-center justify-center bg-white/[0.02]">
                {inspectPin.transparent_image_url ? (
                  <img
                    src={inspectPin.transparent_image_url}
                    alt={editCity || "Pin"}
                    className="max-h-28 object-contain filter drop-shadow-xl"
                  />
                ) : (
                  <Tag className="h-12 w-12 text-muted-fg/40" />
                )}
              </div>

              {/* Editable Fields */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium text-muted-fg mb-1 block">Ciudad / Lugar</Label>
                  <Input
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    placeholder="Ej: Copenhagen · Jardines Tivoli"
                    className="bg-white/5 border-white/10 text-white text-xs rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-fg mb-1 block">País</Label>
                    <Input
                      value={editCountry}
                      onChange={(e) => setEditCountry(e.target.value)}
                      placeholder="Ej: Dinamarca"
                      className="bg-white/5 border-white/10 text-white text-xs rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-fg mb-1 block">Región</Label>
                    <Input
                      value={editRegion}
                      onChange={(e) => setEditRegion(e.target.value)}
                      placeholder="Ej: Hovedstaden"
                      className="bg-white/5 border-white/10 text-white text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-fg mb-1 block">Código de Pin</Label>
                    <Input
                      value={editPinId}
                      onChange={(e) => setEditPinId(e.target.value)}
                      placeholder="Ej: COP-2024"
                      className="bg-white/5 border-white/10 text-white text-xs rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-cyan mb-1 flex items-center gap-1">
                      <Radio className="h-3 w-3" /> Chip NFC (UID)
                    </Label>
                    <Input
                      value={nfcInput}
                      onChange={(e) => setNfcInput(e.target.value)}
                      placeholder="Ej: 04:A2:4B:91:78..."
                      className="bg-white/5 border-white/10 text-white text-xs rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-white/10">
                <Button
                  variant="outline"
                  onClick={() => setInspectPin(null)}
                  className="bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdatePin}
                  disabled={savingPin}
                  className="bg-gradient-to-r from-violet to-cyan text-white font-semibold rounded-xl text-xs gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingPin ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

