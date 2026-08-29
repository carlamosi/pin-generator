// Lazy-loaded country outline layer. Imports world-atlas topojson + d3-geo,
// so it must never be statically referenced from the initial route bundle.
import { useEffect, useMemo, useState } from "react";
import { geoPath, geoMercator } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import { spanishNameToNumericIso } from "@/lib/country-iso";

// Cache the parsed FeatureCollection across all card instances.
let cachedPromise: Promise<FeatureCollection<Geometry, { id: string }>> | null = null;

async function loadCountries(): Promise<FeatureCollection<Geometry, { id: string }>> {
  if (cachedPromise) return cachedPromise;
  cachedPromise = (async () => {
    const topo: any = (await import("world-atlas/countries-110m.json")).default;
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<
      Geometry,
      { id: string }
    >;
    // world-atlas stores numeric ISO as `id` on each feature (string or number).
    fc.features.forEach((f: any) => {
      f.properties = f.properties ?? {};
      f.properties.id = String(f.id ?? "").padStart(3, "0");
    });
    return fc;
  })();
  return cachedPromise;
}

export function CountryOutline({
  countryName,
  isEmbassy,
}: {
  countryName: string | null;
  isEmbassy: boolean;
}) {
  const numeric = useMemo(() => spanishNameToNumericIso(countryName), [countryName]);
  const [pathD, setPathD] = useState<string | null>(null);

  useEffect(() => {
    if (!numeric) {
      setPathD(null);
      return;
    }
    let cancelled = false;
    loadCountries()
      .then((fc) => {
        if (cancelled) return;
        const match = fc.features.find((f: any) => f.properties?.id === numeric);
        if (!match) {
          setPathD(null);
          return;
        }
        // Fit the country geometry into a 100x100 viewBox for CSS scaling.
        const projection = geoMercator().fitSize([100, 100], match as any);
        const path = geoPath(projection);
        setPathD(path(match as any));
      })
      .catch(() => setPathD(null));
    return () => {
      cancelled = true;
    };
  }, [numeric]);

  if (!pathD) return null;

  const strokeColor = isEmbassy
    ? "rgba(255,255,255,0.22)"
    : "color-mix(in oklch, var(--foreground) 6%, transparent)";

  return (
    <svg
      className="bento-card__outline"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
