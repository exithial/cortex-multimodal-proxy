#!/bin/bash
# Script unificado para gestionar Cortex Multimodal Proxy

SERVICE_NAME="cortex-multimodal-proxy"
PORT="7777"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_help() {
    echo "Uso: ./scripts/manage.sh [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  start      Inicia el servicio"
    echo "  stop       Detiene el servicio"
    echo "  restart    Reinicia el servicio"
    echo "  status     Muestra el estado detallado (systemd + salud API)"
    echo "  logs       Muestra los logs en tiempo real"
    echo "             logs --clear  Limpia logs antes de seguir"
    echo "  uninstall  Desinstala el servicio del sistema"
    echo "  help       Muestra esta ayuda"
}

case "$1" in
    start)
        echo -e "${BLUE}Iniciando servicio...${NC}"
        sudo systemctl start "$SERVICE_NAME"
        sudo systemctl is-active --quiet "$SERVICE_NAME" && echo -e "${GREEN}✅ Servicio iniciado${NC}" || echo -e "${RED}❌ Error al iniciar${NC}"
        ;;
    stop)
        echo -e "${BLUE}Deteniendo servicio...${NC}"
        sudo systemctl stop "$SERVICE_NAME"
        echo -e "${GREEN}✅ Servicio detenido${NC}"
        ;;
    restart)
        echo -e "${BLUE}Reiniciando servicio...${NC}"
        sudo systemctl restart "$SERVICE_NAME"
        echo -e "${GREEN}✅ Servicio reiniciado${NC}"
        ;;
    status)
        echo -e "${BLUE}=== Estado del Sistema ===${NC}"
        sudo systemctl status "$SERVICE_NAME" --no-pager
        echo ""
        echo -e "${BLUE}=== Verificación de Salud API ===${NC}"
        if curl -s --max-time 2 http://localhost:$PORT/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ API respondiendo correctamente${NC}"
            curl -s http://localhost:$PORT/health | jq .
        else
            echo -e "${RED}❌ API no responde en el puerto $PORT${NC}"
        fi
        ;;
    logs)
        if [ "$2" = "--clear" ]; then
            sudo journalctl -u "$SERVICE_NAME" --rotate
            sudo journalctl -u "$SERVICE_NAME" --vacuum-time=1s
        fi
        sudo journalctl -u "$SERVICE_NAME" -f
        ;;
    uninstall)
        echo -e "${RED}⚠️  Iniciando desinstalación detallada...${NC}"
        # Aquí se podría llamar al script original o integrar su lógica
        # Para mantener limpieza, lo integramos:
        sudo systemctl stop "$SERVICE_NAME" 2>/dev/null
        sudo systemctl disable "$SERVICE_NAME" 2>/dev/null
        sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
        sudo systemctl daemon-reload
        echo -e "${GREEN}✅ Servicio desinstalado del sistema.${NC}"
        ;;
    *)
        show_help
        ;;
esac
