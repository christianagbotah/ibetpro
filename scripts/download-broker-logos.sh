#!/bin/bash
set -e
OUTDIR="/home/z/my-project/public/brokers"
mkdir -p "$OUTDIR"

# Function to search and download a logo
download_logo() {
    local query="$1"
    local filename="$2"
    local outfile="$OUTDIR/${filename}.png"
    
    if [ -f "$outfile" ] && [ -s "$outfile" ]; then
        echo "SKIP $filename (already exists)"
        return 0
    fi
    
    echo "Searching: $query -> $filename"
    local url=$(z-ai image-search -q "$query" --count 1 --gl us --no-rank 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['original_url'] if r else '')" 2>/dev/null)
    
    if [ -n "$url" ]; then
        echo "  Downloading: $url"
        curl -sL -o "$outfile" "$url" 2>/dev/null
        if [ -f "$outfile" ] && [ -s "$outfile" ]; then
            echo "  OK: $filename"
        else
            echo "  FAIL: download failed for $filename"
            rm -f "$outfile"
        fi
    else
        echo "  FAIL: no URL found for $filename"
    fi
    
    # Rate limit delay
    sleep 2
}

# Major brokers - search for real logos
download_logo "SportyBet official logo" "sportybet_real"
download_logo "Betway official logo" "betway_real"
download_logo "1xBet official logo" "1xbet_real"
download_logo "Bet365 official logo" "bet365_real"
download_logo "Bet9ja official logo" "bet9ja_real"
download_logo "22Bet official logo" "22bet_real"
download_logo "Melbet official logo" "melbet_real"
download_logo "Stake.com official logo" "stake_real"
download_logo "Betwinner official logo" "betwinner_real"
download_logo "DraftKings official logo" "draftkings_real"
download_logo "FanDuel official logo" "fanduel_real"
download_logo "BetMGM official logo" "betmgm_real"
download_logo "Pinnacle sports betting official logo" "pinnacle_real"
download_logo "William Hill betting official logo" "williamhill_real"
download_logo "Unibet official logo" "unibet_real"
download_logo "Bwin official logo" "bwin_real"
download_logo "Betfair official logo" "betfair_real"
download_logo "Ladbrokes official logo" "ladbrokes_real"
download_logo "Hollywoodbets official logo" "hollywoodbets_real"
download_logo "SportPesa official logo" "sportpesa_real"
download_logo "Betika official logo" "betika_real"
download_logo "Parimatch official logo" "parimatch_real"
download_logo "Cloudbet official logo" "cloudbet_real"
download_logo "BetKing official logo" "betking_real"
download_logo "Nairabet official logo" "nairabet_real"

echo "=== Download complete ==="
ls -la "$OUTDIR"/*_real.png 2>/dev/null | wc -l
