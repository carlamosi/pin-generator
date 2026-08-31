/**
 * passport-recognition.ts
 *
 * Client-side stamp recognition pipeline.
 * Responsibilities:
 *  - Visual fingerprinting (aHash, 64-bit hex)
 *  - OCR via Tesseract.js
 *  - Text normalisation + fuzzy matching
 *  - Confidence evaluation (HIGH / MEDIUM / LOW)
 *  - Duplicate detection against existing stamp_designs
 *
 * Deliberate exclusions:
 *  - No external AI/vision API
 *  - No automatic date inference
 *  - No automatic trip inference
 *  - No LEGO catalogue lookup
 */

import { createWorker } from "tesseract.js";
import { normalizeString } from "./pin-processing";
import type { StampDesign, City } from "./trips/trips-repo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecognitionConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface StampRecognitionResult {
  /** 64-bit aHash hex of the crop */
  visualHash: string;
  /** Raw OCR output */
  rawOcrText: string;
  /** Cleaned, normalised OCR tokens */
  ocrTokens: string[];
  /** Confidence level for the best match */
  confidence: RecognitionConfidence;

  // Match candidates
  /** Existing design that was matched, if any */
  existingDesign: StampDesign | null;
  /** Whether this is an exact duplicate of an existing design */
  isDuplicate: boolean;
  /** Suggested name for a new design (from OCR) */
  suggestedName: string;
  /** Suggested category */
  suggestedCategory: string;
  /** Matched existing city entity */
  matchedCity: City | null;
}

// ---------------------------------------------------------------------------
// Visual Fingerprinting — Average Hash (aHash)
// ---------------------------------------------------------------------------

/**
 * Computes an 8x8 average perceptual hash of a crop image.
 * Returns a 16-character hex string (64 bits).
 *
 * Important: use as a signal alongside OCR/text, not as sole duplicate authority.
 * PostgreSQL uniqueness (stamp_design.code UNIQUE) is the final arbiter.
 */
export function computeAHash(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 8;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No 2d context");

        // Resize to 8x8
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE); // RGBA

        // Convert to grayscale values
        const gray: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          gray.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
        }

        // Average of all 64 pixels
        const avg = gray.reduce((s, v) => s + v, 0) / gray.length;

        // Build bit string: 1 if pixel >= avg, else 0
        let bits = "";
        for (const v of gray) {
          bits += v >= avg ? "1" : "0";
        }

        // Convert 64-bit string to 16-char hex
        let hex = "";
        for (let i = 0; i < 64; i += 4) {
          hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
        }

        resolve(hex);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

/**
 * Computes the Hamming distance between two 16-char hex aHash strings (0–64).
 * Lower = more similar.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const bitsA = parseInt(a[i], 16).toString(2).padStart(4, "0");
    const bitsB = parseInt(b[i], 16).toString(2).padStart(4, "0");
    for (let j = 0; j < 4; j++) {
      if (bitsA[j] !== bitsB[j]) dist++;
    }
  }
  return dist;
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

// Singleton shared worker instance to avoid re-initializing Tesseract on every crop
let sharedWorkerPromise: Promise<any> | null = null;

async function getSharedOcrWorker() {
  if (typeof window === "undefined") throw new Error("Window undefined");
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      const worker = await createWorker(["eng", "spa", "cat"]);
      return worker;
    })().catch((err) => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

/**
 * Runs Tesseract OCR on a crop data URL.
 * Uses shared Tesseract worker for maximum speed.
 */
export async function runOcrOnCrop(cropDataUrl: string): Promise<string> {
  const preprocessed = await preprocessForOcr(cropDataUrl);
  const worker = await getSharedOcrWorker();
  const result = await worker.recognize(preprocessed);
  return result.data.text ?? "";
}

/**
 * Boosts contrast of a black-ink stamp crop before OCR.
 * Converts to grayscale then applies a high-contrast threshold.
 */
/**
 * Boosts contrast of a stamp crop before OCR.
 * Upscales 2.5x and applies adaptive Otsu contrast thresholding for maximum OCR precision.
 */
async function preprocessForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2.5;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No 2d context"));

      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;

      // Compute histogram for Otsu threshold
      const hist = new Int32Array(256);
      const totalPixels = data.length / 4;

      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        hist[gray]++;
      }

      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t];

      let sumB = 0;
      let wB = 0;
      let wF = 0;
      let varMax = 0;
      let threshold = 135;

      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        wF = totalPixels - wB;
        if (wF === 0) break;

        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);

        if (varBetween > varMax) {
          varMax = varBetween;
          threshold = t;
        }
      }

      // Apply high-contrast binarization
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        const out = gray < Math.max(110, Math.min(160, threshold)) ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = out;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Text normalisation & fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Normalises a raw OCR string into clean candidate tokens (preserving digits and numbers).
 */
