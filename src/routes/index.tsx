import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Globe2, Pin, BookImage, Satellite, TrendingUp, MapPin,
  Wand2, Wifi, Sparkles, Plane, Car, Train, ArrowRight,
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
  color,
  bg,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sublabel?: string;
  color: string;
  bg: string;
  to: string;
}) {
  return (
    <Link to={to}>
      <div
        className="bg-white rounded-3xl p-5 border border-border/50 cursor-pointer transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden"
        style={{ boxShadow: "0 4px 20px -4px rgba(23,23,23,0.06)" }}
      >
        <div className="flex items-start justify-between">
          <div className={`h-11 w-11 rounded-2xl ${bg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
        <p className="text-3xl font-extrabold mt-4 tracking-tight text-slate-900">{value}</p>
        <p className="text-xs font-semibold text-slate-600 mt-1">{label}</p>
        {sublabel && <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
    </Link>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  to,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  to: string;
  accent: string;
}) {
  return (
    <Link to={to}>
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-border/50 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm group">
        <div className={`h-10 w-10 rounded-xl ${accent} flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-sm`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-900 group-hover:text-primary transition-colors">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors flex-shrink-0" />
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

  const nfcLinkedCount = useMemo(() => pins.filter((p) => p.nfc_uid).length, [pins]);
  const featuredPins = useMemo(() => pins.slice(0, 3), [pins]);

  return (
    <div className="p-6 space-y-6 animate-float-in max-w-7xl mx-auto">
      {/* Welcome banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Colección de Viajes y Pines
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Plataforma unificada para catalogar tus pines físicos, cartulinas satelitales y rutas por el mundo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 gap-1.5 py-1 px-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>NFC & Cloud Sincronizado</span>
          </Badge>
        </div>
      </div>

      {/* Main KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Globe2}
          label="Viajes Registrados"
          value={trips.length}
          sublabel="Excel completamente sincronizado"
          color="text-blue-600"
          bg="bg-blue-50"
          to="/trips"
        />
        <StatCard
          icon={MapPin}
          label="Ciudades en el Mapa"
          value={cities.length}
          sublabel={`${countries.length} países cruzados`}
          color="text-emerald-600"
          bg="bg-emerald-50"
          to="/trips"
        />
        <StatCard
          icon={Pin}
          label="Pines Físicos"
          value={pins.length}
          sublabel={`${nfcLinkedCount} chips NFC vinculados`}
          color="text-violet-600"
          bg="bg-violet-50"
          to="/collection"
        />
        <StatCard
          icon={BookImage}
          label="Páginas del Álbum"
          value={Math.max(1, Math.ceil(pins.length / 12))}
          sublabel="Formato físico 3×4 (12 pines/pág)"
          color="text-amber-600"
          bg="bg-amber-50"
          to="/collection"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Recent Trips & Countries */}
        <div className="col-span-12 lg:col-span-7 space-y-6">
          {/* Countries Pill Highlights */}
          <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-800">Países en tu Registro</h3>
              <span className="text-xs text-muted-foreground font-mono">{countries.length} destinos</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {countries.map((c) => (
                <Badge
                  key={c.name}
                  variant="secondary"
                  className="gap-1.5 py-1.5 px-3 bg-slate-50 border-border/60 hover:bg-slate-100 text-xs font-normal"
                >
                  <span>{c.flag}</span>
                  <span>{c.name}</span>
                </Badge>
              ))}
            </div>
          </div>

          {/* Recent Trips Table */}
          <div className="bg-white rounded-3xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-800">Últimos Viajes Registrados</h3>
              <Link to="/trips">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                  Ver todos ({trips.length})
                </Button>
              </Link>
            </div>
            <div className="divide-y divide-border/40">
              {trips.slice(0, 5).map((trip) => (
                <div
                  key={trip.id}
                  className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-sm">
                      {trip.transport === "Avión" ? "✈️" : trip.transport === "AVE/Tren" ? "🚆" : "🚗"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{trip.name}</p>
                      <p className="text-xs text-muted-foreground">{trip.description}</p>
                    </div>
                  </div>
                  {trip.start_date && (
                    <Badge variant="outline" className="text-[10px] font-mono flex-shrink-0 ml-2">
                      {new Date(trip.start_date).getFullYear()}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions & Featured Album Cards */}
        <div className="col-span-12 lg:col-span-5 space-y-6">
          {/* Quick Action Navigation */}
          <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Acciones del Sistema
            </h3>
            <div className="space-y-2.5 pt-1">
              <QuickAction
                icon={Wand2}
                label="El Estudio"
                description="Subir fotos sueltas, lote ZIP o cámara"
                to="/studio"
                accent="bg-violet-600"
              />
              <QuickAction
                icon={BookImage}
                label="Mi Álbum Físico"
                description="Ver cartulinas acabadas en orden cronológico"
                to="/collection"
                accent="bg-amber-600"
              />
              <QuickAction
                icon={Satellite}
                label="Centro Satelital"
                description="Personalizar encuadre, zoom y datos"
                to="/generator"
                accent="bg-slate-800"
              />
              <QuickAction
                icon={Globe2}
                label="Mis Viajes"
                description="Gestión completa de rutas y ciudades"
                to="/trips"
                accent="bg-blue-600"
              />
            </div>
          </div>

          {/* Featured Cards Preview */}
          {featuredPins.length > 0 && (
            <div className="bg-white rounded-3xl p-6 border border-border/50 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-slate-800">Cartulinas de Muestra</h3>
                <Link to="/collection">
                  <span className="text-xs text-primary font-medium hover:underline">Ver Álbum →</span>
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
