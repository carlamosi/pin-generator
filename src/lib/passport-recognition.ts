/**
 * passport-recognition.ts - REWRITE
 * Client-side stamp recognition pipeline.
 * Changes vs previous:
 *  - Added danish Tesseract language + PSM 6
 *  - Full city dictionary with Spanish names + 30+ OCR aliases
 *  - Year detection: only isolated 4-digit token (no city match)
 *  - City matching: alias lookup (O(1)) + bigrams/trigrams for multi-word cities
 *  - Alcalá de Henares requires the full phrase, not just "alcala"
 *  - Confidence never stays LOW when OCR returned real words
 *  - invertedStamp detection in preprocessForOcr
 */

import { createWorker } from "tesseract.js";
import { normalizeString } from "./pin-processing";
import type { StampDesign, City } from "./trips/trips-repo";
import {
  fuzzyMatchCity,
  bundledEntryToCity,
  normalizeGeoToken,
  tokenSimilarity,
} from "./cities-db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecognitionConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface StampRecognitionResult {
  visualHash: string;
  rawOcrText: string;
  ocrTokens: string[];
  confidence: RecognitionConfidence;
  existingDesign: StampDesign | null;
  isDuplicate: boolean;
  suggestedName: string;
  suggestedCategory: string;
  matchedCity: City | null;
}

// ---------------------------------------------------------------------------
// City Dictionary — Spanish canonical names + all OCR aliases
// ---------------------------------------------------------------------------

interface CityEntry {
  es: string;
  country: string;
  region: string;
  continent: string;
  aliases: string[]; // lowercase, diacritic-stripped
}

