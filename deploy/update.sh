#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Update is intentionally the same immutable-release workflow as a deployment.
# Pass an optional commit SHA; otherwise the configured production branch head
# is resolved by deploy-and-activate.sh.
exec "$SCRIPT_DIR/deploy-and-activate.sh" "${1:-}"
