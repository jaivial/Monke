#!/usr/bin/env bash
# MONKE portable launcher (Linux / macOS). Ensures Node, then runs the bootstrap.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$DIR"
NODE_VER="v20.18.0"
case "$(uname -s)" in Linux) PLAT=linux;; Darwin) PLAT=darwin;; *) echo "Unsupported OS"; exit 1;; esac
case "$(uname -m)" in x86_64|amd64) A=x64;; arm64|aarch64) A=arm64;; *) A="$(uname -m)";; esac

NODE_BIN="$(command -v node || true)"
# Old system Node cannot run Electron 33; use drive-local Node instead.
if [ -n "$NODE_BIN" ] && [ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then NODE_BIN=""; fi
PORT_NODE="$DIR/.runtime/node-$PLAT-$A/bin/node"
if [ -z "$NODE_BIN" ] && [ ! -x "$PORT_NODE" ]; then
  echo "[monke] Node.js >=18 not found — fetching portable Node ($PLAT-$A) onto the drive..."
  mkdir -p "$DIR/.runtime"
  PKG="node-$NODE_VER-$PLAT-$A"
  URL="https://nodejs.org/dist/$NODE_VER/$PKG.tar.gz"
  ( cd "$DIR/.runtime" && { command -v curl >/dev/null && curl -fsSL "$URL" -o node.tgz || wget -q "$URL" -O node.tgz; } && tar xzf node.tgz && rm -rf "node-$PLAT-$A" && mv "$PKG" "node-$PLAT-$A" && rm node.tgz )
fi
[ -z "$NODE_BIN" ] && NODE_BIN="$PORT_NODE"
export PATH="$(dirname "$NODE_BIN"):$PATH"
echo "[monke] using node: $NODE_BIN"
exec "$NODE_BIN" "$DIR/bootstrap/bootstrap.mjs" "$@"
