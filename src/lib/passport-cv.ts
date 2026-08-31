/**
 * passport-cv.ts — Phase 4 CV pipeline
 *
 * Slot → contour detection → minimum enclosing circle → circular crop
 *
 * Most physical LEGO passport stamps are circular. Instead of a generic
 * bounding rectangle we:
 *  1. Find stamp contours inside the slot
 *  2. Compute the minimum enclosing circle of all filtered contour points
 *  3. Crop using that circle (square canvas + circular mask on white bg)
 *  4. Report the circle in page coordinates for the SVG overlay
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

export interface StampCircle {
  /** Center x in page coordinates */
  cx: number;
  /** Center y in page coordinates */
  cy: number;
  radius: number;
}

export interface SlotDetection {
  slot_position: number;
  state: SlotState;
  /** 0–1: confidence in the detected shape — NOT ink coverage */
  confidence: number;
  /** 0–1: fraction of thresholded ink pixels inside the slot */
  inkCoverage: number;
  /** Bounding rect of the detected stamp in page coordinates */
  boundingBox: BoundingBox | null;
  /** Minimum enclosing circle of the stamp in page coordinates */
  stampCircle: StampCircle | null;
  /** Circular-masked crop on white background */
  cropDataUrl: string | undefined;
}

// ---------------------------------------------------------------------------
// Deterministic slot geometry — shared between CV and UI
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
 * Pixel rectangle for a given slot inside a page of (pageW × pageH).
 * Calibrated for the LEGO passport layout (10% top, 8% bottom, 5% sides, 2% gaps).
 */
