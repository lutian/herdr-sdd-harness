#!/usr/bin/env bash
# install.sh — instala o skeleton do sddharness em um projeto alvo
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-}"
if [ -z "$DEST" ]; then
  echo "Usage: ./install.sh /caminho/do-seu-projeto"
  exit 1
fi
exec node "$ROOT/bin/sddharness" init "$DEST"
