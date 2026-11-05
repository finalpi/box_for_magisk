#!/usr/bin/env bash
set -eu
case "${0##*/}" in
  curl)
    [ "${TEST_DOWNLOAD_FAIL:-0}" = 0 ] || exit 22
    while [ "$#" -gt 0 ]; do
      if [ "$1" = --output ]; then target="$2"; shift; fi
      shift
    done
    printf 'mode: rule\n# downloaded fixture\n' > "$target"
    ;;
  clash)
    [ "${TEST_CONFIG_FAIL:-0}" = 0 ] || exit 1
    ;;
  box.service)
    if [ "${TEST_RESTART_FAIL:-0}" = 1 ] && [ ! -e "$BOX_DIR/run/failed-once" ]; then
      touch "$BOX_DIR/run/failed-once"
      exit 1
    fi
    ;;
esac
