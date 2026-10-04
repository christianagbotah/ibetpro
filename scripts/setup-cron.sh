#!/bin/bash
# Configure the protected iBetPro sync cron without embedding credentials in Git.

set -euo pipefail

APP_DIR="/home/lightworld/webapps/ibetpro"
DOMAIN="${IBETPRO_DOMAIN:-ibetpro.lightworldtech.com}"
ENV_FILE="${IBETPRO_ENV_FILE:-${APP_DIR}/.env.production}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Missing ${ENV_FILE}; provision server-side secrets before configuring cron." >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is required in ${ENV_FILE}." >&2
  exit 1
fi

CRON_ENTRY="*/10 * * * * curl -fsS -H \"Authorization: Bearer ${CRON_SECRET}\" https://${DOMAIN}/api/sync/cron >/dev/null 2>&1"

{
  crontab -l 2>/dev/null | grep -v 'api/sync/cron' || true
  echo "${CRON_ENTRY}"
} | crontab -

echo "iBetPro sync cron configured for https://${DOMAIN}/api/sync/cron"
