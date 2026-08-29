import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookImage, Wifi, Pin as PinIcon, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { listTrips, type Trip } from "@/lib/trips/trips-repo";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/collection/")({
  component: CollectionPage,
});

interface FullPin {
  id: string;
  trip_id: string | null;
  city: string | null;
  acquisition_date: string | null;
  dimensions: { width_mm?: number; height_mm?: number } | null;
  transparent_image_url: string | null;
  satellite_image_url: string | null;
  nfc_uid: string | null;
}

const PINS_PER_PAGE = 12; // 3 cols x 4 rows

function PinCard({ pin, trip }: { pin: FullPin | null; trip?: Trip }) {
  const [hovered, setHovered] = useState(false);

  if (!pin) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border/40 flex items-center justify-center bg-slate-50/60 aspect-[1/2] transition-all duration-200 hover:border-primary/30">
        <PinIcon className="h-5 w-5 text-border/60" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden bg-white border border-border/50 aspect-[1/2] cursor-pointer transition-all duration-300 group",
        hovered && "shadow-lift -translate-y-1.5 border-primary/30"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ boxShadow: hovered ? "var(--shadow-lift)" : "var(--shadow-float)" }}
    >
      {/* Image */}
      <div className="checker-bg flex-1 flex items-center justify-center p-3 h-3/4">
        {pin.transparent_image_url ? (
          <img
            src={pin.transparent_image_url}
            className="max-h-full max-w-full object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-105"
            alt={pin.city ?? "Pin"}
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
            <PinIcon className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-2 pb-2 pt-1 border-t border-border/30 bg-white h-1/4 flex flex-col justify-center">
        <p className="text-[11px] font-semibold truncate">{pin.city ?? "Sin ciudad"}</p>
        {pin.acquisition_date && (
          <p className="text-[9px] text-muted-foreground">
            {new Date(pin.acquisition_date).toLocaleDateString("es-ES", { year: "numeric", month: "short" })}
          </p>
        )}
      </div>

      {/* Hover Overlay */}
      {hovered && (
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent rounded-2xl flex flex-col justify-end p-3 animate-float-in pointer-events-none">
          <div className="space-y-1">
            {trip && <p className="text-[10px] text-white/70 font-medium truncate">{trip.name}</p>}
            {pin.dimensions && (
              <p className="text-[10px] text-white/60">
                {pin.dimensions.width_mm}×{pin.dimensions.height_mm} mm
              </p>
            )}
            <div className="flex items-center gap-1">
              <div className={cn(
                "h-3 w-3 rounded-full flex items-center justify-center",
                pin.nfc_uid ? "bg-emerald-400" : "bg-slate-400"
              )}>
                <Wifi className="h-2 w-2 text-white" />
              </div>
              <span className="text-[9px] text-white/70">
                {pin.nfc_uid ? "NFC vinculado" : "NFC pendiente"}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlbumPage({
  pins,
  pageIndex,
  trips,
}: {
  pins: (FullPin | null)[];
  pageIndex: number;
  trips: Trip[];
}) {
  const slots = Array.from({ length: PINS_PER_PAGE }, (_, i) => pins[i] ?? null);
  const tripsMap = Object.fromEntries(trips.map((t) => [t.id, t]));

  return (
    <div className="bg-white rounded-3xl shadow-lift p-6 border border-border/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookImage className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">Página {pageIndex + 1}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {pins.filter(Boolean).length}/{PINS_PER_PAGE} pines
        </Badge>
      </div>
      {/* Grid 3 cols x 4 rows */}
      <div className="grid grid-cols-3 gap-3">
        {slots.map((pin, i) => (
          <PinCard
            key={pin?.id ?? `empty-${i}`}
            pin={pin}
            trip={pin?.trip_id ? tripsMap[pin.trip_id] : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function CollectionPage() {
  const [pins, setPins] = useState<FullPin[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterTrip, setFilterTrip] = useState<string>("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [{ data }, tripsData] = await Promise.all([
          supabase.from("pins").select("id, trip_id, city, acquisition_date, dimensions, transparent_image_url, satellite_image_url, nfc_uid").order("created_at", { ascending: false }),
          listTrips(),
        ]);
        setPins((data ?? []) as FullPin[]);
        setTrips(tripsData);
      } catch {
        toast.error("Error al cargar la colección");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = filterTrip === "all" ? pins : pins.filter((p) => p.trip_id === filterTrip);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PINS_PER_PAGE));
  const pagePins = filtered.slice(page * PINS_PER_PAGE, (page + 1) * PINS_PER_PAGE);

  const nfcLinked = pins.filter((p) => p.nfc_uid).length;

  return (
    <div className="p-6 space-y-6 animate-float-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mi Álbum Físico</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Visualización de tu álbum. Cada página alberga {PINS_PER_PAGE} pines (3×4).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filterTrip} onValueChange={(v) => { setFilterTrip(v); setPage(0); }}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Todos los viajes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los viajes</SelectItem>
              {trips.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pines totales", value: pins.length },
          { label: "Páginas del álbum", value: Math.max(1, Math.ceil(pins.length / PINS_PER_PAGE)), color: "text-blue-600" },
          { label: "NFC vinculados", value: nfcLinked, color: "text-emerald-600" },
          { label: "Sin NFC", value: pins.length - nfcLinked, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border border-border/50 shadow-sm text-center">
            <p className={cn("text-2xl font-bold", color ?? "")}>{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <AlbumPage pins={pagePins} pageIndex={page} trips={trips} />
          {/* Pagination */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="gap-2"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
