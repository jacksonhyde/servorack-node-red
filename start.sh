#!/bin/sh
set -eu
node /opt/servorack/bootstrap.cjs
exec /usr/src/node-red/entrypoint.sh "$@"
