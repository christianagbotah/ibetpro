// ============================================================================
// iBetPro Broker Logo URLs
// Maps platform IDs to their brand logo SVG files served locally
// Local SVGs are stored in /public/brokers/ for reliable, fast loading
// ============================================================================

// Base brand to logo file mapping (regional variants map to the same base brand)
const BASE_LOGO_MAP: Record<string, string> = {
  // Africa - West Africa
  sportybet: "sportybet",
  bet9ja: "bet9ja",
  "1xbet": "1xbet",
  "1xbet_ci": "1xbet",
  "1xbet_asia": "1xbet",
  betway: "betway",
  betway_gh: "betway",
  betway_eg: "betway",
  betway_in: "betway",
  betway_nz: "betway",
  betway_za: "betway",
  betway_ca: "betway",
  betway_asia: "betway",
  betway_latam: "betway",
  "22bet": "22bet",
  melbet: "melbet",
  parimatch: "parimatch",
  parimatch_in: "parimatch",
  helabet: "helabet",
  odibets: "odibets",
  palmsbet: "palmsbet",
  soccabet: "soccabet",
  mybet: "mybet",
  msport: "msport",
  bangbet: "bangbet",
  cloudbet: "cloudbet",
  betking: "betking",
  nairabet: "nairabet",
  betpawa: "betpawa",
  premierbet: "premierbet",
  merrybet: "merrybet",
  surebet247: "surebet247",

  // Africa - East Africa
  sportpesa: "sportpesa",
  betika: "betika",
  mozzartbet_ke: "mozzartbet",
  shabiki: "shabiki",

  // Africa - Southern Africa
  hollywoodbets: "hollywoodbets",
  supabets: "supabets",
  betcoza: "betcoza",
  gbets: "gbets",
  wsb: "wsb",
  playabets: "playabets",
  sunbet: "sunbet",

  // Africa - North Africa
  betano_eg: "betano",

  // Europe - Major
  bet365: "bet365",
  bet365_ar: "bet365",
  bet365_br: "bet365",
  bet365_in: "bet365",
  bet365_za: "bet365",
  pinnacle: "pinnacle",
  williamhill: "williamhill",
  ladbrokes: "ladbrokes",
  ladbrokes_au: "ladbrokes",
  coral: "coral",
  betfair: "betfair",
  betfair_br: "betfair",
  unibet: "unibet",
  betano: "betano",
  betano_br: "betano",
  betano_ae: "betano",
  betano_eu: "betano",
  bwin: "bwin",
  tipico: "tipico",
  stoiximan: "stoiximan",
  tempobet: "tempobet",
  tempobet_tr: "tempobet",
  betist: "betist",
  betist_tr: "betist",
  betvictor: "betvictor",
  mr_green: "mr_green",
  leo_vegas: "leo_vegas",
  boyle_sports: "boyle_sports",
  bet_athome: "bet_athome",
  interwetten: "interwetten",
  sts: "sts",
  fortuna: "fortuna",
  superbet: "superbet",
  rivalo: "rivalo",
  betfinal: "betfinal",
  rabona: "rabona",
  betsson: "betsson",
  betsson_latam: "betsson",
  codere: "codere",
  rushbet: "rushbet",
  efbet: "efbet",
  youwin: "youwin",
  bets10: "bets10",
  kindred: "kindred",

  // Americas
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
  barstool: "barstool",
  pointsbet: "pointsbet",
  caesars: "caesars",
  pixbet: "pixbet",
  betnacional: "betnacional",
  wplay: "wplay",
  caliente: "caliente",
  betcris: "betcris",

  // Asia / Middle East
  sbobet: "sbobet",
  maxbet: "maxbet",
  cmd368: "cmd368",
  krikya: "krikya",
  baji: "baji",
  "4rabet": "4rabet",
  rajabets: "rajabets",
  mekong: "mekong",
  dafa: "dafa",
  "10cric": "10cric",
  fun88: "fun88",
  stake: "stake",
  stake_crypto: "stake",
  betwinner: "betwinner",
  sportsbet_io: "sportsbet",
  thunderpick: "thunderpick",

  // Oceania
  sportsbet: "sportsbet",
  tab: "tab",
};

/**
 * Get the logo path for a broker platform.
 * Uses local SVG files stored in /public/brokers/ for reliable, fast loading.
 * Falls back to a generated SVG data URL if no local file exists.
 */
export function getBrokerLogoUrl(platformId: string, platformName: string, color: string): string {
  const baseLogo = BASE_LOGO_MAP[platformId];
  if (baseLogo) {
    return `/brokers/${baseLogo}.svg`;
  }

  // Fallback: Generate a styled SVG data URL with the brand color and abbreviation
  const bgColor = color || "#10b981";
  const abbr = platformName
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .substring(0, 3)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="30" fill="${bgColor}"/><text x="100" y="120" font-family="Arial,sans-serif" font-weight="bold" font-size="60" fill="white" text-anchor="middle">${abbr}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Get the local logo path from the platform's logoPath field.
 * Returns the logoPath directly, or falls back to getBrokerLogoUrl.
 */
export function getPlatformLogoPath(platform: { id: string; name: string; color: string; logoPath?: string }): string {
  if (platform.logoPath) {
    return platform.logoPath;
  }
  return getBrokerLogoUrl(platform.id, platform.name, platform.color);
}