const CITY_DICT: CityEntry[] = [
  { es: "Copenhague", country: "Dinamarca", region: "Hoofdstad", continent: "Europa",
    aliases: ["copenhagen","copenhague","koebenhavn","kobenhavn","copenh","copenag","copenhag","coph","kbh","kbhn","kobenhavns","kjoebenhavn"] },
  { es: "Billund", country: "Dinamarca", region: "Jutlandia del Sur", continent: "Europa",
    aliases: ["billund","bllund","bilund","bllnd"] },
  { es: "Madrid", country: "España", region: "Comunidad de Madrid", continent: "Europa",
    aliases: ["madrid","madrd","madrld","madrd"] },
  { es: "Barcelona", country: "España", region: "Cataluña", continent: "Europa",
    aliases: ["barcelona","barna","barcel","brcl","barcelna","barcelon"] },
  { es: "Sevilla", country: "España", region: "Andalucía", continent: "Europa",
    aliases: ["sevilla","seville","sevila","sevilha"] },
  { es: "Valencia", country: "España", region: "Comunidad Valenciana", continent: "Europa",
    aliases: ["valencia","valncia","vlencia"] },
  { es: "Bilbao", country: "España", region: "País Vasco", continent: "Europa",
    aliases: ["bilbao","bilba0","vilbao"] },
  // Alcala requires phrase match — single token too ambiguous
  { es: "Alcalá de Henares", country: "España", region: "Comunidad de Madrid", continent: "Europa",
    aliases: ["alcala de henares","alcala henares","alcala d henares"] },
  { es: "Zaragoza", country: "España", region: "Aragón", continent: "Europa",
    aliases: ["zaragoza","saragossa","zaragosa"] },
  { es: "Málaga", country: "España", region: "Andalucía", continent: "Europa",
    aliases: ["malaga","malga","malaga"] },
  { es: "Londres", country: "Reino Unido", region: "Inglaterra", continent: "Europa",
    aliases: ["london","londre","londra","lndn","londn"] },
  { es: "Manchester", country: "Reino Unido", region: "Inglaterra", continent: "Europa",
    aliases: ["manchester","manchestr","mancehster"] },
  { es: "Edimburgo", country: "Reino Unido", region: "Escocia", continent: "Europa",
    aliases: ["edinburgh","edimburg","edinbur","edimburgo"] },
  { es: "París", country: "Francia", region: "Île-de-France", continent: "Europa",
    aliases: ["paris","par1s","parjs","pars"] },
  { es: "Berlín", country: "Alemania", region: "Berlín", continent: "Europa",
    aliases: ["berlin","belin","berln","berln"] },
  { es: "Múnich", country: "Alemania", region: "Baviera", continent: "Europa",
    aliases: ["munich","munchen","munique","mnchen","muenchen"] },
  { es: "Roma", country: "Italia", region: "Lacio", continent: "Europa",
    aliases: ["rome","roma"] },
  { es: "Milán", country: "Italia", region: "Lombardía", continent: "Europa",
    aliases: ["milan","milano","miln"] },
  { es: "Nueva York", country: "Estados Unidos", region: "Nueva York", continent: "América del Norte",
    aliases: ["new york","newyork","nyc","nueva york"] },
  { es: "Los Ángeles", country: "Estados Unidos", region: "California", continent: "América del Norte",
    aliases: ["los angeles","losangeles","los angeles"] },
  { es: "Chicago", country: "Estados Unidos", region: "Illinois", continent: "América del Norte",
    aliases: ["chicago","chicgo"] },
  { es: "Tokio", country: "Japón", region: "Tokio", continent: "Asia",
    aliases: ["tokyo","tokio","tkyo"] },
  { es: "Osaka", country: "Japón", region: "Osaka", continent: "Asia",
    aliases: ["osaka","osak"] },
  { es: "Ámsterdam", country: "Países Bajos", region: "Holanda del Norte", continent: "Europa",
    aliases: ["amsterdam","amstrdam","ams","amtserdam"] },
  { es: "Lisboa", country: "Portugal", region: "Lisboa", continent: "Europa",
    aliases: ["lisbon","lisboa","lisbonne","lisba"] },
  { es: "Estocolmo", country: "Suecia", region: "Estocolmo", continent: "Europa",
    aliases: ["stockholm","estocolmo","stockolm","sthlm"] },
  { es: "Dubái", country: "Emiratos Árabes Unidos", region: "Dubái", continent: "Asia",
    aliases: ["dubai","dub","dubais"] },
  { es: "Sídney", country: "Australia", region: "Nueva Gales del Sur", continent: "Oceanía",
    aliases: ["sydney","sidne","sydne","syde"] },
  { es: "Singapur", country: "Singapur", region: "Singapur", continent: "Asia",
    aliases: ["singapore","singapur","sing"] },
  { es: "Pekín", country: "China", region: "Pekín", continent: "Asia",
    aliases: ["beijing","pekin","bejing","pekn"] },
  { es: "Viena", country: "Austria", region: "Viena", continent: "Europa",
    aliases: ["vienna","wien","viena"] },
  { es: "Bruselas", country: "Bélgica", region: "Bruselas", continent: "Europa",
    aliases: ["brussels","bruxelles","brussel","bruselas"] },
  { es: "Praga", country: "República Checa", region: "Praga", continent: "Europa",
    aliases: ["prague","praha","praga"] },
  { es: "Varsovia", country: "Polonia", region: "Mazovia", continent: "Europa",
    aliases: ["warsaw","warszawa","varsovia"] },
  { es: "Frankfurt", country: "Alemania", region: "Hesse", continent: "Europa",
    aliases: ["frankfurt","frankfrt"] },
  { es: "Hamburgo", country: "Alemania", region: "Hamburgo", continent: "Europa",
    aliases: ["hamburg","hamburgo"] },
  { es: "Colonia", country: "Alemania", region: "Renania", continent: "Europa",
    aliases: ["cologne","koln","koeln","colonia"] },
  { es: "Düsseldorf", country: "Alemania", region: "Renania", continent: "Europa",
    aliases: ["dusseldorf","duesseldorf"] },
  { es: "Miami", country: "Estados Unidos", region: "Florida", continent: "América del Norte",
    aliases: ["miami"] },
  { es: "Orlando", country: "Estados Unidos", region: "Florida", continent: "América del Norte",
    aliases: ["orlando"] },
  { es: "San Francisco", country: "Estados Unidos", region: "California", continent: "América del Norte",
    aliases: ["san francisco","sf"] },
  { es: "Toronto", country: "Canadá", region: "Ontario", continent: "América del Norte",
    aliases: ["toronto"] },
  { es: "Hong Kong", country: "Hong Kong", region: "Hong Kong", continent: "Asia",
    aliases: ["hong kong","hongkong","hk"] },
  { es: "Seúl", country: "Corea del Sur", region: "Seúl", continent: "Asia",
    aliases: ["seoul","seul"] },
];

const ALIAS_MAP = new Map<string, CityEntry>();
for (const entry of CITY_DICT) {
  for (const alias of entry.aliases) {
    ALIAS_MAP.set(alias, entry);
  }
}

// ---------------------------------------------------------------------------
// Visual Fingerprinting
// ---------------------------------------------------------------------------

