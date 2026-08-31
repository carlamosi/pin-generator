import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Compass, Plus, Search, Globe2, MapPin,
  Calendar, Trash2, Edit3, Sparkles, Plane, Train, Car,
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trips/")({
  component: TripsPage,
});

const TRANSPORT_CONFIG: Record<string, { label: string; icon: string; badgeClass: string }> = {
  "Avión": {
    label: "Avión",
    icon: "✈️",
    badgeClass: "bg-cyan/15 text-cyan border-cyan/30 shadow-[0_0_12px_-3px_rgba(0,212,255,0.4)]",
  },
  "AVE/Tren": {
    label: "AVE/Tren",
    icon: "🚆",
    badgeClass: "bg-violet/15 text-violet border-violet/30 shadow-[0_0_12px_-3px_rgba(108,99,255,0.4)]",
  },
  "Coche": {
    label: "Coche",
    icon: "🚗",
    badgeClass: "bg-coral/15 text-coral border-coral/30 shadow-[0_0_12px_-3px_rgba(255,107,107,0.4)]",
  },
};

const PURPOSE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  "Vacaciones familiares": {
    label: "Vacaciones familiares",
    badgeClass: "bg-neon/15 text-neon border-neon/30",
  },
  "Competición": {
    label: "Competición",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  "Congreso": {
    label: "Congreso",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  "Beca": {
    label: "Beca",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  "Escapada": {
    label: "Escapada",
    badgeClass: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  },
};

function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterTransport, setFilterTransport] = useState<string>("all");
  const [filterPurpose, setFilterPurpose] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"trips" | "cities">("trips");

  // Modal CRUD
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [transport, setTransport] = useState("Avión");
  const [purpose, setPurpose] = useState("Vacaciones familiares");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tripsData, citiesData, countriesData] = await Promise.all([
        listTrips(),
        listCities(),
        listCountries(),
      ]);
      setTrips(tripsData);
      setCities(citiesData);
      setCountries(countriesData);
    } catch {
      toast.error("Error al cargar los viajes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingTrip(null);
    setName("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setTransport("Avión");
    setPurpose("Vacaciones familiares");
    setNotes("");
    setModalOpen(true);
  };

  const openEditModal = (t: Trip) => {
    setEditingTrip(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setStartDate(t.start_date ?? "");
    setEndDate(t.end_date ?? "");
    setTransport(t.transport ?? "Avión");
    setPurpose(t.purpose ?? "Vacaciones familiares");
    setNotes(t.notes ?? "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("El nombre del viaje es obligatorio");
      return;
    }
    setSaving(true);
    try {
      if (editingTrip) {
        await updateTrip(editingTrip.id, {
          name,
          description,
          start_date: startDate || null,
          end_date: endDate || null,
          transport,
          purpose,
          notes,
        });
        toast.success("Viaje actualizado correctamente");
      } else {
        await insertTrip({
          name,
          description,
          start_date: startDate || null,
          end_date: endDate || null,
          transport,
          purpose,
          notes,
        });
        toast.success("Nuevo viaje creado con éxito");
      }
      setModalOpen(false);
      loadData();
    } catch {
      toast.error("Error al guardar el viaje");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Deseas eliminar este viaje permanentemente?")) return;
    try {
      await deleteTrip(id);
      toast.success("Viaje eliminado");
      loadData();
    } catch {
      toast.error("Error al eliminar el viaje");
    }
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (filterTransport !== "all" && t.transport !== filterTransport) return false;
      if (filterPurpose !== "all" && t.purpose !== filterPurpose) return false;
      if (search) {
        const s = search.toLowerCase();
        const mName = t.name.toLowerCase().includes(s);
        const mDesc = t.description?.toLowerCase().includes(s);
        if (!mName && !mDesc) return false;
      }
      return true;
    });
  }, [trips, filterTransport, filterPurpose, search]);

  const filteredCities = useMemo(() => {
    return cities.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        const mCity = c.name.toLowerCase().includes(s);
        const mCountry = c.country.toLowerCase().includes(s);
        const mPin = c.pin_code?.toLowerCase().includes(s);
        if (!mCity && !mCountry && !mPin) return false;
      }
      return true;
    });
  }, [cities, search]);

  return (
    <div className="space-y-8 animate-float-in max-w-7xl mx-auto pb-12">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-white">
            Mis Viajes y Rutas
          </h2>
          <p className="text-muted-fg text-sm mt-1 max-w-2xl">
            Catálogo completo sincronizado con tu base de datos relacional. Incluye transportes, propósitos y estado de posesión de pines.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="bg-gradient-to-r from-violet to-cyan text-white font-semibold text-xs px-5 h-11 rounded-2xl shadow-[0_0_24px_-4px_rgba(108,99,255,0.6)] gap-2 hover:opacity-95 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Añadir Viaje
        </Button>
      </div>

      {/* Control Bar & Tabs */}
      <div className="glass rounded-3xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg" />
            <Input
              placeholder="Buscar viaje, ciudad o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-xs bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl focus-visible:ring-violet"
            />
          </div>

          {/* Transport Filter */}
          <Select value={filterTransport} onValueChange={setFilterTransport}>
            <SelectTrigger className="w-44 h-10 text-xs bg-white/5 border-white/10 text-white rounded-xl">
              <SelectValue placeholder="Transporte" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
              <SelectItem value="all">Todo transporte</SelectItem>
              <SelectItem value="Avión">✈️ Avión</SelectItem>
              <SelectItem value="AVE/Tren">🚆 AVE/Tren</SelectItem>
              <SelectItem value="Coche">🚗 Coche</SelectItem>
            </SelectContent>
          </Select>

          {/* Purpose Filter */}
          <Select value={filterPurpose} onValueChange={setFilterPurpose}>
            <SelectTrigger className="w-48 h-10 text-xs bg-white/5 border-white/10 text-white rounded-xl">
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
              <SelectItem value="all">Todos los motivos</SelectItem>
              <SelectItem value="Vacaciones familiares">Vacaciones familiares</SelectItem>
              <SelectItem value="Competición">Competición</SelectItem>
              <SelectItem value="Congreso">Congreso</SelectItem>
              <SelectItem value="Beca">Beca</SelectItem>
              <SelectItem value="Escapada">Escapada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 border border-white/10">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveTab("trips")}
            className={cn(
              "text-xs font-semibold rounded-xl h-8 px-4 transition-all",
              activeTab === "trips"
                ? "bg-white/10 text-white shadow-sm"
                : "text-muted-fg hover:text-white"
            )}
          >
            Viajes ({filteredTrips.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveTab("cities")}
            className={cn(
              "text-xs font-semibold rounded-xl h-8 px-4 transition-all",
              activeTab === "cities"
                ? "bg-white/10 text-white shadow-sm"
                : "text-muted-fg hover:text-white"
            )}
          >
            Ciudades ({filteredCities.length})
          </Button>
        </div>
      </div>

      {/* Main Content: Table / Cards */}
      {activeTab === "trips" ? (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/15 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-white/90">
              <thead className="bg-white/[0.04] text-muted-fg uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                <tr>
                  <th className="py-4 px-6">Transporte</th>
                  <th className="py-4 px-6">Expedición</th>
                  <th className="py-4 px-6">Motivo</th>
                  <th className="py-4 px-6">Fechas</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredTrips.map((t) => {
                  const trans = TRANSPORT_CONFIG[t.transport ?? "Avión"] ?? TRANSPORT_CONFIG["Avión"];
                  const purp = PURPOSE_CONFIG[t.purpose ?? "Vacaciones familiares"] ?? PURPOSE_CONFIG["Vacaciones familiares"];

                  return (
                    <tr key={t.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-4 px-6">
                        <Badge className={cn("text-[11px] font-mono px-2.5 py-1 gap-1.5", trans.badgeClass)}>
                          <span>{trans.icon}</span>
                          <span>{trans.label}</span>
                        </Badge>
                      </td>
                      <td className="py-4 px-6 min-w-[200px]">
                        <p className="font-semibold text-sm text-white">{t.name}</p>
                        {t.description && (
                          <p className="text-muted-fg text-xs truncate max-w-sm mt-0.5">{t.description}</p>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <Badge className={cn("text-[10px] font-mono px-2 py-0.5", purp.badgeClass)}>
                          {purp.label}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 font-mono text-[11px] text-muted-fg whitespace-nowrap">
                        {t.start_date ? new Date(t.start_date).toLocaleDateString() : "—"}
                        {t.end_date && ` → ${new Date(t.end_date).toLocaleDateString()}`}
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(t)}
                          className="h-8 w-8 p-0 text-muted-fg hover:text-white hover:bg-white/10 rounded-lg"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(t.id)}
                          className="h-8 w-8 p-0 text-coral hover:text-white hover:bg-coral/20 rounded-lg"
                        >
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
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/15 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-white/90">
              <thead className="bg-white/[0.04] text-muted-fg uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                <tr>
                  <th className="py-4 px-6">Ciudad / Región</th>
                  <th className="py-4 px-6">País</th>
                  <th className="py-4 px-6">Continente</th>
                  <th className="py-4 px-6">Estado del Pin</th>
                  <th className="py-4 px-6 font-mono">Código</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredCities.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-4 px-6 font-semibold text-white">
                      {c.name}
                      {c.region && <span className="text-muted-fg text-[11px] font-normal block">{c.region}</span>}
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-mono text-xs">{c.country}</span>
                    </td>
                    <td className="py-4 px-6 text-muted-fg">
                      {c.continent}
                    </td>
                    <td className="py-4 px-6">
                      {c.has_pin ? (
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-mono text-[10px]">
                          ✓ En Álbum
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-fg border-white/10 font-mono text-[10px]">
                          Pendiente
                        </Badge>
                      )}
                    </td>
                    <td className="py-4 px-6 font-mono text-cyan text-[11px]">
                      {c.pin_code ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Viaje */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg bg-[#0a0a14] border-white/15 text-white rounded-3xl p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold text-white">
              {editingTrip ? "Editar Expedición" : "Añadir Nueva Expedición"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-fg mb-1 block">Nombre del Viaje</label>
              <Input
                placeholder="Ej: Viaje a Copenhague y Malmö"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-fg mb-1 block">Transporte</label>
                <Select value={transport} onValueChange={setTransport}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
                    <SelectItem value="Avión">✈️ Avión</SelectItem>
                    <SelectItem value="AVE/Tren">🚆 AVE/Tren</SelectItem>
                    <SelectItem value="Coche">🚗 Coche</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-fg mb-1 block">Motivo</label>
                <Select value={purpose} onValueChange={setPurpose}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a14] border-white/15 text-white">
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
                <label className="text-xs font-semibold text-muted-fg mb-1 block">Fecha Inicio</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-fg mb-1 block">Fecha Fin</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-fg mb-1 block">Descripción / Ruta</label>
              <Input
                placeholder="Ej: Copenhague, Hillerød, Christiania, Malmö"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-muted-fg rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              className="bg-white/5 border-white/15 text-white hover:bg-white/10 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-violet to-cyan text-white font-semibold rounded-xl shadow-[0_0_16px_-4px_rgba(108,99,255,0.6)]"
            >
              {saving ? "Guardando..." : "Guardar Viaje"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

