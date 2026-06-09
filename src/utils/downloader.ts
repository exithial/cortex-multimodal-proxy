import axios from "axios";
import { logger } from "./logger";
import { getErrorMessage } from "./error";

/**
 * Utilidad para descargar contenido desde URLs
 */
export class Downloader {
  private static instance: Downloader;
  private axiosInstance;

  private constructor() {
    const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || "50");
    this.axiosInstance = axios.create({
      timeout: 120000, // 120 segundos para archivos grandes
      maxContentLength: maxFileSizeMB * 1024 * 1024, // Configurable (50MB por defecto)
      headers: {
        "User-Agent": "deepseek-multimodal-proxy/2.0.0",
      },
    });
  }

  static getInstance(): Downloader {
    if (!Downloader.instance) {
      Downloader.instance = new Downloader();
    }
    return Downloader.instance;
  }

  /**
   * Descarga una imagen desde una URL con validación de Content-Type
   */
  async downloadImage(
    url: string,
    expectedTypes: string[] = ["image/"],
  ): Promise<Buffer> {
    try {
      logger.info(`📥 Descargando imagen: ${url.substring(0, 100)}...`);
      const startTime = Date.now();

      const response = await this.axiosInstance.get(url, {
        responseType: "arraybuffer",
        validateStatus: (status) => status === 200,
      });

      const buffer = Buffer.from(response.data);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Validación CRÍTICA: Verificar Content-Type real
      const contentType = response.headers["content-type"]?.toLowerCase() || "";
      const isExpectedType = expectedTypes.some((type) =>
        contentType.startsWith(type),
      );

      if (!isExpectedType) {
        logger.warn(
          `⚠️ Content-Type inesperado para imagen: "${contentType}" (URL: ${url.substring(0, 80)}...)`,
        );

        // Detectar tipos problemáticos comunes
        if (
          contentType.includes("text/html") ||
          contentType.includes("application/json")
        ) {
          throw new Error(
            `URL devuelve ${contentType} en lugar de imagen. Posible página de error o redirección.`,
          );
        }

        if (contentType.includes("application/pdf")) {
          throw new Error(
            `URL devuelve PDF (${contentType}) en lugar de imagen. Use tipo 'document' en lugar de 'image'.`,
          );
        }

        // Advertencia pero continuamos (algunos servidores no envían Content-Type correcto)
        logger.warn(
          `Continuando con descarga pero Content-Type "${contentType}" no es imagen típica`,
        );
      } else {
        logger.info(`✓ Content-Type válido: ${contentType}`);
      }

      logger.info(
        `✓ Imagen descargada: ${(buffer.length / 1024).toFixed(1)}KB en ${elapsed}s`,
      );

      return buffer;
    } catch (error: unknown) {
      logger.error(`✗ Error descargando imagen: ${getErrorMessage(error)}`);
      throw new Error(
        `No se pudo descargar la imagen: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Descarga cualquier archivo desde una URL
   */
  async downloadFile(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      logger.info(`📥 Descargando archivo: ${url.substring(0, 100)}...`);
      const startTime = Date.now();

      const response = await this.axiosInstance.get(url, {
        responseType: "arraybuffer",
        validateStatus: (status) => status === 200,
      });

      const buffer = Buffer.from(response.data);
      const contentType =
        response.headers["content-type"] || "application/octet-stream";
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      logger.info(
        `✓ Archivo descargado: ${(buffer.length / 1024).toFixed(1)}KB en ${elapsed}s (${contentType})`,
      );

      return { buffer, contentType };
    } catch (error: unknown) {
      logger.error(`✗ Error descargando archivo: ${getErrorMessage(error)}`);
      throw new Error(
        `No se pudo descargar el archivo: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Verifica si una URL es accesible
   */
  async checkUrlAccessible(url: string): Promise<boolean> {
    try {
      const response = await this.axiosInstance.head(url, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Obtiene información sobre un archivo remoto
   */
  async getFileInfo(
    url: string,
  ): Promise<{ size: number; contentType: string; accessible: boolean }> {
    try {
      const response = await this.axiosInstance.head(url, {
        timeout: 5000,
      });

      const size = parseInt(response.headers["content-length"] || "0");
      const contentType =
        response.headers["content-type"] || "application/octet-stream";

      // Validar tamaño máximo (configurable)
      const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || "50");
      const MAX_SIZE = maxFileSizeMB * 1024 * 1024;
      if (size > MAX_SIZE) {
        logger.warn(
          `⚠️ Archivo demasiado grande: ${(size / 1024 / 1024).toFixed(2)}MB (límite: ${maxFileSizeMB}MB)`,
        );
      }

      return {
        size,
        contentType,
        accessible: response.status === 200,
      };
    } catch (error: unknown) {
      logger.warn(
        `No se pudo obtener info de ${url}: ${getErrorMessage(error)}`,
      );
      return {
        size: 0,
        contentType: "application/octet-stream",
        accessible: false,
      };
    }
  }

  /**
   * Valida si un archivo puede ser descargado según tamaño y tipo
   */
  async validateFile(
    url: string,
    expectedTypes?: string[],
  ): Promise<{
    valid: boolean;
    reason?: string;
    size?: number;
    contentType?: string;
  }> {
    try {
      const info = await this.getFileInfo(url);

      if (!info.accessible) {
        return { valid: false, reason: "URL no accesible" };
      }

      // Validar tamaño máximo (configurable)
      const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || "50");
      const MAX_SIZE = maxFileSizeMB * 1024 * 1024;
      if (info.size > MAX_SIZE) {
        return {
          valid: false,
          reason: `Archivo demasiado grande: ${(info.size / 1024 / 1024).toFixed(2)}MB (límite: ${maxFileSizeMB}MB)`,
          size: info.size,
          contentType: info.contentType,
        };
      }

      // Validar tipo de contenido si se especifican tipos esperados
      if (expectedTypes && expectedTypes.length > 0) {
        const isExpectedType = expectedTypes.some((type) =>
          info.contentType.startsWith(type),
        );
        if (!isExpectedType) {
          return {
            valid: false,
            reason: `Content-Type inesperado: ${info.contentType}`,
            size: info.size,
            contentType: info.contentType,
          };
        }
      }

      return {
        valid: true,
        size: info.size,
        contentType: info.contentType,
      };
    } catch (error: unknown) {
      logger.warn(`Error validando archivo ${url}: ${getErrorMessage(error)}`);
      return {
        valid: false,
        reason: `Error de validación: ${getErrorMessage(error)}`,
      };
    }
  }
}

export const downloader = Downloader.getInstance();
