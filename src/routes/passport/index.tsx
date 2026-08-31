import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Stamp,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  MapPin,
  Calendar,
  Plane,
  Building2,
  X,
  ArrowRight,
  CheckCircle2,
  Info,
  Scan,
} from "lucide-react";
import {
  listPassportPages,
  listPhysicalStamps,
  listStampDesigns,
  listStampingLocations,
  listTrips,
  listCities,
  type PassportPage,
  type FullPhysicalStamp,
  type StampDesign,
  type StampingLocation,
  type Trip,
  type City,
} from "@/lib/trips/trips-repo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/passport/")({
  component: LegoPassportPage,
});

const CATEGORY_META: Record<
  string,
  { label: string; color: string; border: string; bg: string }
> = {
  CITY: {
    label: "Ciudad",
    color: "text-amber-400",
    border: "border-amber-400/30",
    bg: "bg-amber-400/10",
  },
  STORE: {
    label: "LEGO Store",
    color: "text-red-400",
    border: "border-red-400/30",
    bg: "bg-red-400/10",
  },
  AIRPORT: {
    label: "Aeropuerto",
    color: "text-sky-400",
    border: "border-sky-400/30",
    bg: "bg-sky-400/10",
  },
  TERMINAL: {
    label: "Terminal",
    color: "text-cyan-400",
    border: "border-cyan-400/30",
    bg: "bg-cyan-400/10",
  },
  YEAR: {
    label: "Edicion Anual",
    color: "text-emerald-400",
    border: "border-emerald-400/30",
    bg: "bg-emerald-400/10",
  },
  SPECIAL: {
    label: "Especial",
    color: "text-purple-400",
    border: "border-purple-400/30",
    bg: "bg-purple-400/10",
  },
  THEMED: {
    label: "Tematico",
    color: "text-pink-400",
    border: "border-pink-400/30",
    bg: "bg-pink-400/10",
  },
};

type EnrichedStamp = FullPhysicalStamp & {
  design: StampDesign | null | undefined;
  location: StampingLocation | null | undefined;
  trip: Trip | null | undefined;
  represented_city: City | null | undefined;
};

