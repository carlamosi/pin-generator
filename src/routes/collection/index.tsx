import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookImage, Wifi, ChevronLeft, ChevronRight,
  Search, ArrowUpDown, Tag, Check, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listAllPins, type FullPin, upsertFullPin } from "@/lib/trips/trips-repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
});

const PINS_PER_PAGE = 24;

function CollectionPage() {
  const [pins, setPins] = useState<FullPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  // NFC Quick Inspection Modal
  const [inspectPin, setInspectPin] = useState<FullPin | null>(null);
  const [nfcInput, setNfcInput] = useState("");
  const [savingNfc, setSavingNfc] = useState(false);

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
        return sortAsc ? dateA - dateB : dateB - dateA;
      });
  }, [pins, search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredPins.length / PINS_PER_PAGE));
  const currentBatch = filteredPins.slice(page * PINS_PER_PAGE, (page + 1) * PINS_PER_PAGE);
  const nfcCount = pins.filter((p) => p.nfc_uid).length;

  const handleSaveNfc = async () => {
    if (!inspectPin) return;
    setSavingNfc(true);
    try {
      await upsertFullPin({ id: inspectPin.id, nfc_uid: nfcInput || null });
      setPins((prev) =>
        prev.map((p) => (p.id === inspectPin.id ? { ...p, nfc_uid: nfcInput || null } : p))
      );
      setInspectPin((prev) => (prev ? { ...prev, nfc_uid: nfcInput || null } : null));
      toast.success("Chip NFC vinculado a la cartulina ✓");
    } catch {
      toast.error("Error al actualizar chip NFC");
    } finally {
      setSavingNfc(false);
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
            Catálogo cronológico compacto de cartulinas físicas y enlace de chips NFC.
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

      {/* Control Bar: Clean & Minimalist */}
      <div className="glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Buscar ciudad o país..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl focus-visible:ring-violet"
            />
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortAsc((prev) => !prev)}
          className="text-xs font-mono gap-1.5 text-cyan hover:text-white hover:bg-white/5 h-8 px-3 rounded-lg"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortAsc ? "Cronológico: Antiguos → Recientes" : "Cronológico: Recientes → Antiguos"}
        </Button>
      </div>

      {/* Compact Minimalist Grid Container */}
      <div className="glass rounded-3xl p-6 relative border border-white/15 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-cyan shadow-[0_0_8px_#00d4ff]" />
            <span className="font-display font-bold text-xs tracking-wider text-white uppercase">
              HOJA {page + 1} · ({currentBatch.length} CARTULINAS)
            </span>
          </div>
          <span className="text-xs font-mono text-muted-fg">
            {filteredPins.length} registros totales
          </span>
        </div>

        {/* Minimalist Cards Grid: 24 cards per view, highly visible and compact */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {currentBatch.map((pin, index) => {
            const absoluteIndex = page * PINS_PER_PAGE + index + 1;
            const formattedIndex = String(absoluteIndex).padStart(3, "0");
            const hasNfc = !!pin.nfc_uid;

            return (
              <div
                key={pin.id}
                onClick={() => {
                  setInspectPin(pin);
                  setNfcInput(pin.nfc_uid ?? "");
                }}
                className={cn(
                  "group relative cursor-pointer flex flex-col justify-between rounded-xl p-3 transition-all duration-200",
                  "bg-white/[0.03] border hover:bg-white/[0.07] hover:-translate-y-1 hover:shadow-lg",
                  hasNfc
                    ? "border-white/15 hover:border-cyan/50 shadow-[0_4px_16px_-4px_rgba(0,212,255,0.15)]"
                    : "border-white/10 hover:border-violet/40"
                )}
                style={{ aspectRatio: "55 / 75" }}
              >
                {/* Card Top: Number & NFC Tag indicator */}
                <div className="flex items-start justify-between">
                  <span className={cn(
                    "text-[10px] font-mono p-1 rounded-md transition-colors",
                    hasNfc ? "text-cyan bg-cyan/10" : "text-muted-fg bg-white/5"
                  )}>
                    <Wifi className="h-3 w-3" />
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-white/70 group-hover:text-white">
                    {formattedIndex} / ∞
                  </span>
                </div>

                {/* Card Middle: Pin Silhouette / Image preview if available */}
                <div className="my-auto flex items-center justify-center py-1">
                  {pin.transparent_image_url ? (
                    <img
                      src={pin.transparent_image_url}
                      alt={pin.city || "Pin"}
                      className="max-h-14 max-w-full object-contain filter drop-shadow-md group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-dashed border-white/15 flex items-center justify-center bg-white/[0.02]">
                      <Tag className="h-4 w-4 text-muted-fg/40" />
                    </div>
                  )}
                </div>

                {/* Card Bottom: Big City & Country */}
                <div className="space-y-0.5 border-t border-white/10 pt-2">
                  <p className="font-display font-bold text-sm text-white truncate leading-tight group-hover:text-cyan transition-colors">
                    {pin.city || "Sin ciudad"}
                  </p>
                  <p className="text-[11px] text-muted-fg truncate leading-none">
                    {pin.country || "Desconocido"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Controls */}
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

      {/* Inspection & NFC Fast Linker Modal */}
      <Dialog open={!!inspectPin} onOpenChange={(open) => !open && setInspectPin(null)}>
        <DialogContent className="max-w-md bg-[#09090e] border-white/15 text-white rounded-2xl p-6 shadow-2xl">
          {inspectPin && (
            <div className="space-y-5">
              <DialogHeader>
                <DialogTitle className="font-display text-lg font-bold flex items-center justify-between text-white">
                  <span>{inspectPin.city}</span>
                  <Badge variant="outline" className="text-xs font-mono bg-white/5 border-white/15 text-cyan">
                    {inspectPin.country}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              {/* Minimal preview */}
              <div className="glass rounded-xl p-4 flex flex-col items-center justify-center bg-white/[0.02]">
                {inspectPin.transparent_image_url ? (
                  <img
                    src={inspectPin.transparent_image_url}
                    alt={inspectPin.city || "Pin"}
                    className="max-h-28 object-contain filter drop-shadow-xl"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full border border-dashed border-white/20 flex items-center justify-center text-muted-fg">
                    <Tag className="h-6 w-6" />
                  </div>
                )}
                <div className="mt-3 text-center">
                  <p className="text-xs font-mono text-muted-fg">
                    ID Registro: <span className="text-white">{inspectPin.pin_id || inspectPin.id}</span>
                  </p>
                </div>
              </div>

              {/* NFC Manager Card */}
              <div className="glass rounded-xl p-4 space-y-3 border border-white/10 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-cyan" />
                    <span className="text-xs font-display font-semibold text-white">Vincular Chip NFC Físico</span>
                  </div>
                  {inspectPin.nfc_uid ? (
                    <Badge className="bg-neon/15 text-neon border-neon/30 text-[10px] font-mono">
                      Vinculado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-fg border-white/10 text-[10px] font-mono">
                      Sin chip
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-fg leading-relaxed">
                  Pega el identificador UID del chip NFC adherido al dorso de la cartulina física.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: 04:A2:4B:91:78..."
                    value={nfcInput}
                    onChange={(e) => setNfcInput(e.target.value)}
                    className="text-xs font-mono h-9 bg-white/5 border-white/10 text-white placeholder:text-muted-fg focus-visible:ring-violet rounded-xl"
                  />
                  <Button
                    onClick={handleSaveNfc}
                    disabled={savingNfc}
                    className="h-9 px-4 text-xs font-semibold bg-gradient-to-r from-violet to-cyan text-white rounded-xl shadow-[0_0_12px_-3px_rgba(108,99,255,0.5)]"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Guardar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

