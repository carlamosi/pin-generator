// Screen calibration: real pixels per physical centimeter.
// CSS `cm` assumes 96 DPI, which is almost never true. The user drags a
// reference rectangle to match a real ruler; we persist the ratio.
import { useEffect, useState } from "react";

const KEY = "pin-digitizer:px-per-cm";
// 96 DPI = 96 px/in / 2.54 cm/in = ~37.795 px/cm (browser CSS default).
export const DEFAULT_PX_PER_CM = 96 / 2.54;

export function readPxPerCm(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 5 ? n : null;
}

export function writePxPerCm(value: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, String(value));
  window.dispatchEvent(new CustomEvent("pin-digitizer:calibration"));
}

export function clearPxPerCm(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("pin-digitizer:calibration"));
}

export function usePxPerCm(): number | null {
  const [v, setV] = useState<number | null>(() => readPxPerCm());
  useEffect(() => {
    const handler = () => setV(readPxPerCm());
    window.addEventListener("pin-digitizer:calibration", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("pin-digitizer:calibration", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return v;
}
