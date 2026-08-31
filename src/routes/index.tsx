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
  glowClass,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sublabel?: string;
  accentClass: string;
  glowClass: string;
  to: string;
}) {
  return (
    <Link to={to} className="block group">
      <div
        className={cn(
          "relative rounded-3xl p-6 glass transition-all duration-300",
          "hover:-translate-y-1.5 hover:border-white/20 hover:bg-white/[0.07]",
          glowClass
        )}
      >
        <div className="flex items-start justify-between">
          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 shadow-inner", accentClass)}>
            <Icon className="h-6 w-6" />
          </div>
          <ArrowRight className="h-4 w-4 text-muted-fg group-hover:text-white group-hover:translate-x-1 transition-all" />
        </div>

        <div className="mt-5 space-y-1">
          <p className="font-display text-4xl font-extrabold tracking-tight text-white">
            {value}
          </p>
          <p className="text-xs font-semibold text-white/90 tracking-wide uppercase">
            {label}
          </p>
          {sublabel && (
            <p className="text-[11px] font-mono text-muted-fg">
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
  glowColor,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  to: string;
  glowColor: string;
  iconColor: string;
}) {
  return (
    <Link to={to} className="block group">
      <div className="flex items-center gap-4 p-4 rounded-2xl glass hover:bg-white/[0.08] hover:border-white/20 transition-all duration-200">
        <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 flex-shrink-0 transition-transform duration-200 group-hover:scale-105", glowColor)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-sm text-white group-hover:text-cyan transition-colors">
            {label}
          </p>
          <p className="text-xs text-muted-fg truncate mt-0.5">
            {description}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-fg/40 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      </div>
    </Link>
  );
}

function DashboardPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [pins, setPins] = useState<FullPin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tripsData, citiesData, countriesData, pinsData] = await Promise.all([
          listTrips(),
          listCities(),
          listCountries(),
          listAllPins(),
        ]);
        setTrips(tripsData);
        setCities(citiesData);
        setCountries(countriesData);
        setPins(pinsData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const nfcCount = useMemo(() => pins.filter((p) => p.nfc_uid).length, [pins]);
  const featuredPins = useMemo(() => pins.slice(0, 3), [pins]);

  return (
    <div className="space-y-8 animate-float-in max-w-7xl mx-auto pb-12">
      {/* Hero Headline */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-mono tracking-widest text-cyan uppercase bg-cyan/10 px-2.5 py-1 rounded-full border border-cyan/20">
              Orbita · Sistema de Archivo Geográfico
            </span>
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white">
            Panel de Control de Viajes y Pines
          </h2>
          <p className="text-muted-fg text-sm mt-1 max-w-2xl leading-relaxed">
            Plataforma cinematográfica para catalogar pines físicos, simular cartulinas satelitales y explorar rutas por el mundo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className="bg-neon/15 text-neon border-neon/30 gap-2 py-1.5 px-3.5 shadow-[0_0_16px_-4px_#00ffb2]">
            <span className="h-2 w-2 rounded-full bg-neon animate-pulse" />
            <span className="font-mono text-xs">{nfcCount} Pines NFC Listos</span>
          </Badge>
        </div>
      </div>

      {/* Atmospheric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={Globe2}
          label="Viajes Registrados"
          value={trips.length}
          sublabel="Excel completamente sincronizado"
          accentClass="text-cyan"
          glowClass="hover:shadow-[0_0_40px_-8px_rgba(0,212,255,0.4)]"
          to="/trips"
        />
        <StatCard
          icon={MapPin}
          label="Ciudades Cruzadas"
          value={cities.length}
          sublabel={`${countries.length} países en el catálogo`}
          accentClass="text-violet"
          glowClass="hover:shadow-[0_0_40px_-8px_rgba(108,99,255,0.4)]"
          to="/trips"
        />
        <StatCard
          icon={Pin}
          label="Pines Físicos"
          value={pins.length}
          sublabel={`${nfcCount} vinculados por NFC`}
          accentClass="text-coral"
          glowClass="hover:shadow-[0_0_40px_-8px_rgba(255,107,107,0.4)]"
          to="/collection"
        />
        <StatCard
          icon={BookImage}
          label="Páginas de Álbum"
          value={Math.max(1, Math.ceil(pins.length / 12))}
          sublabel="Formato físico 3×4 (12 pines/pág)"
          accentClass="text-neon"
          glowClass="hover:shadow-[0_0_40px_-8px_rgba(0,255,178,0.4)]"
          to="/collection"
        />
      </div>

      {/* Main Grid: Destinations & Showcase */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left 7 Columns: Countries & Recent Journeys */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          {/* Countries Vault */}
          <div className="glass rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-cyan" />
                <h3 className="font-display font-semibold text-sm tracking-wide text-white uppercase">
                  Bóveda de Países Visitados
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-fg">{countries.length} banderas</span>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              {countries.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 transition-colors cursor-default"
                >
                  <span className="text-sm">{c.flag}</span>
                  <span className="text-xs font-medium text-white/90">{c.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Trips Table */}
          <div className="glass rounded-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-violet" />
                <h3 className="font-display font-semibold text-sm tracking-wide text-white uppercase">
                  Últimos Viajes Registrados
                </h3>
              </div>
              <Link to="/trips">
                <Button variant="ghost" size="sm" className="text-xs text-cyan hover:text-white hover:bg-white/5 h-7 font-mono">
                  Ver todos ({trips.length}) →
                </Button>
              </Link>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {trips.slice(0, 5).map((trip) => (
                <div
                  key={trip.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 text-base">
                      {trip.transport === "Avión" ? "✈️" : trip.transport === "AVE/Tren" ? "🚆" : "🚗"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-white truncate">{trip.name}</p>
                      <p className="text-xs text-muted-fg truncate mt-0.5">{trip.description}</p>
                    </div>
                  </div>
                  {trip.start_date && (
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-muted-fg flex-shrink-0 ml-3">
                      {new Date(trip.start_date).getFullYear()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Quick Actions & Live Showcase */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          {/* Quick Actions Dock */}
          <div className="glass rounded-3xl p-6 space-y-3">
            <h3 className="font-display font-semibold text-xs text-muted-fg uppercase tracking-wider px-1">
              Módulos del Sistema
            </h3>
            <div className="space-y-2.5 pt-1">
              <QuickAction
                icon={Wand2}
                label="El Estudio"
                description="Subir fotos sueltas, lote ZIP o cámara"
                to="/studio"
                glowColor="shadow-[0_0_20px_-4px_rgba(0,212,255,0.5)]"
                iconColor="text-cyan"
              />
              <QuickAction
                icon={BookImage}
                label="Mi Álbum Físico"
                description="Cartulinas terminadas en orden cronológico"
                to="/collection"
                glowColor="shadow-[0_0_20px_-4px_rgba(255,107,107,0.5)]"
                iconColor="text-coral"
              />
              <QuickAction
                icon={Satellite}
                label="Centro Satelital"
                description="Encuadre, zoom y datos en tiempo real"
                to="/generator"
                glowColor="shadow-[0_0_20px_-4px_rgba(0,255,178,0.5)]"
                iconColor="text-neon"
              />
              <QuickAction
                icon={Compass}
                label="Mis Viajes"
                description="Gestión integral de rutas y ciudades"
                to="/trips"
                glowColor="shadow-[0_0_20px_-4px_rgba(108,99,255,0.5)]"
                iconColor="text-violet"
              />
            </div>
          </div>

          {/* Featured Cards Showcase */}
          {featuredPins.length > 0 && (
            <div className="glass-strong rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-neon" />
                  <h3 className="font-display font-semibold text-sm tracking-wide text-white uppercase">
                    Cartulinas en Exhibición
                  </h3>
                </div>
                <Link to="/collection">
                  <span className="text-xs font-mono text-cyan hover:underline">Abrir Álbum →</span>
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
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
