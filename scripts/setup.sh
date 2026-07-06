#!/bin/bash
# Script para configurar e iniciar Cortex Multimodal Proxy con inicio automático

set -e  # Detener en caso de error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones de logging (Definidas al inicio para estar disponibles)
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuración básica
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="cortex-multimodal-proxy"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PORT="7777"
USER="$(whoami)"

# Obtener rutas reales (evitando wrappers temporales de yarn/npm)
log_info "=== Configuración de Cortex Multimodal Proxy ==="
log_info "1. Detectando rutas reales de ejecución..."
NODE_PATH=$(node -e 'console.log(process.execPath)' 2>/dev/null || which node)
NPM_PATH="$(dirname "$NODE_PATH")/npm"

# Verificar que npm existe en esa ruta, si no, fallback
if [ ! -f "$NPM_PATH" ]; then
    NPM_PATH=$(which npm)
fi

log_info "   ✅ Node detectado en: $NODE_PATH"
log_info "   ✅ NPM detectado en:  $NPM_PATH"

# Verificar que estamos en el directorio correcto
cd "$PROJECT_DIR" || {
    log_error "No se puede acceder al directorio $PROJECT_DIR"
    exit 1
}

# Verificar si el proxy ya está funcionando
log_info "2. Verificando estado actual del proxy..."
if curl -s --max-time 2 http://localhost:$PORT/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:$PORT/health)
    STATUS=$(echo $HEALTH | jq -r '.status' 2>/dev/null || echo "unknown")
    UPTIME=$(echo $HEALTH | jq -r '.uptime' 2>/dev/null || echo "0")
    
    if [ "$STATUS" = "ok" ]; then
        log_info "   ✅ Proxy ya está funcionando (uptime: ${UPTIME}s)"
        log_info "   ⚠️  No se detendrá el proxy actual para evitar interrupciones"
        SKIP_STOP=true
    else
        log_warn "   ⚠️  Proxy responde pero con estado: $STATUS"
        SKIP_STOP=false
    fi
else
    log_info "   ℹ️  Proxy no responde, procediendo con configuración normal"
    SKIP_STOP=false
fi

# Paso 3: Detener servicio systemd si existe (solo si no estamos saltando)
if [ "$SKIP_STOP" = false ]; then
    log_info "3. Deteniendo servicio systemd..."
    if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        sudo systemctl stop "$SERVICE_NAME"
        log_info "   Servicio systemd detenido"
    else
        log_info "   ℹ️  Servicio systemd no está activo o no existe"
    fi
else
    log_info "3. ⏭️  Saltando detención de servicio (proxy ya funciona)"
fi

# Paso 4: Identificar procesos (solo si no estamos saltando)
if [ "$SKIP_STOP" = false ]; then
    log_info "4. Limpiando procesos en puerto $PORT..."
    PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
    
    if [ -n "$PIDS" ]; then
        for PID in $PIDS; do
            PROCESS_CMD=$(ps -p "$PID" -o cmd= 2>/dev/null || echo "")
            if echo "$PROCESS_CMD" | grep -q "opencode"; then
                log_info "   ⚠️  PID $PID es OpenCode (se mantendrá activo)"
            else
                log_info "   🔧 Deteniendo PID $PID ($(ps -p "$PID" -o comm= 2>/dev/null))"
                kill "$PID" 2>/dev/null || true
                sleep 1
            fi
        done
    else
        log_info "   ✅ No hay procesos bloqueando el puerto $PORT"
    fi
else
    log_info "4. ⏭️  Saltando limpieza de procesos"
fi

# Paso 5: Recompilar proyecto (TypeScript)
log_info "5. Recompilando proyecto (TypeScript)..."
log_info "   Comando: $NPM_PATH run build"
BUILD_OUTPUT=$("$NPM_PATH" run build 2>&1)
if [ $? -eq 0 ]; then
    log_info "   ✅ Compilación completada con éxito"
    if [ -d "dist" ]; then
        FILE_COUNT=$(find dist -name "*.js" | wc -l)
        log_info "   📦 Archivos generados en dist/: $FILE_COUNT"
    fi
else
    log_error "   ❌ Error en la compilación:"
    echo "$BUILD_OUTPUT"
    exit 1
fi

# Paso 6: Configurar variables de entorno
log_info "6. Configurando variables de entorno..."
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    log_info "   ✅ Archivo .env creado desde .env.example"
    log_warn "   ⚠️  RECUERDA: Edita el archivo .env con tus API keys"
else
    log_info "   ✅ Archivo .env ya existe"
fi

# Paso 7: Crear servicio systemd
log_info "7. Creando/actualizando servicio systemd..."
sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=Cortex Multimodal Proxy
After=network.target
Requires=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment="NODE_ENV=production"
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$(dirname "$NODE_PATH")"
ExecStart=$NODE_PATH $PROJECT_DIR/dist/index.js

Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Seguridad básica
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$PROJECT_DIR

[Install]
WantedBy=multi-user.target
EOF

log_info "   ✅ Configuración systemd guardada en: $SERVICE_FILE"

# Paso 8: Habilitar inicio automático
log_info "8. Configurando inicio automático..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

# Paso 9: Iniciar servicio
if [ "$SKIP_STOP" = true ]; then
    log_info "9. ⏭️  Saltando inicio (el servicio ya estaba corriendo fuera de systemd)"
    log_warn "   Para que systemd tome el control, reinicia manualmente:"
    log_warn "   sudo systemctl restart $SERVICE_NAME"
else
    log_info "9. Iniciando servicio vía systemd..."
    sudo systemctl start "$SERVICE_NAME"
    sleep 2
    if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "   ✅ Servicio activo y gestionado por systemd"
    else
        log_error "   ❌ El servicio no pudo iniciar. Revisa los logs:"
        sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        exit 1
    fi
fi

# Paso 10: Verificación final de salud
log_info "10. Verificación final de salud..."
for i in {1..5}; do
    if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
        log_info "   ✅ Proxy respondiendo correctamente"
        MODEL_COUNT=$(curl -s http://localhost:$PORT/v1/models | jq '.data | length' 2>/dev/null || echo "0")
        log_info "   📊 Modelos activos: $MODEL_COUNT"
        break
    fi
    sleep 2
    [ $i -eq 5 ] && log_error "   ❌ El proxy no responde en el puerto $PORT" && exit 1
done

echo ""
log_info "🎉 ¡Proceso completado exitosamente!"
echo "===================================================="
log_info "🔧 COMANDOS DE GESTIÓN:"
log_info "• Ver estado:     ./scripts/manage.sh status"
log_info "• Ver logs:       ./scripts/manage.sh logs"
log_info "• Reiniciar:      sudo systemctl restart $SERVICE_NAME"
log_info "===================================================="