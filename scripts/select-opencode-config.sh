#!/usr/bin/env bash
# Regenera opencode.json desde el template correspondiente segun BRAIN_MODE en .env
# Uso: ./scripts/select-opencode-config.sh
#
# Templates:
#   opencode.opencode.json — 4 brains OpenCode Go + mimo-v2.5 passthrough
#   opencode.deepseek.json — 2 brains DeepSeek (tu cuenta) + mimo-v2.5 passthrough
#
# Output:
#   opencode.json — el archivo que tu OpenCode TUI lee
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env no existe" >&2
  exit 1
fi

mode=$(grep -E "^BRAIN_MODE=" .env | head -1 | cut -d= -f2 | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')

case "$mode" in
  deepseek)
    if [ ! -f opencode.deepseek.json ]; then
      echo "ERROR: opencode.deepseek.json no existe" >&2
      exit 1
    fi
    cp opencode.deepseek.json opencode.json
    echo "✓ opencode.json <- opencode.deepseek.json (BRAIN_MODE=deepseek)"
    echo "  Brains: $(python3 -c "import json; print(', '.join(json.load(open('opencode.json'))['provider']['cortex-multimodal']['models'].keys()))")"
    ;;
  opencode|hybrid|auto|"")
    if [ ! -f opencode.opencode.json ]; then
      echo "ERROR: opencode.opencode.json no existe" >&2
      exit 1
    fi
    cp opencode.opencode.json opencode.json
    echo "✓ opencode.json <- opencode.opencode.json (BRAIN_MODE=${mode:-auto})"
    echo "  Brains: $(python3 -c "import json; print(', '.join(json.load(open('opencode.json'))['provider']['cortex-multimodal']['models'].keys()))")"
    ;;
  *)
    echo "ERROR: BRAIN_MODE='$mode' no reconocido (usa opencode|deepseek|hybrid|auto)" >&2
    exit 1
    ;;
esac
