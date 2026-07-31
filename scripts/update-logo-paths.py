import re

# Brokers that have real PNG logos
HAS_REAL_PNG = {
    "sportybet", "betway", "1xbet", "bet365", "bet9ja", "22bet",
    "melbet", "stake", "betwinner", "draftkings", "fanduel", "betmgm",
    "pinnacle", "williamhill", "unibet", "bwin", "betfair", "ladbrokes",
    "hollywoodbets", "sportpesa", "betika", "parimatch", "cloudbet",
    "betking", "nairabet", "supabets", "betano", "tipico", "mozzartbet",
    "bangbet", "odibets",
}

# Base brand mapping (regional variants map to base brand)
BASE_MAP = {
    "sportybet": "sportybet", "bet9ja": "bet9ja", "1xbet": "1xbet",
    "1xbet_ci": "1xbet", "1xbet_asia": "1xbet",
    "betway": "betway", "betway_gh": "betway", "betway_eg": "betway",
    "betway_in": "betway", "betway_nz": "betway", "betway_za": "betway",
    "betway_ca": "betway", "betway_asia": "betway", "betway_latam": "betway",
    "22bet": "22bet", "melbet": "melbet", "parimatch": "parimatch",
    "parimatch_in": "parimatch", "helabet": "helabet", "odibets": "odibets",
    "palmsbet": "palmsbet", "soccabet": "soccabet", "mybet": "mybet",
    "msport": "msport", "bangbet": "bangbet", "cloudbet": "cloudbet",
    "betking": "betking", "nairabet": "nairabet", "betpawa": "betpawa",
    "premierbet": "premierbet", "merrybet": "merrybet", "surebet247": "surebet247",
    "sportpesa": "sportpesa", "betika": "betika", "mozzartbet_ke": "mozzartbet",
    "shabiki": "shabiki", "hollywoodbets": "hollywoodbets", "supabets": "supabets",
    "betcoza": "betcoza", "gbets": "gbets", "wsb": "wsb",
    "playabets": "playabets", "sunbet": "sunbet", "betano_eg": "betano",
    "bet365": "bet365", "bet365_ar": "bet365", "bet365_br": "bet365",
    "bet365_in": "bet365", "bet365_za": "bet365",
    "pinnacle": "pinnacle", "williamhill": "williamhill",
    "ladbrokes": "ladbrokes", "ladbrokes_au": "ladbrokes",
    "coral": "coral", "betfair": "betfair", "betfair_br": "betfair",
    "unibet": "unibet", "betano": "betano", "betano_br": "betano",
    "betano_ae": "betano", "betano_eu": "betano",
    "bwin": "bwin", "tipico": "tipico", "stoiximan": "stoiximan",
    "tempobet": "tempobet", "tempobet_tr": "tempobet",
    "betist": "betist", "betist_tr": "betist",
    "betvictor": "betvictor", "mr_green": "mr_green",
    "leo_vegas": "leo_vegas", "boyle_sports": "boyle_sports",
    "bet_athome": "bet_athome", "interwetten": "interwetten",
    "sts": "sts", "fortuna": "fortuna", "superbet": "superbet",
    "rivalo": "rivalo", "betfinal": "betfinal", "rabona": "rabona",
    "betsson": "betsson", "betsson_latam": "betsson",
    "codere": "codere", "rushbet": "rushbet", "efbet": "efbet",
    "youwin": "youwin", "bets10": "bets10", "kindred": "kindred",
    "draftkings": "draftkings", "fanduel": "fanduel", "betmgm": "betmgm",
    "barstool": "barstool", "pointsbet": "pointsbet", "caesars": "caesars",
    "pixbet": "pixbet", "betnacional": "betnacional", "wplay": "wplay",
    "caliente": "caliente", "betcris": "betcris",
    "sbobet": "sbobet", "maxbet": "maxbet", "cmd368": "cmd368",
    "krikya": "krikya", "baji": "baji", "4rabet": "4rabet",
    "rajabets": "rajabets", "mekong": "mekong", "dafa": "dafa",
    "10cric": "10cric", "fun88": "fun88", "stake": "stake",
    "stake_crypto": "stake", "betwinner": "betwinner",
    "sportsbet_io": "sportsbet", "thunderpick": "thunderpick",
    "sportsbet": "sportsbet", "tab": "tab",
}

filepath = "/home/z/my-project/src/lib/regions.ts"

with open(filepath, "r") as f:
    content = f.read()

# Replace all logoPath entries with the correct extension
# Pattern: logoPath: "/brokers/xxx.svg",
def replace_logo_path(match):
    indent = match.group(1)
    current_path = match.group(2)
    # Extract the filename without extension
    filename = current_path.replace("/brokers/", "").replace(".svg", "").replace(".png", "")
    # Determine the extension
    base = BASE_MAP.get(filename, filename)
    if base in HAS_REAL_PNG:
        new_path = f"/brokers/{base}.png"
    else:
        new_path = f"/brokers/{base}.svg"
    return f'{indent}logoPath: "{new_path}",'

content = re.sub(r'(\s+)logoPath:\s+"([^"]+)",', replace_logo_path, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated logoPath entries to use .png for real logos and .svg for others")
