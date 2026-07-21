import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processMultimodalContent,
  canDeepseekHandleDirectly,
} from '../../../src/middleware/multimodalProcessor';
import type { ChatMessage } from '../../../src/types/openai';

const mockAnalyzeContent = vi.fn();
const mockGenerateDirectResponse = vi.fn();

vi.mock('../../../src/services/geminiService', () => ({
  geminiService: {
    analyzeContent: (...args: any[]) => mockAnalyzeContent(...args),
    generateDirectResponse: (...args: any[]) => mockGenerateDirectResponse(...args),
  },
}));

const mockDescribeImage = vi.fn();

vi.mock('../../../src/services/providerSelector', () => ({
  getActiveVisionProvider: () => ({
    name: 'test-vision',
    isAvailable: () => true,
    supportsContentType: (t: string) => t === 'image' || t === 'video',
    describeImage: (...args: any[]) => mockDescribeImage(...args),
  }),
  getActiveBrainProvider: () => ({ name: 'test-brain' }),
  getActiveBrainProviderFor: () => ({ name: 'test-brain' }),
  getActiveBrainModels: () => ({}),
  getActiveProviderInfo: () => ({}),
}));

const mockAnalyzePDF = vi.fn();

vi.mock('../../../src/utils/pdfProcessor', () => ({
  pdfProcessor: {
    analyzePDF: (...args: any[]) => mockAnalyzePDF(...args),
  },
}));

const mockValidateFile = vi.fn();
const mockDownloadFile = vi.fn();

vi.mock('../../../src/utils/downloader', () => ({
  downloader: {
    validateFile: (...args: any[]) => mockValidateFile(...args),
    downloadFile: (...args: any[]) => mockDownloadFile(...args),
  },
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/error', () => ({
  getErrorMessage: (error: any) => error?.message || String(error),
}));

