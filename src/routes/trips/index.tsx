import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Globe2, Calendar, MapPin, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
  listTrips, insertTrip, updateTrip, deleteTrip, type Trip, type TripInsert,
} from "@/lib/trips/trips-repo";

export const Route = createFileRoute("/trips/")({
  component: TripsPage,
});

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
    country: initial?.country ?? "",
    region: initial?.region ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
  });

  const set = (k: keyof TripInsert, v: string) =>
    setForm((p) => ({ ...p, [k]: v || null }));

  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="name">Nombre del viaje *</Label>
        <Input
          id="name"
          placeholder="Ej: Road trip por Portugal"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="country">País *</Label>
          <Input
            id="country"
            placeholder="España"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="region">Región</Label>
          <Input
            id="region"
            placeholder="Cataluña"
            value={form.region ?? ""}
            onChange={(e) => set("region", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="start_date">Fecha inicio</Label>
          <Input
            id="start_date"
            type="date"
            value={form.start_date ?? ""}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="end_date">Fecha fin</Label>
          <Input
            id="end_date"
            type="date"
            value={form.end_date ?? ""}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </div>
      </div>
      <DialogFooter className="pt-4">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button
          onClick={() => onSave(form)}
          disabled={loading || !form.name || !form.country}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar
        </Button>
      </DialogFooter>
    </div>
  );
}

function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTrips(await listTrips());
    } catch (e) {
      toast.error("Error al cargar viajes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (t: Trip) => { setEditing(t); setDialogOpen(true); };

  const handleSave = async (form: TripInsert) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateTrip(editing.id, form);
        setTrips((p) => p.map((t) => (t.id === editing.id ? updated : t)));
        toast.success("Viaje actualizado ✓");
      } else {
        const created = await insertTrip(form);
        setTrips((p) => [created, ...p]);
        toast.success("Viaje añadido ✓");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Error al guardar viaje");
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
      toast.error("Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = trips.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.country.toLowerCase().includes(search.toLowerCase()) ||
      (t.region ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const countries = [...new Set(trips.map((t) => t.country))].length;
  const totalDays = trips.reduce((acc, t) => {
    if (!t.start_date || !t.end_date) return acc;
    const diff = Math.ceil(
      (new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    return acc + diff;
  }, 0);

  return (
    <div className="p-6 space-y-6 animate-float-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Mis Viajes</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona y edita tu historial de viajes en tiempo real.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          Nuevo viaje
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Globe2, label: "Viajes totales", value: trips.length, color: "text-blue-600", bg: "bg-blue-50" },
          { icon: MapPin, label: "Países distintos", value: countries, color: "text-emerald-600", bg: "bg-emerald-50" },
          { icon: Calendar, label: "Días viajados", value: totalDays, color: "text-violet-600", bg: "bg-violet-50" },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-sm border border-border/50 flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center gap-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar viajes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 p-0 h-auto text-sm focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/60"
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/70">Viaje</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/70">País</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/70">Región</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/70">Fechas</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    {search ? "No se encontraron viajes" : "No hay viajes registrados todavía."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((trip) => (
                  <TableRow key={trip.id} className="group hover:bg-slate-50/80 cursor-pointer border-border/40"
                    onClick={() => openEdit(trip)}>
                    <TableCell className="font-medium py-3">{trip.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">{trip.country}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{trip.region ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {trip.start_date ? (
                        <span>{formatDate(trip.start_date)} → {formatDate(trip.end_date)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); openEdit(trip); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeletingId(trip.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar viaje" : "Nuevo viaje"}</DialogTitle>
          </DialogHeader>
          <TripForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
            loading={saving}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible. Los pines asociados también se eliminarán.
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
