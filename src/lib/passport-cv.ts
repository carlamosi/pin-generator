import { loadOpenCV } from "./pin-processing";

export type SlotState = "EMPTY" | "DETECTED" | "UNCERTAIN";

export interface SlotDetection {
  slot_position: number;
  state: SlotState;
  confidence: number;
  cropDataUrl?: string; // Optional crop for DETECTED / UNCERTAIN
}

/**
 * Normalizes an uploaded PNG image to a standard coordinate system (maintaining aspect ratio),
 * and optionally crops it if a passport page boundary is reliably identified.
 * Currently returns the resized image data URL as the normalized page.
 */
export async function normalizePassportPage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Target normalized dimension for the page (8:12 ratio ideal, but preserve aspect ratio)
        // We'll normalize to a height of 1200px.
        const TARGET_HEIGHT = 1200;
        const scale = TARGET_HEIGHT / img.height;
        const targetWidth = Math.round(img.width * scale);

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = TARGET_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Failed to get 2d context"));

        ctx.drawImage(img, 0, 0, targetWidth, TARGET_HEIGHT);
        
        // Return normalized image
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Deterministic layout: 2 columns, 3 rows for slots 1-6.
 * The passport page is roughly 800x1200 if perfectly cropped.
 */
const SLOT_LAYOUT = [
  { id: 1, row: 0, col: 0 },
  { id: 2, row: 0, col: 1 },
  { id: 3, row: 1, col: 0 },
  { id: 4, row: 1, col: 1 },
  { id: 5, row: 2, col: 0 },
  { id: 6, row: 2, col: 1 },
];

/**
 * Analyzes the normalized passport page using OpenCV to detect black ink in each of the 6 fixed slots.
 */
export async function detectStamps(normalizedPageDataUrl: string): Promise<SlotDetection[]> {
  const cv = await loadOpenCV();
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No 2d context");
        ctx.drawImage(img, 0, 0);

        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        let thresh = new cv.Mat();

        // 1. Grayscale & Contrast Normalization (Histogram Equalization)
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        
        // 2. Adaptive thresholding for robust black-ink extraction.
        // We use THRESH_BINARY_INV so black ink becomes white pixels (255) in the mask.
        cv.adaptiveThreshold(
          gray,
          thresh,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          21, // block size
          10  // C (constant subtracted from mean)
        );

        const results: SlotDetection[] = [];

        // Define slot regions. We assume slots take up the central portion of the page.
        // E.g., top margin 10%, bottom margin 10%, left/right margins 5%.
        const marginX = img.width * 0.05;
        const marginY = img.height * 0.10;
        const contentW = img.width - (marginX * 2);
        const contentH = img.height - (marginY * 2);

        const slotW = contentW / 2;
        const slotH = contentH / 3;

        for (const slot of SLOT_LAYOUT) {
          const x = Math.round(marginX + slot.col * slotW);
          const y = Math.round(marginY + slot.row * slotH);
          const w = Math.round(slotW);
          const h = Math.round(slotH);

          // Bound check
          const rect = new cv.Rect(
            Math.max(0, Math.min(x, src.cols - 1)),
            Math.max(0, Math.min(y, src.rows - 1)),
            Math.min(w, src.cols - x),
            Math.min(h, src.rows - y)
          );

          const slotMask = thresh.roi(rect);
          
          // Calculate density of black ink (which is now white in the inverted mask)
          const nonZeroCount = cv.countNonZero(slotMask);
          const totalPixels = rect.width * rect.height;
          const density = nonZeroCount / totalPixels;

          // Cleanup slot mask
          slotMask.delete();

          // Conservative thresholds
          let state: SlotState = "UNCERTAIN";
          let confidence = density;
          
          if (density < 0.005) {
            state = "EMPTY"; // Very little ink
          } else if (density > 0.02) {
            state = "DETECTED"; // Solid ink presence
          } else {
            state = "UNCERTAIN"; // Borderline
          }

          let cropDataUrl: string | undefined = undefined;

          if (state !== "EMPTY") {
            // Generate crop with some padding context
            const padX = Math.round(rect.width * 0.1);
            const padY = Math.round(rect.height * 0.1);

            const cropX = Math.max(0, rect.x - padX);
            const cropY = Math.max(0, rect.y - padY);
            const cropW = Math.min(src.cols - cropX, rect.width + padX * 2);
            const cropH = Math.min(src.rows - cropY, rect.height + padY * 2);

            const cropCanvas = document.createElement("canvas");
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext("2d");
            if (cropCtx) {
              cropCtx.drawImage(
                canvas,
                cropX, cropY, cropW, cropH,
                0, 0, cropW, cropH
              );
              cropDataUrl = cropCanvas.toDataURL("image/png");
            }
          }

          results.push({
            slot_position: slot.id,
            state,
            confidence: density,
            cropDataUrl,
          });
        }

        // Cleanup main Mats
        src.delete();
        gray.delete();
        thresh.delete();

        resolve(results);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = normalizedPageDataUrl;
  });
}
