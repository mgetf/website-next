#!/usr/bin/env bash
# Transpile every .rama source under src/ and test/ to sibling .clj files.
# .clj outputs are build artifacts — edit the .rama sources only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
BIN="${RAMA_CHECK_BIN:-}"

echo "building rama-check..."
cargo build --manifest-path "$REPO/rama-syntax-rs/Cargo.toml" --bin rama-check --quiet
BIN="${BIN:-$REPO/rama-syntax-rs/target/debug/rama-check}"

shopt -s nullglob
files=("$ROOT"/src/mge/tf/rama/*.rama "$ROOT"/test/mge/tf/rama/*.rama)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "no .rama sources found under $ROOT" >&2
  exit 1
fi

fail=0
for rama in "${files[@]}"; do
  out="${rama%.rama}.clj"
  if "$BIN" transpile "$rama" -o "$out"; then
    echo "transpiled $(basename "$rama") -> $(basename "$out")"
  else
    echo "transpile failed: $rama" >&2
    fail=1
  fi
done

exit "$fail"