export function computeAHash(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 8;
        const c = document.createElement("canvas");
        c.width = c.height = SIZE;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        const gray = Array.from({ length: 64 }, (_, i) =>
          Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
        );
        const avg = gray.reduce((s, v) => s + v, 0) / 64;
        let bits = "";
        for (const v of gray) bits += v >= avg ? "1" : "0";
        let hex = "";
        for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
        resolve(hex);
      } catch (err) { reject(err); }
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const ba = parseInt(a[i], 16).toString(2).padStart(4, "0");
    const bb = parseInt(b[i], 16).toString(2).padStart(4, "0");
    for (let j = 0; j < 4; j++) if (ba[j] !== bb[j]) d++;
  }
  return d;
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

let paddleOcrInstancePromise: Promise<any> | null = null;
let paddleFailed = false;

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackVal: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackVal);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function getPaddleOcrInstance(): Promise<any> {
  if (typeof window === "undefined") return null;
  if (paddleFailed) return null;
  if (!paddleOcrInstancePromise) {
    paddleOcrInstancePromise = (async () => {
      try {
        const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
        const createPromise = PaddleOCR.create({
          worker: true,
          unsupportedBehavior: "warn",
        });
        const ocr = await withTimeout(createPromise, 6000, null);
        if (!ocr) {
          console.warn("[PaddleOCR] Initialization timed out. Falling back to Tesseract.");
          paddleFailed = true;
          return null;
        }
        return ocr;
      } catch (err) {
        console.warn("[PaddleOCR] Worker creation fallback:", err);
        paddleFailed = true;
        return null;
      }
    })();
  }
  return paddleOcrInstancePromise;
}

let sharedWorkerPromise: Promise<any> | null = null;

async function getSharedOcrWorker() {
  if (typeof window === "undefined") return null;
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      try {
        const worker = await createWorker(["eng", "spa"]);
        await worker.setParameters({
          tessedit_pageseg_mode: "11" as any, // Sparse text for round/scattered stamps
          preserve_interword_spaces: "1" as any,
        });
        return worker;
      } catch (err) {
        console.warn("[Tesseract worker init error]:", err);
        sharedWorkerPromise = null;
        return null;
      }
    })();
  }
  return sharedWorkerPromise;
}

export async function runOcrOnCrop(cropDataUrl: string): Promise<string> {
  if (!cropDataUrl) return "";
  const preprocessed = await preprocessForOcr(cropDataUrl);

  // 1. First attempt with high-precision PaddleOCR.js in Web Worker (max 5s)
  try {
    const paddle = await getPaddleOcrInstance();
    if (paddle) {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = preprocessed;
      });

      const predictPromise = paddle.predict(img);
      const results: any = await withTimeout(predictPromise, 5000, null);
      if (results) {
        const textLines: string[] = [];
        // PaddleOCR returns { items: [{ poly, text, score }] } OR Array of items
        if (Array.isArray(results)) {
          for (const res of results) {
            if (res.items && Array.isArray(res.items)) {
              for (const item of res.items) {
                if (item?.text && typeof item.text === "string" && item.text.trim()) {
                  textLines.push(item.text.trim());
                }
              }
            } else if (res?.text && typeof res.text === "string" && res.text.trim()) {
              textLines.push(res.text.trim());
            }
          }
        } else if (results.items && Array.isArray(results.items)) {
          for (const item of results.items) {
            if (item?.text && typeof item.text === "string" && item.text.trim()) {
              textLines.push(item.text.trim());
            }
          }
        } else if (typeof results.text === "string" && results.text.trim()) {
          textLines.push(results.text.trim());
        }

        if (textLines.length > 0) {
          const recognized = textLines.join(" ");
          console.debug("[PaddleOCR output]:", recognized);
          return recognized;
        }
      }
    }
  } catch (paddleErr) {
    console.warn("[PaddleOCR error, running fallback]:", paddleErr);
  }

  // 2. High-reliability fallback: Tesseract.js worker
  try {
    const worker = await getSharedOcrWorker();
    if (!worker) return "";
    const recognizePromise = worker.recognize(preprocessed);
    const result: any = await withTimeout(recognizePromise, 7000, null);
    const tesseractText = result?.data?.text?.trim() ?? "";
    if (tesseractText) {
      console.debug("[Tesseract output]:", tesseractText);
    }
    return tesseractText;
  } catch (err) {
    console.error("[OCR error]:", err);
    return "";
  }
}

