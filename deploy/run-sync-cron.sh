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
    trainingCapture:value.trainingCapture?.ok === true ? {
      ok:true,
      considered:value.trainingCapture.result?.considered ?? 0,
      captured:value.trainingCapture.result?.captured ?? 0,
      skippedExisting:value.trainingCapture.result?.skippedExisting ?? 0,
      skippedNoConsensus:value.trainingCapture.result?.skippedNoConsensus ?? 0,
      skippedOutsideHorizon:value.trainingCapture.result?.skippedOutsideHorizon ?? 0,
      errors:Array.isArray(value.trainingCapture.result?.errors)
        ? value.trainingCapture.result.errors
        : [],
    } : value.trainingCapture ? {
      ok:false,
      error:value.trainingCapture.error ?? "capture failed",
    } : null,
    predictionEvidence:value.predictionEvidence?.ok === true ? {
      ok:true,
      checked:value.predictionEvidence.result?.checked ?? 0,
      captured:value.predictionEvidence.result?.captured ?? 0,
      skipped:value.predictionEvidence.result?.skipped ?? 0,
      byStage:value.predictionEvidence.result?.byStage ?? null,
    } : value.predictionEvidence ? {
      ok:false,
      error:value.predictionEvidence.error ?? "prediction evidence capture failed",
    } : null,
    betSettlement:value.betSettlement?.ok === true ? {
      ok:true,
      checked:value.betSettlement.checked ?? 0,
      settled:value.betSettlement.settled ?? 0,
      skipped:value.betSettlement.skipped ?? 0,
      totalProfit:value.betSettlement.totalProfit ?? 0,
      totalCommission:value.betSettlement.totalCommission ?? 0,
    } : value.betSettlement ? {
      ok:false,
      error:value.betSettlement.error ?? "settlement sweep failed",
    } : null,
    timestamp:value.timestamp ?? null,
  };
  console.log(JSON.stringify(safe));
  if (value.success !== true) process.exit(1);
' "$response"
