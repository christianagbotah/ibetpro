#!/usr/bin/env bash
set -euo pipefail

DATASET="${1:-}"
HORIZON="${2:-}"
MINIMUM_ROWS="${FIRST_PARTY_PILOT_MIN_LABELED:-300}"
MINIMUM_COMPLETENESS="${FIRST_PARTY_MIN_COMPLETENESS:-0.70}"

if [[ -z "$DATASET" || -z "$HORIZON" ]]; then
  echo "Usage: $0 <first-party-horizon.csv> <24h|6h|1h>" >&2
  exit 2
fi

case "$HORIZON" in
  24h|6h|1h) ;;
  *)
    echo "Unsupported horizon: $HORIZON" >&2
    exit 2
    ;;
esac

if [[ ! -f "$DATASET" ]]; then
  echo "Dataset not found: $DATASET" >&2
  exit 1
fi

ML_CURRENT="${ML_CURRENT:-/home/lightworld/services/ibetpro-ml/current}"
VENV="${IBETPRO_ML_VENV:-/home/lightworld/venvs/ibetpro-ml}"
RESEARCH_ROOT="${IBETPRO_RESEARCH_ROOT:-/home/lightworld/model-research/ibetpro}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$RESEARCH_ROOT/first-party-${HORIZON}-$STAMP"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "ML Python environment not found: $VENV" >&2
  exit 1
fi

mkdir -p "$OUTPUT"
cd "$ML_CURRENT/ml-service"

"$VENV/bin/python" -m training.run_first_party_pilot   --dataset "$DATASET"   --output "$OUTPUT"   --horizon "$HORIZON"   --minimum-rows "$MINIMUM_ROWS"   --minimum-completeness "$MINIMUM_COMPLETENESS"   --feature-profile core

echo "First-party pilot evidence written to: $OUTPUT"
echo "No live model configuration or ML_MODEL_MODE value was changed."
