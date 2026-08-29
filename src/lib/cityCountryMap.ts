// Local, project-scoped city → country lookup (Spanish names).
// This is intentionally curated to cities the user actually collects, not a
// general-purpose geocoder. Values must match names in `countries-es.ts` so
// the País combobox accepts them as-is.
//
// Auto-fill happens ONCE at ingestion time (see labelToLocation callers).
// Editing País manually afterwards is always respected.

const RAW: Record<string, string> = {
  // España
  "alcala de henares": "España",
  "pontevedra": "España",
  "pamplona": "España",
  "vigo": "España",
  "galicia": "España",
  "madrid": "España",
  "barcelona": "España",
  "sevilla": "España",
  "valencia": "España",
  "bilbao": "España",
  "san sebastian": "España",
  "donostia": "España",
  "granada": "España",
  "cordoba": "España",
  "toledo": "España",
  "salamanca": "España",
  "santiago de compostela": "España",
  "a coruna": "España",
  "la coruna": "España",
  "oviedo": "España",
  "gijon": "España",
  "santander": "España",
  "zaragoza": "España",
  "malaga": "España",
  "cadiz": "España",
  "palma": "España",
  "palma de mallorca": "España",
  "ibiza": "España",
  "tenerife": "España",
  "las palmas": "España",

  // Países Bajos
  "roterdam": "Países Bajos",
  "rotterdam": "Países Bajos",
  "amsterdam": "Países Bajos",
  "la haya": "Países Bajos",
  "utrecht": "Países Bajos",
  "delft": "Países Bajos",
  "eindhoven": "Países Bajos",

  // Bélgica
  "amberes": "Bélgica",
  "gante": "Bélgica",
  "brujas": "Bélgica",
  "bruselas": "Bélgica",
  "lovaina": "Bélgica",

  // Alemania
  "colonia": "Alemania",
  "berlin": "Alemania",
  "munich": "Alemania",
  "hamburgo": "Alemania",
  "frankfurt": "Alemania",
  "dresde": "Alemania",
  "nuremberg": "Alemania",
  "stuttgart": "Alemania",

  // Austria
  "salzburgo": "Austria",
  "viena": "Austria",
  "innsbruck": "Austria",
  "graz": "Austria",

  // Francia
  "paris": "Francia",
  "lyon": "Francia",
  "marsella": "Francia",
  "burdeos": "Francia",
  "niza": "Francia",
  "estrasburgo": "Francia",
  "toulouse": "Francia",

  // Italia
  "roma": "Italia",
  "milan": "Italia",
  "florencia": "Italia",
  "venecia": "Italia",
  "napoles": "Italia",
  "turin": "Italia",
  "bolonia": "Italia",
  "verona": "Italia",
  "pisa": "Italia",
  "siena": "Italia",

  // Portugal
  "lisboa": "Portugal",
  "oporto": "Portugal",
  "coimbra": "Portugal",
  "braga": "Portugal",

  // Reino Unido
  "londres": "Reino Unido",
  "edimburgo": "Reino Unido",
  "manchester": "Reino Unido",
  "liverpool": "Reino Unido",
  "glasgow": "Reino Unido",
  "oxford": "Reino Unido",
  "cambridge": "Reino Unido",
  "york": "Reino Unido",
  "bath": "Reino Unido",

  // Irlanda
  "dublin": "Irlanda",
  "galway": "Irlanda",
  "cork": "Irlanda",

  // Estados Unidos
  "seattle": "Estados Unidos",
  "nueva york": "Estados Unidos",
  "new york": "Estados Unidos",
  "los angeles": "Estados Unidos",
  "san francisco": "Estados Unidos",
  "chicago": "Estados Unidos",
  "boston": "Estados Unidos",
  "washington": "Estados Unidos",
  "miami": "Estados Unidos",
  "portland": "Estados Unidos",

  // Japón
  "tokio": "Japón",
  "kioto": "Japón",
  "osaka": "Japón",
  "nara": "Japón",
  "hiroshima": "Japón",

  // Otros europeos comunes
  "praga": "Chequia",
  "budapest": "Hungría",
  "varsovia": "Polonia",
  "cracovia": "Polonia",
  "estocolmo": "Suecia",
  "copenhague": "Dinamarca",
  "oslo": "Noruega",
  "helsinki": "Finlandia",
  "reikiavik": "Islandia",
  "atenas": "Grecia",
  "estambul": "Turquía",
  "moscu": "Rusia",
  "san petersburgo": "Rusia",
  "zurich": "Suiza",
  "ginebra": "Suiza",
  "berna": "Suiza",
  "lucerna": "Suiza",
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const LOOKUP: Map<string, string> = new Map(
  Object.entries(RAW).map(([k, v]) => [norm(k), v]),
);

export function lookupCountryForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  return LOOKUP.get(norm(city)) ?? null;
}
