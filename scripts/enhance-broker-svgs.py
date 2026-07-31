import os

# Enhanced SVG templates with gradient backgrounds, better typography, and professional look
# Each broker gets a unique design with their brand colors

BROKER_DESIGNS = {
    "sportybet": {
        "bg": "#1DB954", "accent": "#0FA349", "text_color": "white",
        "lines": ["SPORTY", "BET"], "font_size": [36, 48], "y": [72, 128]
    },
    "bet9ja": {
        "bg": "#006B3F", "accent": "#004D2E", "text_color": "#FFD700",
        "lines": ["Bet9ja"], "font_size": [48], "y": [118]
    },
    "1xbet": {
        "bg": "#1A2B6C", "accent": "#0D1B4A", "text_color": "white",
        "lines": ["1xBet"], "font_size": [56], "y": [118]
    },
    "betway": {
        "bg": "#000000", "accent": "#1A1A1A", "text_color": "#FFD700",
        "lines": ["BETWAY"], "font_size": [44], "y": [118]
    },
    "22bet": {
        "bg": "#EF4136", "accent": "#C62828", "text_color": "white",
        "lines": ["22Bet"], "font_size": [52], "y": [118]
    },
    "melbet": {
        "bg": "#E31E24", "accent": "#B71C1C", "text_color": "white",
        "lines": ["MELBET"], "font_size": [44], "y": [118]
    },
    "parimatch": {
        "bg": "#FF6600", "accent": "#E65100", "text_color": "white",
        "lines": ["PARI", "MATCH"], "font_size": [36, 36], "y": [78, 128]
    },
    "helabet": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "white",
        "lines": ["HELABET"], "font_size": [42], "y": [118]
    },
    "odibets": {
        "bg": "#1B5E20", "accent": "#0D3B0F", "text_color": "#4CAF50",
        "lines": ["ODI", "BETS"], "font_size": [40, 40], "y": [78, 128]
    },
    "palmsbet": {
        "bg": "#E65100", "accent": "#BF360C", "text_color": "white",
        "lines": ["PALMS", "BET"], "font_size": [36, 36], "y": [78, 128]
    },
    "soccabet": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["SOCCA", "BET"], "font_size": [36, 36], "y": [78, 128]
    },
    "mybet": {
        "bg": "#1A237E", "accent": "#0D1342", "text_color": "#64B5F6",
        "lines": ["mybet"], "font_size": [48], "y": [118]
    },
    "msport": {
        "bg": "#FF6D00", "accent": "#E65100", "text_color": "white",
        "lines": ["MSPORT"], "font_size": [44], "y": [118]
    },
    "bangbet": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["BANG", "BET"], "font_size": [38, 38], "y": [78, 128]
    },
    "cloudbet": {
        "bg": "#0277BD", "accent": "#01579B", "text_color": "white",
        "lines": ["CLOUD", "BET"], "font_size": [36, 36], "y": [78, 128]
    },
    "hollywoodbets": {
        "bg": "#4A148C", "accent": "#38006b", "text_color": "#FFD700",
        "lines": ["HOLLY", "WOOD"], "font_size": [34, 34], "y": [78, 128]
    },
    "supabets": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "white",
        "lines": ["SUPA", "BETS"], "font_size": [38, 38], "y": [78, 128]
    },
    "betcoza": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "#FFD700",
        "lines": ["BET", "COZA"], "font_size": [42, 42], "y": [78, 128]
    },
    "gbets": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "white",
        "lines": ["GBETS"], "font_size": [48], "y": [118]
    },
    "wsb": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "#FFD700",
        "lines": ["WSB"], "font_size": [56], "y": [118]
    },
    "betking": {
        "bg": "#6A1B9A", "accent": "#4A0072", "text_color": "#FFD700",
        "lines": ["Bet", "King"], "font_size": [42, 42], "y": [78, 128]
    },
    "nairabet": {
        "bg": "#FF6600", "accent": "#E65100", "text_color": "white",
        "lines": ["NAIRA", "BET"], "font_size": [36, 36], "y": [78, 128]
    },
    "betpawa": {
        "bg": "#FFC107", "accent": "#FF8F00", "text_color": "#333333",
        "lines": ["bet", "PAWA"], "font_size": [42, 42], "y": [78, 128]
    },
    "premierbet": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["PREMIER", "BET"], "font_size": [30, 30], "y": [78, 128]
    },
    "sportpesa": {
        "bg": "#009639", "accent": "#006625", "text_color": "white",
        "lines": ["SPORT", "PESA"], "font_size": [34, 34], "y": [78, 128]
    },
    "betika": {
        "bg": "#FF8C00", "accent": "#E67E00", "text_color": "white",
        "lines": ["BETIKA"], "font_size": [46], "y": [118]
    },
    "mozzartbet": {
        "bg": "#CC0000", "accent": "#990000", "text_color": "white",
        "lines": ["MOZZART", "BET"], "font_size": [30, 30], "y": [78, 128]
    },
    "shabiki": {
        "bg": "#FF6D00", "accent": "#E65100", "text_color": "white",
        "lines": ["SHABIKI"], "font_size": [38], "y": [118]
    },
    "merrybet": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "#FFD700",
        "lines": ["MERRY", "BET"], "font_size": [34, 34], "y": [78, 128]
    },
    "surebet247": {
        "bg": "#1B5E20", "accent": "#0D3B0F", "text_color": "white",
        "lines": ["SURE", "BET247"], "font_size": [34, 28], "y": [78, 128]
    },
    "bet365": {
        "bg": "#1D1D1D", "accent": "#0A0A0A", "text_color": "#FFCE00",
        "lines": ["bet365"], "font_size": [52], "y": [118]
    },
    "pinnacle": {
        "bg": "#003366", "accent": "#001A33", "text_color": "white",
        "lines": ["PINNACLE"], "font_size": [36], "y": [118]
    },
    "williamhill": {
        "bg": "#003366", "accent": "#001A33", "text_color": "white",
        "lines": ["WILLIAM", "HILL"], "font_size": [30, 38], "y": [78, 128]
    },
    "ladbrokes": {
        "bg": "#CC0000", "accent": "#990000", "text_color": "white",
        "lines": ["LAD", "BROKES"], "font_size": [36, 36], "y": [78, 128]
    },
    "coral": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "white",
        "lines": ["CORAL"], "font_size": [48], "y": [118]
    },
    "betfair": {
        "bg": "#FFB81C", "accent": "#E6A317", "text_color": "#003366",
        "lines": ["Betfair"], "font_size": [44], "y": [118]
    },
    "unibet": {
        "bg": "#00984A", "accent": "#006B34", "text_color": "white",
        "lines": ["UNIBET"], "font_size": [42], "y": [118]
    },
    "betano": {
        "bg": "#00897B", "accent": "#00695C", "text_color": "white",
        "lines": ["BETANO"], "font_size": [42], "y": [118]
    },
    "bwin": {
        "bg": "#FF0000", "accent": "#CC0000", "text_color": "white",
        "lines": ["bwin"], "font_size": [56], "y": [118]
    },
    "tipico": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["TIPICO"], "font_size": [42], "y": [118]
    },
    "stoiximan": {
        "bg": "#1B5E20", "accent": "#0D3B0F", "text_color": "#4CAF50",
        "lines": ["STOIXI", "MAN"], "font_size": [32, 32], "y": [78, 128]
    },
    "tempobet": {
        "bg": "#E65100", "accent": "#BF360C", "text_color": "white",
        "lines": ["TEMPO", "BET"], "font_size": [34, 34], "y": [78, 128]
    },
    "betist": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["BETIST"], "font_size": [42], "y": [118]
    },
    "draftkings": {
        "bg": "#1A3A5C", "accent": "#0F2640", "text_color": "#53D769",
        "lines": ["DRAFT", "KINGS"], "font_size": [30, 38], "y": [78, 128]
    },
    "fanduel": {
        "bg": "#1493FF", "accent": "#0B6FCC", "text_color": "white",
        "lines": ["FAN", "DUEL"], "font_size": [38, 38], "y": [78, 128]
    },
    "betmgm": {
        "bg": "#1A1A1A", "accent": "#0A0A0A", "text_color": "#C5A059",
        "lines": ["BET", "MGM"], "font_size": [38, 38], "y": [78, 128]
    },
    "betsson": {
        "bg": "#003399", "accent": "#002266", "text_color": "white",
        "lines": ["BETSSON"], "font_size": [42], "y": [118]
    },
    "codere": {
        "bg": "#CC0000", "accent": "#990000", "text_color": "white",
        "lines": ["CODERE"], "font_size": [42], "y": [118]
    },
    "rushbet": {
        "bg": "#6A1B9A", "accent": "#4A0072", "text_color": "white",
        "lines": ["RUSH", "BET"], "font_size": [36, 36], "y": [78, 128]
    },
    "stake": {
        "bg": "#1A1A2E", "accent": "#0F0F1E", "text_color": "#00D4FF",
        "lines": ["STAKE"], "font_size": [50], "y": [118]
    },
    "betwinner": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["BET", "WINNER"], "font_size": [34, 34], "y": [78, 128]
    },
    "dafa": {
        "bg": "#D32F2F", "accent": "#B71C1C", "text_color": "white",
        "lines": ["DAFA"], "font_size": [50], "y": [118]
    },
    "10cric": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "#FFD700",
        "lines": ["10CRIC"], "font_size": [44], "y": [118]
    },
    "fun88": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "#FFD700",
        "lines": ["FUN88"], "font_size": [50], "y": [118]
    },
    "sportsbet": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["SPORTS", "BET"], "font_size": [30, 30], "y": [78, 128]
    },
    "tab": {
        "bg": "#E65100", "accent": "#BF360C", "text_color": "white",
        "lines": ["TAB"], "font_size": [56], "y": [118]
    },
    "betfinal": {
        "bg": "#1A1A1A", "accent": "#0A0A0A", "text_color": "#FFD700",
        "lines": ["BET", "FINAL"], "font_size": [36, 36], "y": [78, 128]
    },
    "rabona": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "white",
        "lines": ["RABONA"], "font_size": [38], "y": [118]
    },
    "rivalo": {
        "bg": "#D32F2F", "accent": "#B71C1C", "text_color": "white",
        "lines": ["RIVALO"], "font_size": [44], "y": [118]
    },
    "betvictor": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["BET", "VICTOR"], "font_size": [34, 34], "y": [78, 128]
    },
    "mr_green": {
        "bg": "#1B5E20", "accent": "#0D3B0F", "text_color": "#4CAF50",
        "lines": ["Mr", "Green"], "font_size": [38, 38], "y": [78, 128]
    },
    "leo_vegas": {
        "bg": "#FF6D00", "accent": "#E65100", "text_color": "white",
        "lines": ["Leo", "Vegas"], "font_size": [38, 38], "y": [78, 128]
    },
    "boyle_sports": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["BOYLE", "SPORTS"], "font_size": [30, 30], "y": [78, 128]
    },
    "bet_athome": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "white",
        "lines": ["bet-at", "home"], "font_size": [32, 32], "y": [78, 128]
    },
    "interwetten": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "#FFD700",
        "lines": ["INTER", "WETTEN"], "font_size": [28, 28], "y": [78, 128]
    },
    "sts": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "white",
        "lines": ["STS"], "font_size": [56], "y": [118]
    },
    "fortuna": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "white",
        "lines": ["FORTUNA"], "font_size": [38], "y": [118]
    },
    "superbet": {
        "bg": "#D32F2F", "accent": "#B71C1C", "text_color": "white",
        "lines": ["SUPER", "BET"], "font_size": [34, 34], "y": [78, 128]
    },
    "kindred": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["KINDRED"], "font_size": [36], "y": [118]
    },
    "efbet": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "white",
        "lines": ["EFBET"], "font_size": [48], "y": [118]
    },
    "youwin": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "#FFD700",
        "lines": ["YOU", "WIN"], "font_size": [38, 38], "y": [78, 128]
    },
    "bets10": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "white",
        "lines": ["BETS10"], "font_size": [42], "y": [118]
    },
    "sbobet": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "#FFD700",
        "lines": ["SBOBET"], "font_size": [42], "y": [118]
    },
    "maxbet": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "white",
        "lines": ["MAX", "BET"], "font_size": [38, 38], "y": [78, 128]
    },
    "cmd368": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["CMD", "368"], "font_size": [38, 38], "y": [78, 128]
    },
    "krikya": {
        "bg": "#6A1B9A", "accent": "#4A0072", "text_color": "white",
        "lines": ["KRIKYA"], "font_size": [38], "y": [118]
    },
    "baji": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "#FFD700",
        "lines": ["BAJI"], "font_size": [48], "y": [118]
    },
    "4rabet": {
        "bg": "#D32F2F", "accent": "#B71C1C", "text_color": "white",
        "lines": ["4RA", "BET"], "font_size": [38, 38], "y": [78, 128]
    },
    "rajabets": {
        "bg": "#6A1B9A", "accent": "#4A0072", "text_color": "white",
        "lines": ["RAJA", "BETS"], "font_size": [34, 34], "y": [78, 128]
    },
    "mekong": {
        "bg": "#E65100", "accent": "#BF360C", "text_color": "white",
        "lines": ["MEKONG"], "font_size": [38], "y": [118]
    },
    "pixbet": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["PIX", "BET"], "font_size": [38, 38], "y": [78, 128]
    },
    "betnacional": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "#FFD700",
        "lines": ["BET", "NACIONAL"], "font_size": [32, 28], "y": [78, 128]
    },
    "pointsbet": {
        "bg": "#0D47A1", "accent": "#0A3578", "text_color": "white",
        "lines": ["POINTS", "BET"], "font_size": [28, 28], "y": [78, 128]
    },
    "playabets": {
        "bg": "#1565C0", "accent": "#0D47A1", "text_color": "white",
        "lines": ["PLAYA", "BETS"], "font_size": [30, 30], "y": [78, 128]
    },
    "caesars": {
        "bg": "#1A1A1A", "accent": "#0A0A0A", "text_color": "#C5A059",
        "lines": ["CAESARS"], "font_size": [32], "y": [118]
    },
    "barstool": {
        "bg": "#1B5E20", "accent": "#0D3B0F", "text_color": "white",
        "lines": ["BAR", "STOOL"], "font_size": [34, 34], "y": [78, 128]
    },
    "caliente": {
        "bg": "#C62828", "accent": "#8E0000", "text_color": "#FFD700",
        "lines": ["CALIENTE"], "font_size": [34], "y": [118]
    },
    "betcris": {
        "bg": "#D32F2F", "accent": "#B71C1C", "text_color": "white",
        "lines": ["BET", "CRIS"], "font_size": [38, 38], "y": [78, 128]
    },
    "wplay": {
        "bg": "#2E7D32", "accent": "#1B5E20", "text_color": "white",
        "lines": ["WPLAY"], "font_size": [44], "y": [118]
    },
    "thunderpick": {
        "bg": "#4A148C", "accent": "#38006b", "text_color": "#CE93D8",
        "lines": ["THUNDER", "PICK"], "font_size": [26, 26], "y": [78, 128]
    },
    "sunbet": {
        "bg": "#E65100", "accent": "#BF360C", "text_color": "white",
        "lines": ["SUN", "BET"], "font_size": [38, 38], "y": [78, 128]
    },
    "888sport": {
        "bg": "#0D0D3B", "accent": "#06061F", "text_color": "#FFD700",
        "lines": ["888"], "font_size": [56], "y": [118]
    },
}

def generate_svg(design):
    """Generate a professional SVG for a broker"""
    texts = ""
    for i, line in enumerate(design["lines"]):
        fs = design["font_size"][i]
        y = design["y"][i]
        tc = design["text_color"]
        texts += f'  <text x="100" y="{y}" font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="{fs}" fill="{tc}" text-anchor="middle">{line}</text>\n'
    
    # Create gradient for depth
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:{design["bg"]};stop-opacity:1" />
      <stop offset="100%" style="stop-color:{design["accent"]};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="28" fill="url(#bg)"/>
  <rect x="2" y="2" width="196" height="196" rx="26" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
{texts}</svg>'''
    return svg

# Write all SVGs
output_dir = "/home/z/my-project/public/brokers"
count = 0
for name, design in BROKER_DESIGNS.items():
    svg = generate_svg(design)
    filepath = os.path.join(output_dir, f"{name}.svg")
    with open(filepath, "w") as f:
        f.write(svg)
    count += 1

print(f"Enhanced {count} SVG files")
