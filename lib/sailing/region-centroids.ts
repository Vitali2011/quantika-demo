/**
 * Vague maritime range → representative centroid coordinate.
 *
 * Brokers post positions/loads as broad ranges ("WC India", "North China",
 * "Continent", "US Gulf", "Aegean") that don't resolve to a single port, so the
 * distance engine returns null and the pair shows as `unknown`. For demo realism
 * we map these ranges to a representative point so haversine yields an
 * APPROXIMATE ballast distance. Every such distance is flagged `exact:false`
 * upstream — a centroid distance is never presented as precise.
 *
 * Consulted ONLY when a string fails to normalise to a real port (see
 * port-distances.ts → portCoords), so real ports are never shadowed.
 *
 * Centroids are deliberately rough sea-points representative of the range, not
 * survey-grade coordinates. Ordering matters: more-specific rules precede
 * broader ones (north-china before china, egypt/east/west/spanish-med before
 * the generic mediterranean).
 */
export interface RegionCentroid {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

interface Rule {
  c: RegionCentroid;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  // ── NW Europe / Continent ──
  { c: { id: 'nw-europe', label: 'NW Europe / Continent (ARA)', lat: 51.9, lon: 3.6 },
    patterns: [/\bcontinent\b/, /\bnw europe\b/, /\bnorth ?west europe\b/, /\bara\b/] },
  { c: { id: 'sweden', label: 'Sweden (Gothenburg)', lat: 57.7, lon: 11.9 },
    patterns: [/\bsweden\b/] },
  { c: { id: 'cis-baltic', label: 'CIS Baltic', lat: 59.6, lon: 28.2 },
    patterns: [/\bcis baltic\b/, /\bbaltic\b/] },
  { c: { id: 'biscay', label: 'Bay of Biscay', lat: 45.5, lon: -3.5 },
    patterns: [/\bbiscay\b/] },
  // ── Mediterranean family (specific → generic) ──
  { c: { id: 'spanish-med', label: 'Spanish Mediterranean', lat: 39.4, lon: -0.3 },
    patterns: [/\bspanish med(iterranean)?\b/] },
  { c: { id: 'egypt-med', label: 'Egypt Mediterranean', lat: 31.2, lon: 29.9 },
    patterns: [/\begypt med(iterranean)?\b/] },
  { c: { id: 'east-med', label: 'East Mediterranean', lat: 34.5, lon: 28.0 },
    patterns: [/\beast med(iterranean)?\b/, /\be med\b/] },
  { c: { id: 'west-med', label: 'West Mediterranean', lat: 37.0, lon: 3.0 },
    patterns: [/\bwest med(iterranean)?\b/, /\bw med\b/] },
  { c: { id: 'east-italy', label: 'East Coast Italy (Adriatic)', lat: 43.6, lon: 13.5 },
    patterns: [/\beast coast italy\b/, /\bec italy\b/] },
  { c: { id: 'adriatic', label: 'Adriatic', lat: 42.5, lon: 16.0 },
    patterns: [/\badriatic\b/] },
  { c: { id: 'aegean', label: 'Aegean', lat: 38.5, lon: 25.0 },
    patterns: [/\baegean\b/] },
  { c: { id: 'greece', label: 'Greece (Piraeus)', lat: 37.9, lon: 23.6 },
    patterns: [/\bgreece\b/] },
  { c: { id: 'marmara', label: 'Sea of Marmara', lat: 40.7, lon: 28.0 },
    patterns: [/\bmarmara\b/] },
  { c: { id: 'black-sea', label: 'Black Sea', lat: 44.0, lon: 34.0 },
    patterns: [/\bblack sea\b/] },
  { c: { id: 'med', label: 'Mediterranean (unspecified)', lat: 37.5, lon: 14.0 },
    patterns: [/\bmediterranean\b/, /\bmed range\b/] },
  // ── Red Sea / Gulf ──
  { c: { id: 'red-sea', label: 'Red Sea', lat: 20.0, lon: 38.5 },
    patterns: [/\bred sea\b/] },
  { c: { id: 'yemen', label: 'Yemen (Aden)', lat: 12.8, lon: 45.0 },
    patterns: [/\byemen\b/] },
  { c: { id: 'persian-gulf', label: 'Persian / Arabian Gulf', lat: 26.6, lon: 52.0 },
    patterns: [/\bpersian gulf\b/, /\barabian gulf\b/] },
  { c: { id: 'west-africa', label: 'West Africa (Gulf of Guinea)', lat: 5.0, lon: 1.0 },
    patterns: [/\bwest africa\b/, /\bw africa\b/, /\bwaf\b/] },
  // ── Asia ──
  { c: { id: 'north-china', label: 'North China (Bohai)', lat: 38.9, lon: 121.6 },
    patterns: [/\bnorth china\b/] },
  { c: { id: 'china', label: 'China (unspecified)', lat: 31.2, lon: 121.5 },
    patterns: [/\bchina\b/] },
  { c: { id: 'korea', label: 'South Korea (Busan)', lat: 35.1, lon: 129.0 },
    patterns: [/\bsouth korea\b/, /\bs korea\b/, /\bskorea\b/, /\bkorea\b/] },
  { c: { id: 'ec-india', label: 'East Coast India', lat: 13.1, lon: 80.3 },
    patterns: [/\bec india\b/, /\beast coast india\b/] },
  { c: { id: 'wc-india', label: 'West Coast India', lat: 18.9, lon: 72.8 },
    patterns: [/\bwc india\b/, /\bwest coast india\b/] },
  { c: { id: 'se-asia', label: 'SE Asia (Singapore)', lat: 1.3, lon: 104.0 },
    patterns: [/\bse asia\b/, /\bsouth ?east asia\b/] },
  // ── Americas ──
  { c: { id: 'us-gulf', label: 'US Gulf', lat: 29.3, lon: -94.8 },
    patterns: [/\bus gulf\b/, /\bgulf of mexico\b/] },
  { c: { id: 'us-east-coast', label: 'US East Coast', lat: 36.9, lon: -76.0 },
    patterns: [/\busec\b/, /\bus east coast\b/] },
  { c: { id: 'ec-mexico', label: 'East Coast Mexico (Veracruz)', lat: 19.2, lon: -96.1 },
    patterns: [/\bec mexico\b/, /\beast coast mexico\b/] },
  { c: { id: 'north-brazil', label: 'North Brazil (Itaqui)', lat: -2.6, lon: -44.4 },
    patterns: [/\bnorth brazil\b/, /\bn brazil\b/] },
  { c: { id: 'santos', label: 'Santos / South Brazil', lat: -24.0, lon: -46.3 },
    patterns: [/\bsantos\b/, /\bsouth brazil\b/] },
  { c: { id: 'rio-de-la-plata', label: 'Río de la Plata / Recalada', lat: -34.9, lon: -57.0 },
    patterns: [/\brio de la plata\b/, /\brecalada\b/, /\bec south america\b/] },
  { c: { id: 'wc-south-america', label: 'West Coast South America (Callao)', lat: -12.0, lon: -77.1 },
    patterns: [/\bwc south america\b/, /\bwcsa\b/, /\bwest coast south america\b/] },
];

/** Strip parentheticals, unify separators to spaces, lowercase, collapse whitespace. */
function clean(raw: string): string {
  return raw
    .replace(/\(([^)]*)\)/g, ' ') // drop "(port unspecified)" / "(AG)" etc.
    .replace(/[‐-―]/g, ' ') // unicode dashes → space
    .replace(/[._/\\-]/g, ' ') // ascii separators → space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function regionCentroid(raw: string | null | undefined): RegionCentroid | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = clean(raw);
  if (!s) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(s))) return rule.c;
  }
  return null;
}
