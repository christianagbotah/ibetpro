import re

# Map platform IDs to their logo SVG filenames
# Regional variants map to the base brand logo
LOGO_MAP = {
    "sportybet": "sportybet",
    "bet9ja": "bet9ja",
    "1xbet": "1xbet",
    "1xbet_ci": "1xbet",
    "betway": "betway",
    "betway_gh": "betway",
    "betway_eg": "betway",
    "betway_in": "betway",
    "betway_nz": "betway",
    "22bet": "22bet",
    "melbet": "melbet",
    "parimatch": "parimatch",
    "parimatch_in": "parimatch",
    "helabet": "helabet",
    "odibets": "odibets",
    "palmsbet": "palmsbet",
    "soccabet": "soccabet",
    "mybet": "mybet",
    "msport": "msport",
    "bangbet": "bangbet",
    "cloudbet": "cloudbet",
    "hollywoodbets": "hollywoodbets",
    "supabets": "supabets",
    "betcoza": "betcoza",
    "gbets": "gbets",
    "wsb": "wsb",
    "betano_eg": "betano",
    "betano_br": "betano",
    "betano_ae": "betano",
    "betano_eu": "betano",
    "betano": "betano",
    "bet365": "bet365",
    "pinnacle": "pinnacle",
    "williamhill": "williamhill",
    "ladbrokes": "ladbrokes",
    "ladbrokes_au": "ladbrokes",
    "coral": "coral",
    "betfair": "betfair",
    "betfair_br": "betfair",
    "unibet": "unibet",
    "bwin": "bwin",
    "tipico": "tipico",
    "stoiximan": "stoiximan",
    "tempobet": "tempobet",
    "betist": "betist",
    "draftkings": "draftkings",
    "fanduel": "fanduel",
    "betmgm": "betmgm",
    "betsson": "betsson",
    "codere": "codere",
    "rushbet": "rushbet",
    "stake": "stake",
    "dafa": "dafa",
    "10cric": "10cric",
    "fun88": "fun88",
    "sportsbet": "sportsbet",
    "tab": "tab",
    "betfinal": "betfinal",
    "rabona": "rabona",
    "betwinner": "betwinner",
    "betking": "betking",
    "nairabet": "nairabet",
    "merrybet": "merrybet",
    "surebet247": "surebet247",
    "betpawa": "betpawa",
    "premierbet": "premierbet",
    "betika": "betika",
    "mozzartbet_ke": "mozzartbet",
    "shabiki": "shabiki",
    "leo_vegas": "leo_vegas",
    "mr_green": "mr_green",
    "kindred": "kindred",
    "betvictor": "betvictor",
    "boyle_sports": "boyle_sports",
    "bet_athome": "bet_athome",
    "interwetten": "interwetten",
    "sts": "sts",
    "fortuna": "fortuna",
    "superbet": "superbet",
    "rivalo": "rivalo",
}

filepath = "/home/z/my-project/src/lib/regions.ts"

with open(filepath, "r") as f:
    content = f.read()

# For each platform entry, find the `id: "xxx"` line, then insert logoPath after the `logo:` line
# We need to find each block: id: "xxx" ... logo: "xxx" and add logoPath after logo

# Strategy: find each `logo: "xxx",` line and add `logoPath: "/brokers/yyy.svg",` after it
# where yyy is derived from the platform id

# First, find all platform entries and their IDs
# We'll process line by line

lines = content.split('\n')
new_lines = []
current_platform_id = None

for i, line in enumerate(lines):
    new_lines.append(line)
    
    # Track current platform ID
    id_match = re.match(r'\s+id:\s+"([^"]+)",', line)
    if id_match:
        current_platform_id = id_match.group(1)
    
    # After logo line, insert logoPath
    logo_match = re.match(r'(\s+)logo:\s+"[^"]*",', line)
    if logo_match and current_platform_id:
        indent = logo_match.group(1)
        logo_svg = LOGO_MAP.get(current_platform_id, current_platform_id)
        logo_path = f'{indent}logoPath: "/brokers/{logo_svg}.svg",'
        new_lines.append(logo_path)

with open(filepath, "w") as f:
    f.write('\n'.join(new_lines))

print(f"Added logoPath to all platform entries. Total lines: {len(new_lines)}")
