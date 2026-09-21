#!/bin/sh
# Check PATH before invoking any JavaScript, so missing Node has a useful error.
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '[jev-browser] Node.js was not found in the Agent process PATH.' \
    'Install Node.js 20 or newer from https://nodejs.org/en/download, then restart your Agent application.' \
    'If Node is already installed, make sure the Agent inherits its PATH (try starting the Agent from a terminal where node --version works).' >&2
  exit 127
fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
exec node "$script_dir/start.mjs" "$@"
