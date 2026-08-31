/**
 * passport-cv.ts — Phase 4 CV Pipeline (Full-Page Global Stamp Detection + Deskewing)
 *
 * Core Features:
 *  - Full-page global contour detection.
 *  - Paper fold / light gray shadow filtering (mean grayscale intensity thresholding).
 *  - Automatic deskewing / upright rotation correction using minAreaRect orientation.
 *  - 1-to-1 spatial candidate mapping to passport slot positions 1..6.
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
  /** 0–1: confidence in the detected stamp shape */
  confidence: number;
  /** 0–1: ink density inside the detected stamp region */
  inkCoverage: number;
  /** Bounding rect of the detected stamp in page coordinates */
  boundingBox: BoundingBox | null;
  /** Minimum enclosing circle of the detected stamp in page coordinates */
  stampCircle: StampCircle | null;
  /** Masked crop of the actual stamp on white paper background */
  cropDataUrl: string | undefined;
}

// ---------------------------------------------------------------------------
// 6 Logical Slot Layout
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
 * Returns default anchor coordinates for slot 1..6 on a page of (pageW × pageH).
 */
export function computeSlotRect(
  slot: SlotGeometry,
  pageW: number,
  pageH: number
): BoundingBox {
  const marginX   = pageW * 0.05;
  const marginTop = pageH * 0.08;
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
// Circular Crop Helper with Deskewing Rotation
// ---------------------------------------------------------------------------

function makeCircularCrop(
  pageCanvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number = 0
): string {
  const pad  = Math.max(10, Math.round(radius * 0.15));
  const size = Math.round((radius + pad) * 2);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width  = size;
  cropCanvas.height = size;
  const ctx = cropCanvas.getContext("2d");
  if (!ctx) return "";

  // Pure white paper background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  // Translate to center of crop canvas for rotation
  ctx.translate(size / 2, size / 2);

  // Apply deskewing rotation if stamp is slightly tilted (-45 deg to +45 deg)
  if (Math.abs(angleDeg) > 1 && Math.abs(angleDeg) < 45) {
    ctx.rotate((-angleDeg * Math.PI) / 180);
  }

  // Circular clip mask
  ctx.beginPath();
  ctx.arc(0, 0, radius + pad * 0.3, 0, Math.PI * 2);
  ctx.clip();

  // Draw source image region centered
  const srcX = cx - size / 2;
  const srcY = cy - size / 2;
  ctx.drawImage(pageCanvas, srcX, srcY, size, size, -size / 2, -size / 2, size, size);
  ctx.restore();

  return cropCanvas.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Internal Candidate Interface
// ---------------------------------------------------------------------------

interface StampCandidate {
  id: number;
  cx: number;
  cy: number;
  radius: number;
  boundingBox: BoundingBox;
  inkCoverage: number;
  confidence: number;
  cropDataUrl: string;
}

// ---------------------------------------------------------------------------
// Main Full-Page Detection Pipeline
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

      let pageSrc:    InstanceType<typeof cv.Mat> | null = null;
      let pageGray:   InstanceType<typeof cv.Mat> | null = null;
      let pageEq:     InstanceType<typeof cv.Mat> | null = null;
      let pageThresh: InstanceType<typeof cv.Mat> | null = null;
      let pageMorph:  InstanceType<typeof cv.Mat> | null = null;
      let kernel:     InstanceType<typeof cv.Mat> | null = null;
      let contours:   InstanceType<typeof cv.MatVector> | null = null;
      let hierarchy:  InstanceType<typeof cv.Mat> | null = null;

      try {
        pageSrc  = cv.imread(pageCanvas);
        pageGray = new cv.Mat();
        cv.cvtColor(pageSrc, pageGray, cv.COLOR_RGBA2GRAY, 0);

        // 1. Contrast Normalization across the whole page (CLAHE)
        pageEq = new cv.Mat();
        const clahe = new cv.CLAHE(2.2, new cv.Size(8, 8));
        clahe.apply(pageGray, pageEq);
        clahe.delete();

        // 2. Full-page Adaptive Thresholding (Ink = 255)
        pageThresh = new cv.Mat();
        cv.adaptiveThreshold(
          pageEq, pageThresh, 255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          17, 7
        );

        // 3. Morphological close (fuse stamp ink components)
        pageMorph = new cv.Mat();
        kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
        cv.morphologyEx(pageThresh, pageMorph, cv.MORPH_CLOSE, kernel);

        const pageArea = img.width * img.height;

        // 4. Find all external contours across the FULL PAGE
        contours  = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(
          pageMorph, contours, hierarchy,
          cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE
        );

        const minStampArea = pageArea * 0.0008;
        const maxStampArea = pageArea * 0.30;

        const rawCandidates: { points: number[][]; area: number }[] = [];

        for (let i = 0; i < (contours as any).size(); i++) {
          const contour = (contours as any).get(i);
          const area    = cv.contourArea(contour);

          if (area >= minStampArea && area <= maxStampArea) {
            const data = contour.data32S as Int32Array;
            const pts: number[][] = [];
            for (let p = 0; p < data.length; p += 2) {
              pts.push([data[p], data[p + 1]]);
            }
            rawCandidates.push({ points: pts, area });
          }
          contour.delete();
        }

        // 5. Group overlapping / nearby contours into cohesive physical stamps
        const mergedCandidates: StampCandidate[] = [];
        rawCandidates.sort((a, b) => b.area - a.area);

        let candidateIdCounter = 1;

        for (const cand of rawCandidates) {
          const ptsMat = cv.matFromArray(
            cand.points.length, 1, cv.CV_32SC2,
            cand.points.flat()
          );
          const br = cv.boundingRect(ptsMat);

          const cx = Math.round(br.x + br.width / 2);
          const cy = Math.round(br.y + br.height / 2);
          const radius = Math.round(Math.max(br.width, br.height) / 2);

          // Calculate mean grayscale intensity to filter paper crease shadows (light gray false positives)
          const cvRect = new cv.Rect(
            Math.max(0, br.x), Math.max(0, br.y),
            Math.min(img.width - br.x, br.width),
            Math.min(img.height - br.y, br.height)
          );
          const cropGrayMat = pageGray.roi(cvRect);
          const meanVal = cv.mean(cropGrayMat)[0]; // 0 (black) .. 255 (white)
          cropGrayMat.delete();

          // Compute deskew angle using minAreaRect
          let angleDeg = 0;
          try {
            const minRect = cv.minAreaRect(ptsMat);
            angleDeg = minRect.angle;
            if (angleDeg < -45) angleDeg += 90;
            if (angleDeg > 45) angleDeg -= 90;
          } catch {
            angleDeg = 0;
          }
          ptsMat.delete();

          // Reject paper crease shadows (light gray background, mean brightness > 210)
          if (meanVal > 210) {
            continue;
          }

          // Check for overlap with an already accepted candidate
          const isOverlap = mergedCandidates.some((existing) => {
            const dist = Math.hypot(existing.cx - cx, existing.cy - cy);
            return dist < (existing.radius + radius) * 0.65;
          });

          if (!isOverlap && radius >= 12) {
            const cropUrl = makeCircularCrop(pageCanvas, cx, cy, radius, angleDeg);

            const cropW = Math.min(img.width - br.x, br.width);
            const cropH = Math.min(img.height - br.y, br.height);
            const inkCoverage = Math.min(1.0, cand.area / (cropW * cropH || 1));

            const aspect = br.width / (br.height || 1);
            const isRegularShape = aspect >= 0.65 && aspect <= 1.5;
            const confidence = isRegularShape ? 0.92 : 0.70;

            mergedCandidates.push({
              id: candidateIdCounter++,
              cx,
              cy,
              radius,
              boundingBox: { x: br.x, y: br.y, width: br.width, height: br.height },
              inkCoverage,
              confidence,
              cropDataUrl: cropUrl,
            });
          }
        }

        // 6. 1-to-1 Spatial Matching: Map candidate stamps to slot 1..6 anchors
        const assignedCandidateIds = new Set<number>();

        const slotDetections: SlotDetection[] = SLOT_LAYOUT.map((slotDef) => {
          const anchorRect = computeSlotRect(slotDef, img.width, img.height);
          const anchorCx = anchorRect.x + anchorRect.width / 2;
          const anchorCy = anchorRect.y + anchorRect.height / 2;

          let bestCandidate: StampCandidate | null = null;
          let minDistance = Infinity;

          for (const cand of mergedCandidates) {
            if (assignedCandidateIds.has(cand.id)) continue;

            const dist = Math.hypot(cand.cx - anchorCx, cand.cy - anchorCy);
            const maxAllowedDist = Math.max(anchorRect.width, anchorRect.height) * 1.1;

            if (dist < maxAllowedDist && dist < minDistance) {
              minDistance = dist;
              bestCandidate = cand;
            }
          }

          if (bestCandidate) {
            assignedCandidateIds.add(bestCandidate.id);
            return {
              slot_position: slotDef.id,
              state: "DETECTED" as SlotState,
              confidence: bestCandidate.confidence,
              inkCoverage: bestCandidate.inkCoverage,
              boundingBox: bestCandidate.boundingBox,
              stampCircle: {
                cx: bestCandidate.cx,
                cy: bestCandidate.cy,
                radius: bestCandidate.radius,
              },
              cropDataUrl: bestCandidate.cropDataUrl,
            };
          } else {
            return {
              slot_position: slotDef.id,
              state: "EMPTY" as SlotState,
              confidence: 1.0,
              inkCoverage: 0,
              boundingBox: null,
              stampCircle: null,
              cropDataUrl: undefined,
            };
          }
        });

        resolve(slotDetections);
      } catch (err) {
        reject(err);
      } finally {
        pageSrc?.delete();
        pageGray?.delete();
        pageEq?.delete();
        pageThresh?.delete();
        pageMorph?.delete();
        kernel?.delete();
        contours?.delete();
        hierarchy?.delete();
      }
    };
    img.onerror = reject;
    img.src = normalizedPageDataUrl;
  });
}
