#!/usr/bin/env bash
set -euo pipefail

MODE="${2:-shadow}"
MODEL_DIR="${1:-}"
APP_NAME="${APP_NAME:-ibetpro}"
ML_SERVICE="${ML_SERVICE:-ibetpro-ml.service}"
ML_SERVICE_DIR="${ML_SERVICE_DIR:-/home/lightworld/services/ibetpro-ml}"
ML_ENV="${ML_ENV:-$ML_SERVICE_DIR/ml.env}"
ML_HEALTH_URL="${ML_HEALTH_URL:-http://127.0.0.1:8017/health}"
VENV_PYTHON="${VENV_PYTHON:-/home/lightworld/venvs/ibetpro-ml/bin/python}"

case "$MODE" in
  baseline|shadow|active) ;;
  *)
    echo "Usage: $0 [MODEL_DIR] [baseline|shadow|active]" >&2
    exit 2
    ;;
esac

if [[ "$MODE" != "baseline" ]]; then
  if [[ -z "$MODEL_DIR" || ! -d "$MODEL_DIR" ]]; then
    echo "A readable model directory is required for $MODE mode." >&2
    exit 2
  fi
  MODEL_DIR="$(readlink -f "$MODEL_DIR")"

  if [[ "$MODE" == "active" && "${CONFIRM_ACTIVE_PROMOTION:-}" != "YES" ]]; then
    echo "Active promotion requires CONFIRM_ACTIVE_PROMOTION=YES." >&2
    exit 2
  fi

  if [[ ! -x "$VENV_PYTHON" ]]; then
    echo "ML virtual environment is not installed: $VENV_PYTHON" >&2
    exit 2
  fi

  ML_CURRENT="$(readlink -f "$ML_SERVICE_DIR/current")"
  if [[ -z "$ML_CURRENT" || ! -d "$ML_CURRENT/ml-service" ]]; then
    echo "ML release symlink is not configured." >&2
    exit 2
  fi

  (
    cd "$ML_CURRENT/ml-service"
    "$VENV_PYTHON" - "$MODEL_DIR" "$MODE" <<'PY'
import json
import sys
from pathlib import Path
from app.model_registry import validate_model_dir

directory = Path(sys.argv[1])
mode = sys.argv[2]
valid, problems = validate_model_dir(directory)
if not valid:
    raise SystemExit("Model artifact validation failed: " + ", ".join(problems))

metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
approval = (
    metadata.get("result_calibration", {})
    .get("selective_stability_approval", {})
)
if not approval.get("approved"):
    raise SystemExit(
        "Model is not cross-season approved for selective shadow/active serving."
    )
stable_bands = approval.get("stable_bands") or []
if not stable_bands:
    raise SystemExit("Approved model has no stable selective bands.")

print(
    json.dumps(
        {
            "mode": mode,
            "modelVersion": metadata.get("model_version"),
            "featureProfile": metadata.get("feature_profile"),
            "stableBands": len(stable_bands),
        },
        indent=2,
    )
)
PY
  )
fi

mkdir -p "$ML_SERVICE_DIR"
touch "$ML_ENV"
chmod 600 "$ML_ENV"

WEB_CWD="$(pm2 jlist 2>/dev/null | node -e '
let input="";
process.stdin.on("data", d => input += d);
process.stdin.on("end", () => {
  const rows = JSON.parse(input || "[]");
  const row = rows.find(x => x.name === process.argv[1]);
  process.stdout.write(row?.pm2_env?.pm_cwd || "");
});
' "$APP_NAME")"

if [[ -z "$WEB_CWD" || ! -f "$WEB_CWD/.env" ]]; then
  echo "Could not resolve the live web release .env from PM2." >&2
  exit 2
fi

BACKUP_DIR="$(mktemp -d)"
trap 'rm -rf "$BACKUP_DIR"' EXIT
cp -p "$ML_ENV" "$BACKUP_DIR/ml.env"
cp -p "$WEB_CWD/.env" "$BACKUP_DIR/web.env"

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v "^${key}=" "$file" >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

rollback() {
  echo "Promotion health check failed; restoring previous ML/web mode." >&2
  cp -p "$BACKUP_DIR/ml.env" "$ML_ENV"
  cp -p "$BACKUP_DIR/web.env" "$WEB_CWD/.env"
  systemctl restart "$ML_SERVICE" || true
  pm2 restart "$APP_NAME" --update-env >/dev/null 2>&1 || true
}

if [[ "$MODE" == "baseline" ]]; then
  grep -v '^IBETPRO_MODEL_DIR=' "$ML_ENV" >"$ML_ENV.tmp" || true
  mv "$ML_ENV.tmp" "$ML_ENV"
else
  upsert_env "$ML_ENV" "IBETPRO_MODEL_DIR" "$MODEL_DIR"
fi
upsert_env "$WEB_CWD/.env" "ML_MODEL_MODE" "$MODE"

systemctl restart "$ML_SERVICE"
for _ in $(seq 1 20); do
  if curl --fail --silent "$ML_HEALTH_URL" >/tmp/ibetpro-ml-promote-health 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! curl --fail --silent "$ML_HEALTH_URL" >/tmp/ibetpro-ml-promote-health 2>/dev/null; then
  rollback
  exit 1
fi

if [[ "$MODE" != "baseline" ]]; then
  if ! "$VENV_PYTHON" - <<'PY'
import json
payload=json.load(open("/tmp/ibetpro-ml-promote-health"))
model=payload.get("model") or {}
raise SystemExit(0 if model.get("loaded") else 1)
PY
  then
    rollback
    exit 1
  fi
fi

pm2 restart "$APP_NAME" --update-env >/dev/null
for _ in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:3017/login >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl --fail --silent http://127.0.0.1:3017/login >/dev/null 2>&1; then
  rollback
  exit 1
fi

echo "iBetPro model mode promoted to $MODE."
cat /tmp/ibetpro-ml-promote-health
echo
