#!/usr/bin/env bash
# Sincroniza opencode.json con el template correspondiente segun BRAIN_MODE en .env
# Uso: ./scripts/select-opencode-config.sh
#
# Estructura esperada:
#   opencode.json            — committed: template OpenCode Go (4 brains + passthrough)
#   opencode.deepseek.json   — committed: template DeepSeek (2 brains + passthrough)
#
# Comportamiento:
#   BRAIN_MODE=deepseek       -> cp opencode.deepseek.json opencode.json
#   BRAIN_MODE=opencode|hybrid|auto  -> git checkout -- opencode.json (restaura el template)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env no existe" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: no estás dentro de un repositorio git (necesario para restaurar opencode.json)" >&2
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
    git checkout -- opencode.json
    echo "✓ opencode.json restaurado al template OpenCode Go (BRAIN_MODE=${mode:-auto})"
    echo "  Brains: $(python3 -c "import json; print(', '.join(json.load(open('opencode.json'))['provider']['cortex-multimodal']['models'].keys()))")"
    ;;
  *)
    echo "ERROR: BRAIN_MODE='$mode' no reconocido (usa opencode|deepseek|hybrid|auto)" >&2
    exit 1
    ;;
esac
