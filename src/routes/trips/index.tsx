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
  "hillerod": { country: "Dinamarca", region: "Hillerød", continent: "Europa" },
  "malmo": { country: "Suecia", region: "Skåne", continent: "Europa" },
  "christiania": { country: "Dinamarca", region: "Hovedstaden", continent: "Europa" },
  "madrid": { country: "España", region: "Madrid", continent: "Europa" },
  "barcelona": { country: "España", region: "Catalunya", continent: "Europa" },
  "gante": { country: "Bélgica", region: "Flandes", continent: "Europa" },
  "brujas": { country: "Bélgica", region: "Flandes", continent: "Europa" },
  "bruselas": { country: "Bélgica", region: "Bruselas", continent: "Europa" },
  "amberes": { country: "Bélgica", region: "Flandes", continent: "Europa" },
  "lisboa": { country: "Portugal", region: "Lisboa", continent: "Europa" },
  "sintra": { country: "Portugal", region: "Lisboa", continent: "Europa" },
  "coimbra": { country: "Portugal", region: "Centro", continent: "Europa" },
  "nazare": { country: "Portugal", region: "Leiria", continent: "Europa" },
  "fatima": { country: "Portugal", region: "Santarém", continent: "Europa" },
  "salamanca": { country: "España", region: "Castilla y León", continent: "Europa" },
  "alicante": { country: "España", region: "Valencia", continent: "Europa" },
  "roterdam": { country: "Países Bajos", region: "Holanda Meridional", continent: "Europa" },
  "ciudad del cabo": { country: "Sudáfrica", region: "Western Cape", continent: "África" },
  "andorra la vella": { country: "Andorra", region: "Andorra", continent: "Europa" },
};

