#!/usr/bin/env bash
set -euo pipefail

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT

BIN="$ROOT/bin"
RELEASE="$ROOT/release"
STANDALONE="$RELEASE/.next/standalone"
ML_DIR="$ROOT/ml"
LOG="$ROOT/pm2.log"

mkdir -p "$BIN" "$STANDALONE" "$ML_DIR"
printf 'ML_MODEL_MODE=shadow\nKEEP_ME=yes\n' > "$STANDALONE/.env"
printf 'ML_MODEL_MODE=shadow\nKEEP_ME=yes\n' > "$RELEASE/.env.production"
printf 'IBETPRO_MODEL_DIR=/old/model\n' > "$ML_DIR/ml.env"

cat > "$BIN/pm2" <<EOF
#!/usr/bin/env bash
set -e
case "\${1:-}" in
  jlist)
    printf '%s\n' '[{"name":"ibetpro","pm2_env":{"pm_cwd":"$STANDALONE"}}]'
    ;;
  restart)
    printf 'restart HOSTNAME=%s PORT=%s NODE_ENV=%s ML_MODEL_MODE=%s\n' \
      "\${HOSTNAME:-}" "\${PORT:-}" "\${NODE_ENV:-}" "\${ML_MODEL_MODE:-}" >> "$LOG"
    ;;
  save)
    printf 'save\n' >> "$LOG"
    ;;
  *)
    echo "unexpected pm2 invocation: $*" >&2
    exit 2
    ;;
esac
EOF
chmod +x "$BIN/pm2"

cat > "$BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$BIN/systemctl"

cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"status":"ok","model":{"configured":false,"loaded":false}}'
exit 0
EOF
chmod +x "$BIN/curl"

PATH="$BIN:$PATH" \
APP_NAME=ibetpro \
APP_HOST=127.0.0.1 \
APP_PORT=3017 \
ML_SERVICE=ibetpro-ml.service \
ML_SERVICE_DIR="$ML_DIR" \
ML_ENV="$ML_DIR/ml.env" \
ML_HEALTH_URL=http://127.0.0.1:8017/health \
bash deploy/promote-ml-model.sh baseline >/dev/null

grep -qx 'ML_MODEL_MODE=baseline' "$STANDALONE/.env"
grep -qx 'ML_MODEL_MODE=baseline' "$RELEASE/.env.production"
grep -qx 'KEEP_ME=yes' "$STANDALONE/.env"
grep -qx 'KEEP_ME=yes' "$RELEASE/.env.production"
if grep -q '^IBETPRO_MODEL_DIR=' "$ML_DIR/ml.env"; then
  echo "baseline mode did not clear IBETPRO_MODEL_DIR" >&2
  exit 1
fi

grep -q 'restart HOSTNAME=127.0.0.1 PORT=3017 NODE_ENV=production ML_MODEL_MODE=baseline' "$LOG"
grep -q '^save$' "$LOG"

# The fixture intentionally has no release-root .env. Promotion must still
# complete successfully under set -e.
test ! -e "$RELEASE/.env"

echo "baseline promotion regression test passed"
