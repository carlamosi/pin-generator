import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import {
  CONTENT_H_CM,
  CONTENT_W_CM,
  INNER_INSET_CM,
  MARGIN_CM,
  PAGE_H_CM,
  PAGE_W_CM,
  USABLE_H_CM,
  USABLE_W_CM,
  computePrintPages,
  type PlacedCard,
} from "@/lib/print-layout";
import {
  DEFAULT_PX_PER_CM,
  clearPxPerCm,
  usePxPerCm,
  writePxPerCm,
} from "@/lib/calibration";

const CountryOutline = lazy(() =>
  import("./CountryOutline").then((m) => ({ default: m.CountryOutline })),
);

const MONTHS_ES_ABBR = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function PrintPreview({
  rows,
  onReorder,
}: {
  rows: PinRow[];
  onReorder: (nextOrder: PinRow[]) => void;
}) {
  const pxPerCm = usePxPerCm();
  const [showCalibration, setShowCalibration] = useState(false);

  // Recompute pages fresh on every open / rows change.
  const pages = useMemo(() => computePrintPages(rows), [rows]);
  const placedIds = useMemo(
    () => pages.flatMap((p) => p.cards.map((c) => c.row.id)),
    [pages],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Reorder the *placed* sequence, then splice back into the full rows array
    // so error/excluded rows keep their relative order at the end.
    const placedRows = placedIds
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is PinRow => !!r);
    const from = placedRows.findIndex((r) => r.id === active.id);
    const to = placedRows.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(placedRows, from, to);
    const excluded = rows.filter((r) => !placedRows.includes(r));
    onReorder([...reordered, ...excluded]);
  };

  if (!pxPerCm) {
    return <CalibrationScreen onDone={() => setShowCalibration(false)} />;
  }
  if (showCalibration) {
    return <CalibrationScreen onDone={() => setShowCalibration(false)} />;
  }

  const totalPlaced = placedIds.length;
  const excluded = rows.length - totalPlaced;


  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex w-full flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <div>
          <span className="text-foreground font-medium">
            {totalPlaced} {totalPlaced === 1 ? "pin" : "pines"} · {pages.length}{" "}
            {pages.length === 1 ? "página" : "páginas"} A4
          </span>
          <span className="mx-2 opacity-40">·</span>
          Tamaño final recortado ~{USABLE_W_CM.toFixed(1)} × {USABLE_H_CM.toFixed(1)} cm
          <span className="mx-2 opacity-40">·</span>
          Página A4 ({PAGE_W_CM} × {PAGE_H_CM} cm) con {MARGIN_CM} cm de margen
        </div>

        <button
          onClick={() => setShowCalibration(true)}
          className="underline decoration-dotted underline-offset-4 hover:text-foreground"
        >
          Recalibrar pantalla
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={placedIds} strategy={rectSortingStrategy}>
          <div className="flex flex-col items-center gap-10">
            {pages.map((page) => (
              <PrintPage
                key={page.index}
                index={page.index}
                total={pages.length}
                cards={page.cards}
                pxPerCm={pxPerCm}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {excluded > 0 && (
        <p className="text-center text-[12px] text-muted-foreground">
          {excluded} {excluded === 1 ? "pin no incluido" : "pines no incluidos"} (sin recorte válido o con errores de procesado)
        </p>
      )}

    </div>
  );
}

function PrintPage({
  index,
  total,
  cards,
  pxPerCm,
}: {
  index: number;
  total: number;
  cards: PlacedCard[];
  pxPerCm: number;
}) {
  const pageW = PAGE_W_CM * pxPerCm;
  const pageH = PAGE_H_CM * pxPerCm;
  const marginPx = MARGIN_CM * pxPerCm;
  const insetPx = INNER_INSET_CM * pxPerCm;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
        Página {index + 1} de {total}
      </div>
      <div
        style={{
          width: pageW,
          height: pageH,
          background: "white",
          boxShadow: "var(--shadow-float)",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Usable-area guide (trim). */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: marginPx,
            top: marginPx,
            width: USABLE_W_CM * pxPerCm,
            height: USABLE_H_CM * pxPerCm,
            border: "1px dashed color-mix(in oklch, currentColor 14%, transparent)",
            pointerEvents: "none",
          }}
        />
        {/* Content area — cards positioned in cm. */}
        <div
          style={{
            position: "absolute",
            left: marginPx + insetPx,
            top: marginPx + insetPx,
            width: CONTENT_W_CM * pxPerCm,
            height: CONTENT_H_CM * pxPerCm,
          }}
        >
          {cards.map((c) => (
            <PrintCard key={c.row.id} card={c} pxPerCm={pxPerCm} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PrintCard({ card, pxPerCm }: { card: PlacedCard; pxPerCm: number }) {
  const { row } = card;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const classes = [
    "bento-card",
    row.isFuture ? "bento-card--future" : "",
    row.isEmbassy ? "bento-card--embassy" : "",
    isDragging ? "bento-card--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: React.CSSProperties = {
    position: "absolute",
    left: card.xCm * pxPerCm,
    top: card.yCm * pxPerCm,
    width: card.wCm * pxPerCm,
    height: card.hCm * pxPerCm,
    padding: 0.18 * pxPerCm,
    borderRadius: 0.28 * pxPerCm,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };

  const imgSrc = row.thumbnailDataUrl ?? row.cutoutImageUrl ?? "";

  const monthLabel =
    row.month && row.month >= 1 && row.month <= 12 ? MONTHS_ES_ABBR[row.month - 1] : "";
  const dateLabel = [monthLabel, row.year ?? ""].filter(Boolean).join(" ");

  return (
    <article ref={setNodeRef} className={classes} style={style} {...attributes} {...listeners}>
      <Suspense fallback={null}>
        <CountryOutline countryName={row.country} isEmbassy={row.isEmbassy} />
      </Suspense>
      {row.isFuture && <div className="bento-card__hazard" aria-hidden="true" />}

      <div className="bento-card__media">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={row.city ?? ""}
            loading="lazy"
            style={{
              transform: `scale(${row.visualScale ?? 1})`,
              transformOrigin: "center center",
            }}
          />
        ) : null}
      </div>

      <div className="bento-card__divider" aria-hidden="true" />
      <div
        className="bento-card__footer"
        style={{ fontSize: Math.max(9, 0.28 * pxPerCm), padding: `${0.08 * pxPerCm}px ${0.05 * pxPerCm}px 0` }}
      >
        <span className="bento-card__city" title={row.city ?? ""}>
          {row.city ?? ""}
        </span>
        <span className="bento-card__year">{dateLabel}</span>
      </div>
    </article>
  );
}

// ------------------ Calibration ------------------

function CalibrationScreen({ onDone }: { onDone: () => void }) {
  const [pxPerCm, setLocal] = useState<number>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("pin-digitizer:px-per-cm") : null;
    const n = stored ? Number.parseFloat(stored) : NaN;
    return Number.isFinite(n) && n > 5 ? n : DEFAULT_PX_PER_CM;
  });

  // Drag the right handle to change width — bar always represents 10cm.
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      // Compute px from left edge of bar to pointer. Bar starts at fixed left offset (screen-centered).
      const bar = document.getElementById("calib-bar");
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const widthPx = Math.max(60, e.clientX - rect.left);
      setLocal(widthPx / 10);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  const barWidth = pxPerCm * 10;

  const save = () => {
    writePxPerCm(pxPerCm);
    onDone();
  };
  const reset = () => {
    setLocal(DEFAULT_PX_PER_CM);
    clearPxPerCm();
  };

  return (
    <div className="mx-auto max-w-3xl rounded-[24px] bg-surface-elevated p-8" style={{ boxShadow: "var(--shadow-float)" }}>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">Calibra tu pantalla</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        Coloca una regla física contra la pantalla y arrastra el asa hasta que la barra mida
        exactamente <strong className="text-foreground">10 cm</strong>. Esto garantiza que la vista
        de impresión reproduzca el tamaño real de tus pines. Guarda una vez ajustado.
      </p>

      <div className="mt-8 rounded-2xl bg-background p-6" style={{ boxShadow: "var(--shadow-press)" }}>
        <div className="relative select-none">
          <div
            id="calib-bar"
            style={{
              width: barWidth,
              height: 40,
              background: "linear-gradient(180deg, oklch(0.94 0.005 260), oklch(0.88 0.005 260))",
              borderRadius: 8,
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* cm tick marks */}
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: i * pxPerCm,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: i === 0 || i === 10 ? "oklch(0.3 0.01 260)" : "oklch(0.5 0.01 260 / 0.5)",
                }}
              />
            ))}
            <span
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: 12,
                fontWeight: 600,
                color: "oklch(0.3 0.01 260)",
                letterSpacing: "0.02em",
              }}
            >
              10 cm
            </span>
            {/* Handle */}
            <div
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDragging(true);
              }}
              style={{
                position: "absolute",
                right: -14,
                top: -6,
                width: 28,
                height: 52,
                borderRadius: 8,
                background: "var(--primary)",
                boxShadow: "var(--shadow-lift)",
                cursor: "ew-resize",
                touchAction: "none",
              }}
              aria-label="Arrastra para ajustar"
            />
          </div>
        </div>
        <p className="mt-4 text-[12px] text-muted-foreground">
          Ratio actual: <span className="font-medium text-foreground">{pxPerCm.toFixed(2)} px/cm</span>
          <span className="mx-2 opacity-40">·</span>
          Predeterminado del navegador: {DEFAULT_PX_PER_CM.toFixed(2)} px/cm
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={save}
          className="rounded-full bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Guardar calibración
        </button>
        <button
          onClick={reset}
          className="rounded-full bg-secondary px-5 py-2 text-[13px] font-medium text-foreground transition-all hover:bg-secondary/70"
        >
          Restablecer
        </button>
      </div>
    </div>
  );
}
