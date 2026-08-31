import React, { useMemo, useState } from "react";
import { Wifi, Sparkles } from "lucide-react";
import { type FullPin } from "@/lib/trips/trips-repo";
import { cn } from "@/lib/utils";

// Origin: Terrassa, Spain
const ORIGIN_LAT = 41.5632;
const ORIGIN_LON = 2.0089;

function calculateDistanceAndBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const safeLat1 = Number(lat1) || ORIGIN_LAT;
  const safeLon1 = Number(lon1) || ORIGIN_LON;
  const safeLat2 = Number(lat2) || ORIGIN_LAT;
  const safeLon2 = Number(lon2) || ORIGIN_LON;

  const R = 6371; // Earth radius in km
  const dLat = ((safeLat2 - safeLat1) * Math.PI) / 180;
  const dLon = ((safeLon2 - safeLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((safeLat1 * Math.PI) / 180) *
      Math.cos((safeLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  const d = Math.round(R * c);

  // Bearing
  const y = Math.sin(dLon) * Math.cos((safeLat2 * Math.PI) / 180);
  const x =
    Math.cos((safeLat1 * Math.PI) / 180) * Math.sin((safeLat2 * Math.PI) / 180) -
    Math.sin((safeLat1 * Math.PI) / 180) *
      Math.cos((safeLat2 * Math.PI) / 180) *
      Math.cos(dLon);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360;

  const cardinals = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const cardinal = cardinals[Math.round(brng / 45) % 8];

  return { distance: d, bearing: Math.round(brng), cardinal };
}

// Fallback coordinates for known cities
const CITY_COORDS: Record<string, [number, number]> = {
  "Andorra la Vella": [42.5063, 1.5218],
  Madrid: [40.4168, -3.7038],
  Mérida: [38.9161, -6.3437],
  Lisboa: [38.7223, -9.1393],
  Sintra: [38.8003, -9.3783],
  Coimbra: [40.2033, -8.4103],
  Nazaré: [39.6012, -9.0712],
  Fátima: [39.6172, -8.6521],
  Salamanca: [40.9701, -5.6635],
  Soria: [41.7636, -2.4649],
  Alicante: [38.3452, -0.481],
  Gante: [51.0543, 3.7174],
  Bruselas: [50.8503, 4.3517],
  Brujas: [51.2093, 3.2247],
  Ferrol: [43.4832, -8.2369],
  "Ciudad del Cabo": [-33.9249, 18.4241],
  Ginebra: [46.2044, 6.1432],
  "Las Palmas de Gran Canaria": [28.1235, -15.4363],
  Amberes: [51.2194, 4.4025],
  Róterdam: [51.9244, 4.4777],
  Cambrils: [41.0667, 1.05],
  Copenhague: [55.6761, 12.5683],
  Hillerød: [55.9279, 12.3008],
  Malmö: [55.605, 13.0038],
  Christiania: [55.6736, 12.5976],
};

const COUNTRY_FLAGS: Record<string, string> = {
  España: "🇪🇸",
  Portugal: "🇵🇹",
  Francia: "🇫🇷",
  Andorra: "🇦🇩",
  Bélgica: "🇧🇪",
  Dinamarca: "🇩🇰",
  Suiza: "🇨🇭",
  "Países Bajos": "🇳🇱",
  Suecia: "🇸🇪",
  Sudáfrica: "🇿🇦",
  Catar: "🇶🇦",
};

interface FinishedCardProps {
  pin: FullPin;
  className?: string;
  showPinOverlay?: boolean;
  onClick?: () => void;
}

export function FinishedCard({
  pin,
  className,
  showPinOverlay = true,
  onClick,
}: FinishedCardProps) {
  const [hovered, setHovered] = useState(false);

  const coords = useMemo<[number, number]>(() => {
    if (!pin) return [ORIGIN_LAT, ORIGIN_LON];
    if (pin.satellite_params?.lat != null && pin.satellite_params?.lon != null) {
      const parsedLat = Number(pin.satellite_params.lat);
      const parsedLon = Number(pin.satellite_params.lon);
      if (!isNaN(parsedLat) && !isNaN(parsedLon)) {
        return [parsedLat, parsedLon];
      }
    }
    if (pin.city && CITY_COORDS[pin.city]) {
      return CITY_COORDS[pin.city];
    }
    return [ORIGIN_LAT, ORIGIN_LON];
  }, [pin]);

  const nav = useMemo(() => {
    return calculateDistanceAndBearing(ORIGIN_LAT, ORIGIN_LON, coords[0], coords[1]);
  }, [coords]);

  const flag = pin?.country ? COUNTRY_FLAGS[pin.country] ?? "🌍" : "🌍";
  const zoom = Number(pin?.satellite_params?.zoom) || 14;

  const tileUrl = useMemo(() => {
    const n = Math.pow(2, zoom);
    const xtile = Math.floor(((coords[1] + 180) / 360) * n);
    const latRad = (coords[0] * Math.PI) / 180;
    const ytile = Math.floor(
      ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
    );
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ytile}/${xtile}`;
  }, [coords, zoom]);

  const pinCodeDisplay = useMemo(() => {
    if (!pin) return "PIN";
    if (pin.pin_id) return pin.pin_id;
    if (pin.acquisition_date) {
      try {
        const year = new Date(pin.acquisition_date).getFullYear();
        if (!isNaN(year)) return year.toString();
      } catch {}
    }
    return "PIN";
  }, [pin]);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 select-none group",
        "aspect-[55/75] flex flex-col justify-between",
        className
      )}
      style={{
        backgroundColor: "#F4F1E8",
        boxShadow: hovered
          ? "0 24px 48px -12px rgba(0,0,0,0.9), 0 0 24px -4px rgba(108,99,255,0.4)"
          : "0 8px 24px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)",
        transform: hovered ? "translateY(-6px) scale(1.02)" : "translateY(0) scale(1)",
      }}
    >
      {/* 1. LAYER SATELLITE WITH WATERCOLOR FILTER */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img
          src={tileUrl}
          alt={pin?.city ?? "Map"}
          className="w-full h-full object-cover"
          style={{
            opacity: 0.72,
            filter: "contrast(1.18) saturate(0.92) brightness(1.02)",
            mixBlendMode: "multiply",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = "none";
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(244, 241, 232, 0.45) 65%, rgba(244, 241, 232, 0.96) 100%)",
          }}
        />
        <div className="absolute inset-1.5 rounded-xl border border-[#171717]/10 pointer-events-none" />
      </div>

      {/* 2. LAYER TYPOGRAPHY: TOP HEADER */}
      <div className="relative z-10 p-3 pt-3 flex items-start justify-between">
        <div className="space-y-0.5">
          <p
            className="text-[13px] font-bold tracking-tight text-[#171717] leading-tight"
            style={{ fontFamily: "'Space Grotesk', serif" }}
          >
            {pin?.city ?? "Ciudad"}
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[11px] leading-none">{flag}</span>
            <span className="text-[10px] font-semibold text-[#66635C] tracking-wider uppercase font-mono">
              {pin?.country ?? "Mundo"}
            </span>
          </div>
        </div>

        {/* NFC Indicator Badge */}
        <div
          className={cn(
            "h-4 w-4 rounded-full flex items-center justify-center transition-colors",
            pin?.nfc_uid ? "bg-emerald-600 text-white shadow-[0_0_8px_#00ffb2]" : "bg-[#171717]/10 text-[#66635C]/60"
          )}
          title={pin?.nfc_uid ? `NFC: ${pin.nfc_uid}` : "NFC no vinculado"}
        >
          <Wifi className="h-2.5 w-2.5" />
        </div>
      </div>

      {/* 3. LAYER PIN CUTOUT (CENTERED) */}
      <div className="relative z-20 flex-1 flex items-center justify-center p-2 min-h-0">
        {showPinOverlay && pin?.transparent_image_url ? (
          <img
            src={pin.transparent_image_url}
            alt={pin.city ?? "Pin"}
            className="max-h-[84%] max-w-[84%] object-contain transition-transform duration-300 group-hover:scale-110"
            style={{
              filter: "drop-shadow(0 10px 18px rgba(23,23,23,0.3))",
            }}
          />
        ) : (
          <div className="h-10 w-10 rounded-full border border-dashed border-[#66635C]/30 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-[#66635C]/40" />
          </div>
        )}
      </div>

      {/* 4. LAYER TYPOGRAPHY: BOTTOM FOOTER */}
      <div className="relative z-10 p-2.5 pt-1 flex items-end justify-between text-[9px] text-[#66635C] font-mono border-t border-[#171717]/10 bg-[#F4F1E8]/75 backdrop-blur-[2px]">
        {/* Pin Code / Coordinates */}
        <div>
          <span className="font-bold text-[#171717] tracking-wider">
            {pinCodeDisplay}
          </span>
          <p className="text-[8px] opacity-75">
            {Number(coords[0]).toFixed(2)}°, {Number(coords[1]).toFixed(2)}°
          </p>
        </div>

        {/* Bearing & Distance from Terrassa */}
        <div className="text-right">
          <div className="flex items-center justify-end gap-0.5 text-[#171717] font-bold">
            <span>{nav.cardinal}</span>
            <span className="text-[8px]">↗</span>
          </div>
          <p className="text-[8px] opacity-75">{nav.distance} km</p>
        </div>
      </div>
    </div>
  );
}