export function normaliseOcrText(raw: string): string[] {
  return raw
    .split(/[\r\n\s]+/)
    .map((line) => line.replace(/[^a-zA-Z0-9À-ÖØ-öø-ÿ\-']/g, "").trim())
    .filter((line) => line.length >= 2)
    .map((line) => normalizeString(line));
}

/**
 * Levenshtein distance (unbounded).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Returns a similarity score 0–1 based on Levenshtein distance.
 */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const aNorm = normalizeString(a).toLowerCase();
  const bNorm = normalizeString(b).toLowerCase();
  if (aNorm === bNorm) return 1.0;
  const dist = levenshtein(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// ---------------------------------------------------------------------------
// Core recognition
// ---------------------------------------------------------------------------

const AHASH_DUPLICATE_THRESHOLD = 6;   // ≤6 bits differ → very likely same stamp
const AHASH_SIMILAR_THRESHOLD   = 14;  // ≤14 bits → plausible visual similarity

const TEXT_HIGH_THRESHOLD   = 0.80;
const TEXT_MEDIUM_THRESHOLD = 0.50;

/**
 * Main entry-point. Analyses a single confirmed stamp crop.
 */
export async function recogniseStamp(
  cropDataUrl: string,
  existingDesigns: StampDesign[],
  existingCities: City[]
): Promise<StampRecognitionResult> {
  // 1. Visual fingerprint
  const visualHash = await computeAHash(cropDataUrl);

  // 2. OCR
  let rawOcrText = "";
  try {
    rawOcrText = await runOcrOnCrop(cropDataUrl);
  } catch (err) {
    console.warn("[passport-recognition] OCR failed:", err);
  }

  // 3. Normalise text
  const ocrTokens = normaliseOcrText(rawOcrText);
  const combinedText = (rawOcrText + " " + ocrTokens.join(" ")).toLowerCase();

  // 4. Check for 4-digit Year Stamps (e.g. 2026, 2025, 2024)
  const yearToken = ocrTokens.find((t) => /^(19|20)\d{2}$/.test(t));

  // 5. Compare visual hash against existing designs
  let bestVisualDesign: StampDesign | null = null;
  let bestVisualDistance = 64;
  for (const design of existingDesigns) {
    if (!design.visual_hash) continue;
    const dist = hammingDistance(visualHash, design.visual_hash);
    if (dist < bestVisualDistance) {
      bestVisualDistance = dist;
      bestVisualDesign = design;
    }
  }

  const isDuplicate = bestVisualDistance <= AHASH_DUPLICATE_THRESHOLD;
  const isVisuallySimilar = bestVisualDistance <= AHASH_SIMILAR_THRESHOLD;

  // 6. Compare OCR text against design names
  let bestTextDesign: StampDesign | null = null;
  let bestTextScore = 0;
  for (const design of existingDesigns) {
    const designNorm = normalizeString(design.name).toLowerCase();
    for (const token of ocrTokens) {
      if (token.length < 3) continue;
      const score = textSimilarity(token, designNorm);
      if (score > bestTextScore) {
        bestTextScore = score;
        bestTextDesign = design;
      }
    }
  }

  // 7. Strict City matching (ONLY if not a year stamp and token explicitly matches)
  let matchedCity: City | null = null;
  let bestCityScore = 0;

  if (!yearToken) {
    // 7a. Known LEGO City Patterns
    if (combinedText.includes("copenh") || combinedText.includes("copenag") || combinedText.includes("kobenhavn")) {
      matchedCity = existingCities.find((c) => /copenh/i.test(c.name)) || ({
        id: "city-copenhagen",
        name: "Copenhagen",
        country: "Dinamarca",
        region: "Hovedstaden",
        continent: "Europa",
        trip_id: null,
        start_date: null,
        end_date: null,
        notes: null,
      } as City);
      bestCityScore = 1.0;
    } else if (combinedText.includes("billund")) {
      matchedCity = existingCities.find((c) => /billund/i.test(c.name)) || ({
        id: "city-billund",
        name: "Billund",
        country: "Dinamarca",
        region: "Syddanmark",
        continent: "Europa",
        trip_id: null,
        start_date: null,
        end_date: null,
        notes: null,
      } as City);
      bestCityScore = 1.0;
    } else {
      // 7b. Strict token-by-token comparison against database cities
      for (const city of existingCities) {
        const cityNorm = normalizeString(city.name).toLowerCase();
        if (cityNorm.length < 3) continue;
        for (const token of ocrTokens) {
          if (token.length < 4) continue;
          const score = textSimilarity(token, cityNorm);
          if (score >= 0.78 && score > bestCityScore) {
            bestCityScore = score;
            matchedCity = city;
          }
        }
      }
    }
  }

  if (bestCityScore < 0.75) {
    matchedCity = null;
  }

  // 8. Determine best matching design
  let existingDesign: StampDesign | null = null;
  if (isDuplicate && bestVisualDesign) {
    existingDesign = bestVisualDesign;
  }
  if (bestTextScore >= TEXT_HIGH_THRESHOLD && bestTextDesign) {
    existingDesign = bestTextDesign;
  }

  // 9. Suggested Name & Category
  let suggestedName = "";
  let suggestedCategory = "SPECIAL";

  if (yearToken) {
    suggestedName = yearToken;
    suggestedCategory = "YEAR";
    matchedCity = null; // A year stamp represents a year, not a city!
  } else if (matchedCity) {
    suggestedName = matchedCity.name;
    suggestedCategory = "CITY";
  } else if (existingDesign) {
    suggestedName = existingDesign.name;
    suggestedCategory = existingDesign.category;
  } else if (ocrTokens.length > 0) {
    const rawBest = ocrTokens.reduce((a, b) => (a.length >= b.length ? a : b), "");
    suggestedName = rawBest ? rawBest.charAt(0).toUpperCase() + rawBest.slice(1) : "";
    const allLower = combinedText;
    if (/airport|aeropuerto|terminal/i.test(allLower)) suggestedCategory = "AIRPORT";
    else if (/store|tienda/i.test(allLower)) suggestedCategory = "STORE";
  }

  // 10. Confidence
  let confidence: RecognitionConfidence = "LOW";
  if (yearToken || (matchedCity && bestCityScore >= 0.85) || (isDuplicate && bestTextScore >= 0.70)) {
    confidence = "HIGH";
  } else if (matchedCity || bestTextScore >= 0.70 || isVisuallySimilar) {
    confidence = "MEDIUM";
  }

  return {
    visualHash,
    rawOcrText,
    ocrTokens,
    confidence,
    existingDesign,
    isDuplicate,
    suggestedName,
    suggestedCategory,
    matchedCity,
  };
}
