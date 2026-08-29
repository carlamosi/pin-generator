import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Globe2, Pin, BookImage, Satellite, TrendingUp, Map, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { listTrips, type Trip } from "@/lib/trips/trips-repo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
  bg: string;
  to: string;
}) {
  return (
    <Link to={to}>
      <div className={cn(
        "bg-white rounded-2xl p-5 border border-border/50 cursor-pointer transition-all duration-300 hover:-translate-y-1 group",
      )}
        style={{ boxShadow: "var(--shadow-float)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-lift)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-float)"; }}
      >
        <div className="flex items-start justify-between">
          <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-3xl font-bold mt-4 tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
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
      <div className={cn(
        "flex items-center gap-4 p-4 rounded-2xl bg-white border border-border/50 cursor-pointer transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 group",
      )}>
        <div className={`h-10 w-10 rounded-xl ${accent} flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
    </Link>
  );
}

function WorldMapSvg({ countries }: { countries: Set<string> }) {
  // Simplified world map visual with highlighted country badges
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100/60 min-h-48 flex flex-col items-center justify-center gap-4">
      <Map className="h-10 w-10 text-blue-400" />
      <div className="text-center">
        <p className="text-sm font-semibold text-blue-900">Países visitados</p>
        <p className="text-xs text-blue-600/70 mt-1">El mapamundi interactivo llega en la Fase 3</p>
      </div>
      {countries.size > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
          {[...countries].slice(0, 12).map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">
              {c}
            </Badge>
          ))}
          {countries.size > 12 && (
            <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800">
              +{countries.size - 12} más
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [pinCount, setPinCount] = useState(0);
  const [nfcCount, setNfcCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tripsData, { count: pinsTotal }, { count: nfcTotal }] = await Promise.all([
          listTrips(),
          supabase.from("pins").select("id", { count: "exact", head: true }),
          supabase.from("pins").select("id", { count: "exact", head: true }).not("nfc_uid", "is", null),
        ]);
        setTrips(tripsData);
        setPinCount(pinsTotal ?? 0);
        setNfcCount(nfcTotal ?? 0);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const countries = new Set(trips.map((t) => t.country).filter(Boolean));
  const recentTrips = trips.slice(0, 5);

  return (
    <div className="p-6 space-y-6 animate-float-in">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Bienvenida de vuelta 👋
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Tu colección de pines del mundo, centralizada y siempre al día.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Globe2} label="Viajes registrados" value={trips.length} color="text-blue-600" bg="bg-blue-50" to="/trips" />
        <StatCard icon={Map} label="Países visitados" value={countries.size} color="text-emerald-600" bg="bg-emerald-50" to="/trips" />
        <StatCard icon={Pin} label="Pines en colección" value={pinCount} color="text-violet-600" bg="bg-violet-50" to="/collection" />
        <StatCard icon={BookImage} label="Páginas del álbum" value={Math.max(1, Math.ceil(pinCount / 12))} color="text-amber-600" bg="bg-amber-50" to="/collection" />
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* World Map */}
        <div className="col-span-3 space-y-4">
          <WorldMapSvg countries={countries} />

          {/* Recent Trips */}
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Viajes recientes</h3>
              <Link to="/trips">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7">
                  Ver todos
                </Button>
              </Link>
            </div>
            <div className="divide-y divide-border/40">
              {recentTrips.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aún no tienes viajes. ¡Añade el primero!
                </p>
              ) : (
                recentTrips.map((trip) => (
                  <div key={trip.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/80 transition-colors">
                    <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Globe2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{trip.name}</p>
                      <p className="text-xs text-muted-foreground">{trip.country}{trip.region ? ` · ${trip.region}` : ""}</p>
                    </div>
                    {trip.start_date && (
                      <Badge variant="outline" className="text-[10px] flex-shrink-0">
                        {new Date(trip.start_date).getFullYear()}
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="col-span-2 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider px-1">Acciones rápidas</h3>
          <div className="space-y-2.5">
            <QuickAction
              icon={Wand2}
              label="Procesar nuevo pin"
              description="Quitar fondo, medir y guardar"
              to="/studio"
              accent="bg-violet-500"
            />
            <QuickAction
              icon={Globe2}
              label="Añadir viaje"
              description="Registrar un nuevo destino"
              to="/trips"
              accent="bg-blue-500"
            />
            <QuickAction
              icon={BookImage}
              label="Ver álbum físico"
              description="Previsualizar tus páginas de pines"
              to="/collection"
              accent="bg-amber-500"
            />
            <QuickAction
              icon={Satellite}
              label="Centro Satelital"
              description="Configurar generador de imágenes"
              to="/generator"
              accent="bg-slate-700"
            />
          </div>

          {/* NFC Status */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-4 mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-emerald-900">Estado NFC</p>
              <Badge className="bg-emerald-100 text-emerald-800 text-[10px] border-emerald-200">
                Infraestructura activa
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-emerald-700">Pines con NFC</span>
                <span className="font-semibold text-emerald-900">{nfcCount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-emerald-700">Pendientes de vincular</span>
                <span className="font-semibold text-emerald-900">{pinCount - nfcCount}</span>
              </div>
            </div>
            <p className="text-[10px] text-emerald-600/80">
              Listos para el álbum físico con chips NFC.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