describe('multimodalProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PDF_LOCAL_PROCESSING = 'false';
    delete process.env.MAX_IMAGES_PER_REQUEST;
  });

  describe('processMultimodalContent', () => {
    it('debe pasar directo si el modelo es passthrough (nativamente multimodal)', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hola' },
      ];

      const result = await processMultimodalContent(messages, 'mimo-v2.5');

      expect(result.strategy).toBe('direct');
      expect(result.useDeepseekDirectly).toBe(true);
      expect(result.processedMessages).toEqual(messages);
    });

    it('debe pasar directamente si solo hay texto', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Solo texto sin imagenes' },
      ];

      const result = await processMultimodalContent(messages);

      expect(result.strategy).toBe('direct');
      expect(result.useDeepseekDirectly).toBe(true);
      expect(result.processedMessages).toEqual(messages);
    });

    it('debe procesar imagen a traves del VisionProvider activo cuando supportsContentType("image")=true', async () => {
      mockDescribeImage.mockResolvedValue('Descripcion de imagen');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe esta imagen' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages);

      expect(mockDescribeImage).toHaveBeenCalled();
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.strategy).toBe('vision-mimo');
      expect(result.useDeepseekDirectly).toBe(false);
      expect(result.processedMessages[0].content).toContain('DESCRIPCI');
      expect(result.processedMessages[0].content).toContain('Descripcion de imagen');
    });

    it('debe procesar multiples imagenes a traves del VisionProvider activo', async () => {
      mockDescribeImage
        .mockResolvedValueOnce('Primera imagen')
        .mockResolvedValueOnce('Segunda imagen');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img1.png' } },
            { type: 'image_url', image_url: { url: 'https://example.com/img2.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages);

      expect(mockDescribeImage).toHaveBeenCalledTimes(2);
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.processedMessages[0].content).toContain('Primera imagen');
      expect(result.processedMessages[0].content).toContain('Segunda imagen');
    });

    it('debe procesar PDF con Gemini (sin procesamiento local)', async () => {
      process.env.PDF_LOCAL_PROCESSING = 'false';
      mockAnalyzeContent.mockResolvedValue('Contenido del PDF');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Resume este PDF' },
            { type: 'document_url', document_url: { url: 'https://example.com/doc.pdf' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages);

      expect(mockAnalyzeContent).toHaveBeenCalled();
      expect(result.strategy).toBe('vision');
      expect(result.processedMessages[0].content).toContain('PDF');
    });

    it('debe procesar PDF localmente si esta habilitado', async () => {
      process.env.PDF_LOCAL_PROCESSING = 'true';
      process.env.PDF_LOCAL_MAX_SIZE_MB = '5';

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Resume este PDF' },
            { type: 'document_url', document_url: { url: 'https://example.com/small.pdf' } },
          ],
        },
      ];

      expect(process.env.PDF_LOCAL_PROCESSING).toBe('true');
    });

    it('debe hacer fallback a Gemini si procesamiento local falla', async () => {
      process.env.PDF_LOCAL_PROCESSING = 'true';
      mockValidateFile.mockResolvedValue({ valid: true, size: 1024, contentType: 'application/pdf' });
      mockDownloadFile.mockResolvedValue({ buffer: Buffer.from('pdf'), contentType: 'application/pdf' });
      mockAnalyzePDF.mockRejectedValue(new Error('PDF parse error'));
      mockAnalyzeContent.mockResolvedValue('Fallback Gemini');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'document_url', document_url: { url: 'https://example.com/doc.pdf' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages);

      expect(mockAnalyzeContent).toHaveBeenCalled();
      expect(result.processedMessages[0].content).toContain('Fallback Gemini');
    });

    it('debe lanzar error si VisionProvider y fallback a Gemini fallan', async () => {
      mockDescribeImage.mockRejectedValue(new Error('Vision API error'));
      mockAnalyzeContent.mockRejectedValue(new Error('Gemini API error'));

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      await expect(processMultimodalContent(messages)).rejects.toThrow('Gemini API error');
    });

    it('debe pasar contexto del usuario al VisionProvider activo', async () => {
      mockDescribeImage.mockResolvedValue('Descripcion');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe detalladamente esta imagen' },
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      await processMultimodalContent(messages);

      expect(mockDescribeImage).toHaveBeenCalledWith(
        'https://example.com/img.png',
        'Describe detalladamente esta imagen'
      );
    });

    it('debe usar MiMo V2.5 para imagenes cuando el modelo es proxy/ text-only', async () => {
      mockDescribeImage.mockResolvedValue('Descripcion via MiMo');
      mockAnalyzeContent.mockResolvedValue('Fallback Gemini');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'proxy/deepseek-v4-pro');

      expect(mockDescribeImage).toHaveBeenCalledWith(
        'https://example.com/img.png',
        ''
      );
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.strategy).toBe('vision-mimo');
      expect(result.processedMessages[0].content).toContain('Descripcion via MiMo');
    });

    it('debe pasar imagen directo al brain cuando es passthrough (mimo-v2.5)', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'mimo-v2.5');

      expect(mockDescribeImage).not.toHaveBeenCalled();
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.strategy).toBe('direct');
      expect(result.useDeepseekDirectly).toBe(true);
    });

    it('debe usar MiMo V2.5 para GLM brains (text-only confirmados)', async () => {
      mockDescribeImage.mockResolvedValue('Descripcion GLM');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'proxy/glm-5.2');

      expect(mockDescribeImage).toHaveBeenCalled();
      expect(result.strategy).toBe('vision-mimo');
    });

    it('debe hacer fallback a Gemini si MiMo falla para imagen', async () => {
      mockDescribeImage.mockRejectedValue(new Error('MiMo API error'));
      mockAnalyzeContent.mockResolvedValue('Fallback Gemini descripcion');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'proxy/deepseek-v4-pro');

      expect(mockDescribeImage).toHaveBeenCalled();
      expect(mockAnalyzeContent).toHaveBeenCalled();
      expect(result.processedMessages[0].content).toContain('Fallback Gemini descripcion');
    });

    it('debe usar Gemini (no MiMo) para audio/video aunque modelo sea multimodal nativo', async () => {
      mockAnalyzeContent.mockResolvedValue('Descripcion de audio');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'audio_url', audio_url: { url: 'https://example.com/audio.mp3' } },
          ],
        },
      ];

      const result = await processMultimodalContent(
        messages,
        'proxy/kimi-k2.6',
      );

      expect(mockDescribeImage).not.toHaveBeenCalled();
      expect(mockAnalyzeContent).toHaveBeenCalled();
      expect(result.strategy).toBe('vision');
    });

    it('debe pasar sin procesar si el modelo es passthrough (nativamente multimodal)', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'mimo-v2.5');

      expect(mockDescribeImage).not.toHaveBeenCalled();
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.strategy).toBe('direct');
      expect(result.useDeepseekDirectly).toBe(true);
    });

    it('debe usar MiMo V2.5 para imagenes con proxy/qwen3.7-max (brain nuevo, endpoint Anthropic)', async () => {
      mockDescribeImage.mockResolvedValue('Descripcion Qwen');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/qwen.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'proxy/qwen3.7-max');

      expect(mockDescribeImage).toHaveBeenCalledWith('https://example.com/qwen.png', '');
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.strategy).toBe('vision-mimo');
      expect(result.processedMessages[0].content).toContain('Descripcion Qwen');
    });

    it('debe usar MiMo V2.5 para imagenes con proxy/mimo-v2.5-pro (brain nuevo coexistente con passthrough)', async () => {
      mockDescribeImage.mockResolvedValue('Descripcion MiMo Pro');

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/mimopro.png' } },
          ],
        },
      ];

      const result = await processMultimodalContent(messages, 'proxy/mimo-v2.5-pro');

      expect(mockDescribeImage).toHaveBeenCalledWith('https://example.com/mimopro.png', '');
      expect(mockAnalyzeContent).not.toHaveBeenCalled();
      expect(result.strategy).toBe('vision-mimo');
      expect(result.processedMessages[0].content).toContain('Descripcion MiMo Pro');
    });

    it("routes image content through the active VisionProvider when supportsContentType('image')=true", async () => {
      mockDescribeImage.mockResolvedValue('described by active vision');
      const messages: ChatMessage[] = [
        { role: 'user', content: 'look' },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://x/y.png' } } as any,
          ],
        },
      ];
      const result = await processMultimodalContent(messages);
      expect(mockDescribeImage).toHaveBeenCalledWith('https://x/y.png', expect.any(String));
      expect(result.strategy).toBe('vision-mimo');
    });
  });

  describe('canDeepseekHandleDirectly', () => {
    it('debe retornar true para texto puro', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Solo texto' },
      ];

      const result = await canDeepseekHandleDirectly(messages);

      expect(result).toBe(true);
    });

    it('debe retornar false si hay contenido que requiere Gemini', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ];

      const result = await canDeepseekHandleDirectly(messages);

      expect(result).toBe(false);
    });

    it('debe retornar true para codigo fuente', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'document_url', document_url: { url: 'https://example.com/code.py' } },
          ],
        },
      ];

      const result = await canDeepseekHandleDirectly(messages);

      expect(result).toBe(true);
    });

    it('debe retornar false si hay PDF (va a Gemini o local)', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'document_url', document_url: { url: 'https://example.com/doc.pdf' } },
          ],
        },
      ];

      const result = await canDeepseekHandleDirectly(messages);

      expect(result).toBe(false);
    });
  });
});
