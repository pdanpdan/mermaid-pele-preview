#!/bin/sh
# VS Code tasks run in a non-interactive shell, which usually does not load
# the user's nvm/fish setup. Find an nvm-managed Node/pnpm when they are not
# already on PATH, then run the normal compile script.
set -eu

cd "$(dirname "$0")/.."

add_nvm_bin() {
  root=$1
  [ -d "$root" ] || return 0

  versions=$(ls -1 "$root" 2>/dev/null | sed -n 's/^v//p' | sort -t. -k1,1n -k2,2n -k3,3n)
  candidate=
  for version in $versions; do
    bin="$root/v$version/bin"
    if [ -x "$bin/node" ] && [ -x "$bin/pnpm" ]; then
      candidate=$bin
    fi
  done
  if [ -n "$candidate" ]; then
    PATH="$candidate:$PATH"
    export PATH
  fi
}

if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  add_nvm_bin "${NVM_DIR:-$HOME/.nvm}/versions/node"
  add_nvm_bin "$HOME/.local/share/nvm"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo "Node.js and pnpm were not found. Install them or add their bin directory to PATH." >&2
  exit 127
fi

exec pnpm run compile
