import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Globe2, Calendar, MapPin, Loader2, Search,
  Car, Train, Plane, Tag, Pin as PinIcon, Sparkles, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listTrips, insertTrip, updateTrip, deleteTrip, listCities,
  type Trip, type TripInsert, type City,
} from "@/lib/trips/trips-repo";

export const Route = createFileRoute("/trips/")({
  component: TripsPage,
});

const TRANSPORT_OPTIONS = [
  { label: "Avión", icon: Plane, emoji: "✈️" },
  { label: "AVE/Tren", icon: Train, emoji: "🚆" },
  { label: "Coche", icon: Car, emoji: "🚗" },
];

const PURPOSE_OPTIONS = [
  { label: "Vacaciones familiares", emoji: "🏖️" },
  { label: "Competición", emoji: "🏆" },
  { label: "Congreso", emoji: "🎓" },
  { label: "Beca", emoji: "🌟" },
  { label: "Escapada", emoji: "🎒" },
];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { year: "numeric", month: "short", day: "numeric" });
}

function TripForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<Trip>;
  onSave: (t: TripInsert) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<TripInsert>({
    name: initial?.name ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    transport: initial?.transport ?? "Avión",
    description: initial?.description ?? "Vacaciones familiares",
    notes: initial?.notes ?? "",
  });

  const set = (k: keyof TripInsert, v: string) =>
    setForm((p) => ({ ...p, [k]: v || null }));

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre del viaje *</Label>
        <Input
          id="name"
          placeholder="Ej: Roadtrip familiar por España y Portugal"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Transporte principal</Label>
          <Select value={form.transport} onValueChange={(v) => set("transport", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSPORT_OPTIONS.map((t) => (
                <SelectItem key={t.label} value={t.label}>
                  <span className="mr-1.5">{t.emoji}</span> {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Motivo del viaje</Label>
          <Select value={form.description} onValueChange={(v) => set("description", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PURPOSE_OPTIONS.map((p) => (
                <SelectItem key={p.label} value={p.label}>
                  <span className="mr-1.5">{p.emoji}</span> {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="start_date">Fecha inicio</Label>
          <Input
            id="start_date"
            type="date"
            value={form.start_date ?? ""}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end_date">Fecha fin</Label>
          <Input
            id="end_date"
            type="date"
            value={form.end_date ?? ""}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas y detalles adicionales</Label>
        <Textarea
          id="notes"
          placeholder="Anotaciones, hoteles, fechas estimadas..."
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter className="pt-4">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={loading || !form.name}
          className="shadow-md"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar Viaje
        </Button>
      </DialogFooter>
    </div>
  );
}

function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTransport, setFilterTransport] = useState("all");
  const [filterPurpose, setFilterPurpose] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tripsData, citiesData] = await Promise.all([listTrips(), listCities()]);
      setTrips(tripsData);
      setCities(citiesData);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (t: Trip) => { setEditing(t); setDialogOpen(true); };

  const handleSave = async (form: TripInsert) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateTrip(editing.id, form);
        setTrips((p) => p.map((t) => (t.id === editing.id ? updated : t)));
        toast.success("Viaje actualizado con éxito ✓");
      } else {
        const created = await insertTrip(form);
        setTrips((p) => [created, ...p]);
        toast.success("Nuevo viaje añadido ✓");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Error al guardar el viaje");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteTrip(deletingId);
      setTrips((p) => p.filter((t) => t.id !== deletingId));
      toast.success("Viaje eliminado");
    } catch {
      toast.error("Error al eliminar viaje");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (filterTransport !== "all" && t.transport !== filterTransport) return false;
      if (filterPurpose !== "all" && t.description !== filterPurpose) return false;
      if (search) {
        const s = search.toLowerCase();
        const matchName = t.name.toLowerCase().includes(s);
        const matchNotes = (t.notes ?? "").toLowerCase().includes(s);
        if (!matchName && !matchNotes) return false;
      }
      return true;
    });
  }, [trips, filterTransport, filterPurpose, search]);

  const countriesCount = useMemo(() => {
    return new Set(cities.map((c) => c.country).filter(Boolean)).size;
  }, [cities]);

  const pinsCount = useMemo(() => {
    return cities.filter((c) => c.has_pin).length;
  }, [cities]);

  return (
    <div className="p-6 space-y-6 animate-float-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mis Viajes y Rutas</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Historial exhaustivo de tus viajes, transporte, motivos y ciudades visitadas.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          Añadir Viaje
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Viajes Registrados", value: trips.length, icon: Globe2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Ciudades Visitadas", value: cities.length, icon: MapPin, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Países Cruzados", value: countriesCount, icon: Sparkles, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Pines Adquiridos", value: pinsCount, icon: PinIcon, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-border/50 shadow-sm flex items-center gap-4">
            <div className={`h-11 w-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs: Trips & Cities */}
      <Tabs defaultValue="trips" className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="trips" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Globe2 className="h-4 w-4" />
            Tabla de Viajes ({filteredTrips.length})
          </TabsTrigger>
          <TabsTrigger value="cities" className="gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <MapPin className="h-4 w-4" />
            Ciudades del Excel ({cities.length})
          </TabsTrigger>
        </TabsList>

        {/* TRIPS TAB */}
        <TabsContent value="trips" className="space-y-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            {/* Filters bar */}
            <div className="p-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar viaje..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-white h-8 text-xs border-border/60"
                />
              </div>

              <div className="flex items-center gap-3">
                <Select value={filterTransport} onValueChange={setFilterTransport}>
                  <SelectTrigger className="w-36 h-8 text-xs bg-white">
                    <SelectValue placeholder="Transporte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los transportes</SelectItem>
                    {TRANSPORT_OPTIONS.map((t) => (
                      <SelectItem key={t.label} value={t.label}>{t.emoji} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterPurpose} onValueChange={setFilterPurpose}>
                  <SelectTrigger className="w-44 h-8 text-xs bg-white">
                    <SelectValue placeholder="Motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los motivos</SelectItem>
                    {PURPOSE_OPTIONS.map((p) => (
                      <SelectItem key={p.label} value={p.label}>{p.emoji} {p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Viaje</TableHead>
                    <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Transporte</TableHead>
                    <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Motivo</TableHead>
                    <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Fechas</TableHead>
                    <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Ciudades</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        No se encontraron viajes con los filtros actuales.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTrips.map((trip) => {
                      const tripCities = cities.filter((c) => c.trip_id === trip.id);
                      return (
                        <TableRow
                          key={trip.id}
                          onClick={() => openEdit(trip)}
                          className="cursor-pointer hover:bg-slate-50/80 group border-border/40"
                        >
                          <TableCell className="font-semibold py-3.5 text-sm max-w-xs">
                            <p className="truncate">{trip.name}</p>
                            {trip.notes && (
                              <p className="text-[11px] text-muted-foreground font-normal truncate mt-0.5">
                                {trip.notes}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal text-xs gap-1">
                              {trip.transport === "Avión" ? "✈️" : trip.transport === "AVE/Tren" ? "🚆" : "🚗"}
                              <span>{trip.transport}</span>
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal text-xs">
                              {trip.description}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {trip.start_date ? (
                              <span>{formatDate(trip.start_date)} → {formatDate(trip.end_date)}</span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {tripCities.slice(0, 3).map((c) => (
                                <Badge key={c.id} variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                                  {c.name} {c.has_pin && "📌"}
                                </Badge>
                              ))}
                              {tripCities.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{tripCities.length - 3}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={(e) => { e.stopPropagation(); openEdit(trip); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); setDeletingId(trip.id); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* CITIES TAB */}
        <TabsContent value="cities" className="space-y-4">
          <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Ciudad</TableHead>
                  <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Región / País</TableHead>
                  <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Continente</TableHead>
                  <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Fechas</TableHead>
                  <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Pin</TableHead>
                  <TableHead className="text-xs uppercase font-semibold text-muted-foreground/70">Código Pin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map((city) => (
                  <TableRow key={city.id} className="border-border/40 hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-sm py-3">{city.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {city.region ? `${city.region}, ` : ""}{city.country}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="font-normal">{city.continent}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(city.start_date)}
                    </TableCell>
                    <TableCell>
                      {city.has_pin ? (
                        <Badge className="bg-emerald-100 text-emerald-800 text-[10px] border-emerald-200">
                          Pin Adquirido ✓
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Sin pin</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">
                      {city.pin_code || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Viaje" : "Añadir Nuevo Viaje"}</DialogTitle>
          </DialogHeader>
          <TripForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el viaje del registro. Las ciudades y pines asociados quedarán desvinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
