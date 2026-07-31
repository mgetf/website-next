#!/usr/bin/env bash
# Start a single-node Rama cluster and (optionally) deploy mge modules.
# Requires: Java 21, unpacked Rama 1.9.0 (default /tmp/rama-dist/rama-1.9.0)
set -euo pipefail

RAMA_HOME="${RAMA_HOME:-/tmp/rama-dist/rama-1.9.0}"
JAR="${RAMA_JAR:-/workspace/rama/target/mge-rama.jar}"
ACTION="${1:-up}"

MODULES=(
  "mge.tf.rama.users-module/UsersModule"
  "mge.tf.rama.catalog-module/CatalogModule"
  "mge.tf.rama.divisions-module/DivisionsModule"
  "mge.tf.rama.seasons-module/SeasonsModule"
  "mge.tf.rama.teams-module/TeamsModule"
  "mge.tf.rama.match-module/MatchModule"
  "mge.tf.rama.payments-module/PaymentsModule"
  "mge.tf.rama.notifications-module/NotificationsModule"
  "mge.tf.rama.map-pools-module/MapPoolsModule"
  "mge.tf.rama.events-module/EventsModule"
  "mge.tf.rama.demos-module/DemosModule"
  "mge.tf.rama.globals-module/GlobalsModule"
)

die() { echo "error: $*" >&2; exit 1; }

ensure_release() {
  [[ -x "$RAMA_HOME/rama" ]] || die "Rama not found at $RAMA_HOME (set RAMA_HOME)"
}

start_daemon() {
  local name="$1"
  local pattern
  case "$name" in
    devZookeeper) pattern='rpl.rama.distributed.command.dev_zookeeper' ;;
    conductor) pattern='rpl.rama.distributed.daemon.conductor' ;;
    supervisor) pattern='rpl.rama.distributed.daemon.supervisor' ;;
    *) pattern="rpl.rama.distributed.daemon.${name}" ;;
  esac
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "$name already running"
    return 0
  fi
  echo "starting $name..."
  (cd "$RAMA_HOME" && ./rama "$name") &
  sleep 2
}

cmd_up() {
  ensure_release
  mkdir -p "$RAMA_HOME/logs"
  start_daemon devZookeeper
  sleep 2
  start_daemon conductor
  sleep 3
  start_daemon supervisor
  sleep 3
  (cd "$RAMA_HOME" && ./rama conductorReady)
  (cd "$RAMA_HOME" && ./rama numSupervisors)
}

cmd_deploy() {
  ensure_release
  local force="${FORCE_REDEPLOY:-0}"
  [[ -f "$JAR" ]] || {
    echo "building module jar..."
    (cd /workspace/rama && bash scripts/transpile-rama.sh && lein uberjar-modules)
  }
  [[ -f "$JAR" ]] || die "missing $JAR"
  for mod in "${MODULES[@]}"; do
    status="$(cd "$RAMA_HOME" && ./rama moduleStatus "$mod" 2>/dev/null || true)"
    if echo "$status" | grep -q '"moduleState":"RUNNING"'; then
      if [[ "$force" != "1" ]]; then
        echo "already RUNNING: $mod"
        continue
      fi
      echo "destroying $mod for redeploy..."
      printf '%s\n' "$mod" | (cd "$RAMA_HOME" && ./rama destroy "$mod") || true
      sleep 2
    fi
    echo "deploying $mod"
    (cd "$RAMA_HOME" && ./rama deploy \
      --action launch \
      --jar "$JAR" \
      --module "$mod" \
      --tasks 4 \
      --threads 2 \
      --workers 1)
  done
}

cmd_status() {
  ensure_release
  (cd "$RAMA_HOME" && ./rama conductorReady)
  for mod in "${MODULES[@]}"; do
    echo -n "$mod: "
    (cd "$RAMA_HOME" && ./rama moduleStatus "$mod" 2>/dev/null | head -c 200) || echo "missing"
    echo
  done
}

case "$ACTION" in
  up) cmd_up ;;
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  up-deploy) cmd_up; cmd_deploy ;;
  *) die "usage: $0 {up|deploy|status|up-deploy}" ;;
esac
