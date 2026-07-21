#!/usr/bin/env bash
# Informa qué template de opencode.json usar según BRAIN_MODE en .env
# Uso:
#   ./scripts/select-opencode-config.sh                # solo imprime recomendación
#   ./scripts/select-opencode-config.sh <dest_path>    # copia el template al destino
#
# Templates disponibles (NO se regeneran automáticamente):
#   opencode.json          — OpenCode Go (4 brains + mimo-v2.5 passthrough)
#   opencode.deepseek.json — DeepSeek (2 brains + MiniMax-M3 passthrough)
#
# Para tu setup personal con BRAIN_MODE=deepseek, copiá manualmente:
#   cp opencode.deepseek.json ~/.config/opencode/opencode.json
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env no existe" >&2
  exit 1
fi

mode=$(grep -E "^BRAIN_MODE=" .env | head -1 | cut -d= -f2 | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')

case "$mode" in
  deepseek)
    template="opencode.deepseek.json"
    echo "BRAIN_MODE=$mode → usa opencode.deepseek.json"
    ;;
  opencode|hybrid|auto|"")
    template="opencode.json"
    echo "BRAIN_MODE=${mode:-auto} → usa opencode.json"
    ;;
  *)
    echo "ERROR: BRAIN_MODE='$mode' no reconocido (usa opencode|deepseek|hybrid|auto)" >&2
    exit 1
    ;;
esac

if [ ! -f "$template" ]; then
  echo "ERROR: $template no existe" >&2
  exit 1
fi

if [ $# -ge 1 ]; then
  cp "$template" "$1"
  echo "✓ $1 <- $template"
fi
