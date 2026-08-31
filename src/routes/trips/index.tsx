import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Compass, Plus, Search, Globe2, MapPin,
  Calendar, Trash2, Edit3, Sparkles, Plane, Train, Car,
  Eye, EyeOff, Check, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  listTrips, listCities, listCountries, insertTrip, updateTrip, deleteTrip,
  type Trip, type City, type Country,
} from "@/lib/trips/trips-repo";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trips/")({
  component: TripsPage,
});

const KNOWN_CITIES_GEO: Record<string, { country: string; region: string; continent: string }> = {
  "copenhague": { country: "Dinamarca", region: "Hovedstaden", continent: "Europa" },
  "copenhagen": { country: "Dinamarca", region: "Hovedstaden", continent: "Europa" },
  "hillerod": { country: "Dinamarca", region: "Hillerød", continent: "Europa" },
  "helsingor": { country: "Dinamarca", region: "Hovedstaden", continent: "Europa" },
  "roskilde": { country: "Dinamarca", region: "Sjælland", continent: "Europa" },
  "christiania": { country: "Dinamarca", region: "Hovedstaden", continent: "Europa" },
  "malmo": { country: "Suecia", region: "Skåne", continent: "Europa" },
  "estocolmo": { country: "Suecia", region: "Stockholm", continent: "Europa" },
  "gotemburgo": { country: "Suecia", region: "Västra Götaland", continent: "Europa" },
  "oslo": { country: "Noruega", region: "Østlandet", continent: "Europa" },
  "bergen": { country: "Noruega", region: "Vestland", continent: "Europa" },
  "helsinki": { country: "Finlandia", region: "Uusimaa", continent: "Europa" },
  "madrid": { country: "España", region: "Comunidad de Madrid", continent: "Europa" },
  "barcelona": { country: "España", region: "Cataluña", continent: "Europa" },
  "sevilla": { country: "España", region: "Andalucía", continent: "Europa" },
  "valencia": { country: "España", region: "Comunidad Valenciana", continent: "Europa" },
  "bilbao": { country: "España", region: "País Vasco", continent: "Europa" },
  "san sebastian": { country: "España", region: "País Vasco", continent: "Europa" },
  "donostia": { country: "España", region: "País Vasco", continent: "Europa" },
  "salamanca": { country: "España", region: "Castilla y León", continent: "Europa" },
  "alicante": { country: "España", region: "Comunidad Valenciana", continent: "Europa" },
  "granada": { country: "España", region: "Andalucía", continent: "Europa" },
  "cordoba": { country: "España", region: "Andalucía", continent: "Europa" },
  "malaga": { country: "España", region: "Andalucía", continent: "Europa" },
  "toledo": { country: "España", region: "Castilla-La Mancha", continent: "Europa" },
  "zaragoza": { country: "España", region: "Aragón", continent: "Europa" },
  "santiago de compostela": { country: "España", region: "Galicia", continent: "Europa" },
  "a coruna": { country: "España", region: "Galicia", continent: "Europa" },
  "pontevedra": { country: "España", region: "Galicia", continent: "Europa" },
  "vigo": { country: "España", region: "Galicia", continent: "Europa" },
  "pamplona": { country: "España", region: "Navarra", continent: "Europa" },
  "oviedo": { country: "España", region: "Asturias", continent: "Europa" },
  "gijon": { country: "España", region: "Asturias", continent: "Europa" },
  "santander": { country: "España", region: "Cantabria", continent: "Europa" },
  "palma": { country: "España", region: "Islas Baleares", continent: "Europa" },
  "palma de mallorca": { country: "España", region: "Islas Baleares", continent: "Europa" },
  "ibiza": { country: "España", region: "Islas Baleares", continent: "Europa" },
  "bruselas": { country: "Bélgica", region: "Región de Bruselas", continent: "Europa" },
  "gante": { country: "Bélgica", region: "Flandes Oriental", continent: "Europa" },
  "brujas": { country: "Bélgica", region: "Flandes Occidental", continent: "Europa" },
  "amberes": { country: "Bélgica", region: "Provincia de Amberes", continent: "Europa" },
  "lovaina": { country: "Bélgica", region: "Brabante Flamenco", continent: "Europa" },
  "amsterdam": { country: "Países Bajos", region: "Holanda Septentrional", continent: "Europa" },
  "roterdam": { country: "Países Bajos", region: "Holanda Meridional", continent: "Europa" },
  "rotterdam": { country: "Países Bajos", region: "Holanda Meridional", continent: "Europa" },
  "la haya": { country: "Países Bajos", region: "Holanda Meridional", continent: "Europa" },
  "utrecht": { country: "Países Bajos", region: "Provincia de Utrecht", continent: "Europa" },
  "lisboa": { country: "Portugal", region: "Área Metropolitana de Lisboa", continent: "Europa" },
  "porto": { country: "Portugal", region: "Norte", continent: "Europa" },
  "oporto": { country: "Portugal", region: "Norte", continent: "Europa" },
  "sintra": { country: "Portugal", region: "Gran Lisboa", continent: "Europa" },
  "coimbra": { country: "Portugal", region: "Região Centro", continent: "Europa" },
  "nazare": { country: "Portugal", region: "Leiria", continent: "Europa" },
  "fatima": { country: "Portugal", region: "Santarém", continent: "Europa" },
  "paris": { country: "Francia", region: "Île-de-France", continent: "Europa" },
  "londres": { country: "Reino Unido", region: "Gran Londres", continent: "Europa" },
  "roma": { country: "Italia", region: "Lacio", continent: "Europa" },
  "berlin": { country: "Alemania", region: "Berlín", continent: "Europa" },
  "ciudad del cabo": { country: "Sudáfrica", region: "Cabo Occidental", continent: "África" },
  "andorra la vella": { country: "Andorra", region: "Andorra la Vella", continent: "Europa" },
};

