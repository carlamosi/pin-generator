// Real-size A4 print layout: pack pin cards at physical cm dimensions,
// distributing balanced across the minimum number of pages by bentoSize.
import type { PinRow, BentoSize } from "./pin-processing";

// A4 in cm.
export const PAGE_W_CM = 21;
export const PAGE_H_CM = 29.7;
export const MARGIN_CM = 0.3; // printer non-printable + trim
export const USABLE_W_CM = PAGE_W_CM - 2 * MARGIN_CM; // 20.4
export const USABLE_H_CM = PAGE_H_CM - 2 * MARGIN_CM; // 29.1

// Inner padding so cards keep 0.3cm from the usable-area boundary.
export const INNER_INSET_CM = 0.3;
export const CARD_GAP_CM = 0.3;

export const CONTENT_W_CM = USABLE_W_CM - 2 * INNER_INSET_CM; // 19.8
export const CONTENT_H_CM = USABLE_H_CM - 2 * INNER_INSET_CM; // 28.5

// Practical fill rate used to estimate page count (gaps + irregular packing).
const PRACTICAL_FILL = 0.85;

export const CARD_DIMENSIONS_CM: Record<Exclude<BentoSize, "">, { w: number; h: number }> = {
  "1x1": { w: 3.5, h: 3.5 },
  "1x2": { w: 3.5, h: 5.25 },
  "2x1": { w: 5.25, h: 3.5 },
  "2x2": { w: 5.25, h: 5.25 },
  "3x2": { w: 7.875, h: 5.25 },
};

export type PlacedCard = {
  row: PinRow;
  xCm: number;
  yCm: number;
  wCm: number;
  hCm: number;
};

export type PageLayout = {
  index: number;
  cards: PlacedCard[];
};

function cardSize(row: PinRow): { w: number; h: number } {
  const key = (row.bentoSize || "1x1") as Exclude<BentoSize, "">;
  return CARD_DIMENSIONS_CM[key] ?? CARD_DIMENSIONS_CM["1x1"];
}

// Estimate needed page count from total footprint (card + gap) vs usable area.
function estimatePageCount(rows: PinRow[]): number {
  let footprint = 0;
  for (const r of rows) {
    const { w, h } = cardSize(r);
    footprint += (w + CARD_GAP_CM) * (h + CARD_GAP_CM);
  }
  const capacity = CONTENT_W_CM * CONTENT_H_CM * PRACTICAL_FILL;
  return Math.max(1, Math.ceil(footprint / capacity));
}

// Group by bentoSize preserving manualOrder inside each bucket, then deal
// round-robin across N buckets so every page gets a proportional mix.
function distributeByCategory(rows: PinRow[], pageCount: number): PinRow[][] {
  const CATS: BentoSize[] = ["3x2", "2x2", "2x1", "1x2", "1x1"];
  const byCat = new Map<string, PinRow[]>();
  for (const cat of CATS) byCat.set(cat, []);
  for (const r of rows) {
    const key = (r.bentoSize || "1x1") as BentoSize;
    (byCat.get(key) ?? byCat.get("1x1")!).push(r);
  }
  // Sort inside each category by manualOrder to keep visual sequence.
  for (const list of byCat.values()) {
    list.sort((a, b) => (a.manualOrder ?? 0) - (b.manualOrder ?? 0));
  }
  const pages: PinRow[][] = Array.from({ length: pageCount }, () => []);
  let cursor = 0;
  for (const cat of CATS) {
    const list = byCat.get(cat)!;
    for (const row of list) {
      pages[cursor % pageCount].push(row);
      cursor++;
    }
  }
  // Within each page, sort by manualOrder so the visual reading order is stable.
  for (const p of pages) p.sort((a, b) => (a.manualOrder ?? 0) - (b.manualOrder ?? 0));
  return pages;
}

