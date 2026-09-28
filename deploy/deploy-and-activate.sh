#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-ibetpro}"
BASE_DIR="${BASE_DIR:-/home/lightworld/webapps/ibetpro}"
RELEASES_DIR="${RELEASES_DIR:-/home/lightworld/releases}"
LOG_DIR="${LOG_DIR:-/home/lightworld/logs/ibetpro}"
DEPLOY_REF="${DEPLOY_REF:-origin/revamp/production-foundation}"
APP_PORT="${APP_PORT:-3017}"
VALIDATION_PORT="${VALIDATION_PORT:-3117}"

cd "$BASE_DIR"
git fetch origin revamp/production-foundation --quiet

SHA="${1:-$(git rev-parse "$DEPLOY_REF")}"
git cat-file -e "$SHA^{commit}"
SHORT_SHA="$(git rev-parse --short=12 "$SHA")"
RELEASE="$RELEASES_DIR/ibetpro-$SHORT_SHA"

CURRENT_RELEASE=""
if command -v pm2 >/dev/null 2>&1; then
  CURRENT_RELEASE="$(pm2 jlist 2>/dev/null | node -e '
    let input="";
    process.stdin.on("data", d => input += d);
    process.stdin.on("end", () => {
      try {
        const rows = JSON.parse(input);
        const row = rows.find(x => x.name === process.argv[1]);
        const path = row?.pm2_env?.pm_exec_path || "";
        const match = path.match(/^(.*\/ibetpro-[^/]+)\//);
        if (match) process.stdout.write(match[1]);
      } catch {}
    });
  ' "$APP_NAME")"
fi

if [[ ! -d "$RELEASE" ]]; then
  git worktree add --detach "$RELEASE" "$SHA"
fi

if [[ -n "$CURRENT_RELEASE" && -f "$CURRENT_RELEASE/.env.production" ]]; then
  cp -p "$CURRENT_RELEASE/.env.production" "$RELEASE/.env.production"
  [[ -f "$CURRENT_RELEASE/.env" ]] && cp -p "$CURRENT_RELEASE/.env" "$RELEASE/.env"
elif [[ -f "$BASE_DIR/.env.production" ]]; then
  cp -p "$BASE_DIR/.env.production" "$RELEASE/.env.production"
  [[ -f "$BASE_DIR/.env" ]] && cp -p "$BASE_DIR/.env" "$RELEASE/.env"
else
  echo "No runtime .env.production found; refusing deployment." >&2
  exit 1
fi

cd "$RELEASE"
npm ci --no-audit --no-fund
npx prisma generate

# Never use --accept-data-loss. Destructive changes must stop for review.
npx prisma db push
npm run build

(
  cd "$RELEASE/.next/standalone"
  PORT="$VALIDATION_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
    ML_MODEL_MODE=baseline AUTO_BET_RECOVERY_ENABLED=false \
    node server.js >/tmp/ibetpro-release-smoke.log 2>&1 &
  SMOKE_PID=$!
  trap 'kill "$SMOKE_PID" 2>/dev/null || true' EXIT
  sleep 2
  curl --fail --silent --show-error \
    "http://127.0.0.1:$VALIDATION_PORT/login" >/dev/null
)

mkdir -p "$LOG_DIR"
PREVIOUS_RELEASE="$CURRENT_RELEASE"

start_release() {
  local target="$1"
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  PORT="$APP_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
    ML_MODEL_MODE=baseline AUTO_BET_RECOVERY_ENABLED=false \
    pm2 start "$target/.next/standalone/server.js" \
      --name "$APP_NAME" \
      --cwd "$target/.next/standalone" \
      --interpreter node \
      --output "$LOG_DIR/out.log" \
      --error "$LOG_DIR/error.log" \
      --time >/dev/null
}

start_release "$RELEASE"
sleep 2

if ! curl --fail --silent --show-error \
  "http://127.0.0.1:$APP_PORT/login" >/dev/null; then
  echo "New release failed health check." >&2
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    echo "Rolling back to $PREVIOUS_RELEASE" >&2
    start_release "$PREVIOUS_RELEASE"
  fi
  exit 1
fi

pm2 save >/dev/null 2>&1 || true
echo "Deployed $APP_NAME release $SHORT_SHA on port $APP_PORT"
