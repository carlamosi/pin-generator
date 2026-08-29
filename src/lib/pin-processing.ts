// Client-side pin processing pipeline. OpenCV.js is loaded lazily from the local npm package.
import opencvUmdUrl from "@techstark/opencv-js/dist/opencv.js?url";

export const COIN_DIAMETER_MM = 23.25;

// Threshold for white-background segmentation (grayscale). Pixels darker than this = foreground.
export const WHITE_BG_THRESHOLD = 240;



// Detect ambiguity thresholds
const CIRCULARITY_COIN_THRESHOLD = 0.85;
const NOISE_AREA_FRACTION = 0.003;

export type PinShape =
  | "circular"
  | "cuadrado"
  | "rectangular horizontal"
  | "rectangular vertical"
  | "forma libre";

export type PinStatus = "ok" | "review" | "error";

export type StepId =
  | "zip"
  | "heic"
  | "chroma"
  | "contours"
  | "coin_pin"
  | "measure"
  | "cutout"
  | "ai"
  | "unknown";

export const STEP_LABEL_ES: Record<StepId, string> = {
  zip: "Error al leer el archivo ZIP",
  heic: "Error al convertir HEIC a JPEG",
  chroma: "Error al detectar el fondo verde",
  contours: "Error al detectar los contornos",
  coin_pin: "Error al distinguir la moneda del pin",
  measure: "Error al calcular las medidas",
  cutout: "Error al generar el recorte",
  ai: "Error al conectar con la IA",
  unknown: "Error desconocido",
};

export class StepError extends Error {
  step: StepId;
  cause?: unknown;
  constructor(step: StepId, message: string, cause?: unknown) {
    super(message);
    this.name = "StepError";
    this.step = step;
    this.cause = cause;
  }
}

export type BentoSize = "1x1" | "2x1" | "1x2" | "2x2" | "3x2" | "";

export type PinRow = {
  id: string;
  pinId?: string; // internal stable slug (primary key in Supabase)
  originalName: string;
  status: PinStatus;
  step?: StepId;
  note?: string;
  detail?: string;
  thumbnailDataUrl?: string; // in-memory PNG data URL (fresh processing)
  rawDataUrl?: string;
  cutoutImageUrl?: string;   // persisted public URL from Supabase Storage
  city: string | null;
  country: string | null;
  year: number | null;       // year of the trip, editable, not derived from createdAt
  month: number | null;      // 1..12, optional; shown as 3-letter ES abbreviation in bento
  shape: PinShape | "";
  widthMm: number | null;
  heightMm: number | null;
  aspectRatio: number | null;
  bentoSize: BentoSize;
  visualScale: number; // continuous 0.65..1.0 scale factor for image within its cell
  visited: boolean;
  isFuture: boolean;
  isEmbassy: boolean;
  manualOrder?: number;      // ordering within the collection; managed by DnD
};


