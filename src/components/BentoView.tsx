import { lazy, Suspense, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PinRow } from "@/lib/pin-processing";

// Country outline is heavy (world-atlas topojson + d3-geo). Lazy-loaded so it
// only enters the bundle when the user actually opens the bento view.
const CountryOutline = lazy(() =>
  import("./CountryOutline").then((m) => ({ default: m.CountryOutline })),
);

const SPANS: Record<
  Exclude<PinRow["bentoSize"], "">,
  { colSpan: number; rowSpan: number }
> = {
  "1x1": { colSpan: 1, rowSpan: 1 },
  "1x2": { colSpan: 1, rowSpan: 2 },
  "2x1": { colSpan: 2, rowSpan: 1 },
  "2x2": { colSpan: 2, rowSpan: 2 },
  "3x2": { colSpan: 3, rowSpan: 2 },
};

function locationLine(row: PinRow): string {
  const parts = [row.city, row.country].filter((s): s is string => !!s && s.trim().length > 0);
  return parts.length ? parts.join(", ") : "—";
}

export function BentoView({
  rows,
  onReorder,
}: {
  rows: PinRow[];
  onReorder: (nextOrder: PinRow[]) => void;
}) {
  const visible = useMemo(
    () => rows.filter((r) => r.status !== "error" && !!(r.thumbnailDataUrl || r.cutoutImageUrl)),
    [rows],
  );
  const excluded = rows.length - visible.length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const ids = useMemo(() => visible.map((r) => r.id), [visible]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = visible.findIndex((r) => r.id === active.id);
    const to = visible.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(visible, from, to);
    // Splice back into the full rows array (error/excluded rows keep their relative order).
    const excludedRows = rows.filter((r) => !visible.includes(r));
    onReorder([...reordered, ...excludedRows]);
  };

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="bento-grid">
            {visible.map((r) => (
              <SortableBentoCard key={r.id} row={r} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {excluded > 0 && (
        <p className="mt-6 text-center text-[12px] text-muted-foreground">
          {excluded} {excluded === 1 ? "pin no incluido" : "pines no incluidos"} por errores pendientes
        </p>
      )}
    </div>
  );
}

function SortableBentoCard({ row }: { row: PinRow }) {
  const key = (row.bentoSize || "1x1") as Exclude<PinRow["bentoSize"], "">;
  const { colSpan, rowSpan } = SPANS[key] ?? SPANS["1x1"];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const cardClasses = [
    "bento-card",
    row.isFuture ? "bento-card--future" : "",
    row.isEmbassy ? "bento-card--embassy" : "",
    isDragging ? "bento-card--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: React.CSSProperties = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${rowSpan}`,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  const imgSrc = row.thumbnailDataUrl ?? row.cutoutImageUrl ?? "";

  return (
    <article ref={setNodeRef} className={cardClasses} style={style} {...attributes} {...listeners}>
      {/* Background layer: country outline (skipped if country empty/unmatched). */}
      <Suspense fallback={null}>
        <CountryOutline countryName={row.country} isEmbassy={row.isEmbassy} />
      </Suspense>

      {/* Status: hazard stripes overlay for isFuture (behind the pin). */}
      {row.isFuture && <div className="bento-card__hazard" aria-hidden="true" />}

      <div className="bento-card__media">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={locationLine(row)}
            loading="lazy"
            style={{
              transform: `scale(${row.visualScale ?? 1})`,
              transformOrigin: "center center",
            }}
          />
        ) : null}
      </div>

      <div className="bento-card__divider" aria-hidden="true" />

      <div className="bento-card__footer">
        <span className="bento-card__city" title={row.city ?? ""}>
          {row.city ?? ""}
        </span>
        <span className="bento-card__year">{row.year ?? ""}</span>
      </div>
    </article>
  );
}