// Bottom-left rectangle packer with a fixed gap.
// Candidate anchors are (0,0) plus, for each placed rect, its top-right and
// bottom-left corners offset by the gap.
function packPage(pageRows: PinRow[]): { placed: PlacedCard[]; overflow: PinRow[] } {
  const placed: PlacedCard[] = [];
  const overflow: PinRow[] = [];
  const anchors: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  const EPS = 1e-6;

  const collides = (x: number, y: number, w: number, h: number): boolean => {
    for (const p of placed) {
      const gapX = Math.max(p.xCm - (x + w), x - (p.xCm + p.wCm));
      const gapY = Math.max(p.yCm - (y + h), y - (p.yCm + p.hCm));
      if (gapX < CARD_GAP_CM - EPS && gapY < CARD_GAP_CM - EPS) return true;
    }
    return false;
  };

  for (const row of pageRows) {
    const { w, h } = cardSize(row);
    let best: { x: number; y: number } | null = null;
    for (const a of anchors) {
      if (a.x + w > CONTENT_W_CM + EPS) continue;
      if (a.y + h > CONTENT_H_CM + EPS) continue;
      if (collides(a.x, a.y, w, h)) continue;
      if (!best || a.y < best.y - EPS || (Math.abs(a.y - best.y) < EPS && a.x < best.x)) {
        best = { x: a.x, y: a.y };
      }
    }
    if (!best) {
      overflow.push(row);
      continue;
    }
    placed.push({ row, xCm: best.x, yCm: best.y, wCm: w, hCm: h });
    anchors.push({ x: best.x + w + CARD_GAP_CM, y: best.y });
    anchors.push({ x: best.x, y: best.y + h + CARD_GAP_CM });
    // Deduplicate/clip anchors
    for (let i = anchors.length - 1; i >= 0; i--) {
      const a = anchors[i];
      if (a.x > CONTENT_W_CM - EPS || a.y > CONTENT_H_CM - EPS) anchors.splice(i, 1);
    }
  }
  return { placed, overflow };
}

export function computePrintPages(rows: PinRow[]): PageLayout[] {
  // Include every printable pin. Missing bentoSize falls back to 1x1 instead of
  // being dropped, so the page count always reflects the whole collection.
  const eligible = rows.filter(
    (r) => r.status !== "error" && !!(r.thumbnailDataUrl || r.cutoutImageUrl),
  );
  const totalFootprint = eligible.reduce((acc, r) => {
    const { w, h } = cardSize(r);
    return acc + (w + CARD_GAP_CM) * (h + CARD_GAP_CM);
  }, 0);
  const capacity = CONTENT_W_CM * CONTENT_H_CM * PRACTICAL_FILL;
  console.log("[print-layout] compute", {
    rowsIn: rows.length,
    eligible: eligible.length,
    withoutBentoSize: eligible.filter((r) => !r.bentoSize).length,
    excludedError: rows.filter((r) => r.status === "error").length,
    excludedNoCutout: rows.filter((r) => !(r.thumbnailDataUrl || r.cutoutImageUrl)).length,
    totalFootprintCm2: Number(totalFootprint.toFixed(2)),
    usableAreaCm2: Number((CONTENT_W_CM * CONTENT_H_CM).toFixed(2)),
    capacityCm2: Number(capacity.toFixed(2)),
    estimatedPages: Math.max(1, Math.ceil(totalFootprint / capacity)),
  });
  if (eligible.length === 0) return [];

  // Try increasing page counts until nothing overflows, so every pin is shown
  // and the mix stays balanced across all pages.
  const runWith = (pageCount: number): { pages: PageLayout[]; unplaced: number } => {
    const buckets = distributeByCategory(eligible, pageCount);
    const pages: PageLayout[] = [];
    let queue: PinRow[] = [];
    const flush = (rowsForPage: PinRow[]): PinRow[] => {
      const { placed, overflow } = packPage(rowsForPage);
      if (placed.length === 0) return overflow; // nothing fit: avoid empty page
      pages.push({ index: pages.length, cards: placed });
      return overflow;
    };
    for (const bucket of buckets) queue = flush([...queue, ...bucket]);
    let guard = 0;
    while (queue.length > 0 && guard++ < 500) {
      const before = queue.length;
      queue = flush(queue);
      if (queue.length === before) break;
    }
    return { pages, unplaced: queue.length };
  };

  const start = estimatePageCount(eligible);
  let result = runWith(start);
  for (let n = start + 1; n <= start + 8 && result.pages.length > n - 1; n++) {
    const next = runWith(n);
    if (next.unplaced > result.unplaced) break;
    if (next.pages.length <= result.pages.length) {
      result = next;
      if (next.pages.length === n) break;
    }
  }

  console.log("[print-layout] packed", {
    pages: result.pages.length,
    cards: result.pages.reduce((a, p) => a + p.cards.length, 0),
    unplaced: result.unplaced,
  });
  return result.pages;

}

