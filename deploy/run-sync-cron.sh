#!/usr/bin/env bash
set -euo pipefail

WEB_CURRENT="${WEB_CURRENT:-/home/lightworld/services/ibetpro-web/current}"
SYNC_URL="${SYNC_URL:-http://127.0.0.1:3017/api/sync/cron}"
ENV_FILE="${ENV_FILE:-$WEB_CURRENT/.next/standalone/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "iBetPro runtime environment not found: $ENV_FILE" >&2
  exit 1
fi

CRON_SECRET="$(
  awk -F= '
    $1 == "CRON_SECRET" {
      sub(/^[^=]*=/, "", $0)
      gsub(/^["'\'' ]+|["'\'' ]+$/, "", $0)
      print
      exit
    }
  ' "$ENV_FILE"
)"

CURL_ARGS=(--fail --silent --show-error --max-time 90)
if [[ -n "$CRON_SECRET" ]]; then
  CURL_ARGS+=(-H "Authorization: Bearer $CRON_SECRET")
fi

response="$(curl "${CURL_ARGS[@]}" "$SYNC_URL")"

# Emit only operational fields; never echo request headers or environment data.
node -e '
  const input=process.argv[1];
  const value=JSON.parse(input);
  const safe={
    success:value.success === true,
    source:value.source ?? null,
    matchesSynced:value.matchesSynced ?? 0,
    matchesUpdated:value.matchesUpdated ?? 0,
    skipped:value.skipped ?? false,
    skipReason:value.skipReason ?? null,
    durationMs:value.durationMs ?? null,
    errors:Array.isArray(value.errors) ? value.errors : [],
    timestamp:value.timestamp ?? null,
  };
  console.log(JSON.stringify(safe));
  if (value.success !== true) process.exit(1);
' "$response"
