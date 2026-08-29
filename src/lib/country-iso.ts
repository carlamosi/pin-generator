// Map Spanish country names → ISO 3166-1 numeric code (as string, zero-padded
// to 3 digits) so we can look up country geometries in world-atlas
// (countries-110m.json uses numeric IDs).
import { COUNTRIES_ES } from "./countries-es";

// ISO 3166-1 alpha-2 → numeric (subset covering every entry in COUNTRIES_ES).
// Kept as a plain object for tree-shaking friendliness.
const ALPHA2_TO_NUMERIC: Record<string, string> = {
  AF: "004", AL: "008", DE: "276", AD: "020", AO: "024", AI: "660", AQ: "010",
  AG: "028", SA: "682", DZ: "012", AR: "032", AM: "051", AW: "533", AU: "036",
  AT: "040", AZ: "031", BS: "044", BD: "050", BB: "052", BH: "048", BE: "056",
  BZ: "084", BJ: "204", BM: "060", BY: "112", BO: "068", BA: "070", BW: "072",
  BR: "076", BN: "096", BG: "100", BF: "854", BI: "108", BT: "064", CV: "132",
  KH: "116", CM: "120", CA: "124", QA: "634", TD: "148", CL: "152", CN: "156",
  CY: "196", VA: "336", CO: "170", KM: "174", KP: "408", KR: "410", CI: "384",
  CR: "188", HR: "191", CU: "192", CW: "531", DK: "208", DM: "212", EC: "218",
  EG: "818", SV: "222", AE: "784", ER: "232", SK: "703", SI: "705", ES: "724",
  US: "840", EE: "233", SZ: "748", ET: "231", PH: "608", FI: "246", FJ: "242",
  FR: "250", GA: "266", GM: "270", GE: "268", GH: "288", GI: "292", GD: "308",
  GR: "300", GL: "304", GP: "312", GU: "316", GT: "320", GF: "254", GG: "831",
  GN: "324", GQ: "226", GW: "624", GY: "328", HT: "332", HN: "340", HK: "344",
  HU: "348", IN: "356", ID: "360", IQ: "368", IR: "364", IE: "372", IS: "352",
  KY: "136", CK: "184", FO: "234", FK: "238", MP: "580", MH: "584", SB: "090",
  TC: "796", VG: "092", VI: "850", IL: "376", IT: "380", JM: "388", JP: "392",
  JE: "832", JO: "400", KZ: "398", KE: "404", KG: "417", KI: "296", KW: "414",
  LA: "418", LS: "426", LV: "428", LB: "422", LR: "430", LY: "434", LI: "438",
  LT: "440", LU: "442", MO: "446", MK: "807", MG: "450", MY: "458", MW: "454",
  MV: "462", ML: "466", MT: "470", MA: "504", MQ: "474", MU: "480", MR: "478",
  YT: "175", MX: "484", FM: "583", MD: "498", MC: "492", MN: "496", ME: "499",
  MS: "500", MZ: "508", MM: "104", NA: "516", NR: "520", NP: "524", NI: "558",
  NE: "562", NG: "566", NU: "570", NO: "578", NC: "540", NZ: "554", OM: "512",
  NL: "528", PK: "586", PW: "585", PS: "275", PA: "591", PG: "598", PY: "600",
  PE: "604", PF: "258", PL: "616", PT: "620", PR: "630", GB: "826", CF: "140",
  CZ: "203", CG: "178", CD: "180", DO: "214", RE: "638", RW: "646", RO: "642",
  RU: "643", EH: "732", WS: "882", AS: "016", BL: "652", KN: "659", SM: "674",
  MF: "663", PM: "666", VC: "670", SH: "654", LC: "662", ST: "678", SN: "686",
  RS: "688", SC: "690", SL: "694", SG: "702", SX: "534", SY: "760", SO: "706",
  LK: "144", ZA: "710", SD: "729", SS: "728", SE: "752", CH: "756", SR: "740",
  TH: "764", TW: "158", TZ: "834", TJ: "762", TL: "626", TG: "768", TK: "772",
  TO: "776", TT: "780", TN: "788", TM: "795", TR: "792", TV: "798", UA: "804",
  UG: "800", UY: "858", UZ: "860", VU: "548", VE: "862", VN: "704", WF: "876",
  YE: "887", DJ: "262", ZM: "894", ZW: "716",
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const NAME_TO_NUMERIC = new Map<string, string>();
for (const c of COUNTRIES_ES) {
  const numeric = ALPHA2_TO_NUMERIC[c.code];
  if (numeric) NAME_TO_NUMERIC.set(norm(c.name), numeric);
}

export function spanishNameToNumericIso(name: string | null | undefined): string | null {
  if (!name) return null;
  return NAME_TO_NUMERIC.get(norm(name)) ?? null;
}
