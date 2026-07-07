# Scripts de Gestión Unificados

Este directorio contiene los scripts para la instalación, gestión y ejecución de **Cortex Multimodal Proxy**. Se ha simplificado la estructura para ofrecer una experiencia más profesional y directa.

## 📋 Scripts Principales

### 1. `setup.sh` / `setup.ps1` - Instalador Automático

**Propósito:** Configurar el entorno, compilar el proyecto e instalar o iniciar el proxy según el sistema operativo.

- **Detección Inteligente:** Localiza el binario real de Node.js (incluso bajo NVM/Yarn) para asegurar la persistencia del servicio systemd.
- **Compilación Transparente:** Ejecuta `npm run build` y verifica la generación de archivos en `dist/`.
- **Linux:** Crea y habilita el servicio `cortex-multimodal-proxy.service` con reinicio automático.
- **Windows:** Compila, crea `.env` si falta y arranca el proxy en segundo plano.
- **Salida Informativa:** Reporta cada paso y verifica la salud de la API al finalizar.

```bash
npm run setup
```

---

### 2. `manage.sh` / `manage.ps1` - Comando Único de Gestión

**Propósito:** Centralizar todas las operaciones del servicio en un solo punto de entrada.

**Comandos disponibles:**

- `start`: Inicia el servicio o proceso gestionado.
- `stop`: Detiene el servicio o proceso gestionado.
- `restart`: Reinicia el servicio para aplicar cambios.
- `status`: Muestra el estado y realiza un **Health Check** real a la API.
- `logs`: Muestra los logs en tiempo real.
- `logs --clear`: Limpia logs y luego muestra seguimiento en vivo.
- `uninstall`: Limpia la instalación/gestión actual.

```bash
npm run proxy:start
npm run proxy:stop
npm run proxy:restart
npm run status
npm run proxy:logs
npm run proxy:uninstall
```

---

### 3. `run-local.sh` / `run-local.ps1` - Ejecución Rápida

**Propósito:** Iniciar el proxy manualmente para pruebas rápidas o desarrollo, sin instalar nada como servicio del sistema.

```bash
npm run proxy:local
```

## 🚀 Integración con NPM

Para mayor comodidad, estos scripts están mapeados en el `package.json`:

| Comando NPM               | Descripción                          |
| :------------------------ | :----------------------------------- |
| `npm run setup`           | Ejecuta el instalador completo.      |
| `npm run status`          | Muestra el estado y salud de la API. |
| `npm run proxy:start`     | Inicia el servicio o proceso.        |
| `npm run proxy:stop`      | Detiene el servicio o proceso.       |
| `npm run proxy:logs`      | Ver logs en tiempo real.             |
| `npm run proxy:logs:clear`| Limpiar logs y seguir en vivo.       |
| `npm run proxy:uninstall` | Desinstalación limpia.               |
| `npm run proxy:local`     | Ejecución manual sin systemd.        |
| `npm run docker:build`    | Construye la imagen Docker.          |
| `npm run docker:up`       | Levanta el stack en segundo plano.   |
| `npm run docker:logs`     | Sigue los logs del contenedor.       |
| `npm run docker:ps`       | Muestra el estado del stack Docker.  |
| `npm run docker:down`     | Detiene el stack Docker.             |
| `npm run test:claude`     | Pruebas Claude Code.                 |
| `npm run test:all`        | Ejecuta test master + Claude Code.   |

## 🧪 Pruebas

Para validar que la instalación y el routing funcionan correctamente:

```bash
npm run test:master
npm run test:claude
npm run test:all
```

## ⚠️ Solución de Problemas

1. **Permisos:** Si recibes un error de permisos, asegúrate de que los scripts sean ejecutables: `chmod +x scripts/*.sh`.
2. **Logs:** Si el servicio no inicia, usa `npm run proxy:logs` para ver el error específico de Node.js.
3. **API Keys:** Verifica que tu archivo `.env` contenga las claves válidas para DeepSeek y Gemini.
4. **Reseteo:** Si necesitas empezar de cero, usa `npm run proxy:uninstall` y luego `npm run setup`.
5. **Cambio de SO:** Si mueves `node_modules` entre Linux y Windows, ejecuta `npm install` otra vez para regenerar binarios y dependencias opcionales nativas.
6. **Docker:** Para operación persistente multiplataforma, usa `docker compose` con `restart: unless-stopped`.

---

**🎯 Gestión simplificada para máxima robustez técnica.**
