import subprocess
import json
import re
import os
import time
import urllib.request

OUTDIR = "/home/z/my-project/public/brokers"

# Broker name -> (search query, output filename)
BROKERS = [
    ("Betway official logo", "betway.png"),
    ("1xBet official logo", "1xbet.png"),
    ("Bet365 official logo", "bet365.png"),
    ("Bet9ja official logo", "bet9ja.png"),
    ("22Bet official logo", "22bet.png"),
    ("Melbet official logo", "melbet.png"),
    ("Stake.com official logo", "stake.png"),
    ("Betwinner official logo", "betwinner.png"),
    ("DraftKings official logo", "draftkings.png"),
    ("FanDuel official logo", "fanduel.png"),
    ("BetMGM official logo", "betmgm.png"),
    ("Pinnacle sports betting official logo", "pinnacle.png"),
    ("William Hill betting official logo", "williamhill.png"),
    ("Unibet official logo", "unibet.png"),
    ("Bwin official logo", "bwin.png"),
    ("Betfair official logo", "betfair.png"),
    ("Ladbrokes official logo", "ladbrokes.png"),
    ("Hollywoodbets official logo", "hollywoodbets.png"),
    ("SportPesa official logo", "sportpesa.png"),
    ("Betika official logo", "betika.png"),
    ("Parimatch official logo", "parimatch.png"),
    ("Cloudbet official logo", "cloudbet.png"),
    ("BetKing Nigeria official logo", "betking.png"),
    ("Nairabet official logo", "nairabet.png"),
    ("Supabets official logo", "supabets.png"),
    ("Betano official logo", "betano.png"),
    ("Tipico official logo", "tipico.png"),
    ("Mozzartbet official logo", "mozzartbet.png"),
    ("Sportybet Ghana official logo", "sportybet_gh.png"),
    ("Bangbet official logo", "bangbet.png"),
    ("Odibets official logo", "odibets.png"),
    ("Helabet official logo", "helabet.png"),
    ("Msport official logo", "msport.png"),
    ("Betpawa official logo", "betpawa.png"),
    ("Premierbet official logo", "premierbet.png"),
    ("Merrybet official logo", "merrybet.png"),
    ("Betika Kenya official logo", "betika_ke.png"),
    ("Shabiki official logo", "shabiki.png"),
    ("Coral betting official logo", "coral.png"),
    ("Betvictor official logo", "betvictor.png"),
    ("Tipico official logo", "tipico.png"),
    ("Stoiximan official logo", "stoiximan.png"),
    ("Codere official logo", "codere.png"),
    ("Rabona betting official logo", "rabona.png"),
    ("Betsson official logo", "betsson.png"),
    ("Superbet official logo", "superbet.png"),
    ("Fortuna betting official logo", "fortuna.png"),
    ("Fun88 official logo", "fun88.png"),
    ("10CRIC official logo", "10cric.png"),
    ("Rivalo official logo", "rivalo.png"),
    ("Betfinal official logo", "betfinal.png"),
    ("SBOBET official logo", "sbobet.png"),
    ("Dafabet official logo", "dafa.png"),
    ("Bet-at-home official logo", "bet_athome.png"),
    ("Interwetten official logo", "interwetten.png"),
    ("Mr Green betting official logo", "mr_green.png"),
    ("LeoVegas official logo", "leo_vegas.png"),
    ("Boylesports official logo", "boyle_sports.png"),
    ("Playabets official logo", "playabets.png"),
    ("Sunbet official logo", "sunbet.png"),
    ("Gbets official logo", "gbets.png"),
    ("Betcoza official logo", "betcoza.png"),
    ("WSB betting official logo", "wsb.png"),
    ("Surebet247 official logo", "surebet247.png"),
    ("Mybet official logo", "mybet.png"),
    ("Palmsbet official logo", "palmsbet.png"),
    ("Soccabet official logo", "soccabet.png"),
    ("Merrybet official logo", "merrybet.png"),
    ("Krikya official logo", "krikya.png"),
    ("Maxbet official logo", "maxbet.png"),
    ("4rabet official logo", "4rabet.png"),
    ("Rajabets official logo", "rajabets.png"),
    ("Baji official logo", "baji.png"),
    ("Pixbet official logo", "pixbet.png"),
    ("Caesars sportsbook official logo", "caesars.png"),
    ("Pointsbet official logo", "pointsbet.png"),
    ("Barstool sportsbook official logo", "barstool.png"),
    ("Caliente betting official logo", "caliente.png"),
    ("Betcris official logo", "betcris.png"),
    ("Wplay official logo", "wplay.png"),
    ("Thunderpick official logo", "thunderpick.png"),
    ("Mekong betting official logo", "mekong.png"),
    ("Kindred Group official logo", "kindred.png"),
    ("Efbet official logo", "efbet.png"),
    ("Youwin betting official logo", "youwin.png"),
    ("Bets10 official logo", "bets10.png"),
    ("CMD368 official logo", "cmd368.png"),
    ("Betnacional official logo", "betnacional.png"),
    ("Rushbet official logo", "rushbet.png"),
    ("Sportsbet Australia official logo", "sportsbet.png"),
    ("TAB Australia official logo", "tab.png"),
    ("Betist official logo", "betist.png"),
    ("Tempobet official logo", "tempobet.png"),
    ("STS betting official logo", "sts.png"),
    ("Coral betting official logo", "coral.png"),
]

success = 0
failed = 0

for query, filename in BROKERS:
    outfile = os.path.join(OUTDIR, filename)
    
    # Skip if already downloaded
    if os.path.exists(outfile) and os.path.getsize(outfile) > 1000:
        print(f"SKIP {filename} (already exists, {os.path.getsize(outfile)} bytes)")
        success += 1
        continue
    
    try:
        result = subprocess.run(
            ["z-ai", "image-search", "-q", query, "--count", "1", "--gl", "us", "--no-rank"],
            capture_output=True, text=True, timeout=90
        )
        
        # Parse the JSON output
        output = result.stdout
        # Find the JSON part
        json_start = output.find("{")
        if json_start >= 0:
            json_str = output[json_start:]
            data = json.loads(json_str)
            results = data.get("results", [])
            if results:
                url = results[0].get("original_url", "")
                if url:
                    print(f"Downloading {filename} from {url[:60]}...")
                    urllib.request.urlretrieve(url, outfile)
                    if os.path.exists(outfile) and os.path.getsize(outfile) > 500:
                        print(f"  OK: {filename} ({os.path.getsize(outfile)} bytes)")
                        success += 1
                    else:
                        print(f"  FAIL: download too small for {filename}")
                        failed += 1
                        # Remove the bad file
                        if os.path.exists(outfile):
                            os.remove(outfile)
                else:
                    print(f"  FAIL: no URL for {filename}")
                    failed += 1
            else:
                print(f"  FAIL: no results for {filename}")
                failed += 1
        else:
            print(f"  FAIL: no JSON in output for {filename}")
            failed += 1
    except Exception as e:
        print(f"  ERROR: {filename} - {e}")
        failed += 1
    
    # Rate limit
    time.sleep(2)

print(f"\n=== Done: {success} succeeded, {failed} failed ===")
