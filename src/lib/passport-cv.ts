/**
 * passport-cv.ts — Phase 4 CV pipeline (revised)
 *
 * Design principles:
 *  - slot region  = fixed deterministic search area (never moves)
 *  - stamp region = actual detected stamp boundary (per image)
 *  - inkCoverage  = fraction of dark pixels inside slot (a raw signal)
 *  - confidence   = quality of the detected boundary (structural evidence)
 *  - crop         = tight crop of the detected stamp boundary + padding
 *
 * Pipeline per slot:
 *  1. Extract slot ROI from full-page grayscale
 *  2. Histogram-equalize the slot (normalize local contrast)
 *  3. Adaptive threshold → binary ink mask
 *  4. Morphological close → merge nearby ink fragments
 *  5. Find connected components (blobs) filtered by area
 *  6. Group the retained blobs into a single union bounding box
 *  7. Classify EMPTY / DETECTED / UNCERTAIN from ink coverage + component evidence
 *  8. Crop from the detected bounding box (+ padding) on the original color image
 */

import { loadOpenCV } from "./pin-processing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlotState = "EMPTY" | "DETECTED" | "UNCERTAIN";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SlotDetection {
  slot_position: number;
  state: SlotState;
  /** 0–1: quality of boundary detection, NOT ink coverage */
  confidence: number;
  /** 0–1: fraction of thresholded-ink pixels in the slot region */
  inkCoverage: number;
  /** Detected stamp bounding box in page coordinates (not slot-local) */
  boundingBox: BoundingBox | null;
  /** Tight crop around the detected stamp (not the full slot) */
  cropDataUrl: string | undefined;
}

// ---------------------------------------------------------------------------
// Deterministic slot geometry — defined once, reused everywhere
// ---------------------------------------------------------------------------

export interface SlotGeometry {
  id: number;
  row: number;
  col: number;
}

export const SLOT_LAYOUT: SlotGeometry[] = [
  { id: 1, row: 0, col: 0 },
  { id: 2, row: 0, col: 1 },
  { id: 3, row: 1, col: 0 },
  { id: 4, row: 1, col: 1 },
  { id: 5, row: 2, col: 0 },
  { id: 6, row: 2, col: 1 },
];

/**
 * Computes the pixel rectangle for a given slot in a page of (pageW × pageH).
 * Margins calibrated for the physical LEGO passport page layout:
 *   - 10% top, 8% bottom for header/footer printed elements
 *   - 5% left/right for binding and edge artwork
 *   - A gap of 2% between columns and rows
 */
