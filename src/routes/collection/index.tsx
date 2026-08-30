import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookImage, Wifi, ChevronLeft, ChevronRight, Filter,
  Calendar, Layers, Sparkles, MapPin, Search, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FinishedCard } from "@/components/FinishedCard";
import { listAllPins, listCountries, type FullPin, type Country, upsertFullPin } from "@/lib/trips/trips-repo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
});

const PINS_PER_PAGE = 12; // 3 columns x 4 rows per physical page

function CollectionPage() {
  const [pins, setPins] = useState<FullPin[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true); // Chronological

  // Inspection Modal
  const [inspectPin, setInspectPin] = useState<FullPin | null>(null);
  const [nfcInput, setNfcInput] = useState("");
  const [savingNfc, setSavingNfc] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pinsData, countriesData] = await Promise.all([listAllPins(), listCountries()]);
      setPins(pinsData);
      setCountries(countriesData);
    } catch {
      toast.error("Error al cargar la colección");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Available years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    pins.forEach((p) => {
      if (p.acquisition_date) {
        years.add(new Date(p.acquisition_date).getFullYear().toString());
      }
    });
    return Array.from(years).sort();
  }, [pins]);

  // Filtered & Chronologically Sorted Pins
  const filteredPins = useMemo(() => {
    return pins
      .filter((p) => {
        if (selectedCountry !== "all" && p.country !== selectedCountry) return false;
        if (selectedYear !== "all") {
          const year = p.acquisition_date ? new Date(p.acquisition_date).getFullYear().toString() : "";
          if (year !== selectedYear) return false;
        }
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
  }, [pins, selectedCountry, selectedYear, search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredPins.length / PINS_PER_PAGE));
  const currentBatch = filteredPins.slice(page * PINS_PER_PAGE, (page + 1) * PINS_PER_PAGE);

  // Fill up to 12 slots for the physical sheet layout
  const pageSlots = Array.from({ length: PINS_PER_PAGE }, (_, i) => currentBatch[i] ?? null);

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
      toast.success("Chip NFC vinculado a la cartulina física ✓");
    } catch {
      toast.error("Error al actualizar chip NFC");
    } finally {
      setSavingNfc(false);
    }
  };

  return (
    <div className="p-6 space-y-6 animate-float-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mi Álbum Físico</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Visualización cronológica de tus cartulinas acabadas con mapa satelital, acuarela y pines montados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 py-1 px-3">
            <BookImage className="h-3.5 w-3.5 text-primary" />
            <span>Página {page + 1} de {totalPages}</span>
          </Badge>
          <Badge variant="secondary" className="gap-1.5 py-1 px-3 bg-emerald-50 text-emerald-800 border-emerald-200">
            <Wifi className="h-3.5 w-3.5 text-emerald-600" />
            <span>{nfcCount} NFC Vinculados</span>
          </Badge>
        </div>
      </div>

      {/* Control Bar: Filters & Sorting */}
      <div className="bg-white rounded-2xl border border-border/50 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-60">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar ciudad o código..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Country Filter */}
          <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setPage(0); }}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="Todos los países" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los países</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.name} value={c.name}>
                  {c.flag} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Year Filter */}
          <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="Todos los años" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {availableYears.map((y) => (
                <SelectItem key={y} value={y}>
                  Año {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Chronological Sorting Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortAsc((prev) => !prev)}
            className="text-xs gap-1.5 text-muted-foreground"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortAsc ? "Más antiguos primero" : "Más recientes primero"}
          </Button>
        </div>
      </div>

      {/* Physical Album Sheet Container (3 cols x 4 rows) */}
      <div
        className="bg-white rounded-3xl p-8 border border-border/40 shadow-xl transition-all duration-300 relative"
        style={{
          background: "linear-gradient(to bottom right, #ffffff, #faf8f5)",
        }}
      >
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold tracking-wider text-muted-foreground uppercase">
              ÁLBUM DE COLECCIÓN · PÁGINA {page + 1}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {filteredPins.length} pines en total (12 por página)
          </span>
        </div>

        {/* 3 Columns x 4 Rows Grid */}
        <div className="grid grid-cols-3 gap-6">
          {pageSlots.map((slot, index) =>
            slot ? (
              <FinishedCard
                key={slot.id}
                pin={slot}
                onClick={() => {
                  setInspectPin(slot);
                  setNfcInput(slot.nfc_uid ?? "");
                }}
              />
            ) : (
              <div
                key={`empty-${index}`}
                className="aspect-[55/75] rounded-2xl border-2 border-dashed border-border/30 flex flex-col items-center justify-center p-4 bg-slate-50/40"
              >
                <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                  <Sparkles className="h-4 w-4 text-slate-300" />
                </div>
                <span className="text-[10px] text-muted-foreground/40 font-mono">Ranura Vacía</span>
              </div>
            )
          )}
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="gap-2 text-xs"
          >
            <ChevronLeft className="h-4 w-4" />
            Página Anterior
          </Button>

          <span className="text-xs font-medium text-muted-foreground font-mono">
            {page + 1} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="gap-2 text-xs"
          >
            Página Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Inspection & NFC Linking Modal */}
      <Dialog open={!!inspectPin} onOpenChange={(open) => !open && setInspectPin(null)}>
        <DialogContent className="max-w-md">
          {inspectPin && (
            <div className="space-y-5">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <span>{inspectPin.city}</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    {inspectPin.country}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              {/* High-res Card Preview */}
              <div className="w-56 mx-auto">
                <FinishedCard pin={inspectPin} />
              </div>

              {/* NFC Configuration */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-semibold">Vincular Chip NFC Físico</span>
                  </div>
                  {inspectPin.nfc_uid && (
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] border-emerald-200">
                      Vinculado
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Introduce el UID de tu chip NFC o acércalo a tu lector para asociarlo a esta cartulina.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: 04:A2:4B:91:78..."
                    value={nfcInput}
                    onChange={(e) => setNfcInput(e.target.value)}
                    className="text-xs font-mono h-9"
                  />
                  <Button
                    onClick={handleSaveNfc}
                    disabled={savingNfc}
                    size="sm"
                    className="h-9 px-4 text-xs"
                  >
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
