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

/**
 * Runs Tesseract OCR on a crop data URL.
 * Targets English, Spanish and Catalan (languages already used by pin-processing.ts).
 */
export async function runOcrOnCrop(cropDataUrl: string): Promise<string> {
  // Pre-process: boost contrast via canvas before handing to Tesseract
  const preprocessed = await preprocessForOcr(cropDataUrl);

  const worker = await createWorker(["eng", "spa", "cat"]);
  try {
    const result = await worker.recognize(preprocessed);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

/**
 * Boosts contrast of a black-ink stamp crop before OCR.
 * Converts to grayscale then applies a high-contrast threshold.
 */
async function preprocessForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No 2d context"));

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        // High contrast: anything below 128 becomes black, above becomes white
        const out = gray < 128 ? 0 : 255;
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
 * Applies common OCR substitutions then strips diacritics and lowercases.
 */
function applyOcrSubstitutions(text: string): string {
  return text
    .replace(/0/g, "O")    // zero → O (common in city names)
    .replace(/1/g, "I")    // one → I
    .replace(/\|/g, "I")   // pipe → I
    .replace(/[@]/g, "A")
    .replace(/[€]/g, "E");
}

/**
 * Normalises a raw OCR string into clean candidate tokens.
 */
export function normaliseOcrText(raw: string): string[] {
  return raw
    .split(/[\r\n]+/)
    .map((line) => applyOcrSubstitutions(line))
    .map((line) => line.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ\s\-']/g, " "))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3)
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
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// ---------------------------------------------------------------------------
// Core recognition
// ---------------------------------------------------------------------------

const AHASH_DUPLICATE_THRESHOLD = 6;   // ≤6 bits differ → very likely same stamp
const AHASH_SIMILAR_THRESHOLD   = 14;  // ≤14 bits → plausible visual similarity

const TEXT_HIGH_THRESHOLD   = 0.85;
const TEXT_MEDIUM_THRESHOLD = 0.60;

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

  // 4. Compare visual hash against existing designs
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

  // 5. Compare OCR text against design names & city names
  let bestTextDesign: StampDesign | null = null;
  let bestTextScore = 0;
  for (const design of existingDesigns) {
    const designNorm = normalizeString(design.name);
    for (const token of ocrTokens) {
      const score = textSimilarity(token, designNorm);
      if (score > bestTextScore) {
        bestTextScore = score;
        bestTextDesign = design;
      }
    }
  }

  let matchedCity: City | null = null;
  let bestCityScore = 0;
  for (const city of existingCities) {
    const cityNorm = normalizeString(city.name);
    for (const token of ocrTokens) {
      const score = textSimilarity(token, cityNorm);
      if (score > bestCityScore) {
        bestCityScore = score;
        matchedCity = city;
      }
    }
  }
  // Only accept city match if confidence is high enough
  if (bestCityScore < TEXT_MEDIUM_THRESHOLD) matchedCity = null;

  // 6. Determine best matching design (text takes precedence over visual alone)
  let existingDesign: StampDesign | null = null;

  if (isDuplicate && bestVisualDesign) {
    existingDesign = bestVisualDesign;
  }
  if (bestTextScore >= TEXT_HIGH_THRESHOLD && bestTextDesign) {
    // Text match is strong — use it (may agree or override visual)
    existingDesign = bestTextDesign;
  }
  if (!existingDesign && isVisuallySimilar && bestVisualDesign) {
    // Visual is plausible but not definitive; offer as suggestion
    existingDesign = bestVisualDesign;
  }

  // 7. Confidence
  let confidence: RecognitionConfidence;

  const hasStrongText = bestTextScore >= TEXT_HIGH_THRESHOLD;
  const hasMediumText = bestTextScore >= TEXT_MEDIUM_THRESHOLD;

  if (isDuplicate && (hasStrongText || bestTextScore > 0.5)) {
    // Combined strong visual + text
    confidence = "HIGH";
  } else if (hasStrongText && existingDesign) {
    confidence = "HIGH";
  } else if ((isVisuallySimilar && hasMediumText) || (hasStrongText && !existingDesign)) {
    confidence = "MEDIUM";
  } else if (hasMediumText || isVisuallySimilar) {
    confidence = "MEDIUM";
  } else {
    confidence = "LOW";
  }

  // If we have no existing design, confidence can't be HIGH
  if (!existingDesign && confidence === "HIGH") {
    confidence = "MEDIUM";
  }

  // 8. Suggested name for new design (best OCR token)
  const suggestedName = ocrTokens.length > 0
    ? ocrTokens.reduce((a, b) => (a.length >= b.length ? a : b), "") // longest token
    : "";

  // 9. Suggest category based on OCR/matching
  let suggestedCategory = existingDesign?.category ?? "SPECIAL";
  if (!existingDesign) {
    // Simple heuristics from OCR tokens
    const allText = ocrTokens.join(" ");
    if (/^\d{4}$/.test(suggestedName)) suggestedCategory = "YEAR";
    else if (/airport|aeropuerto|terminal/i.test(allText)) suggestedCategory = "AIRPORT";
    else if (/store|tienda/i.test(allText)) suggestedCategory = "STORE";
    else if (matchedCity) suggestedCategory = "CITY";
  }

  return {
    visualHash,
    rawOcrText,
    ocrTokens,
    confidence,
    existingDesign,
    isDuplicate,
    suggestedName:
      existingDesign?.name ?? (suggestedName
        ? suggestedName.charAt(0).toUpperCase() + suggestedName.slice(1)
        : ""),
    suggestedCategory,
    matchedCity,
  };
}