export function computeSlotRect(
  slot: SlotGeometry,
  pageW: number,
  pageH: number
): BoundingBox {
  const marginX    = pageW * 0.05;
  const marginTop  = pageH * 0.10;
  const marginBot  = pageH * 0.08;
  const gapX       = pageW * 0.02;
  const gapY       = pageH * 0.02;

  const contentW = pageW - marginX * 2;
  const contentH = pageH - marginTop - marginBot;

  // Each slot takes up (contentW - 1 gap) / 2 cols, (contentH - 2 gaps) / 3 rows
  const slotW = (contentW - gapX) / 2;
  const slotH = (contentH - gapY * 2) / 3;

  const x = Math.round(marginX + slot.col * (slotW + gapX));
  const y = Math.round(marginTop + slot.row * (slotH + gapY));

  return {
    x: Math.max(0, Math.min(x, pageW - 1)),
    y: Math.max(0, Math.min(y, pageH - 1)),
    width:  Math.min(Math.round(slotW), pageW - x),
    height: Math.min(Math.round(slotH), pageH - y),
  };
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Resizes the uploaded PNG to a standard height (1200 px) while preserving
 * aspect ratio. Does NOT blindly crop to 8:12 — scan boundaries are preserved.
 */
export async function normalizePassportPage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const TARGET_H = 1200;
        const scale = TARGET_H / img.height;
        const targetW = Math.round(img.width * scale);

        const canvas = document.createElement("canvas");
        canvas.width  = targetW;
        canvas.height = TARGET_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No 2d context"));
        ctx.drawImage(img, 0, 0, targetW, TARGET_H);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Stamp detection with boundary extraction
// ---------------------------------------------------------------------------

// Minimum blob area as a fraction of slot area.
// Blobs smaller than this are considered noise (printing dots, paper texture).
const MIN_BLOB_FRACTION = 0.002;    // 0.2 % of slot

// Maximum blob area fraction — blobs covering >85% of slot are likely
// the slot background / passport printed artwork, not a stamp.
const MAX_BLOB_FRACTION = 0.85;

// Ink coverage thresholds (fraction of slot)
const INK_EMPTY_MAX  = 0.003;   // below this → EMPTY
const INK_DETECT_MIN = 0.015;   // above this + good boundary → DETECTED
// between the two, or boundary weak → UNCERTAIN

// Confidence from structural evidence:
// We score 0–1 based on: did we find a plausible union bounding box whose
// area is meaningfully smaller than the full slot?
function computeStructuralConfidence(
  bboxArea: number,
  slotArea: number,
  blobCount: number
): number {
  if (blobCount === 0) return 0;
  // If the union bounding box is nearly the full slot, the boundary isn't reliable
  const coverageRatio = bboxArea / slotArea;
  if (coverageRatio > 0.90) return 0.3;
  if (coverageRatio > 0.70) return 0.5;
  // A well-bounded stamp: bbox is 20–70% of slot → high confidence
  if (blobCount >= 3) return 0.85;
  if (blobCount >= 1) return 0.70;
  return 0.4;
}

/**
 * Analyzes the normalized passport page and returns per-slot detections with
 * actual stamp boundary boxes and tight crops.
 */
export async function detectStamps(
  normalizedPageDataUrl: string
): Promise<SlotDetection[]> {
  const cv = await loadOpenCV();

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width  = img.width;
      pageCanvas.height = img.height;
      const pageCtx = pageCanvas.getContext("2d");
      if (!pageCtx) return reject(new Error("No 2d context"));
      pageCtx.drawImage(img, 0, 0);

      // Build OpenCV Mats — one grayscale for the full page
      let pageSrc:  InstanceType<typeof cv.Mat> | null = null;
      let pageGray: InstanceType<typeof cv.Mat> | null = null;

      try {
        pageSrc  = cv.imread(pageCanvas);
        pageGray = new cv.Mat();
        cv.cvtColor(pageSrc, pageGray, cv.COLOR_RGBA2GRAY, 0);

        const results: SlotDetection[] = [];

        for (const slot of SLOT_LAYOUT) {
          const slotRect = computeSlotRect(slot, img.width, img.height);
          const slotArea = slotRect.width * slotRect.height;

          // ── 1. Extract slot ROI (grayscale) ─────────────────────────────
          const cvRect = new cv.Rect(
            slotRect.x, slotRect.y,
            slotRect.width, slotRect.height
          );
          let slotGray:  InstanceType<typeof cv.Mat> | null = null;
          let slotEq:    InstanceType<typeof cv.Mat> | null = null;
          let slotThresh:InstanceType<typeof cv.Mat> | null = null;
          let slotMorph: InstanceType<typeof cv.Mat> | null = null;
          let labels:    InstanceType<typeof cv.Mat> | null = null;
          let stats:     InstanceType<typeof cv.Mat> | null = null;
          let centroids: InstanceType<typeof cv.Mat> | null = null;
          let kernel:    InstanceType<typeof cv.Mat> | null = null;

          try {
            slotGray = pageGray.roi(cvRect);

            // ── 2. Local contrast normalization (CLAHE) ──────────────────
            slotEq = new cv.Mat();
            const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
            clahe.apply(slotGray, slotEq);
            clahe.delete();

            // ── 3. Adaptive threshold — inverted so ink = 255 ────────────
            slotThresh = new cv.Mat();
            cv.adaptiveThreshold(
              slotEq,
              slotThresh,
              255,
              cv.ADAPTIVE_THRESH_GAUSSIAN_C,
              cv.THRESH_BINARY_INV,
              /* blockSize */ 15,
              /* C */ 8
            );

            // ── 4. Morphological close — merge nearby ink fragments ───────
            slotMorph = new cv.Mat();
            kernel = cv.getStructuringElement(
              cv.MORPH_ELLIPSE,
              new cv.Size(5, 5)
            );
            cv.morphologyEx(slotThresh, slotMorph, cv.MORPH_CLOSE, kernel);

            // ── 5. Ink coverage (raw signal, not confidence) ──────────────
            const nonZero = cv.countNonZero(slotMorph);
            const inkCoverage = nonZero / slotArea;

            // ── 6. Connected components ───────────────────────────────────
            labels    = new cv.Mat();
            stats     = new cv.Mat();
            centroids = new cv.Mat();
            const numLabels = cv.connectedComponentsWithStats(
              slotMorph, labels, stats, centroids
            );

            const minArea = slotArea * MIN_BLOB_FRACTION;
            const maxArea = slotArea * MAX_BLOB_FRACTION;

            // Collect blobs that pass the area filter (label 0 = background)
            let unionX1 = Infinity, unionY1 = Infinity;
            let unionX2 = -Infinity, unionY2 = -Infinity;
            let blobCount = 0;

            for (let label = 1; label < numLabels; label++) {
              const bx = stats.intAt(label, cv.CC_STAT_LEFT);
              const by = stats.intAt(label, cv.CC_STAT_TOP);
              const bw = stats.intAt(label, cv.CC_STAT_WIDTH);
              const bh = stats.intAt(label, cv.CC_STAT_HEIGHT);
              const ba = stats.intAt(label, cv.CC_STAT_AREA);

              if (ba < minArea || ba > maxArea) continue;

              unionX1 = Math.min(unionX1, bx);
              unionY1 = Math.min(unionY1, by);
              unionX2 = Math.max(unionX2, bx + bw);
              unionY2 = Math.max(unionY2, by + bh);
              blobCount++;
            }

            // ── 7. Classify ───────────────────────────────────────────────
            let state: SlotState;
            let confidence: number;
            let boundingBox: BoundingBox | null = null;

            const hasBoundary = blobCount > 0 && unionX2 > unionX1;

            if (inkCoverage < INK_EMPTY_MAX) {
              state      = "EMPTY";
              confidence = 1 - inkCoverage / INK_EMPTY_MAX; // high when very clean
            } else if (hasBoundary && inkCoverage >= INK_DETECT_MIN) {
              state      = "DETECTED";
              const bboxArea = (unionX2 - unionX1) * (unionY2 - unionY1);
              confidence = computeStructuralConfidence(bboxArea, slotArea, blobCount);

              // Convert from slot-local to page coordinates
              boundingBox = {
                x:      slotRect.x + unionX1,
                y:      slotRect.y + unionY1,
                width:  unionX2 - unionX1,
                height: unionY2 - unionY1,
              };
            } else if (inkCoverage >= INK_EMPTY_MAX || hasBoundary) {
              state      = "UNCERTAIN";
              confidence = 0.4;

              if (hasBoundary) {
                boundingBox = {
                  x:      slotRect.x + unionX1,
                  y:      slotRect.y + unionY1,
                  width:  unionX2 - unionX1,
                  height: unionY2 - unionY1,
                };
                confidence = 0.5;
              }
            } else {
              state      = "EMPTY";
              confidence = 0.6;
            }

            // ── 8. Crop from detected boundary (not full slot) ────────────
            let cropDataUrl: string | undefined;

            if (state !== "EMPTY" && boundingBox) {
              // Padding: 8% of slot dimension, minimum 8px
              const padX = Math.max(8, Math.round(slotRect.width  * 0.08));
              const padY = Math.max(8, Math.round(slotRect.height * 0.08));

              const cropX = Math.max(0, boundingBox.x - padX);
              const cropY = Math.max(0, boundingBox.y - padY);
              const cropW = Math.min(img.width  - cropX, boundingBox.width  + padX * 2);
              const cropH = Math.min(img.height - cropY, boundingBox.height + padY * 2);

              const cropCanvas = document.createElement("canvas");
              cropCanvas.width  = cropW;
              cropCanvas.height = cropH;
              const cropCtx = cropCanvas.getContext("2d");
              if (cropCtx) {
                cropCtx.drawImage(pageCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                cropDataUrl = cropCanvas.toDataURL("image/png");
              }
            } else if (state === "UNCERTAIN" && !boundingBox) {
              // No boundary detected but some ink — fall back to slot crop
              const cropCanvas = document.createElement("canvas");
              cropCanvas.width  = slotRect.width;
              cropCanvas.height = slotRect.height;
              const cropCtx = cropCanvas.getContext("2d");
              if (cropCtx) {
                cropCtx.drawImage(
                  pageCanvas,
                  slotRect.x, slotRect.y, slotRect.width, slotRect.height,
                  0, 0, slotRect.width, slotRect.height
                );
                cropDataUrl = cropCanvas.toDataURL("image/png");
              }
            }

            results.push({
              slot_position: slot.id,
              state,
              confidence,
              inkCoverage,
              boundingBox,
              cropDataUrl,
            });
          } finally {
            slotGray?.delete();
            slotEq?.delete();
            slotThresh?.delete();
            slotMorph?.delete();
            labels?.delete();
            stats?.delete();
            centroids?.delete();
            kernel?.delete();
          }
        }

        resolve(results);
      } catch (err) {
        reject(err);
      } finally {
        pageSrc?.delete();
        pageGray?.delete();
      }
    };
    img.onerror = reject;
    img.src = normalizedPageDataUrl;
  });
}