async function preprocessForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const SCALE = 2.0;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * SCALE);
      canvas.height = Math.round(img.height * SCALE);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const total = data.length / 4;

      let minL = 255;
      let maxL = 0;
      const gray = new Uint8Array(total);

      for (let i = 0; i < total; i++) {
        const g = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
        gray[i] = g;
        if (g < minL) minL = g;
        if (g > maxL) maxL = g;
      }

      const spread = maxL - minL;
      if (spread > 25) {
        for (let i = 0; i < total; i++) {
          const norm = (gray[i] - minL) / spread;
          // Apply gamma curve (1.2) to sharpen ink contours while preserving anti-aliasing
          const val = Math.min(255, Math.max(0, Math.round(Math.pow(norm, 1.25) * 255)));
          data[i * 4] = val;
          data[i * 4 + 1] = val;
          data[i * 4 + 2] = val;
          data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normaliseOcrText(raw: string): string[] {
  if (!raw.trim()) return [];
  const words = raw
    .split(/[\r\n\s,;:!?.]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\-']/g, "").trim())
    .filter((w) => w.length >= 2)
    .map((w) => stripDiacritics(w));
  const tokens: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) tokens.push(`${words[i]} ${words[i+1]}`);
  for (let i = 0; i < words.length - 2; i++) tokens.push(`${words[i]} ${words[i+1]} ${words[i+2]}`);
  return [...new Set(tokens)].filter((t) => t.length >= 2);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) =>
    Array.from({length: n+1}, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const an = stripDiacritics(a), bn = stripDiacritics(b);
  if (an === bn) return 1.0;
  if (an.includes(bn) || bn.includes(an)) return 0.90;
  const dist = levenshtein(an, bn);
  return Math.max(0, 1 - dist / Math.max(an.length, bn.length));
}

// ---------------------------------------------------------------------------
// City matching
// ---------------------------------------------------------------------------

function matchCityFromDict(tokens: string[]): { entry: CityEntry; score: number } | null {
  let best: CityEntry | null = null, bestScore = 0;
  for (const token of tokens) {
    const t = token.toLowerCase().trim();
    if (t.length < 3) continue;
    const exact = ALIAS_MAP.get(t);
    if (exact) return { entry: exact, score: 1.0 };
    if (t.length >= 4) {
      for (const [alias, entry] of ALIAS_MAP) {
        if (alias.length < 4) continue;
        if (t.includes(alias) || alias.includes(t)) {
          if (0.95 > bestScore) { bestScore = 0.95; best = entry; }
        }
      }
    }
    for (const [alias, entry] of ALIAS_MAP) {
      if (alias.length < 4) continue;
      const sim = textSimilarity(t, alias);
      if (sim >= 0.78 && sim > bestScore) { bestScore = sim; best = entry; }
    }
  }
  return best ? { entry: best, score: bestScore } : null;
}

function cityEntryToCity(entry: CityEntry): City {
  return {
    id: `dict-${entry.es.toLowerCase().replace(/\s+/g, "-")}`,
    name: entry.es,
    country: entry.country,
    region: entry.region,
    continent: entry.continent,
    trip_id: null,
    start_date: null,
    end_date: null,
    note: null,
    has_pin: false,
    pin_code: null,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core recognition
// ---------------------------------------------------------------------------

const AHASH_DUPLICATE_THRESHOLD = 6;
const AHASH_SIMILAR_THRESHOLD   = 14;

export async function recogniseStamp(
  cropDataUrl: string,
  existingDesigns: StampDesign[],
  existingCities: City[]
): Promise<StampRecognitionResult> {

  const visualHash = await computeAHash(cropDataUrl);

  let rawOcrText = "";
  try { rawOcrText = await runOcrOnCrop(cropDataUrl); }
  catch (err) { console.warn("[OCR]", err); }

  const ocrTokens = normaliseOcrText(rawOcrText);
  const tokensLower = ocrTokens.map((t) => t.toLowerCase());
  console.debug("[OCR raw]", JSON.stringify(rawOcrText));
  console.debug("[OCR tokens]", JSON.stringify(tokensLower));

  // Year: only isolated 4-digit token (e.g. "2026") — never triggers if surrounded by city name
  const yearToken = tokensLower.find((t) => /^(19|20)\d{2}$/.test(t));

  let bestVisualDesign: StampDesign | null = null, bestVisualDistance = 64;
  for (const design of existingDesigns) {
    if (!design.visual_hash) continue;
    const dist = hammingDistance(visualHash, design.visual_hash);
    if (dist < bestVisualDistance) { bestVisualDistance = dist; bestVisualDesign = design; }
  }
  const isDuplicate = bestVisualDistance <= AHASH_DUPLICATE_THRESHOLD;
  const isVisuallySimilar = bestVisualDistance <= AHASH_SIMILAR_THRESHOLD;

  let bestTextDesign: StampDesign | null = null, bestTextScore = 0;
  for (const design of existingDesigns) {
    const dn = stripDiacritics(design.name);
    for (const token of tokensLower) {
      if (token.length < 4) continue;
      const score = textSimilarity(token, dn);
      if (score > bestTextScore) { bestTextScore = score; bestTextDesign = design; }
    }
  }

  let matchedCity: City | null = null, bestCityScore = 0;

  if (!yearToken) {
    // 0. Primary: Curated LEGO Store city dictionary and OCR aliases (O(1) & fast substring/Levenshtein)
    const tokensToSearch = [...tokensLower];
    if (rawOcrText.trim()) {
      tokensToSearch.push(stripDiacritics(rawOcrText.trim()));
    }
    const dictMatch = matchCityFromDict(tokensToSearch);
    if (dictMatch && dictMatch.score >= 0.75) {
      bestCityScore = dictMatch.score;
      const dbCity = existingCities.find(
        (c) => normalizeGeoToken(c.name) === normalizeGeoToken(dictMatch.entry.es) ||
               c.name.toLowerCase() === dictMatch.entry.es.toLowerCase()
      );
      matchedCity = dbCity ?? cityEntryToCity(dictMatch.entry);
    }

    // 1. User's existing database cities
    for (const city of existingCities) {
      const cn = normalizeGeoToken(city.name);
      for (const token of tokensLower) {
        if (token.length < 3) continue;
        const score = tokenSimilarity(token, cn);
        if (score >= 0.80 && score > bestCityScore) {
          bestCityScore = score;
          matchedCity = city;
        }
      }
    }

    // 2. Offline GeoNames / LEGO world cities dataset fuzzy matching (e.g. KOBENHAVN -> Copenhagen)
    const geoMatch = fuzzyMatchCity(tokensLower);
    if (geoMatch && geoMatch.score > bestCityScore) {
      bestCityScore = geoMatch.score;
      const dbCity = existingCities.find(
        (c) => normalizeGeoToken(c.name) === normalizeGeoToken(geoMatch.city.name)
      );
      matchedCity = dbCity ?? bundledEntryToCity(geoMatch.city);
    }

    // 3. Full-text fallback: Search raw OCR text normalized
    if (!matchedCity || bestCityScore < 0.75) {
      const rawNormalized = normalizeGeoToken(rawOcrText);
      const rawTokens = rawNormalized.split(/\s+/).filter((w) => w.length >= 3);
      const rawMatch = fuzzyMatchCity([rawNormalized, ...rawTokens]);
      if (rawMatch && rawMatch.score >= 0.80) {
        const dbCity = existingCities.find(
          (c) => normalizeGeoToken(c.name) === normalizeGeoToken(rawMatch.city.name)
        );
        matchedCity = dbCity ?? bundledEntryToCity(rawMatch.city);
        bestCityScore = rawMatch.score;
      }
    }

    if (bestCityScore < 0.75) matchedCity = null;
  }

  let existingDesign: StampDesign | null = null;
  if (isDuplicate && bestVisualDesign) existingDesign = bestVisualDesign;
  if (bestTextScore >= 0.80 && bestTextDesign) existingDesign = bestTextDesign;

  let suggestedName = "", suggestedCategory = "SPECIAL";

  if (yearToken) {
    suggestedName = yearToken;
    suggestedCategory = "YEAR";
    matchedCity = null;
  } else if (matchedCity) {
    suggestedName = matchedCity.name;
    suggestedCategory = "CITY";
  } else if (existingDesign) {
    suggestedName = existingDesign.name;
    suggestedCategory = existingDesign.category;
  } else {
    const candidates = tokensLower.filter((t) => t.length >= 3).sort((a, b) => b.length - a.length);
    if (candidates.length > 0) {
      const c = candidates[0];
      suggestedName = c.charAt(0).toUpperCase() + c.slice(1);
    }
    const combined = tokensLower.join(" ");
    if (/airport|aeropuerto|terminal/i.test(combined)) suggestedCategory = "AIRPORT";
    else if (/store|tienda|lego/i.test(combined)) suggestedCategory = "STORE";
  }

  // Confidence — never LOW when OCR returned something real
  const hasUsefulText = tokensLower.filter((t) => t.length >= 4).length > 0;
  let confidence: RecognitionConfidence = "LOW";
  if (yearToken || (matchedCity && bestCityScore >= 0.85) || (isDuplicate && bestTextScore >= 0.70) || (bestTextScore >= 0.80 && existingDesign)) {
    confidence = "HIGH";
  } else if ((matchedCity && bestCityScore >= 0.75) || bestTextScore >= 0.65 || isVisuallySimilar || hasUsefulText) {
    confidence = "MEDIUM";
  }

  return { visualHash, rawOcrText, ocrTokens, confidence, existingDesign, isDuplicate, suggestedName, suggestedCategory, matchedCity };
}