function normalizeName(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

  // Trip modal
  const [tripModalOpen, setTripModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [tripName, setTripName] = useState("");
  const [tripDescription, setTripDescription] = useState("");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [tripTransport, setTripTransport] = useState("Avión");
  const [tripPurpose, setTripPurpose] = useState("Vacaciones familiares");
  const [tripNotes, setTripNotes] = useState("");
  const [tripSaving, setTripSaving] = useState(false);
  const [tripNewCityName, setTripNewCityName] = useState("");
  const [tripNewCityHasPin, setTripNewCityHasPin] = useState(true);
  const [tripNewCityDate, setTripNewCityDate] = useState("");

  // City modal
  const [cityModalOpen, setCityModalOpen] = useState(false);
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
    if (geo) { setCityCountry(geo.country); setCityRegion(geo.region); setCityContinent(geo.continent); }
  };

  const openCreateTrip = () => {
    setEditingTrip(null);
    setTripName(""); setTripDescription(""); setTripStartDate(""); setTripEndDate("");
    setTripTransport("Avión"); setTripPurpose("Vacaciones familiares"); setTripNotes("");
    setTripNewCityName(""); setTripNewCityHasPin(true); setTripNewCityDate("");
    setTripModalOpen(true);
  };

  const openEditTrip = (t: Trip) => {
    setEditingTrip(t);
    setTripName(t.name); setTripDescription(t.notes ?? "");
    setTripStartDate(t.start_date ?? ""); setTripEndDate(t.end_date ?? "");
    setTripTransport(t.transport ?? "Avión"); setTripPurpose(t.description ?? "Vacaciones familiares");
    setTripNotes(t.notes ?? ""); setTripNewCityName(""); setTripNewCityHasPin(true); setTripNewCityDate("");
    setTripModalOpen(true);
  };

  const handleSaveTrip = async () => {
    if (!tripName.trim()) { toast.error("El nombre del viaje es obligatorio"); return; }
    setTripSaving(true);
    try {
      let savedTripId = editingTrip?.id;
      if (editingTrip) {
        await updateTrip(editingTrip.id, { name: tripName, description: tripPurpose, start_date: tripStartDate || null, end_date: tripEndDate || null, transport: tripTransport, notes: tripDescription });
        toast.success("Viaje actualizado");
      } else {
        const created = await insertTrip({ name: tripName, description: tripPurpose, start_date: tripStartDate || null, end_date: tripEndDate || null, transport: tripTransport, notes: tripDescription });
        savedTripId = created.id;
        toast.success("Viaje creado con éxito");
      }
      if (tripNewCityName.trim() && savedTripId) {
        const norm = normalizeName(tripNewCityName);
        const geo = KNOWN_CITIES_GEO[norm] ?? { country: "España", region: "", continent: "Europa" };
        await supabase.from("cities").insert({ trip_id: savedTripId, name: tripNewCityName.trim(), country: geo.country, region: geo.region || null, continent: geo.continent, start_date: tripNewCityDate || tripStartDate || null, end_date: tripNewCityDate || tripEndDate || null, has_pin: tripNewCityHasPin, pin_code: `${tripNewCityName.slice(0,3).toUpperCase()}-${new Date().getFullYear()}` });
        toast.success(`Ciudad ${tripNewCityName} añadida ✓`);
      }
      setTripModalOpen(false);
      loadData();
    } catch { toast.error("Error al guardar el viaje"); }
    finally { setTripSaving(false); }
  };

  const handleDeleteTrip = async (id: string) => {
    if (!confirm("¿Eliminar este viaje?")) return;
    try { await deleteTrip(id); toast.success("Viaje eliminado"); loadData(); }
    catch { toast.error("Error al eliminar"); }
  };

  const handleSaveCity = async () => {
    if (!cityName.trim()) { toast.error("El nombre de la ciudad es obligatorio"); return; }
    setCitySaving(true);
    try {
      const { error } = await supabase.from("cities").insert({ trip_id: cityTripId === "none" ? null : cityTripId, name: cityName.trim(), country: cityCountry.trim() || "España", region: cityRegion.trim() || null, continent: cityContinent.trim() || "Europa", start_date: cityStartDate || null, end_date: cityEndDate || null, has_pin: cityHasPin, pin_code: `${cityName.slice(0,3).toUpperCase()}-${new Date().getFullYear()}` });
      if (error) throw error;
      toast.success("Ciudad registrada ✓");
      setCityModalOpen(false); setCityName(""); setCityRegion(""); setCityStartDate(""); setCityEndDate("");
      loadData();
    } catch { toast.error("Error al guardar la ciudad"); }
    finally { setCitySaving(false); }
  };

  const filteredTrips = useMemo(() => trips.filter((t) => {
    if (filterTransport !== "all" && t.transport !== filterTransport) return false;
    if (search) { const s = search.toLowerCase(); return t.name.toLowerCase().includes(s) || !!t.description?.toLowerCase().includes(s); }
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
          <p className="text-muted-fg text-xs mt-1 leading-relaxed">Historial de rutas, transportes, ciudades y registro de pines.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setCityModalOpen(true)} variant="outline" className="border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs h-10 px-4 rounded-xl gap-2">
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
                  <th className="py-3.5 px-5">Viaje</th>
                  <th className="py-3.5 px-5">Motivo</th>
                  <th className="py-3.5 px-5">Fechas</th>
                  <th className="py-3.5 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredTrips.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.025] transition-colors">
                    <td className="py-3.5 px-5">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                        t.transport === "Avión" && "bg-gradient-to-r from-cyan/20 to-cyan/5 text-cyan border border-cyan/20",
                        t.transport === "AVE/Tren" && "bg-gradient-to-r from-violet/20 to-violet/5 text-violet border border-violet/20",
                        t.transport === "Coche" && "bg-gradient-to-r from-coral/20 to-coral/5 text-coral border border-coral/20"
                      )}>
                        {t.transport === "Avión" && <Plane className="h-3 w-3" />}
                        {t.transport === "AVE/Tren" && <Train className="h-3 w-3" />}
                        {t.transport === "Coche" && <Car className="h-3 w-3" />}
                        {t.transport || "Avión"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 min-w-[200px]">
                      <p className="font-semibold text-white">{t.name}</p>
                      {t.notes && <p className="text-muted-fg text-[11px] truncate max-w-xs mt-0.5">{t.notes}</p>}
                    </td>
                    <td className="py-3.5 px-5 text-muted-fg">{t.description || "—"}</td>
                    <td className="py-3.5 px-5 text-muted-fg whitespace-nowrap">
                      {t.start_date ? new Date(t.start_date).toLocaleDateString("es") : "—"}
                      {t.end_date && ` → ${new Date(t.end_date).toLocaleDateString("es")}`}
                    </td>
                    <td className="py-3.5 px-5 text-right space-x-1.5">
                      <Button variant="ghost" size="sm" onClick={() => openEditTrip(t)} className="h-7 w-7 p-0 text-muted-fg hover:text-white hover:bg-white/10 rounded-md"><Edit3 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteTrip(t.id)} className="h-7 w-7 p-0 text-coral/70 hover:text-coral hover:bg-coral/10 rounded-md"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                ))}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trip Modal */}
      <Dialog open={tripModalOpen} onOpenChange={setTripModalOpen}>
        <DialogContent className="max-w-xl bg-[#09090e] border-white/15 text-white rounded-2xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-bold">{editingTrip ? "Editar Viaje" : "Añadir Viaje"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-fg mb-1 block">Nombre del Viaje</label>
              <Input placeholder="Ej: Copenhague y Malmö" value={tripName} onChange={(e) => setTripName(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
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
              <label className="text-xs font-medium text-muted-fg mb-1 block">Descripción de Ruta</label>
              <Input placeholder="Ej: Copenhague, Hillerød, Christiania, Malmö" value={tripDescription} onChange={(e) => setTripDescription(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
            </div>
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
              <span className="text-xs font-medium text-cyan block">+ Ciudad visitada en este viaje (opcional)</span>
              <div className="flex gap-2">
                <Input placeholder="Ciudad (ej: Malmö)" value={tripNewCityName} onChange={(e) => setTripNewCityName(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs h-8 rounded-lg flex-1" />
                <Input type="date" value={tripNewCityDate} onChange={(e) => setTripNewCityDate(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs h-8 rounded-lg w-36" />
                <button type="button" onClick={() => setTripNewCityHasPin(!tripNewCityHasPin)} className={cn("text-[11px] font-medium h-8 px-3 rounded-lg border transition-colors whitespace-nowrap", tripNewCityHasPin ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-white/5 text-muted-fg border-white/10")}>
                  {tripNewCityHasPin ? "✓ Pin" : "Sin pin"}
                </button>
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

      {/* City Modal */}
      <Dialog open={cityModalOpen} onOpenChange={setCityModalOpen}>
        <DialogContent className="max-w-lg bg-[#09090e] border-white/15 text-white rounded-2xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-bold">Añadir Ciudad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-fg mb-1 block">Nombre de la Ciudad</label>
              <Input placeholder="Escribe la ciudad (ej: Malmö, Copenhague...)" value={cityName} onChange={(e) => handleCityNameChange(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              <span className="text-[10px] text-muted-fg mt-1 block">Autodetecta país y región para ciudades comunes.</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">País</label>
                <Input value={cityCountry} onChange={(e) => setCityCountry(e.target.value)} className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-fg mb-1 block">Región (opcional)</label>
                <Input value={cityRegion} onChange={(e) => setCityRegion(e.target.value)} placeholder="Ej: Skåne, Catalunya..." className="bg-white/5 border-white/10 text-white text-xs rounded-xl" />
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


