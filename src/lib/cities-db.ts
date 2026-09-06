/**
 * cities-db.ts
 *
 * Offline database of world cities based on GeoNames (lutangar/cities.json)
 * and worldwide LEGO Store / Passport stamping locations.
 * Provides high-speed offline fuzzy matching and OCR error resolution
 * (e.g. KOBENHAVN -> Copenhagen / Copenhague, Dinamarca).
 */

import rawCities from './cities-data.json';
import type { City } from './trips/trips-repo';

export interface BundledCityEntry {
  name: string;
  country: string;
  countryCode: string;
  region: string;
  continent: string;
  aliases: string[];
}

export const CITIES_DATA: BundledCityEntry[] = rawCities as BundledCityEntry[];

/**
 * Strips diacritics, punctuation, and returns lowercase string
 */
export function normalizeGeoToken(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Fast Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const m = a.length;
  const n = b.length;
  const dp: number[] = Array(n + 1);

  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  return dp[n];
}

/**
 * Computes string similarity between 0 and 1
 */
export function tokenSimilarity(a: string, b: string): number {
  const an = normalizeGeoToken(a);
  const bn = normalizeGeoToken(b);
  if (!an || !bn) return 0;
  if (an === bn) return 1.0;
  if (an.includes(bn) || bn.includes(an)) {
    const minLen = Math.min(an.length, bn.length);
    const maxLen = Math.max(an.length, bn.length);
    return 0.88 + 0.12 * (minLen / maxLen);
  }
  const dist = levenshteinDistance(an, bn);
  const maxLen = Math.max(an.length, bn.length);
  return Math.max(0, 1 - dist / maxLen);
}

// Inverted index of normalized alias/name -> BundledCityEntry
const ALIAS_INDEX = new Map<string, BundledCityEntry>();
const ALL_ALIASES: Array<{ alias: string; entry: BundledCityEntry }> = [];

for (const entry of CITIES_DATA) {
  const normName = normalizeGeoToken(entry.name);
  if (normName) {
    ALIAS_INDEX.set(normName, entry);
    ALL_ALIASES.push({ alias: normName, entry });
  }
  for (const alias of entry.aliases) {
    const na = normalizeGeoToken(alias);
    if (na && na !== normName) {
      if (!ALIAS_INDEX.has(na)) {
        ALIAS_INDEX.set(na, entry);
      }
      ALL_ALIASES.push({ alias: na, entry });
    }
  }
}

export interface MatchResult {
  city: BundledCityEntry;
  score: number;
  matchedToken: string;
}

/**
 * Fuzzy matches an array of OCR tokens against the offline GeoNames / LEGO database.
 */
export function fuzzyMatchCity(tokens: string[]): MatchResult | null {
  if (!tokens || tokens.length === 0) return null;

  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const rawToken of tokens) {
    const token = normalizeGeoToken(rawToken);
    if (!token || token.length < 3) continue;

    // 1. Exact match in index
    const exact = ALIAS_INDEX.get(token);
    if (exact) {
      return { city: exact, score: 1.0, matchedToken: token };
    }

    // 2. Substring boundaries match for longer strings
    if (token.length >= 4) {
      for (const item of ALL_ALIASES) {
        if (item.alias.length < 4) continue;
        if (token === item.alias) {
          return { city: item.entry, score: 1.0, matchedToken: token };
        }
        if (item.alias.length >= 5 && (token.includes(item.alias) || item.alias.includes(token))) {
          const score = 0.90;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = { city: item.entry, score, matchedToken: token };
          }
        }
      }
    }

    // 3. Levenshtein fuzzy match
    for (const item of ALL_ALIASES) {
      if (item.alias.length < 4) continue;
      if (Math.abs(item.alias.length - token.length) > 3) continue;

      const sim = tokenSimilarity(token, item.alias);
      if (sim >= 0.82 && sim > bestScore) {
        bestScore = sim;
        bestMatch = { city: item.entry, score: sim, matchedToken: token };
      }
    }
  }

  return bestMatch;
}

/**
 * Converts a BundledCityEntry into a database City representation
 */
export function bundledEntryToCity(entry: BundledCityEntry): City {
  const slug = normalizeGeoToken(entry.name).replace(/\s+/g, '-');
  return {
    id: `dict-${slug}`,
    name: entry.name,
    country: entry.country,
    region: entry.region || null,
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
