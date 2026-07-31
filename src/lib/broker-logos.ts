// ============================================================================
// iBetPro Broker Logo URLs
// Maps platform IDs to their brand logo URLs
// Uses: official brand assets, clearbit.com, or ui-avatars.com fallback
// ============================================================================

/**
 * Get the logo URL for a broker platform.
 * Priority: 1. Official brand logo  2. Clearbit domain logo  3. UI Avatars fallback
 */
export function getBrokerLogoUrl(platformId: string, platformName: string, color: string): string {
  const logoMap: Record<string, string> = {
    // Africa - Major
    sportybet: "https://logo.clearbit.com/sportybet.com",
    bet9ja: "https://logo.clearbit.com/bet9ja.com",
    "1xbet": "https://logo.clearbit.com/1xbet.com",
    betway: "https://logo.clearbit.com/betway.com",
    "22bet": "https://logo.clearbit.com/22bet.com",
    melbet: "https://logo.clearbit.com/melbet.com",
    parimatch: "https://logo.clearbit.com/parimatch.com",
    helabet: "https://logo.clearbit.com/helabet.com",
    odibets: "https://logo.clearbit.com/odibets.com",
    palmsbet: "https://logo.clearbit.com/palmsbet.com",
    soccabet: "https://logo.clearbit.com/soccabet.com",
    mybet: "https://logo.clearbit.com/mybet.com",
    msport: "https://logo.clearbit.com/msport.com",
    bangbet: "https://logo.clearbit.com/bangbet.com",
    cloudbet: "https://logo.clearbit.com/cloudbet.com",
    hollywoodbets: "https://logo.clearbit.com/hollywoodbets.com",
    supabets: "https://logo.clearbit.com/supabets.com",
    betcoza: "https://logo.clearbit.com/betcoza.com",
    gbets: "https://logo.clearbit.com/gbets.co.za",
    wsb: "https://logo.clearbit.com/wsb.co.za",
    betking: "https://logo.clearbit.com/betking.com",
    nairabet: "https://logo.clearbit.com/nairabet.com",
    betpawa: "https://logo.clearbit.com/betpawa.com",
    premierbet: "https://logo.clearbit.com/premierbet.com",
    sportpesa: "https://logo.clearbit.com/sportpesa.com",
    betin: "https://logo.clearbit.com/betin.co.ke",

    // Europe - Major
    bet365: "https://logo.clearbit.com/bet365.com",
    pinnacle: "https://logo.clearbit.com/pinnacle.com",
    williamhill: "https://logo.clearbit.com/williamhill.com",
    ladbrokes: "https://logo.clearbit.com/ladbrokes.com",
    coral: "https://logo.clearbit.com/coral.co.uk",
    betfair: "https://logo.clearbit.com/betfair.com",
    unibet: "https://logo.clearbit.com/unibet.com",
    betano: "https://logo.clearbit.com/betano.com",
    bwin: "https://logo.clearbit.com/bwin.com",
    tipico: "https://logo.clearbit.com/tipico.com",
    stoiximan: "https://logo.clearbit.com/stoiximan.com",
    tempobet: "https://logo.clearbit.com/tempobet.com",
    betist: "https://logo.clearbit.com/betist.com",
    betano_eg: "https://logo.clearbit.com/betano.com",
    betvictor: "https://logo.clearbit.com/betvictor.com",
    mr_green: "https://logo.clearbit.com/mrgreen.com",
    leovegas: "https://logo.clearbit.com/leovegas.com",
    boylesports: "https://logo.clearbit.com/boylesports.com",
    bet_at_home: "https://logo.clearbit.com/bet-at-home.com",
    interwetten: "https://logo.clearbit.com/interwetten.com",
    sts: "https://logo.clearbit.com/sts.pl",
    fortuna: "https://logo.clearbit.com/fortuna.com",
    superbet: "https://logo.clearbit.com/superbet.com",
    efbet: "https://logo.clearbit.com/efbet.com",
    rivalo: "https://logo.clearbit.com/rivalo.com",
    youwin: "https://logo.clearbit.com/youwin.com",
    bets10: "https://logo.clearbit.com/bets10.com",
    betfinal: "https://logo.clearbit.com/betfinal.com",
    rabona: "https://logo.clearbit.com/rabona.com",

    // Americas
    draftkings: "https://logo.clearbit.com/draftkings.com",
    fanduel: "https://logo.clearbit.com/fanduel.com",
    betmgm: "https://logo.clearbit.com/betmgm.com",
    pointsbet: "https://logo.clearbit.com/pointsbet.com",
    caesars: "https://logo.clearbit.com/caesars.com",
    betano_br: "https://logo.clearbit.com/betano.com",
    betfair_br: "https://logo.clearbit.com/betfair.com",
    pixbet: "https://logo.clearbit.com/pixbet.com",
    betnacional: "https://logo.clearbit.com/betnacional.com",
    wplay: "https://logo.clearbit.com/wplay.co",
    caliente: "https://logo.clearbit.com/caliente.com",
    betcris: "https://logo.clearbit.com/betcris.com",
    codere: "https://logo.clearbit.com/codere.com",
    rushbet: "https://logo.clearbit.com/rushbet.com",

    // Asia / Middle East
    sbobet: "https://logo.clearbit.com/sbobet.com",
    maxbet: "https://logo.clearbit.com/maxbet.com",
    cmd368: "https://logo.clearbit.com/cmd368.com",
    krikya: "https://logo.clearbit.com/krikya.com",
    baji: "https://logo.clearbit.com/baji.com",
    "4rabet": "https://logo.clearbit.com/4rabet.com",
    rajabets: "https://logo.clearbit.com/rajabets.com",
    mekong88: "https://logo.clearbit.com/mekong88.com",
    dafabet: "https://logo.clearbit.com/dafabet.com",
    "10cric": "https://logo.clearbit.com/10cric.com",
    betway_in: "https://logo.clearbit.com/betway.com",
    bet365_in: "https://logo.clearbit.com/bet365.com",
    betway_pk: "https://logo.clearbit.com/betway.com",
    "1xbet_af": "https://logo.clearbit.com/1xbet.com",
    "1xbet_as": "https://logo.clearbit.com/1xbet.com",
    betway_ae: "https://logo.clearbit.com/betway.com",
    betway_sa: "https://logo.clearbit.com/betway.com",
    bet365_sa: "https://logo.clearbit.com/bet365.com",
    betway_la: "https://logo.clearbit.com/betway.com",
    bet365_ar: "https://logo.clearbit.com/bet365.com",
    betano_eu: "https://logo.clearbit.com/betano.com",
    betsson: "https://logo.clearbit.com/betsson.com",
    betsson_latam: "https://logo.clearbit.com/betsson.com",

    // Crypto / Global
    stake: "https://logo.clearbit.com/stake.com",
    sportsbet_io: "https://logo.clearbit.com/sportsbet.io",
    thunderpick: "https://logo.clearbit.com/thunderpick.com",
    nitrogen: "https://logo.clearbit.com/nitrogensports.eu",

    // Oceania
    sportsbet_aus: "https://logo.clearbit.com/sportsbet.com.au",
    ladbrokes_aus: "https://logo.clearbit.com/ladbrokes.com.au",
    tab: "https://logo.clearbit.com/tab.com.au",
    neds: "https://logo.clearbit.com/neds.com.au",
    pointsbet_aus: "https://logo.clearbit.com/pointsbet.com",
    beteasy: "https://logo.clearbit.com/beteasy.com.au",
    playabets: "https://logo.clearbit.com/playabets.co.za",
    sunbet: "https://logo.clearbit.com/sunbet.co.za",
    betway_gh: "https://logo.clearbit.com/betway.com",
    betway_eg: "https://logo.clearbit.com/betway.com",
    betway_ca: "https://logo.clearbit.com/betway.com",
    betway_ng: "https://logo.clearbit.com/betway.com",
  };

  if (logoMap[platformId]) {
    return logoMap[platformId];
  }

  // Fallback: Generate a styled text avatar using UI Avatars API
  const name = platformName.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const bgColor = color.replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bgColor}&color=ffffff&size=80&bold=true&format=svg`;
}
