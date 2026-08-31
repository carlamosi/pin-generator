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

  // 1. Force 1:1 square crop or centered maximum aspect ratio for consistent framing
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const squareSize = Math.min(srcW, srcH);
  const cropX = Math.max(0, Math.floor((srcW - squareSize) / 2));
  const cropY = Math.max(0, Math.floor((srcH - squareSize) / 2));

  const TARGET_DIM = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_DIM;
  canvas.height = TARGET_DIM;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new StepError("chroma", "Canvas 2D no disponible en este navegador");

  // Draw centered square crop
  ctx.drawImage(img, cropX, cropY, squareSize, squareSize, 0, 0, TARGET_DIM, TARGET_DIM);

  const w = TARGET_DIM;
  const h = TARGET_DIM;

  let src: any, hsv: any, gray: any, mask: any, foreground: any;
  try {
    src = cv.imread(canvas);
    hsv = new cv.Mat();
    gray = new cv.Mat();
    mask = new cv.Mat();
    foreground = new cv.Mat();
  } catch (e) {
    throw new StepError("chroma", `cv.imread/Mat() falló: ${(e as Error).message ?? e}`, e);
  }

  try {
    // ---- MULTI-BACKGROUND SEGMENTATION STRATEGY ----
    // 1. Check for Chroma Green (HSV: Hue 35..85, Sat > 50, Val > 50)
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Green mask
    const lowGreen = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 45, 40, 0]);
    const highGreen = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [90, 255, 255, 0]);
    const greenMask = new cv.Mat();
    cv.inRange(hsv, lowGreen, highGreen, greenMask);
    lowGreen.delete();
    highGreen.delete();

    // Check how many green pixels are in the corners
    let greenCount = 0;
    const gData = greenMask.data;
    const sampleLimit = Math.min(gData.length, 50000);
    for (let i = 0; i < sampleLimit; i++) if (gData[i] > 0) greenCount++;
    const isGreenChroma = (greenCount / sampleLimit) > 0.15;

    if (isGreenChroma) {
      // Invert green mask to get foreground
      cv.bitwise_not(greenMask, foreground);
      console.log(`${tag} strategy=chroma-green active`);
    } else {
      // 2. Corner-sampled background color distance (adaptive for white, grey, table, etc.)
      const band = Math.floor(w * 0.08); // 8% border
      let bgR = 0, bgG = 0, bgB = 0, bgSamples = 0;
      const imgData = ctx.getImageData(0, 0, w, h).data;

      // Sample corners
      const cornerRegions = [
        { x0: 0, y0: 0, x1: band, y1: band },
        { x0: w - band, y0: 0, x1: w, y1: band },
        { x0: 0, y0: h - band, x1: band, y1: h },
        { x0: w - band, y0: h - band, x1: w, y1: h },
      ];

      for (const r of cornerRegions) {
        for (let y = r.y0; y < r.y1; y += 2) {
          for (let x = r.x0; x < r.x1; x += 2) {
            const idx = (y * w + x) * 4;
            bgR += imgData[idx];
            bgG += imgData[idx + 1];
            bgB += imgData[idx + 2];
            bgSamples++;
          }
        }
      }
      bgR = bgSamples > 0 ? bgR / bgSamples : 240;
      bgG = bgSamples > 0 ? bgG / bgSamples : 240;
      bgB = bgSamples > 0 ? bgB / bgSamples : 240;

      // Create distance-based foreground mask
      const fgCanvas = document.createElement("canvas");
      fgCanvas.width = w;
      fgCanvas.height = h;
      const fgCtx = fgCanvas.getContext("2d")!;
      const fgImgData = fgCtx.createImageData(w, h);

      const colorThreshold = 38; // Distance from mean background
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const dr = Math.abs(imgData[idx] - bgR);
          const dg = Math.abs(imgData[idx + 1] - bgG);
          const db = Math.abs(imgData[idx + 2] - bgB);
          const dist = (dr + dg + db) / 3;

          // If different from background, it's foreground
          const val = dist > colorThreshold ? 255 : 0;
          fgImgData.data[idx] = val;
          fgImgData.data[idx + 1] = val;
          fgImgData.data[idx + 2] = val;
          fgImgData.data[idx + 3] = 255;
        }
      }
      fgCtx.putImageData(fgImgData, 0, 0);

      const tempFg = cv.imread(fgCanvas);
      cv.cvtColor(tempFg, foreground, cv.COLOR_RGBA2GRAY);
      tempFg.delete();
      console.log(`${tag} strategy=adaptive-color-diff bgRGB=(${bgR.toFixed(0)},${bgG.toFixed(0)},${bgB.toFixed(0)})`);
    }
    greenMask.delete();

    // Clean up foreground mask with morphological ops
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.morphologyEx(foreground, foreground, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(foreground, foreground, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // ---- STEP: CONTOURS & OBJECT DETECTION ----
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(foreground, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = w * h * 0.005; // 0.5% of total area
    const contourInfo: Array<{
      idx: number;
      area: number;
      perimeter: number;
      circularity: number;
      rect: { x: number; y: number; width: number; height: number };
    }> = [];

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c, false);
      if (area >= minArea) {
        const perimeter = cv.arcLength(c, true);
        const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
        const rect = cv.boundingRect(c);
        contourInfo.push({ idx: i, area, perimeter, circularity, rect });
      }
      c.delete();
    }
    hierarchy.delete();

    // If no distinct contours found with high contrast, fallback to center bounding box crop
    let pinContourIdx = -1;
    let pinRect = { x: Math.floor(w * 0.15), y: Math.floor(h * 0.15), width: Math.floor(w * 0.7), height: Math.floor(h * 0.7) };
    let pinCircularity = 0.5;
    let pinWidthMm = 35.0;
    let pinHeightMm = 35.0;

    if (contourInfo.length === 0) {
      console.log(`${tag} fallback=centered-1:1-crop`);
    } else if (contourInfo.length === 1) {
      // Single pin without reference coin
      const p = contourInfo[0];
      pinContourIdx = p.idx;
      pinRect = p.rect;
      pinCircularity = p.circularity;
      const scaleFactor = 35 / Math.max(p.rect.width, p.rect.height);
      pinWidthMm = Math.round(p.rect.width * scaleFactor * 10) / 10;
      pinHeightMm = Math.round(p.rect.height * scaleFactor * 10) / 10;
    } else {
      // 2 or more objects (coin reference + pin)
      contourInfo.sort((a, b) => b.area - a.area);
      const top2 = contourInfo.slice(0, 2);
      top2.sort((a, b) => (a.rect.x + a.rect.width / 2) - (b.rect.x + b.rect.width / 2));
      const coin = top2[0];
      const pin = top2[1];

      pinContourIdx = pin.idx;
      pinRect = pin.rect;
      pinCircularity = pin.circularity;

      const coinDiamPx = (Math.sqrt(coin.area / Math.PI) * 2 + (coin.rect.width + coin.rect.height) / 2) / 2;
      const pixelsPerMm = coinDiamPx / COIN_DIAMETER_MM;
      if (pixelsPerMm > 0) {
        pinWidthMm = Math.round((pin.rect.width / pixelsPerMm) * 10) / 10;
        pinHeightMm = Math.round((pin.rect.height / pixelsPerMm) * 10) / 10;
      }
    }

    const aspect = Math.round((pinWidthMm / pinHeightMm) * 100) / 100;
    let shape = classifyShape(pinCircularity, aspect);
    if (shape === "circular") {
      const avg = Math.round(((pinWidthMm + pinHeightMm) / 2) * 10) / 10;
      pinWidthMm = avg;
      pinHeightMm = avg;
    }

    // ---- STEP: GENERATE HIGH-QUALITY CUTOUT ----
    const pad = 12;
    const x0 = Math.max(0, pinRect.x - pad);
    const y0 = Math.max(0, pinRect.y - pad);
    const x1 = Math.min(w, pinRect.x + pinRect.width + pad);
    const y1 = Math.min(h, pinRect.y + pinRect.height + pad);
    const cw = x1 - x0;
    const ch = y1 - y0;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = cw;
    outCanvas.height = ch;
    const octx = outCanvas.getContext("2d")!;
    const pinMask = cv.Mat.zeros(h, w, cv.CV_8UC1);

    if (pinContourIdx >= 0) {
      const singleVec = new cv.MatVector();
      const pc = contours.get(pinContourIdx);
      singleVec.push_back(pc);
      cv.drawContours(pinMask, singleVec, 0, new cv.Scalar(255), -1);
      pc.delete();
      singleVec.delete();
    } else {
      // Fallback mask: soft rounded rectangle
      cv.rectangle(pinMask, new cv.Point(x0 + 4, y0 + 4), new cv.Point(x1 - 4, y1 - 4), new cv.Scalar(255), -1);
    }

    const rgba = new cv.Mat();
    cv.cvtColor(src, rgba, cv.COLOR_RGB2RGBA);
    const srcData = rgba.data;
    const maskData = pinMask.data;
    const resultImgData = octx.createImageData(cw, ch);

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sx = x + x0;
        const sy = y + y0;
        const si = (sy * w + sx) * 4;
        const mi = sy * w + sx;
        const di = (y * cw + x) * 4;
        if (maskData[mi] > 0) {
          resultImgData.data[di] = srcData[si];
          resultImgData.data[di + 1] = srcData[si + 1];
          resultImgData.data[di + 2] = srcData[si + 2];
          resultImgData.data[di + 3] = 255;
        } else {
          resultImgData.data[di + 3] = 0;
        }
      }
    }
    octx.putImageData(resultImgData, 0, 0);

    rgba.delete();
    pinMask.delete();
    contours.delete();

    const cutoutUrl = outCanvas.toDataURL("image/png");

    return {
      status: "ok",
      thumbnailDataUrl: cutoutUrl,
      shape,
      widthMm: pinWidthMm || 35.0,
      heightMm: pinHeightMm || 35.0,
      aspectRatio: aspect || 1.0,
    };
  } finally {
    try { src?.delete(); } catch {}
    try { hsv?.delete(); } catch {}
    try { gray?.delete(); } catch {}
    try { mask?.delete(); } catch {}
    try { foreground?.delete(); } catch {}
  }
}
