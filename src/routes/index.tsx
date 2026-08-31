import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Globe2, Pin, BookImage, Satellite, Compass, Sparkles,
  Wifi, ArrowRight, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { listTrips, listCities, listCountries, listAllPins, type Trip, type City, type Country, type FullPin } from "@/lib/trips/trips-repo";
import { FinishedCard } from "@/components/FinishedCard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  accentClass,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sublabel?: string;
  accentClass: string;
  to: string;
}) {
  return (
    <Link to={to} className="block group">
      <div
        className={cn(
          "relative rounded-2xl p-5 glass transition-all duration-200",
          "hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]"
        )}
      >
        <div className="flex items-start justify-between">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10", accentClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <ArrowRight className="h-4 w-4 text-muted-fg/40 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
        </div>

        <div className="mt-4 space-y-1">
          <p className="font-display text-3xl font-bold tracking-tight text-white">
            {value}
          </p>
          <p className="text-xs font-medium text-white/80 tracking-normal">
            {label}
          </p>
          {sublabel && (
            <p className="text-[11px] font-sans text-muted-fg">
              {sublabel}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  to,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  to: string;
  iconColor: string;
}) {
  return (
    <Link to={to} className="block group">
      <div className="flex items-center gap-3.5 p-3.5 rounded-xl glass hover:bg-white/[0.06] hover:border-white/20 transition-all duration-150">
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 flex-shrink-0")}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-medium text-xs text-white group-hover:text-cyan transition-colors">
            {label}
          </p>
          <p className="text-[11px] text-muted-fg truncate mt-0.5">
            {description}
          </p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-fg/40 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}

function DashboardPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [pins, setPins] = useState<FullPin[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tripsData, citiesData, countriesData, pinsData] = await Promise.all([
          listTrips().catch(() => []),
          listCities().catch(() => []),
          listCountries().catch(() => []),
          listAllPins().catch(() => []),
        ]);
        setTrips(tripsData ?? []);
        setCities(citiesData ?? []);
        setCountries(countriesData ?? []);
        setPins(pinsData ?? []);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const nfcCount = useMemo(() => (pins ?? []).filter((p) => p?.nfc_uid).length, [pins]);
  const featuredPins = useMemo(() => (pins ?? []).slice(0, 3), [pins]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-white">
            Panel de Control
          </h2>
          <p className="text-muted-fg text-xs mt-1 max-w-2xl leading-relaxed">
            Resumen de tus viajes, catálogo de pines físicos y cartulinas satelitales.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className="bg-neon/10 text-neon border-neon/30 gap-2 py-1 px-3">
            <span className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
            <span className="text-xs font-sans">{nfcCount} Pines NFC</span>
          </Badge>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Globe2}
          label="Viajes Registrados"
          value={trips.length}
          sublabel="Base de datos completa"
          accentClass="text-cyan"
          to="/trips"
        />
        <StatCard
          icon={MapPin}
          label="Ciudades"
          value={cities.length}
          sublabel={`${countries.length} países`}
          accentClass="text-violet"
          to="/trips"
        />
        <StatCard
          icon={Pin}
          label="Pines Físicos"
          value={pins.length}
          sublabel={`${nfcCount} con chip NFC`}
          accentClass="text-coral"
          to="/collection"
        />
        <StatCard
          icon={BookImage}
          label="Páginas de Álbum"
          value={Math.max(1, Math.ceil(pins.length / 12))}
          sublabel="Formato 12 pines por página"
          accentClass="text-neon"
          to="/collection"
        />
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left: Countries & Trips */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          {/* Countries */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-cyan" />
                <h3 className="font-display font-semibold text-xs tracking-wide text-white uppercase">
                  Países Visitados
                </h3>
              </div>
              <span className="text-xs text-muted-fg">{countries.length} países</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {countries.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors cursor-default"
                >
                  <span className="text-sm">{c.flag}</span>
                  <span className="text-xs font-medium text-white/90">{c.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Trips */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-violet" />
                <h3 className="font-display font-semibold text-xs tracking-wide text-white uppercase">
                  Últimos Viajes
                </h3>
              </div>
              <Link to="/trips">
                <Button variant="ghost" size="sm" className="text-xs text-cyan hover:text-white hover:bg-white/5 h-7">
                  Ver todos ({trips.length}) →
                </Button>
              </Link>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {trips.slice(0, 5).map((trip) => {
                let yearStr = "—";
                if (trip.start_date) {
                  try {
                    const y = new Date(trip.start_date).getFullYear();
                    if (!isNaN(y)) yearStr = y.toString();
                  } catch {}
                }
                return (
                  <div
                    key={trip.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-sm">
                        {trip.transport === "Avión" ? "✈️" : trip.transport === "AVE/Tren" ? "🚆" : "🚗"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs text-white truncate">{trip.name}</p>
                        <p className="text-[11px] text-muted-fg truncate mt-0.5">{trip.description}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-white/5 border border-white/10 text-muted-fg flex-shrink-0 ml-3">
                      {yearStr}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Quick Navigation & Showcase */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-semibold text-xs text-muted-fg uppercase tracking-wide">
              Secciones
            </h3>
            <div className="space-y-2 pt-1">
              <QuickAction
                icon={Compass}
                label="Mis Viajes"
                description="Listado de expediciones y ciudades"
                to="/trips"
                iconColor="text-violet"
              />
              <QuickAction
                icon={BookImage}
                label="Mi Álbum"
                description="Cartulinas en formato físico cronológico"
                to="/collection"
                iconColor="text-coral"
              />
              <QuickAction
                icon={Satellite}
                label="Centro Satelital"
                description="Personalizar encuadre y coordenadas"
                to="/generator"
                iconColor="text-neon"
              />
            </div>
          </div>

          {featuredPins.length > 0 && (
            <div className="glass-strong rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-neon" />
                  <h3 className="font-display font-semibold text-xs tracking-wide text-white uppercase">
                    Cartulinas Destacadas
                  </h3>
                </div>
                <Link to="/collection">
                  <span className="text-xs text-cyan hover:underline">Ver Álbum →</span>
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1">
                {featuredPins.map((p) => (
                  <FinishedCard key={p.id} pin={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
