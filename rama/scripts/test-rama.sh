#!/usr/bin/env bash
# Transpile .rama → .clj, then run lein test-rama (optional ns args).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/transpile-rama.sh"
cd "$ROOT"
exec lein test-rama "$@"