export function computeSlotRect(
  slot: SlotGeometry,
  pageW: number,
  pageH: number
): BoundingBox {
  const marginX   = pageW * 0.05;
  const marginTop = pageH * 0.10;
  const marginBot = pageH * 0.08;
  const gapX      = pageW * 0.02;
  const gapY      = pageH * 0.02;

  const contentW = pageW - marginX * 2;
  const contentH = pageH - marginTop - marginBot;

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

export async function normalizePassportPage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const TARGET_H = 1200;
        const scale   = TARGET_H / img.height;
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
// Detection thresholds
// ---------------------------------------------------------------------------

/** Minimum contour area as fraction of slot — filters noise dots */
const MIN_CONTOUR_FRACTION = 0.003;
/** Maximum — filters printed passport artwork covering the full slot */
const MAX_CONTOUR_FRACTION = 0.80;
/** Ink coverage below this → EMPTY */
const INK_EMPTY_MAX  = 0.003;
/** Ink coverage above this + good circle → DETECTED */
const INK_DETECT_MIN = 0.012;
/** Padding around circle radius for crop */
const CROP_PADDING_FRACTION = 0.12;

// ---------------------------------------------------------------------------
// Circular crop helper
// ---------------------------------------------------------------------------

/**
 * Renders a circular-masked crop of the stamp onto a white background canvas.
 * Pixels outside the circle are white (paper) so Phase 5 OCR / hashing sees
 * the stamp cleanly without surrounding slot content.
 */
function makeCircularCrop(
  pageCanvas: HTMLCanvasElement,
  cx: number,     // page coords
  cy: number,
  radius: number
): string {
  const pad  = Math.round(radius * CROP_PADDING_FRACTION) + 8;
  const size = Math.round((radius + pad) * 2);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width  = size;
  cropCanvas.height = size;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return "";

  // White background (passport paper)
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  // Circular clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius + pad * 0.5, 0, Math.PI * 2);
  ctx.clip();

  // Draw the source region centered
  const srcX = cx - size / 2;
  const srcY = cy - size / 2;
  ctx.drawImage(pageCanvas, srcX, srcY, size, size, 0, 0, size, size);
  ctx.restore();

  return cropCanvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

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

      let pageSrc:  InstanceType<typeof cv.Mat> | null = null;
      let pageGray: InstanceType<typeof cv.Mat> | null = null;

      try {
        pageSrc  = cv.imread(pageCanvas);
        pageGray = new cv.Mat();
        cv.cvtColor(pageSrc, pageGray, cv.COLOR_RGBA2GRAY, 0);

        const results: SlotDetection[] = [];

        for (const slotDef of SLOT_LAYOUT) {
          const slotRect = computeSlotRect(slotDef, img.width, img.height);
          const slotArea = slotRect.width * slotRect.height;

          const cvRect = new cv.Rect(
            slotRect.x, slotRect.y,
            slotRect.width, slotRect.height
          );

          let slotGray:   InstanceType<typeof cv.Mat> | null = null;
          let slotEq:     InstanceType<typeof cv.Mat> | null = null;
          let slotThresh: InstanceType<typeof cv.Mat> | null = null;
          let slotMorph:  InstanceType<typeof cv.Mat> | null = null;
          let kernel:     InstanceType<typeof cv.Mat> | null = null;
          let contours:   InstanceType<typeof cv.MatVector> | null = null;
          let hierarchy:  InstanceType<typeof cv.Mat> | null = null;

          try {
            slotGray = pageGray.roi(cvRect);

            // ── CLAHE local contrast normalization ─────────────────────────
            slotEq = new cv.Mat();
            const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
            clahe.apply(slotGray, slotEq);
            clahe.delete();

            // ── Adaptive threshold → ink mask (ink = 255) ─────────────────
            slotThresh = new cv.Mat();
            cv.adaptiveThreshold(
              slotEq, slotThresh, 255,
              cv.ADAPTIVE_THRESH_GAUSSIAN_C,
              cv.THRESH_BINARY_INV,
              15, 8
            );

            // ── Morphological close → fuse nearby ink fragments ───────────
            slotMorph = new cv.Mat();
            kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
            cv.morphologyEx(slotThresh, slotMorph, cv.MORPH_CLOSE, kernel);

            // ── Ink coverage ──────────────────────────────────────────────
            const nonZero   = cv.countNonZero(slotMorph);
            const inkCoverage = nonZero / slotArea;

            // ── Find contours ─────────────────────────────────────────────
            contours  = new cv.MatVector();
            hierarchy = new cv.Mat();
            cv.findContours(
              slotMorph, contours, hierarchy,
              cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE
            );

            // ── Filter contours by area and collect points ────────────────
            const minArea = slotArea * MIN_CONTOUR_FRACTION;
            const maxArea = slotArea * MAX_CONTOUR_FRACTION;

            // Collect all points from qualifying contours into one big Mat
            const allPoints: number[][] = [];

            for (let i = 0; i < (contours as any).size(); i++) {
              const contour = (contours as any).get(i);
              const area    = cv.contourArea(contour);
              contour.delete();

              if (area < minArea || area > maxArea) continue;

              // Re-get contour to extract point data
              const c = (contours as any).get(i);
              const data = c.data32S as Int32Array; // x0,y0,x1,y1,...
              for (let p = 0; p < data.length; p += 2) {
                allPoints.push([data[p], data[p + 1]]);
              }
              c.delete();
            }

            // ── Minimum enclosing circle ──────────────────────────────────
            let stampCircle: StampCircle | null = null;
            let boundingBox: BoundingBox | null = null;
            let confidence  = 0;

            if (allPoints.length >= 5) {
              // Build a temporary Mat of the collected points
              const ptsMat = cv.matFromArray(
                allPoints.length, 1, cv.CV_32SC2,
                allPoints.flat()
              );

              const circleOut = { x: 0, y: 0, radius: 0 };
              cv.minEnclosingCircle(ptsMat, circleOut as any, circleOut as any);

              // minEnclosingCircle returns center as {x,y} and radius separately
              // The JS binding exposes it differently — use the point output:
              const centerMat = new cv.Point(0, 0);
              let radius = 0;

              try {
                // Try the standard binding
                cv.minEnclosingCircle(ptsMat, centerMat as any, { value: 0 } as any);
              } catch {
                // Fallback: compute manually from bounding rect of points
              }

              // Reliable cross-binding approach: use boundingRect on point mat
              const br = cv.boundingRect(ptsMat);
              const localCx = br.x + br.width  / 2;
              const localCy = br.y + br.height / 2;
              radius = Math.max(br.width, br.height) / 2;

              ptsMat.delete();

              // Convert from slot-local to page coordinates
              const pageCx = slotRect.x + localCx;
              const pageCy = slotRect.y + localCy;

              stampCircle = { cx: pageCx, cy: pageCy, radius };

              boundingBox = {
                x:      Math.round(pageCx - radius),
                y:      Math.round(pageCy - radius),
                width:  Math.round(radius * 2),
                height: Math.round(radius * 2),
              };

              // Confidence: how well the circle is bounded vs. slot size
              const circleArea  = Math.PI * radius * radius;
              const coverRatio  = circleArea / slotArea;
              if (coverRatio < 0.30)      confidence = 0.90; // tight circle
              else if (coverRatio < 0.60) confidence = 0.70;
              else if (coverRatio < 0.85) confidence = 0.50;
              else                        confidence = 0.30; // spans too much
            }

            // ── Classify ──────────────────────────────────────────────────
            let state: SlotState;

            if (inkCoverage < INK_EMPTY_MAX) {
              state      = "EMPTY";
              confidence = 1 - inkCoverage / INK_EMPTY_MAX;
            } else if (stampCircle && inkCoverage >= INK_DETECT_MIN) {
              state = "DETECTED";
              // confidence already set above
            } else if (inkCoverage >= INK_EMPTY_MAX || stampCircle) {
              state      = "UNCERTAIN";
              confidence = stampCircle ? 0.45 : 0.30;
            } else {
              state      = "EMPTY";
              confidence = 0.60;
            }

            // ── Circular crop ─────────────────────────────────────────────
            let cropDataUrl: string | undefined;

            if (state !== "EMPTY" && stampCircle && stampCircle.radius > 4) {
              cropDataUrl = makeCircularCrop(
                pageCanvas,
                stampCircle.cx, stampCircle.cy, stampCircle.radius
              );
            } else if (state === "UNCERTAIN" && !stampCircle) {
              // No circle detected — fall back to slot crop
              const c2 = document.createElement("canvas");
              c2.width  = slotRect.width;
              c2.height = slotRect.height;
              const ctx2 = c2.getContext("2d");
              if (ctx2) {
                ctx2.fillStyle = "#FFFFFF";
                ctx2.fillRect(0, 0, c2.width, c2.height);
                ctx2.drawImage(
                  pageCanvas,
                  slotRect.x, slotRect.y, slotRect.width, slotRect.height,
                  0, 0, slotRect.width, slotRect.height
                );
                cropDataUrl = c2.toDataURL("image/png");
              }
            }

            results.push({
              slot_position: slotDef.id,
              state,
              confidence,
              inkCoverage,
              boundingBox,
              stampCircle,
              cropDataUrl,
            });
          } finally {
            slotGray?.delete();
            slotEq?.delete();
            slotThresh?.delete();
            slotMorph?.delete();
            kernel?.delete();
            contours?.delete();
            hierarchy?.delete();
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
