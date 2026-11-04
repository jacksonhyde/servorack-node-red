#!/usr/bin/env bash
################################################################################
# Cross-platform Compose wrapper
################################################################################
# Runs the same command on macOS and Linux. Automatically layers the USB MIDI
# overlay (docker-compose.midi.yaml) only when running on a Linux host with the
# ALSA sequencer present (i.e. the rack host with a MIDI interface attached).
# Everywhere else (macOS/Docker Desktop, or a Linux dev machine without the
# interface) it runs the base stack only.
#
# Usage mirrors `docker compose` itself, e.g.:
#   ./compose.sh up -d --build
#   ./compose.sh down
#   ./compose.sh logs -f node-red
################################################################################
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

files=(-f docker-compose.yaml)

if [[ "$(uname -s)" == "Linux" && -e /dev/snd/seq ]]; then
  files+=(-f docker-compose.midi.yaml)
  echo "compose.sh: Linux host with /dev/snd/seq detected; enabling USB MIDI overlay." >&2
else
  echo "compose.sh: no ALSA sequencer detected; running base stack without MIDI overlay." >&2
fi

if docker compose "${files[@]}" "$@"; then
  status=0
else
  status=$?
fi

if [[ "${1:-}" == "up" && $status -eq 0 ]]; then
  addr="$(docker compose "${files[@]}" port node-red 1880 2>/dev/null || true)"
  if [[ -n "$addr" ]]; then
    host="${addr%:*}"
    port="${addr##*:}"
    [[ "$host" == "0.0.0.0" || "$host" == "::" ]] && host="localhost"
    echo "Dashboard: http://${host}:${port}/dashboard/servos" >&2
  fi
fi

exit "$status"