function LegoPassportPage() {
  const [pages, setPages] = useState<PassportPage[]>([]);
  const [stamps, setStamps] = useState<FullPhysicalStamp[]>([]);
  const [designs, setDesigns] = useState<StampDesign[]>([]);
  const [locations, setLocations] = useState<StampingLocation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);

  const [activePageIndex, setActivePageIndex] = useState<number | "cover">(
    "cover"
  );
  const [selectedStamp, setSelectedStamp] = useState<EnrichedStamp | null>(
    null
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [
          pagesData,
          stampsData,
          designsData,
          locationsData,
          tripsData,
          citiesData,
        ] = await Promise.all([
          listPassportPages(),
          listPhysicalStamps(),
          listStampDesigns(),
          listStampingLocations(),
          listTrips().catch(() => [] as Trip[]),
          listCities().catch(() => [] as City[]),
        ]);

        const effectivePages: PassportPage[] =
          pagesData.length > 0
            ? pagesData
            : [
                {
                  id: "default-page-1",
                  page_number: 1,
                  dimension_w_cm: 8.0,
                  dimension_h_cm: 12.0,
                  max_slots: 6,
                  scanned_image_url: null,
                  notes: "Pagina 1",
                  created_at: new Date().toISOString(),
                },
              ];

        setPages(effectivePages);
        setStamps(stampsData);
        setDesigns(designsData);
        setLocations(locationsData);
        setTrips(tripsData);
        setCities(citiesData);
      } catch (err) {
        console.error("Failed to load LEGO passport data:", err);
      }
    }
    loadData();
  }, []);

  const enrichedStamps: EnrichedStamp[] = useMemo(() => {
    const designMap = new Map<string, StampDesign>(
      designs.map((d) => [d.id, d])
    );
    const locMap = new Map<string, StampingLocation>(
      locations.map((l) => [l.id, l])
    );
    const tripMap = new Map<string, Trip>(trips.map((t) => [t.id, t]));
    const cityMap = new Map<string, City>(cities.map((c) => [c.id, c]));

    return stamps.map((st): EnrichedStamp => {
      const design =
        st.design != null
          ? st.design
          : st.stamp_design_id
          ? designMap.get(st.stamp_design_id)
          : null;
      const location =
        st.location != null
          ? st.location
          : st.stamping_location_id
          ? locMap.get(st.stamping_location_id)
          : null;
      const trip =
        st.trip != null
          ? st.trip
          : st.trip_id
          ? tripMap.get(st.trip_id)
          : null;
      const represented_city =
        st.represented_city != null
          ? st.represented_city
          : design?.represented_city_id
          ? cityMap.get(design.represented_city_id)
          : null;

      return {
        ...st,
        design,
        location,
        trip,
        represented_city,
      };
    });
  }, [stamps, designs, locations, trips, cities]);

  const totalPages = pages.length;
  const currentPage =
    typeof activePageIndex === "number" ? pages[activePageIndex] : null;

  const currentPageStamps = useMemo(
    () =>
      currentPage
        ? enrichedStamps.filter((s) => s.passport_page_id === currentPage.id)
        : [],
    [currentPage, enrichedStamps]
  );

  const slotStampMap = useMemo(() => {
    const map = new Map<number, EnrichedStamp>();
    for (const st of currentPageStamps) {
      if (st.slot_position && st.slot_position >= 1 && st.slot_position <= 6) {
        map.set(st.slot_position, st);
      }
    }
    return map;
  }, [currentPageStamps]);

  const totalCollectedStamps = enrichedStamps.length;

  const handlePrev = () => {
    if (activePageIndex === "cover") return;
    if (activePageIndex === 0) {
      setActivePageIndex("cover");
    } else {
      setActivePageIndex((prev) =>
        typeof prev === "number" ? prev - 1 : 0
      );
    }
  };

  const handleNext = () => {
    if (activePageIndex === "cover") {
      setActivePageIndex(0);
    } else if (
      typeof activePageIndex === "number" &&
      activePageIndex < totalPages - 1
    ) {
      setActivePageIndex((prev) =>
        typeof prev === "number" ? prev + 1 : 0
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16 pt-2">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-6 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-xs font-bold font-mono">
              LP
            </span>
            <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-white">
              LEGO Travel Passport
            </h2>
          </div>
          <p className="text-muted-fg text-xs mt-1 max-w-2xl leading-relaxed">
            Archivo fisico-digital de sellos oficiales LEGO. Formato original de
            pasaporte (8 x 12 cm, 6 posiciones por pagina).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-amber-400/10 text-amber-300 border-amber-400/30 gap-2 py-1.5 px-3">
            <Stamp className="h-3.5 w-3.5" />
            <span className="text-xs font-sans">
              {totalCollectedStamps} sellos oficiales
            </span>
          </Badge>
          <Badge className="bg-white/5 text-muted-fg border-white/10 gap-1.5 py-1.5 px-3 font-mono text-xs">
            <span>
              {totalPages} {totalPages === 1 ? "pagina" : "paginas"}
            </span>
          </Badge>
          <Link to="/passport/scan">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 ml-2 border border-emerald-500/50">
              <Scan className="h-4 w-4" />
              Escanear Pasaporte
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ── Left: Passport viewer ── */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Navigation controls */}
          <div className="w-full max-w-[360px] sm:max-w-[420px] flex items-center justify-between mb-4 px-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={activePageIndex === "cover"}
              className="h-8 border-white/10 hover:bg-white/5 text-xs text-white/80 gap-1 rounded-xl transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Anterior</span>
            </Button>
            <span className="text-xs font-mono tracking-wider text-muted-fg uppercase">
              {activePageIndex === "cover"
                ? "Portada Oficial"
                : `Pagina ${currentPage?.page_number ?? 1} de ${totalPages}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={
                typeof activePageIndex === "number" &&
                activePageIndex >= totalPages - 1
              }
              className="h-8 border-white/10 hover:bg-white/5 text-xs text-white/80 gap-1 rounded-xl transition-all"
            >
              <span>Siguiente</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Passport book */}
          <div className="relative w-full max-w-[340px] sm:max-w-[390px] aspect-[8/12] select-none group">
            {activePageIndex === "cover" ? (
              /* Cover */
              <div
                onClick={() => setActivePageIndex(0)}
                className="w-full h-full rounded-2xl p-7 flex flex-col justify-between cursor-pointer transition-all duration-300 relative overflow-hidden hover:-translate-y-1"
                style={{
                  background:
                    "linear-gradient(145deg, #121824 0%, #0d121c 50%, #090d15 100%)",
                  boxShadow:
                    "inset 0 0 40px rgba(0,0,0,0.6), inset 3px 0 8px rgba(255,255,255,0.1), 0 24px 50px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.12)",
                }}
              >
                <div className="absolute inset-3.5 rounded-xl border border-amber-400/25 pointer-events-none" />
                <div className="absolute inset-4 rounded-lg border border-amber-400/15 pointer-events-none" />
                <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/40 via-white/5 to-transparent pointer-events-none" />

                <div className="text-center pt-4 space-y-1 relative z-10">
                  <p className="text-[10px] font-mono tracking-[0.3em] text-amber-400/80 uppercase font-semibold">
                    OFFICIAL PASSPORT
                  </p>
                  <h3
                    className="text-xl sm:text-2xl font-bold tracking-widest text-amber-300"
                    style={{ fontFamily: "'Space Grotesk', serif" }}
                  >
                    LEGO PASSPORT
                  </h3>
                </div>

                <div className="flex flex-col items-center justify-center my-auto py-6 relative z-10">
                  <div
                    className="h-24 w-24 rounded-full border-2 border-amber-400/40 flex items-center justify-center relative"
                    style={{ boxShadow: "inset 0 0 20px rgba(245,158,11,0.2)" }}
                  >
                    <div className="h-20 w-20 rounded-full border border-amber-400/20 flex flex-col items-center justify-center text-amber-300">
                      <Stamp className="h-9 w-9 text-amber-400/90" />
                    </div>
                  </div>
                  <span className="text-[9px] font-mono tracking-[0.25em] text-amber-400/60 uppercase mt-4">
                    SPECIAL EDITION
                  </span>
                </div>

                <div className="text-center pb-2 relative z-10 space-y-3">
                  <div className="flex items-center justify-center gap-2 text-amber-400/70 text-xs font-mono">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Abrir Pasaporte</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <p className="text-[8px] font-mono tracking-wider text-muted-fg/40 uppercase">
                    80 x 120 MM &bull; 6 STAMPS PER PAGE
                  </p>
                </div>
              </div>
            ) : (
              /* Inner page */
              <div
                className="w-full h-full rounded-2xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300"
                style={{
                  backgroundColor: "#FAF7EE",
                  color: "#1E1E1E",
                  backgroundImage:
                    "radial-gradient(#D6CEB8 0.75px, transparent 0.75px)",
                  backgroundSize: "16px 16px",
                  boxShadow:
                    "inset 0 0 30px rgba(180,165,130,0.35), inset 3px 0 8px rgba(0,0,0,0.15), 0 24px 50px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08)",
                }}
              >
                <div className="absolute left-0 top-0 bottom-0 w-3.5 bg-gradient-to-r from-black/25 via-black/5 to-transparent pointer-events-none" />

                {/* Page header */}
                <div className="relative z-10 flex items-center justify-between border-b border-[#DCD5C2] pb-2 text-[10px] font-mono text-[#7A7463]">
                  <div className="flex items-center gap-1.5 font-bold tracking-wider text-[#3D3A31] uppercase">
                    <Stamp className="h-3 w-3 text-amber-700" />
                    <span>LEGO TRAVEL PASSPORT</span>
                  </div>
                  <span className="font-bold text-[#3D3A31]">
                    PAG. {currentPage?.page_number ?? 1}
                  </span>
                </div>

                {/* 6-slot grid */}
                <div className="relative z-10 grid grid-cols-2 grid-rows-3 gap-2.5 my-auto flex-1 py-3">
                  {[1, 2, 3, 4, 5, 6].map((slotNumber) => {
                    const stamp = slotStampMap.get(slotNumber);
                    const isSelected =
                      selectedStamp?.id === stamp?.id && stamp != null;
                    const cat = stamp?.design?.category
                      ? CATEGORY_META[stamp.design.category]
                      : null;

                    return (
                      <div
                        key={slotNumber}
                        onClick={() => stamp && setSelectedStamp(stamp)}
                        className={cn(
                          "relative rounded-xl border border-dashed flex flex-col items-center justify-center p-1.5 transition-all duration-200 aspect-square select-none overflow-hidden",
                          stamp
                            ? "border-amber-700/30 bg-[#F3EDE0]/80 cursor-pointer hover:border-amber-600 hover:shadow-md hover:scale-[1.03]"
                            : "border-[#DCD5C2] bg-transparent opacity-60",
                          isSelected &&
                            "ring-2 ring-amber-600 border-solid bg-[#EAE2D0]"
                        )}
                      >
                        <span className="absolute top-1 left-1.5 text-[8px] font-mono font-bold text-[#A8A08C]">
                          0{slotNumber}
                        </span>

                        {stamp ? (
                          <div className="w-full h-full flex flex-col items-center justify-center text-center p-1 relative">
                            {stamp.cutout_image_url ||
                            stamp.raw_image_url ||
                            stamp.design?.preview_image_url ? (
                              <img
                                src={
                                  stamp.cutout_image_url ||
                                  stamp.raw_image_url ||
                                  stamp.design?.preview_image_url ||
                                  ""
                                }
                                alt={stamp.design?.name ?? "LEGO Stamp"}
                                className="max-h-[70%] max-w-[85%] object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full border border-amber-700/40 text-amber-800 flex items-center justify-center">
                                <Stamp className="h-5 w-5 opacity-70" />
                              </div>
                            )}
                            <p className="text-[9px] font-bold text-[#2A2720] truncate w-full mt-1 leading-tight font-sans">
                              {stamp.design?.name ?? "Sello LEGO"}
                            </p>
                            <span className="text-[7px] font-mono uppercase tracking-wider text-[#6B6554] truncate">
                              {cat?.label ??
                                stamp.design?.category ??
                                "OFICIAL"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-1 text-[#B0A794]">
                            <div className="h-5 w-5 rounded-full border border-dashed border-[#C7BEA9] flex items-center justify-center">
                              <span className="text-[9px] font-mono font-semibold">
                                +
                              </span>
                            </div>
                            <span className="text-[7px] font-mono uppercase tracking-wider">
                              Vacio
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Page footer */}
                <div className="relative z-10 flex items-center justify-between border-t border-[#DCD5C2] pt-2 text-[8px] font-mono text-[#8C8472]">
                  <span>DIMENSION: 80 x 120 MM</span>
                  <span className="tracking-widest font-semibold">
                    {currentPageStamps.length} / 6 POSICIONES
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Page tab strip */}
          <div className="flex items-center gap-2 mt-6 overflow-x-auto max-w-full pb-2 px-2">
            <button
              onClick={() => setActivePageIndex("cover")}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-mono transition-all border",
                activePageIndex === "cover"
                  ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                  : "bg-white/[0.03] text-muted-fg border-white/10 hover:bg-white/5"
              )}
            >
              Portada
            </button>
            {pages.map((p, idx) => {
              const pageStampCount = enrichedStamps.filter(
                (s) => s.passport_page_id === p.id
              ).length;
              return (
                <button
                  key={p.id}
                  onClick={() => setActivePageIndex(idx)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-mono transition-all border flex items-center gap-1.5",
                    activePageIndex === idx
                      ? "bg-amber-400/20 text-amber-300 border-amber-400/40 font-bold"
                      : "bg-white/[0.03] text-muted-fg border-white/10 hover:bg-white/5"
                  )}
                >
                  <span>Pag. {p.page_number}</span>
                  <span className="text-[10px] opacity-70">
                    ({pageStampCount}/6)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Detail inspector ── */}
        <div className="lg:col-span-5 space-y-6">
          {selectedStamp ? (
            <div className="rounded-2xl glass border border-white/15 p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        "text-[10px] font-mono uppercase px-2 py-0.5 border",
                        CATEGORY_META[selectedStamp.design?.category ?? ""]
                          ?.bg ?? "bg-white/10",
                        CATEGORY_META[selectedStamp.design?.category ?? ""]
                          ?.color ?? "text-white",
                        CATEGORY_META[selectedStamp.design?.category ?? ""]
                          ?.border ?? "border-white/20"
                      )}
                    >
                      {CATEGORY_META[selectedStamp.design?.category ?? ""]
                        ?.label ??
                        selectedStamp.design?.category ??
                        "Sello"}
                    </Badge>
                    <span className="text-[11px] font-mono text-muted-fg">
                      Posicion 0{selectedStamp.slot_position ?? "-"}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-xl text-white mt-1.5">
                    {selectedStamp.design?.name ?? "Sello LEGO"}
                  </h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedStamp(null)}
                  className="h-8 w-8 rounded-lg text-muted-fg hover:text-white hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Stamp image */}
              <div
                className="flex items-center justify-center p-6 rounded-xl border border-amber-900/20 shadow-inner relative overflow-hidden"
                style={{ backgroundColor: "#FAF7EE" }}
              >
                {selectedStamp.cutout_image_url ||
                selectedStamp.raw_image_url ||
                selectedStamp.design?.preview_image_url ? (
                  <img
                    src={
                      selectedStamp.cutout_image_url ||
                      selectedStamp.raw_image_url ||
                      selectedStamp.design?.preview_image_url ||
                      ""
                    }
                    alt={selectedStamp.design?.name ?? "LEGO Stamp"}
                    className="max-h-40 max-w-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full border-2 border-dashed border-amber-900/30 flex items-center justify-center text-amber-900">
                    <Stamp className="h-10 w-10 opacity-60" />
                  </div>
                )}
              </div>

              {/* 4 domain pillars */}
              <div className="space-y-3.5 text-xs">
                {/* 1. Stamping location */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">
                      Lugar Fisico de Estampado
                    </p>
                    <p className="font-semibold text-white mt-0.5">
                      {selectedStamp.location?.name ??
                        selectedStamp.location?.city_name ??
                        "LEGO Store Oficial"}
                    </p>
                    {selectedStamp.location?.country && (
                      <p className="text-[11px] text-muted-fg mt-0.5">
                        {selectedStamp.location.country}
                      </p>
                    )}
                  </div>
                </div>

                {/* 2. Represented city / topic */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">
                      Ciudad / Tema Representado
                    </p>
                    <p className="font-semibold text-white mt-0.5">
                      {selectedStamp.represented_city?.name ??
                        (selectedStamp.design?.category === "CITY"
                          ? selectedStamp.design.name
                          : "Sin ciudad especifica (Tema especial)")}
                    </p>
                    {selectedStamp.represented_city?.country && (
                      <p className="text-[11px] text-muted-fg mt-0.5">
                        {selectedStamp.represented_city.country}
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. Stamped date */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">
                      Fecha de Estampado (stamped_at)
                    </p>
                    <p className="font-semibold text-white mt-0.5 font-mono">
                      {selectedStamp.stamped_at || "Fecha no registrada"}
                    </p>
                    <p className="text-[11px] text-muted-fg mt-0.5">
                      Registrada fisicamente en tienda
                    </p>
                  </div>
                </div>

                {/* 4. Optional trip */}
                {selectedStamp.trip && (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Plane className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-muted-fg uppercase tracking-wider">
                        Expedicion Asociada
                      </p>
                      <p className="font-semibold text-white mt-0.5">
                        {selectedStamp.trip.name}
                      </p>
                      {selectedStamp.trip.start_date && (
                        <p className="text-[11px] text-muted-fg mt-0.5 font-mono">
                          {selectedStamp.trip.start_date}
                          {selectedStamp.trip.end_date
                            ? ` - ${selectedStamp.trip.end_date}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-muted-fg border-t border-white/10 font-mono">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Obtenido personalmente</span>
                </div>
                <span>Codigo: {selectedStamp.design?.code ?? "STAMP-01"}</span>
              </div>
            </div>
          ) : (
            /* Guide panel */
            <div className="rounded-2xl glass border border-white/10 p-6 space-y-5">
              <div className="flex items-center gap-2 text-amber-400">
                <Info className="h-4 w-4" />
                <h3 className="font-display font-semibold text-sm tracking-wide text-white uppercase">
                  Guia del Pasaporte
                </h3>
              </div>
              <p className="text-xs text-muted-fg leading-relaxed">
                Haz clic sobre cualquier sello colocado en la pagina de
                pasaporte para inspeccionar su trazabilidad completa: procedencia
                fisica en tienda, fecha exacta de tinta y relacion tematica.
              </p>
              <div className="space-y-3 pt-2">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <p className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    Independencia de Fechas
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    La fecha de estampado (
                    <code className="text-amber-300">stamped_at</code>) es
                    independiente de las visitas turisticas de ciudad (
                    <code className="text-amber-300">visited_at</code>).
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <p className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" />
                    Categorias Extensibles
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    Soporta sellos de Ciudad, Tienda LEGO, Aeropuerto,
                    Terminales, Tematicos (Pride, World Cup) y Ediciones
                    Anuales (2026).
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <p className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-400" />
                    Diseno Unico Coleccionable
                  </p>
                  <p className="text-[11px] text-muted-fg">
                    Cada diseno de sello se posee una unica vez en la
                    coleccion fisica.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}