// Slugify any string: lowercase, strip accents, non-alphanum → hyphens.
// Returns empty string when input has no usable characters (caller must fall
// back to the next priority — never emit a hardcoded placeholder like
// "sin-ciudad", which produces confusing shared prefixes across pins.
export function slugify(input: string | null | undefined): string {
  const base = (input ?? "").trim();
  if (!base) return "";
  return base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Priority-based slug for pinId prefix:
//   1) city  2) country  3) filename (without extension)
// Never returns a hardcoded placeholder. If all three are empty (should not
// happen at creation time), returns "pin" as an ultimate neutral fallback.
export function slugifyForPinId(
  city: string | null | undefined,
  country: string | null | undefined,
  filename: string | null | undefined,
): string {
  const fromCity = slugify(city);
  if (fromCity) return fromCity;
  const fromCountry = slugify(country);
  if (fromCountry) return fromCountry;
  const noExt = (filename ?? "").replace(/\.[^./\\]+$/, "");
  const fromFile = slugify(noExt);
  if (fromFile) return fromFile;
  return "pin";
}


// Normalize a string for accent/case-insensitive equality.
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Parse a filename into a candidate location label.
// - strips extension
// - replaces "_" and "-" with spaces
// - collapses whitespace
// - capitalizes first letter of each word
export function parseFilenameLabel(filename: string): string {
  const noExt = filename.replace(/\.[^./\\]+$/, "");
  const cleaned = noExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Given a label + Spanish country list, return either { country } (label matches
// a country name accent/case-insensitive) or { city } otherwise. Both fields
// remain user-editable afterwards.
export function labelToLocation(
  label: string,
  countries: { code: string; name: string }[],
): { city: string | null; country: string | null } {
  if (!label) return { city: null, country: null };
  const target = normalizeName(label);
  const match = countries.find((c) => normalizeName(c.name) === target);
  if (match) return { city: null, country: match.name };
  return { city: label, country: null };
}

// Compute bentoSize + visualScale for every row using quintile area thresholds.
// - bentoSize: discrete grid footprint from area tier (XS..XL) + aspectRatio.
// - visualScale: continuous 0.65..1.0 factor for the image within its cell,
//   so two pins sharing the same bentoSize still differ visually in size.
export type BentoLayoutEntry = { bentoSize: BentoSize; visualScale: number };

export function computeBentoLayout<T extends { widthMm: number | null; heightMm: number | null; aspectRatio: number | null }>(
  rows: T[],
): BentoLayoutEntry[] {
  const areas: { idx: number; area: number }[] = [];
  rows.forEach((r, idx) => {
    if (r.widthMm != null && r.heightMm != null && r.widthMm > 0 && r.heightMm > 0) {
      areas.push({ idx, area: r.widthMm * r.heightMm });
    }
  });
  const result: BentoLayoutEntry[] = rows.map(() => ({ bentoSize: "", visualScale: 1 }));
  if (areas.length === 0) return result;

  const sorted = [...areas].map((a) => a.area).sort((a, b) => a - b);
  const q = (p: number) => {
    const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
    return sorted[i];
  };
  const p20 = q(0.2);
  const p40 = q(0.4);
  const p60 = q(0.6);
  const p80 = q(0.8);
  const areaMin = sorted[0];
  const areaMax = sorted[sorted.length - 1];
  const spread = areaMax - areaMin;

  // Floor at 0.65 (slightly higher than 0.6) so smallest pins keep visual
  // presence inside their cell — verified against real pin batches.
  const SCALE_FLOOR = 0.65;
  const SCALE_CEIL = 1.0;

  for (const { idx, area } of areas) {
    const ar = rows[idx].aspectRatio ?? 1;
    let tier: "XS" | "S" | "M" | "L" | "XL";
    if (area < p20) tier = "XS";
    else if (area < p40) tier = "S";
    else if (area < p60) tier = "M";
    else if (area < p80) tier = "L";
    else tier = "XL";

    let bentoSize: BentoSize;
    if (tier === "XS" || tier === "S") {
      // Too small to justify a large footprint unless extremely elongated.
      if (ar > 1.8) bentoSize = "2x1";
      else if (ar < 0.55) bentoSize = "1x2";
      else bentoSize = "1x1";
    } else if (tier === "M") {
      if (ar > 1.1) bentoSize = "2x1";
      else if (ar < 0.9) bentoSize = "1x2";
      else bentoSize = "1x1";
    } else if (tier === "L") {
      if (ar > 1.25) bentoSize = "3x2";
      else if (ar >= 0.8) bentoSize = "2x2";
      else bentoSize = "1x2";
    } else {
      // XL
      if (ar > 1.1) bentoSize = "3x2";
      else if (ar >= 0.8) bentoSize = "2x2";
      else bentoSize = "2x2"; // no taller-than-2x2 tier available yet
    }

    const visualScale =
      spread <= 0
        ? SCALE_CEIL
        : SCALE_FLOOR + (SCALE_CEIL - SCALE_FLOOR) * ((area - areaMin) / spread);

    result[idx] = { bentoSize, visualScale: Math.max(SCALE_FLOOR, Math.min(SCALE_CEIL, visualScale)) };
  }
  return result;
}

// Back-compat wrapper: returns only the bentoSize array.
export function computeBentoSizes<T extends { widthMm: number | null; heightMm: number | null; aspectRatio: number | null }>(
  rows: T[],
): BentoSize[] {
  return computeBentoLayout(rows).map((e) => e.bentoSize);
}



// ---------- OpenCV loader with explicit local-package diagnostics ----------

let cvReady: Promise<any> | null = null;
let cvInstance: any = null;

export type OpenCVDiagnosticStage =
  | "Cargando bundle UMD de OpenCV"
  | "Bundle UMD cargado, esperando runtime WASM"
  | "Runtime inicializado";


export type OpenCVDiagnostic = {
  stage: OpenCVDiagnosticStage;
  startedAt: number | null;
  status: "idle" | "loading" | "ready" | "failed";
  rawError: string | null;
};

const OPENCV_TIMEOUT_MS = 60_000;
const diagnosticListeners = new Set<(diagnostic: OpenCVDiagnostic) => void>();
let opencvDiagnostic: OpenCVDiagnostic = {
  stage: "Cargando bundle UMD de OpenCV",
  startedAt: null,
  status: "idle",
  rawError: null,
};


function formatRawError(error: unknown): string {
  if (!error) return "ninguno";
  if (error instanceof Error) return `${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  return String(error);
}

function setOpenCVDiagnostic(patch: Partial<OpenCVDiagnostic>) {
  opencvDiagnostic = { ...opencvDiagnostic, ...patch };
  diagnosticListeners.forEach((listener) => listener(opencvDiagnostic));
}

export function getOpenCVDiagnostic(): OpenCVDiagnostic {
  return opencvDiagnostic;
}

export function subscribeOpenCVDiagnostic(listener: (diagnostic: OpenCVDiagnostic) => void) {
  diagnosticListeners.add(listener);
  listener(opencvDiagnostic);
  return () => {
    diagnosticListeners.delete(listener);
  };
}

function isCvRuntimeReady(cv: any): boolean {
  return Boolean(cv?.calcHist || cv?.Mat);
}

export function loadOpenCV(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("window undefined"));
  if (isCvRuntimeReady(cvInstance)) {
    setOpenCVDiagnostic({ stage: "Runtime inicializado", status: "ready", rawError: null });
    return Promise.resolve(cvInstance);
  }
  if (cvReady) return cvReady;

  const startedAt = Date.now();
  setOpenCVDiagnostic({
    stage: "Cargando bundle UMD de OpenCV",
    startedAt,
    status: "loading",
    rawError: null,
  });
  console.log("[opencv] loading UMD bundle: @techstark/opencv-js/dist/opencv.js");

  cvReady = (async () => {
    let lastCapturedError: unknown = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          const rawError = formatRawError(lastCapturedError);
          const message = `El motor no respondió a tiempo. Última etapa alcanzada: ${opencvDiagnostic.stage}. Error capturado: ${rawError}.`;
          reject(new Error(message));
        }, OPENCV_TIMEOUT_MS);
      });

      const initPromise = (async () => {
        // Resolve the UMD bundle as a plain asset URL via Vite's static ?url import
        // (bare specifiers can't be resolved at runtime in the browser).
        const scriptUrl: string = opencvUmdUrl;
        console.log("[opencv] UMD asset url resolved", scriptUrl);

        // Inject the UMD script; window.cv becomes a Promise<Module> (v5) or the Module (legacy).

        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>(
            'script[data-opencv-loader="1"]'
          );
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener(
              "error",
              () => reject(new Error("Fallo al cargar el <script> de OpenCV")),
              { once: true }
            );
            return;
          }
          const script = document.createElement("script");
          script.async = true;
          script.dataset.opencvLoader = "1";
          script.src = scriptUrl;
          script.onload = () => {
            console.log("[opencv] UMD script onload fired");
            resolve();
          };
          script.onerror = (event) => {
            console.error("[opencv] UMD script onerror", event);
            reject(new Error("Fallo al cargar el <script> de OpenCV"));
          };
          document.head.appendChild(script);
        });

        setOpenCVDiagnostic({
          stage: "Bundle UMD cargado, esperando runtime WASM",
          rawError: null,
        });

        const cvGlobal: any = (window as any).cv;
        console.log("[opencv] window.cv after script load", {
          type: typeof cvGlobal,
          isPromise: cvGlobal instanceof Promise,
          isThenable: Boolean(cvGlobal && typeof cvGlobal.then === "function"),
          isFunction: typeof cvGlobal === "function",
          hasMat: Boolean(cvGlobal?.Mat),
        });

        if (!cvGlobal) {
          throw new Error("El script UMD cargó pero window.cv es undefined");
        }

        let cv: any;
        if (cvGlobal instanceof Promise) {
          // v5.x UMD sets window.cv = cv(Module) where cv is async → Promise<Module>.
          try {
            cv = await cvGlobal;
          } catch (error) {
            lastCapturedError = error;
            console.error("[opencv] window.cv promise rejected", error);
            throw error;
          }
        } else if (typeof cvGlobal === "function") {
          // Some builds expose an async factory instead of an already-called promise.
          try {
            cv = await cvGlobal();
          } catch (error) {
            lastCapturedError = error;
            console.error("[opencv] window.cv() factory rejected", error);
            throw error;
          }
        } else if (isCvRuntimeReady(cvGlobal)) {
          cv = cvGlobal;
        } else {
          // Legacy v3/v4 builds: Module object that fires onRuntimeInitialized.
          await new Promise<void>((resolve, reject) => {
            try {
              cvGlobal.onRuntimeInitialized = () => resolve();
            } catch (error) {
              reject(error);
            }
          });
          cv = cvGlobal;
        }


        if (!isCvRuntimeReady(cv)) {
          throw new Error(
            "OpenCV cargó, pero Mat/calcHist no están disponibles tras la inicialización"
          );
        }

        cvInstance = cv;
        (window as any).cv = cv;
        setOpenCVDiagnostic({ stage: "Runtime inicializado", status: "ready", rawError: null });
        console.log("[opencv] runtime initialized", {
          Mat: typeof cv.Mat,
          calcHist: typeof cv.calcHist,
          elapsedMs: Date.now() - startedAt,
        });
        return cv;
      })();

      return await Promise.race([initPromise, timeoutPromise]);
    } catch (error) {
      lastCapturedError = error;
      const rawError = formatRawError(error);
      setOpenCVDiagnostic({ status: "failed", rawError });
      console.error("[opencv] initialization failed", error);
      cvReady = null;
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

  })();

  return cvReady;
}

export function isOpenCVReady(): boolean {
  return typeof window !== "undefined" && isCvRuntimeReady(cvInstance);
}

// ---------- File utilities ----------

export async function fileToImageDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("FileReader falló al leer el blob"));
    r.readAsDataURL(file);
  });
}

export async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("El navegador no pudo decodificar la imagen (formato o data URL inválido)"));
    img.src = dataUrl;
  });
}

function classifyShape(pinCircularity: number, aspect: number): PinShape {
  if (pinCircularity > CIRCULARITY_COIN_THRESHOLD) return "circular";
  if (aspect >= 0.9 && aspect <= 1.1) return "cuadrado";
  if (aspect > 1.1) return "rectangular horizontal";
  if (aspect < 0.9) return "rectangular vertical";
  return "forma libre";
}

// ---------- Main pipeline ----------

export type ProcessOutput =
  | {
      status: "ok";
      thumbnailDataUrl: string;
      shape: PinShape;
      widthMm: number;
      heightMm: number;
      aspectRatio: number;
    }
  | { status: "review"; note: string };

export async function processPinImage(
  img: HTMLImageElement,
  filename: string,
): Promise<ProcessOutput> {
  const tag = `[pipeline:${filename}]`;
  console.log(`${tag} start. naturalSize=${img.naturalWidth}x${img.naturalHeight}`);

  let cv: any;
  try {
    cv = await loadOpenCV();
  } catch (e) {
    throw new StepError("chroma", (e as Error).message ?? "loadOpenCV falló", e);
  }

  const MAX_DIM = 1600;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  console.log(`${tag} downscaled to ${w}x${h} (scale=${scale.toFixed(3)})`);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new StepError("chroma", "Canvas 2D no disponible en este navegador");
  // Composite onto solid white so PNGs with alpha-transparent backgrounds are
  // treated as if they had a white background (matches the expected input).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);


  let src: any, gray: any, mask: any, foreground: any;
  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    mask = new cv.Mat();
    foreground = new cv.Mat();
  } catch (e) {
    throw new StepError("chroma", `cv.imread/Mat() falló: ${(e as Error).message ?? e}`, e);
  }

  try {
    // ---- STEP: segmentación fondo blanco ----
    let fgFraction = 0;
    let cornerStats: { grayMean: number; whiteFraction: number } | null = null;
    try {
      console.log(`${tag} step=white-bg start`);
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Diagnostic: sample grayscale from 4 corner bands (~5% each)
      try {
        const bandW = Math.max(4, Math.floor(w * 0.05));
        const bandH = Math.max(4, Math.floor(h * 0.05));
        const gData = gray.data;
        let sumG = 0, samples = 0, whiteCount = 0;
        const cornerRects = [
          { x0: 0, y0: 0, x1: bandW, y1: bandH },
          { x0: w - bandW, y0: 0, x1: w, y1: bandH },
          { x0: 0, y0: h - bandH, x1: bandW, y1: h },
          { x0: w - bandW, y0: h - bandH, x1: w, y1: h },
        ];
        for (const r of cornerRects) {
          for (let y = r.y0; y < r.y1; y++) {
            for (let x = r.x0; x < r.x1; x++) {
              const v = gData[y * w + x];
              sumG += v;
              samples++;
              if (v >= WHITE_BG_THRESHOLD) whiteCount++;
            }
          }
        }
        cornerStats = {
          grayMean: sumG / samples,
          whiteFraction: whiteCount / samples,
        };
        console.log(
          `${tag} corner gray mean≈${cornerStats.grayMean.toFixed(0)} · ${(cornerStats.whiteFraction * 100).toFixed(1)}% ≥ ${WHITE_BG_THRESHOLD}`,
        );
      } catch (statErr) {
        console.warn(`${tag} corner gray sampling failed`, statErr);
      }

      // Foreground = pixels darker than white threshold (i.e. NOT background).
      cv.threshold(gray, foreground, WHITE_BG_THRESHOLD, 255, cv.THRESH_BINARY_INV);

      const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.morphologyEx(foreground, foreground, cv.MORPH_OPEN, kernel);
      cv.morphologyEx(foreground, foreground, cv.MORPH_CLOSE, kernel);
      kernel.delete();

      const totalPixels = w * h;
      let fgCount = 0;
      const fgData = foreground.data;
      for (let i = 0; i < fgData.length; i++) if (fgData[i] > 0) fgCount++;
      fgFraction = fgCount / totalPixels;
      console.log(
        `${tag} step=white-bg end. foreground=${(fgFraction * 100).toFixed(2)}% of image (threshold gray<${WHITE_BG_THRESHOLD})`,
      );
    } catch (e) {
      throw new StepError("chroma", (e as Error).message ?? String(e), e);
    }

    if (fgFraction < 0.005 || fgFraction > 0.7) {
      const cornerTxt = cornerStats
        ? ` · esquinas medidas: gris≈${cornerStats.grayMean.toFixed(0)} (${(cornerStats.whiteFraction * 100).toFixed(1)}% ≥ ${WHITE_BG_THRESHOLD})`
        : "";
      const note =
        fgFraction < 0.005
          ? `Casi no se detectaron objetos: sólo ${(fgFraction * 100).toFixed(2)}% de píxeles por debajo del umbral. ¿La foto tiene fondo blanco limpio?${cornerTxt}`
          : `Fondo blanco no detectado: el ${(fgFraction * 100).toFixed(1)}% de la imagen quedó como primer plano.${cornerTxt}`;
      console.warn(`${tag} white-bg review: ${note}`);
      return { status: "review", note };
    }




    // ---- STEP: contours ----
    let contours: any;
    let hierarchy: any;
    const contourInfo: Array<{
      idx: number;
      area: number;
      perimeter: number;
      circularity: number;
      rect: { x: number; y: number; width: number; height: number };
    }> = [];
    try {
      console.log(`${tag} step=contours start`);
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(
        foreground, contours, hierarchy,
        cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE,
      );

      const minArea = w * h * NOISE_AREA_FRACTION;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        const area = cv.contourArea(c, false);
        if (area < minArea) { c.delete(); continue; }
        const perimeter = cv.arcLength(c, true);
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        const rect = cv.boundingRect(c);
        contourInfo.push({ idx: i, area, perimeter, circularity, rect });
        c.delete();
      }
      hierarchy.delete();
      console.log(
        `${tag} step=contours end. found ${contours.size()} raw, ${contourInfo.length} above noise (>${minArea.toFixed(0)}px²)`,
      );
    } catch (e) {
      throw new StepError("contours", (e as Error).message ?? String(e), e);
    }

    if (contourInfo.length < 2) {
      contours.delete();
      return {
        status: "review",
        note: `No se detectaron dos objetos (moneda + pin). Contornos válidos: ${contourInfo.length}.`,
      };
    }

    // ---- STEP: coin (izquierda) vs pin (derecha) por posición X ----
    let coin: (typeof contourInfo)[number];
    let pin: (typeof contourInfo)[number];
    try {
      console.log(`${tag} step=coin_pin start (izquierda=moneda / derecha=pin)`);
      contourInfo.sort((a, b) => b.area - a.area);
      const top2 = contourInfo.slice(0, 2);
      top2.sort((a, b) => (a.rect.x + a.rect.width / 2) - (b.rect.x + b.rect.width / 2));
      coin = top2[0]; // leftmost
      pin = top2[1];  // rightmost
      const coinCx = coin.rect.x + coin.rect.width / 2;
      const pinCx = pin.rect.x + pin.rect.width / 2;
      const dxFrac = Math.abs(pinCx - coinCx) / w;
      console.log(
        `${tag} step=coin_pin end. moneda@x=${coinCx.toFixed(0)} pin@x=${pinCx.toFixed(0)} dx=${(dxFrac * 100).toFixed(1)}%`,
      );
      if (dxFrac < 0.05) {
        contours.delete();
        return {
          status: "review",
          note: "No se pudo determinar la posición de la moneda y el pin con seguridad",
        };
      }
    } catch (e) {
      contours.delete();
      throw new StepError("coin_pin", (e as Error).message ?? String(e), e);
    }


    // ---- STEP: measurement ----
    let pinWidthMm: number, pinHeightMm: number, aspect: number, shape: PinShape;
    try {
      console.log(`${tag} step=measure start`);
      const coinDiamPx =
        (Math.sqrt(coin.area / Math.PI) * 2 + (coin.rect.width + coin.rect.height) / 2) / 2;
      const pixelsPerMm = coinDiamPx / COIN_DIAMETER_MM;
      if (!isFinite(pixelsPerMm) || pixelsPerMm <= 0) {
        throw new Error(`pixels_per_mm inválido (${pixelsPerMm}) — moneda no medible`);
      }
      pinWidthMm = pin.rect.width / pixelsPerMm;
      pinHeightMm = pin.rect.height / pixelsPerMm;
      aspect = Math.round((pinWidthMm / pinHeightMm) * 100) / 100;
      shape = classifyShape(pin.circularity, aspect);
      // Circular pins: enforce equal width/height and aspectRatio 1.0.
      if (shape === "circular") {
        const avg = (pinWidthMm + pinHeightMm) / 2;
        pinWidthMm = avg;
        pinHeightMm = avg;
        aspect = 1.0;
      }
      console.log(
        `${tag} step=measure end. coinDiamPx=${coinDiamPx.toFixed(2)} px/mm=${pixelsPerMm.toFixed(3)} pin=${pinWidthMm.toFixed(2)}x${pinHeightMm.toFixed(2)}mm aspect=${aspect} shape=${shape}`,
      );
    } catch (e) {
      contours.delete();
      throw new StepError("measure", (e as Error).message ?? String(e), e);
    }

    // ---- STEP: cutout ----
    let cutout: string;
    try {
      console.log(`${tag} step=cutout start`);
      const buildCutout = (erodePx: number): string => {
        const pinMask = cv.Mat.zeros(h, w, cv.CV_8UC1);
        const singleVec = new cv.MatVector();
        const pinContour = contours.get(pin.idx);
        singleVec.push_back(pinContour);
        cv.drawContours(pinMask, singleVec, 0, new cv.Scalar(255), -1);
        pinContour.delete();
        singleVec.delete();

        if (erodePx > 0) {
          const k = cv.Mat.ones(erodePx * 2 + 1, erodePx * 2 + 1, cv.CV_8U);
          cv.erode(pinMask, pinMask, k);
          k.delete();
        }

        const pad = 10;
        const x0 = Math.max(0, pin.rect.x - pad);
        const y0 = Math.max(0, pin.rect.y - pad);
        const x1 = Math.min(w, pin.rect.x + pin.rect.width + pad);
        const y1 = Math.min(h, pin.rect.y + pin.rect.height + pad);
        const cw = x1 - x0;
        const ch = y1 - y0;

        const rgba = new cv.Mat();
        cv.cvtColor(src, rgba, cv.COLOR_RGB2RGBA);
        const srcData = rgba.data;
        const maskData = pinMask.data;

        const outCanvas = document.createElement("canvas");
        outCanvas.width = cw;
        outCanvas.height = ch;
        const octx = outCanvas.getContext("2d")!;
        const imgData = octx.createImageData(cw, ch);

        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const sx = x + x0;
            const sy = y + y0;
            const si = (sy * w + sx) * 4;
            const mi = sy * w + sx;
            const di = (y * cw + x) * 4;
            if (maskData[mi] > 0) {
              imgData.data[di] = srcData[si];
              imgData.data[di + 1] = srcData[si + 1];
              imgData.data[di + 2] = srcData[si + 2];
              imgData.data[di + 3] = 255;
            } else {
              imgData.data[di + 3] = 0;
            }
          }
        }
        rgba.delete();
        pinMask.delete();
        octx.putImageData(imgData, 0, 0);
        return outCanvas.toDataURL("image/png");
      };

      cutout = buildCutout(0);
      console.log(`${tag} step=cutout end. dataURL length=${cutout.length}`);
    } catch (e) {
      contours.delete();
      throw new StepError("cutout", (e as Error).message ?? String(e), e);
    }

    contours.delete();

    const widthMm = Math.round(pinWidthMm * 10) / 10;
    const heightMm = Math.round(pinHeightMm * 10) / 10;
    console.log(
      `${tag} RESULT status=ok moneda@x=${(coin.rect.x + coin.rect.width / 2).toFixed(0)} pin@x=${(pin.rect.x + pin.rect.width / 2).toFixed(0)} widthMm=${widthMm} heightMm=${heightMm} shape=${shape}`,
    );
    return {
      status: "ok",
      thumbnailDataUrl: cutout,
      shape,
      widthMm,
      heightMm,
      aspectRatio: aspect,
    };

  } finally {
    try { src?.delete(); } catch {}
    try { gray?.delete(); } catch {}
    try { mask?.delete(); } catch {}
    try { foreground?.delete(); } catch {}
  }
}