function normalizeName(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

interface TempCityEntry {
  id?: string;
  name: string;
  country: string;
  region: string;
  date: string;
  hasPin: boolean;
}

function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterTransport, setFilterTransport] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"trips" | "cities">("trips");
  const [showPinCode, setShowPinCode] = useState(false);

  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [tripName, setTripName] = useState("");
  const [tripDescription, setTripDescription] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [tripTransport, setTripTransport] = useState("Avión");
  const [tripPurpose, setTripPurpose] = useState("Vacaciones familiares");
  const [tripCitiesList, setTripCitiesList] = useState<TempCityEntry[]>([]);
  const [tempCityInput, setTempCityInput] = useState("");
  const [tempCityDateInput, setTempCityDateInput] = useState("");
  const [tempCityPinInput, setTempCityPinInput] = useState(true);
  const [tripSaving, setTripSaving] = useState(false);

  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [cityName, setCityName] = useState("");
  const [cityCountry, setCityCountry] = useState("España");
  const [cityRegion, setCityRegion] = useState("");
  const [cityContinent, setCityContinent] = useState("Europa");
  const [cityStartDate, setCityStartDate] = useState("");
  const [cityEndDate, setCityEndDate] = useState("");
  const [cityHasPin, setCityHasPin] = useState(true);
  const [cityTripId, setCityTripId] = useState("none");
  const [citySaving, setCitySaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tripsData, citiesData, countriesData] = await Promise.all([
        listTrips().catch(() => []),
        listCities().catch(() => []),
        listCountries().catch(() => []),
      ]);
      setTrips(tripsData);
      setCities(citiesData);
      setCountries(countriesData);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCityNameChange = (val: string) => {
    setCityName(val);
    const norm = normalizeName(val);
    const geo = KNOWN_CITIES_GEO[norm];
    if (geo) {
      setCityCountry(geo.country);
      setCityRegion(geo.region);
      setCityContinent(geo.continent);
    }
  };

  const addCityToTripList = () => {
    if (!tempCityInput.trim()) return;
    const norm = normalizeName(tempCityInput);
    const geo = KNOWN_CITIES_GEO[norm] ?? { country: "España", region: "", continent: "Europa" };
    setTripCitiesList((prev) => [
      ...prev,
      {
        name: tempCityInput.trim(),
        country: geo.country,
        region: geo.region,
        date: tempCityDateInput || tripStartDate || "",
        hasPin: tempCityPinInput,
      },
    ]);
    setTempCityInput("");
    setTempCityDateInput("");
  };

  const removeCityFromTripList = (idx: number) => {
    setTripCitiesList((prev) => prev.filter((_, i) => i !== idx));
  };

  const openCreateTrip = () => {
    setEditingTrip(null);
    setTripName(""); setTripDescription(""); setTripStartDate(""); setTripEndDate("");
    setTripTransport("Avión"); setTripPurpose("Vacaciones familiares");
    setTripCitiesList([]);
    setTempCityInput(""); setTempCityDateInput(""); setTempCityPinInput(true);
    setTripModalOpen(true);
  };

  const openEditTrip = (t: Trip) => {
    setEditingTrip(t);
    setTripName(t.name); setTripDescription(t.notes ?? "");
    setTripStartDate(t.start_date ?? ""); setTripEndDate(t.end_date ?? "");
    setTripTransport(t.transport ?? "Avión"); setTripPurpose(t.description ?? "Vacaciones familiares");
    
    const existing = cities.filter((c) => c.trip_id === t.id).map((c) => ({
      id: c.id,
      name: c.name,
      country: c.country,
      region: c.region ?? "",
      date: c.start_date ?? "",
      hasPin: c.has_pin,
    }));
    setTripCitiesList(existing);
    setTempCityInput(""); setTempCityDateInput(""); setTempCityPinInput(true);
    setTripModalOpen(true);
  };

  const handleSaveTrip = async () => {
    if (!tripName.trim()) { toast.error("El nombre del viaje es obligatorio"); return; }
    setTripSaving(true);
    try {
      let savedTripId = editingTrip?.id;
      if (editingTrip) {
        await updateTrip(editingTrip.id, {
          name: tripName,
          description: tripPurpose,
          start_date: tripStartDate || null,
          end_date: tripEndDate || null,
          transport: tripTransport,
          notes: tripDescription,
        });
        toast.success("Viaje actualizado");
      } else {
        const created = await insertTrip({
          name: tripName,
          description: tripPurpose,
          start_date: tripStartDate || null,
          end_date: tripEndDate || null,
          transport: tripTransport,
          notes: tripDescription,
        });
        savedTripId = created.id;
        toast.success("Viaje creado con éxito");
      }

      if (savedTripId && tripCitiesList.length > 0) {
        for (const c of tripCitiesList) {
          if (!c.id) {
            const norm = normalizeName(c.name);
            const geo = KNOWN_CITIES_GEO[norm] ?? { country: c.country || "España", region: c.region || "", continent: "Europa" };
            await supabase.from("cities").insert({
              trip_id: savedTripId,
              name: c.name,
              country: geo.country,
              region: geo.region || null,
              continent: geo.continent,
              start_date: c.date || tripStartDate || null,
              end_date: c.date || tripEndDate || null,
              has_pin: c.hasPin,
              pin_code: `${c.name.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
            });
          }
        }
      }

      setTripModalOpen(false);
      loadData();
    } catch {
      toast.error("Error al guardar el viaje");
    } finally {
      setTripSaving(false);
    }
  };

  const handleDeleteTrip = async (id: string) => {
    if (!confirm("¿Eliminar este viaje y desvincular sus ciudades?")) return;
    try {
      await deleteTrip(id);
      toast.success("Viaje eliminado");
      loadData();
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const openCreateCity = () => {
    setEditingCity(null);
    setCityName(""); setCityCountry("España"); setCityRegion(""); setCityContinent("Europa");
    setCityStartDate(""); setCityEndDate(""); setCityHasPin(true); setCityTripId("none");
    setCityModalOpen(true);
  };

  const openEditCity = (c: City) => {
    setEditingCity(c);
    setCityName(c.name);
    setCityCountry(c.country);
    setCityRegion(c.region ?? "");
    setCityContinent(c.continent ?? "Europa");
    setCityStartDate(c.start_date ?? "");
    setCityEndDate(c.end_date ?? "");
    setCityHasPin(c.has_pin);
    setCityTripId(c.trip_id ?? "none");
    setCityModalOpen(true);
  };

  const handleSaveCity = async () => {
    if (!cityName.trim()) { toast.error("El nombre de la ciudad es obligatorio"); return; }
    setCitySaving(true);
    try {
      const norm = normalizeName(cityName);
      const geo = KNOWN_CITIES_GEO[norm];
      const finalRegion = cityRegion.trim() || geo?.region || null;
      const finalCountry = cityCountry.trim() || geo?.country || "España";
      const finalContinent = cityContinent.trim() || geo?.continent || "Europa";

      if (editingCity) {
        const { error } = await supabase.from("cities").update({
          trip_id: cityTripId === "none" ? null : cityTripId,
          name: cityName.trim(),
          country: finalCountry,
          region: finalRegion,
          continent: finalContinent,
          start_date: cityStartDate || null,
          end_date: cityEndDate || null,
          has_pin: cityHasPin,
        }).eq("id", editingCity.id);
        if (error) throw error;
        toast.success("Ciudad modificada ✓");
      } else {
        const { error } = await supabase.from("cities").insert({
          trip_id: cityTripId === "none" ? null : cityTripId,
          name: cityName.trim(),
          country: finalCountry,
          region: finalRegion,
          continent: finalContinent,
          start_date: cityStartDate || null,
          end_date: cityEndDate || null,
          has_pin: cityHasPin,
          pin_code: `${cityName.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
        });
        if (error) throw error;
        toast.success("Ciudad registrada ✓");
      }

      setCityModalOpen(false);
      loadData();
    } catch {
      toast.error("Error al guardar la ciudad");
    } finally {
      setCitySaving(false);
    }
  };

  const handleDeleteCity = async (id: string) => {
    if (!confirm("¿Eliminar esta ciudad del registro?")) return;
    try {
      const { error } = await supabase.from("cities").delete().eq("id", id);
      if (error) throw error;
      toast.success("Ciudad eliminada");
      loadData();
    } catch {
      toast.error("Error al eliminar la ciudad");
    }
  };

  const filteredTrips = useMemo(() => trips.filter((t) => {
    if (filterTransport !== "all" && t.transport !== filterTransport) return false;
    if (search) {
      const s = search.toLowerCase();
      return t.name.toLowerCase().includes(s) || !!t.description?.toLowerCase().includes(s);
    }
    return true;
  }), [trips, filterTransport, search]);

  const filteredCities = useMemo(() => cities.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.country.toLowerCase().includes(s) || !!c.region?.toLowerCase().includes(s);
  }), [cities, search]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-white">Mis Viajes</h2>
          <p className="text-muted-fg text-xs mt-1 leading-relaxed">Historial de expediciones, transportes, múltiples ciudades y registro de pines.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openCreateCity} variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs h-10 px-4 rounded-xl gap-2">
            <Building2 className="h-4 w-4 text-cyan" /> Añadir Ciudad
          </Button>
          <Button onClick={openCreateTrip} className="bg-gradient-to-r from-violet to-cyan text-white font-semibold text-xs px-5 h-10 rounded-xl shadow-[0_0_20px_-4px_rgba(108,99,255,0.5)] gap-2 hover:opacity-95">
            <Plus className="h-4 w-4" /> Añadir Viaje
          </Button>
        </div>
      </div>

      <div className="glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-56">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
            <Input placeholder="Buscar viaje o ciudad..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl" />
          </div>
          <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-xl border border-white/10">
            <button onClick={() => setFilterTransport("all")} className={cn("px-2.5 py-1 text-xs font-medium rounded-lg transition-all", filterTransport === "all" ? "bg-white/15 text-white" : "text-muted-fg hover:text-white")}>Todos</button>
            <button onClick={() => setFilterTransport("Avión")} className={cn("flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all", filterTransport === "Avión" ? "bg-gradient-to-r from-cyan/30 to-cyan/10 text-cyan border border-cyan/30" : "text-muted-fg hover:text-white")}>
              <Plane className="h-3 w-3" /> Avión
            </button>
            <button onClick={() => setFilterTransport("AVE/Tren")} className={cn("flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all", filterTransport === "AVE/Tren" ? "bg-gradient-to-r from-violet/30 to-violet/10 text-violet border border-violet/30" : "text-muted-fg hover:text-white")}>
              <Train className="h-3 w-3" /> Tren
            </button>
            <button onClick={() => setFilterTransport("Coche")} className={cn("flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all", filterTransport === "Coche" ? "bg-gradient-to-r from-coral/30 to-coral/10 text-coral border border-coral/30" : "text-muted-fg hover:text-white")}>
              <Car className="h-3 w-3" /> Coche
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "cities" && (
            <Button variant="ghost" size="sm" onClick={() => setShowPinCode(!showPinCode)} className="h-8 text-xs text-muted-fg hover:text-white gap-1.5 px-2.5 rounded-lg">
              {showPinCode ? <EyeOff className="h-3.5 w-3.5 text-cyan" /> : <Eye className="h-3.5 w-3.5" />}
              {showPinCode ? "Ocultar Códigos" : "Ver Códigos"}
            </Button>
          )}
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10">
            <button onClick={() => setActiveTab("trips")} className={cn("text-xs font-medium rounded-lg h-7 px-3 transition-all", activeTab === "trips" ? "bg-white/15 text-white" : "text-muted-fg hover:text-white")}>
              Viajes ({filteredTrips.length})
            </button>
            <button onClick={() => setActiveTab("cities")} className={cn("text-xs font-medium rounded-lg h-7 px-3 transition-all", activeTab === "cities" ? "bg-white/15 text-white" : "text-muted-fg hover:text-white")}>
              Ciudades ({filteredCities.length})
            </button>
          </div>
        </div>
      </div>

      {activeTab === "trips" ? (
        <div className="glass rounded-2xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-white/90">
              <thead className="bg-white/[0.03] text-muted-fg font-medium text-[11px] border-b border-white/10">
                <tr>
                  <th className="py-3.5 px-5">Transporte</th>
                  <th className="py-3.5 px-5">Nombre del Viaje</th>
                  <th className="py-3.5 px-5">Ciudades</th>
                  <th className="py-3.5 px-5">Motivo</th>
                  <th className="py-3.5 px-5">Fechas</th>
                  <th className="py-3.5 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredTrips.map((t) => {
                  const tripCities = cities.filter((c) => c.trip_id === t.id);

                  return (
                    <tr key={t.id} className="hover:bg-white/[0.025] transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-[11px] text-cyan">
                          {t.transport === "Avión" && <Plane className="h-3.5 w-3.5" />}
                          {t.transport === "AVE/Tren" && <Train className="h-3.5 w-3.5 text-violet" />}
                          {t.transport === "Coche" && <Car className="h-3.5 w-3.5 text-coral" />}
                          {t.transport}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 min-w-[180px]">
                        <p className="font-semibold text-white">{t.name}</p>
                        {t.notes && <p className="text-muted-fg text-[11px] truncate max-w-xs mt-0.5">{t.notes}</p>}
                      </td>
                      <td className="py-3.5 px-5">
                        {tripCities.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tripCities.map((tc) => (
                              <span key={tc.id} className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/80">
                                {tc.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-fg text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-muted-fg">{t.description || "—"}</td>
                      <td className="py-3.5 px-5 text-muted-fg whitespace-nowrap">
                        {t.start_date ? new Date(t.start_date).toLocaleDateString("es") : "—"}
                        {t.end_date && ` → ${new Date(t.end_date).toLocaleDateString("es")}`}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditTrip(t)} className="h-7 w-7 p-0 text-muted-fg hover:text-white rounded-lg">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteTrip(t.id)} className="h-7 w-7 p-0 text-coral hover:text-white hover:bg-coral/20 rounded-lg">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-white/90">
              <thead className="bg-white/[0.03] text-muted-fg font-medium text-[11px] border-b border-white/10">
                <tr>
                  <th className="py-3.5 px-5">Ciudad</th>
                  <th className="py-3.5 px-5">País / Región</th>
                  <th className="py-3.5 px-5">Fecha Inicio / Fin</th>
                  <th className="py-3.5 px-5">Pin Físico</th>
                  {showPinCode && <th className="py-3.5 px-5 font-mono">Código</th>}
                  <th className="py-3.5 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredCities.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.025] transition-colors">
                    <td className="py-3.5 px-5 font-medium text-white">{c.name}</td>
                    <td className="py-3.5 px-5">
                      <span>{c.country}</span>
                      {c.region && <span className="text-muted-fg text-[11px] block">{c.region}</span>}
                    </td>
                    <td className="py-3.5 px-5 text-muted-fg whitespace-nowrap">
                      {c.start_date ? new Date(c.start_date).toLocaleDateString("es") : "—"}
                      {c.end_date && ` → ${new Date(c.end_date).toLocaleDateString("es")}`}
                    </td>
                    <td className="py-3.5 px-5">
                      {c.has_pin
                        ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"><Check className="h-3 w-3" /> Tengo Pin</span>
                        : <span className="text-muted-fg text-[11px]">Sin pin</span>
                      }
                    </td>
                    {showPinCode && <td className="py-3.5 px-5 font-mono text-cyan text-[11px]">{c.pin_code ?? "—"}</td>}
                    <td className="py-3.5 px-5 text-right whitespace-nowrap space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditCity(c)} className="h-7 w-7 p-0 text-muted-fg hover:text-white rounded-lg">
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCity(c.id)} className="h-7 w-7 p-0 text-coral hover:text-white hover:bg-coral/20 rounded-lg">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trip Modal (Create / Edit with MULTI-CITY Support) */}
      <Dialog open={tripModalOpen} onOpenChange={setTripModalOpen}>
        <DialogContent className="max-w-xl bg-[#09090e] border-white/15 text-white rounded-2xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-bold">{editingTrip ? "Editar Viaje" : "Añadir Viaje"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-fg mb-1 block">Nombre del Viaje</label>
              <Input placeholder="Ej: Dinamarca y Suecia 2024" value={tripName} onChange={(e) => setTripName(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Transporte</label>
                <Select value={tripTransport} onValueChange={setTripTransport}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#09090e] border-white/15 text-white">
                    <SelectItem value="Avión">Avión</SelectItem>
                    <SelectItem value="AVE/Tren">AVE/Tren</SelectItem>
                    <SelectItem value="Coche">Coche</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Motivo</label>
                <Select value={tripPurpose} onValueChange={setTripPurpose}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#09090e] border-white/15 text-white">
                    <SelectItem value="Vacaciones familiares">Vacaciones familiares</SelectItem>
                    <SelectItem value="Competición">Competición</SelectItem>
                    <SelectItem value="Congreso">Congreso</SelectItem>
                    <SelectItem value="Beca">Beca</SelectItem>
                    <SelectItem value="Escapada">Escapada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Fecha Inicio</label>
                <Input type="date" value={tripStartDate} onChange={(e) => setTripStartDate(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl text-xs" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Fecha Fin</label>
                <Input type="date" value={tripEndDate} onChange={(e) => setTripEndDate(e.target.value)} className="bg-white/5 border-white/10 text-white rounded-xl text-xs" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-fg mb-1 block">Descripción de Ruta / Notas</label>
              <Input placeholder="Ej: Copenhague, Hillerød, Christiania, Malmö" value={tripDescription} onChange={(e) => setTripDescription(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
            </div>

            {/* MULTI-CITY BUILDER IN TRIP */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-cyan block">Ciudades añadidas a este viaje ({tripCitiesList.length})</span>
              </div>

              {tripCitiesList.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tripCitiesList.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-xs">
                      <span className="text-white font-medium">{c.name}</span>
                      {c.region && <span className="text-[10px] text-muted-fg">({c.region})</span>}
                      {c.hasPin && <span className="text-[10px] text-emerald-400">✓ Pin</span>}
                      {!c.id && (
                        <button type="button" onClick={() => removeCityFromTripList(idx)} className="text-coral hover:text-white ml-1">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Añadir ciudad (ej: Copenhagen, Malmö...)"
                  value={tempCityInput}
                  onChange={(e) => setTempCityInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCityToTripList(); } }}
                  className="bg-white/5 border-white/10 text-white text-xs h-8 rounded-lg flex-1"
                />
                <Input
                  type="date"
                  value={tempCityDateInput}
                  onChange={(e) => setTempCityDateInput(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-xs h-8 rounded-lg w-32"
                />
                <button
                  type="button"
                  onClick={() => setTempCityPinInput(!tempCityPinInput)}
                  className={cn("text-[11px] font-medium h-8 px-2.5 rounded-lg border transition-colors whitespace-nowrap", tempCityPinInput ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-muted-fg border-white/10")}
                >
                  {tempCityPinInput ? "✓ Pin" : "Sin pin"}
                </button>
                <Button
                  type="button"
                  size="sm"
                  onClick={addCityToTripList}
                  className="h-8 text-xs bg-white/10 hover:bg-white/15 text-white rounded-lg px-3"
                >
                  Añadir
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t border-white/10">
            <Button variant="outline" onClick={() => setTripModalOpen(false)} className="bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl text-xs">Cancelar</Button>
            <Button onClick={handleSaveTrip} disabled={tripSaving} className="bg-gradient-to-r from-violet to-cyan text-white font-semibold rounded-xl text-xs">
              {tripSaving ? "Guardando..." : "Guardar Viaje"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* City Modal (Add / Edit) */}
      <Dialog open={cityModalOpen} onOpenChange={setCityModalOpen}>
        <DialogContent className="max-w-lg bg-[#09090e] border-white/15 text-white rounded-2xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-bold">{editingCity ? "Editar Ciudad" : "Añadir Ciudad"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-fg mb-1 block">Nombre de la Ciudad</label>
              <Input placeholder="Escribe la ciudad (ej: Malmö, Copenhagen...)" value={cityName} onChange={(e) => handleCityNameChange(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              <span className="text-[10px] text-muted-fg mt-1 block">Determina automáticamente región y país si no los introduces.</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">País</label>
                <Input value={cityCountry} onChange={(e) => setCityCountry(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Región</label>
                <Input value={cityRegion} onChange={(e) => setCityRegion(e.target.value)} placeholder="Ej: Skåne, Hovedstaden, Madrid..." className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Fecha Inicio</label>
                <Input type="date" value={cityStartDate} onChange={(e) => setCityStartDate(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Fecha Fin</label>
                <Input type="date" value={cityEndDate} onChange={(e) => setCityEndDate(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Asignar a Viaje</label>
                <Select value={cityTripId} onValueChange={setCityTripId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl text-xs"><SelectValue placeholder="Sin viaje" /></SelectTrigger>
                  <SelectContent className="bg-[#09090e] border-white/15 text-white">
                    <SelectItem value="none">Sin viaje específico</SelectItem>
                    {trips.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <button type="button" onClick={() => setCityHasPin(!cityHasPin)} className={cn("h-10 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all", cityHasPin ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-muted-fg border-white/10")}>
                  <Check className="h-4 w-4" /> {cityHasPin ? "Tengo Pin" : "Sin pin"}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t border-white/10">
            <Button variant="outline" onClick={() => setCityModalOpen(false)} className="bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl text-xs">Cancelar</Button>
            <Button onClick={handleSaveCity} disabled={citySaving} className="bg-gradient-to-r from-violet to-cyan text-white font-semibold rounded-xl text-xs">
              {citySaving ? "Guardando..." : "Guardar Ciudad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
