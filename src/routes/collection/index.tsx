import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookImage, Wifi, ChevronLeft, ChevronRight,
  Sparkles, Search, ArrowUpDown,
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

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
});

const PINS_PER_PAGE = 12;

function CollectionPage() {
  const [pins, setPins] = useState<FullPin[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  // Inspection Modal
  const [inspectPin, setInspectPin] = useState<FullPin | null>(null);
  const [nfcInput, setNfcInput] = useState("");
  const [savingNfc, setSavingNfc] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pinsData, countriesData] = await Promise.all([
        listAllPins().catch(() => []),
        listCountries().catch(() => []),
      ]);
      setPins(pinsData ?? []);
      setCountries(countriesData ?? []);
    } catch {
      toast.error("Aviso al consultar la base de datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    pins.forEach((p) => {
      if (p.acquisition_date) {
        try {
          const y = new Date(p.acquisition_date).getFullYear();
          if (!isNaN(y)) years.add(y.toString());
        } catch {}
      }
    });
    return Array.from(years).sort();
  }, [pins]);

  const filteredPins = useMemo(() => {
    return (pins ?? [])
      .filter((p) => {
        if (!p) return false;
        if (selectedCountry !== "all" && p.country !== selectedCountry) return false;
        if (selectedYear !== "all") {
          try {
            const year = p.acquisition_date ? new Date(p.acquisition_date).getFullYear().toString() : "";
            if (year !== selectedYear) return false;
          } catch {
            return false;
          }
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
    <div className="space-y-8 animate-float-in max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono tracking-widest text-coral uppercase bg-coral/10 px-2.5 py-1 rounded-full border border-coral/20">
              
            </span>
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white">
            Mi Álbum Físico
          </h2>
          <p className="text-muted-fg text-sm mt-1 max-w-2xl">
            Simulador de tu álbum de colección física. Cada hoja contiene 12 cartulinas terminadas (55 × 75 mm) ordenadas cronológicamente.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className="bg-white/5 text-white border-white/15 gap-2 py-1.5 px-3.5 font-mono text-xs">
            <BookImage className="h-3.5 w-3.5 text-cyan" />
            <span>Página {page + 1} de {totalPages}</span>
          </Badge>
          <Badge className="bg-neon/15 text-neon border-neon/30 gap-2 py-1.5 px-3.5 font-mono text-xs shadow-[0_0_16px_-4px_#00ffb2]">
            <Wifi className="h-3.5 w-3.5" />
            <span>{nfcCount} NFC Vinculados</span>
          </Badge>
        </div>
      </div>

      {/* Control Bar: Filters & Sorting */}
      <div className="glass rounded-3xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Buscar ciudad o código..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-10 h-10 text-xs bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl focus-visible:ring-violet"
            />
          </div>

          {/* Country Filter */}
          <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setPage(0); }}>
            <SelectTrigger className="w-48 h-10 text-xs bg-white/5 border-white/10 text-white rounded-xl">
              <SelectValue placeholder="Todos los países" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
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
            <SelectTrigger className="w-40 h-10 text-xs bg-white/5 border-white/10 text-white rounded-xl">
              <SelectValue placeholder="Todos los años" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSortAsc((prev) => !prev)}
          className="text-xs font-mono gap-2 text-cyan hover:text-white hover:bg-white/5"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortAsc ? "Antiguos → Recientes" : "Recientes → Antiguos"}
        </Button>
      </div>

      {/* Cinematic Physical Sheet Container (3 cols x 4 rows) */}
      <div className="glass-strong rounded-3xl p-8 relative overflow-hidden border border-white/15 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-coral shadow-[0_0_8px_#ff6b6b]" />
            <span className="font-display font-bold text-xs tracking-wider text-white uppercase">
              ÁLBUM DE COLECCIÓN · HOJA {page + 1}
            </span>
          </div>
          <span className="text-xs font-mono text-muted-fg">
            {filteredPins.length} cartulinas catalogadas
          </span>
        </div>

        {/* 3 Columns x 4 Rows Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
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
                className="aspect-[55/75] rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-4 bg-white/[0.02] transition-colors hover:border-white/20"
              >
                <div className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                  <Sparkles className="h-4 w-4 text-muted-fg/40" />
                </div>
                <span className="text-[10px] text-muted-fg/50 font-mono tracking-wider uppercase">
                  Ranura {index + 1}
                </span>
              </div>
            )
          )}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="gap-2 text-xs font-mono bg-white/5 border-white/15 text-white hover:bg-white/10"
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
            className="gap-2 text-xs font-mono bg-white/5 border-white/15 text-white hover:bg-white/10"
          >
            Página Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Inspection & NFC Linking Modal */}
      <Dialog open={!!inspectPin} onOpenChange={(open) => !open && setInspectPin(null)}>
        <DialogContent className="max-w-md bg-[#0a0a14] border-white/15 text-white rounded-3xl p-6 shadow-2xl">
          {inspectPin && (
            <div className="space-y-6">
              <DialogHeader>
                <DialogTitle className="font-display text-lg font-bold flex items-center gap-2.5 text-white">
                  <span>{inspectPin.city}</span>
                  <Badge variant="outline" className="text-xs font-mono bg-white/5 border-white/15 text-cyan">
                    {inspectPin.country}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="w-60 mx-auto drop-shadow-2xl">
                <FinishedCard pin={inspectPin} />
              </div>

              <div className="glass rounded-2xl p-5 space-y-3 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-neon" />
                    <span className="text-xs font-display font-semibold text-white">Vincular Chip NFC</span>
                  </div>
                  {inspectPin.nfc_uid && (
                    <Badge className="bg-neon/15 text-neon border-neon/30 text-[10px] font-mono">
                      Vinculado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-fg leading-relaxed">
                  Asocia el identificador hexadecimal del chip NFC físico pegado detrás de la cartulina.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: 04:A2:4B:91:78..."
                    value={nfcInput}
                    onChange={(e) => setNfcInput(e.target.value)}
                    className="text-xs font-mono h-10 bg-white/5 border-white/10 text-white placeholder:text-muted-fg focus-visible:ring-violet"
                  />
                  <Button
                    onClick={handleSaveNfc}
                    disabled={savingNfc}
                    className="h-10 px-5 text-xs font-semibold bg-violet hover:bg-violet/90 text-white shadow-[0_0_16px_-4px_rgba(108,99,255,0.6)]"
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

