import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectMultimodalContent,
  extractUserContext,
  getDeepseekSupportedContent,
  ContentAnalysis,
  DetectedContent,
} from '../../../src/middleware/multimodalDetector';
import type { ChatMessage } from '../../../src/types/openai';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock downloader
vi.mock('../../../src/utils/downloader', () => ({
  downloader: {
    getFileInfo: vi.fn(),
  },
}));

describe('multimodalDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PDF_LOCAL_PROCESSING = 'false';
  });

  describe('detectMultimodalContent', () => {
    it('debe retornar análisis vacío si no hay mensajes de usuario', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Eres un asistente' },
        { role: 'assistant', content: 'Hola' },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.hasOnlyText).toBe(true);
      expect(result.detectedContent).toHaveLength(0);
    });

    it('debe detectar imagen en formato image_url', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe esta imagen' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].type).toBe('image');
      expect(result.detectedContent[0].internalType).toBe('image');
      expect(result.detectedContent[0].source).toBe('https://example.com/image.png');
      expect(result.hasOnlyText).toBe(false);
    });

    it('debe detectar imagen base64 embebida en texto', async () => {
      // Cadena base64 válida (1x1 pixel PNG transparente)
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: `Aquí está la imagen: ${base64Image} ¿Qué ves?`,
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].type).toBe('image');
      expect(result.detectedContent[0].source).toBe(base64Image);
    });

    it('debe detectar audio en formato audio_url', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe este audio' },
            { type: 'audio_url', audio_url: { url: 'https://example.com/audio.mp3', format: 'mp3' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].type).toBe('audio');
      expect(result.detectedContent[0].internalType).toBe('audio');
    });

    it('debe detectar video en formato video_url', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analiza este video' },
            { type: 'video_url', video_url: { url: 'https://example.com/video.mp4', format: 'mp4' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].type).toBe('video');
      expect(result.detectedContent[0].internalType).toBe('video');
    });

    it('debe detectar PDF por extensión', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Resume este documento' },
            { type: 'document_url', document_url: { url: 'https://example.com/document.pdf' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].type).toBe('pdf');
      expect(result.detectedContent[0].internalType).toBe('pdf');
    });

    it('debe detectar archivos de código como tipo text', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Revisa este código' },
            { type: 'document_url', document_url: { url: 'https://example.com/script.py' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].type).toBe('text');
      expect(result.detectedContent[0].internalType).toBe('code');
    });

    it('debe detectar múltiples tipos de contenido', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compara estos archivos' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
            { type: 'document_url', document_url: { url: 'https://example.com/doc.pdf' } },
            { type: 'audio_url', audio_url: { url: 'https://example.com/audio.mp3' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(3);
      expect(result.detectedContent.some(c => c.type === 'image')).toBe(true);
      expect(result.detectedContent.some(c => c.type === 'pdf')).toBe(true);
      expect(result.detectedContent.some(c => c.type === 'audio')).toBe(true);
    });

    it('debe procesar solo el último mensaje del usuario', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/old.png' } },
          ],
        },
        {
          role: 'assistant',
          content: 'Ya vi esa imagen',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/new.png' } },
          ],
        },
      ];

      const result = await detectMultimodalContent(messages);

      expect(result.detectedContent).toHaveLength(1);
      expect(result.detectedContent[0].source).toBe('https://example.com/new.png');
    });
  });

  describe('extractUserContext', () => {
    it('debe extraer texto de mensaje string', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Esta es mi pregunta' },
      ];

      const context = extractUserContext(messages);

      expect(context).toBe('Esta es mi pregunta');
    });

    it('debe extraer solo partes de texto de contenido multipart', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Primera parte' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
            { type: 'text', text: 'Segunda parte' },
          ],
        },
      ];

      const context = extractUserContext(messages);

      expect(context).toBe('Primera parte Segunda parte');
    });

    it('debe retornar string vacío si no hay mensaje de usuario', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Eres un asistente' },
      ];

      const context = extractUserContext(messages);

      expect(context).toBe('');
    });
  });

  describe('getDeepseekSupportedContent', () => {
    it('debe incluir archivos de código', () => {
      const content: DetectedContent[] = [
        { source: 'test.py', type: 'text', internalType: 'code', messageIndex: 0, extension: 'py' },
        { source: 'test.js', type: 'text', internalType: 'code', messageIndex: 0, extension: 'js' },
        { source: 'test.ts', type: 'text', internalType: 'code', messageIndex: 0, extension: 'ts' },
      ];

      const result = getDeepseekSupportedContent(content);

      expect(result).toHaveLength(3);
    });

    it('debe incluir archivos de texto', () => {
      const content: DetectedContent[] = [
        { source: 'readme.md', type: 'text', internalType: 'text_file', messageIndex: 0, extension: 'md' },
        { source: 'notes.txt', type: 'text', internalType: 'text_file', messageIndex: 0, extension: 'txt' },
      ];

      const result = getDeepseekSupportedContent(content);

      expect(result).toHaveLength(2);
    });

    it('debe excluir PDFs', () => {
      const content: DetectedContent[] = [
        { source: 'doc.pdf', type: 'pdf', internalType: 'pdf', messageIndex: 0, extension: 'pdf' },
      ];

      const result = getDeepseekSupportedContent(content);

      expect(result).toHaveLength(0);
    });

    it('debe excluir imágenes', () => {
      const content: DetectedContent[] = [
        { source: 'image.png', type: 'image', internalType: 'image', messageIndex: 0, extension: 'png' },
      ];

      const result = getDeepseekSupportedContent(content);

      expect(result).toHaveLength(0);
    });

    it('debe incluir JSON y YAML como archivos de datos', () => {
      const content: DetectedContent[] = [
        { source: 'config.json', type: 'text', internalType: 'data_file', messageIndex: 0, extension: 'json' },
        { source: 'config.yaml', type: 'text', internalType: 'data_file', messageIndex: 0, extension: 'yaml' },
      ];

      const result = getDeepseekSupportedContent(content);

      expect(result).toHaveLength(2);
    });
  });
});
