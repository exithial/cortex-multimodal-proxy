import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const importService = async () => {
  vi.resetModules();
  const mod = await import('../../../src/services/deepseekService');
  return mod.deepseekService as any;
};

const setApiKey = () => {
  process.env.DEEPSEEK_API_KEY = 'test-key';
};

describe('deepseekService', () => {
  beforeEach(() => {
    setApiKey();
    delete process.env.DEEPSEEK_THINKING_ENABLED;
    delete process.env.DEEPSEEK_THINKING_EFFORT;
  });

  afterEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_THINKING_ENABLED;
    delete process.env.DEEPSEEK_THINKING_EFFORT;
  });

  describe('mapModel', () => {
    it('mapea deepseek-multimodal-pro a deepseek-v4-pro con thinking=true (default)', async () => {
      const svc = await importService();
      expect(svc.mapModel('deepseek-multimodal-pro')).toEqual({
        target: 'deepseek',
        model: 'deepseek-v4-pro',
        thinking: true,
      });
    });

    it('mapea deepseek-multimodal-flash a deepseek-v4-flash con thinking=true (default)', async () => {
      const svc = await importService();
      expect(svc.mapModel('deepseek-multimodal-flash')).toEqual({
        target: 'deepseek',
        model: 'deepseek-v4-flash',
        thinking: true,
      });
    });

    it('mapea deepseek-multimodal-pro-nothink a deepseek-v4-pro con thinking=false', async () => {
      const svc = await importService();
      expect(svc.mapModel('deepseek-multimodal-pro-nothink')).toEqual({
        target: 'deepseek',
        model: 'deepseek-v4-pro',
        thinking: false,
      });
    });

    it('mapea deepseek-multimodal-flash-nothink a deepseek-v4-flash con thinking=false', async () => {
      const svc = await importService();
      expect(svc.mapModel('deepseek-multimodal-flash-nothink')).toEqual({
        target: 'deepseek',
        model: 'deepseek-v4-flash',
        thinking: false,
      });
    });

    it('respeta DEEPSEEK_THINKING_ENABLED=false para modelos con thinking', async () => {
      process.env.DEEPSEEK_THINKING_ENABLED = 'false';
      const svc = await importService();
      expect(svc.mapModel('deepseek-multimodal-pro').thinking).toBe(false);
      expect(svc.mapModel('deepseek-multimodal-flash').thinking).toBe(false);
    });

    it('los modelos -nothink siempre tienen thinking=false aunque DEEPSEEK_THINKING_ENABLED=true', async () => {
      process.env.DEEPSEEK_THINKING_ENABLED = 'true';
      const svc = await importService();
      expect(svc.mapModel('deepseek-multimodal-pro-nothink').thinking).toBe(false);
      expect(svc.mapModel('deepseek-multimodal-flash-nothink').thinking).toBe(false);
    });

    it('modelo desconocido cae al default flash con thinking=true', async () => {
      const svc = await importService();
      expect(svc.mapModel('modelo-raro')).toEqual({
        target: 'deepseek',
        model: 'deepseek-v4-flash',
        thinking: true,
      });
    });
  });

  describe('prepareMessages', () => {
    it('preserva reasoning_content cuando thinking=true', async () => {
      const svc = await importService();
      const result = svc.prepareMessages(
        [{ role: 'assistant', content: 'hola', reasoning_content: 'pensando...' }],
        true,
      );
      expect(result[0].reasoning_content).toBe('pensando...');
    });

    it('descarta reasoning_content cuando thinking=false (regresion AnthingLLM)', async () => {
      const svc = await importService();
      const result = svc.prepareMessages(
        [{ role: 'assistant', content: 'hola', reasoning_content: 'pensando...' }],
        false,
      );
      expect(result[0].reasoning_content).toBeUndefined();
      expect(result[0]).not.toHaveProperty('reasoning_content');
    });

    it('preserva tool_calls en assistant', async () => {
      const svc = await importService();
      const toolCalls = [
        { id: '1', type: 'function', function: { name: 'f', arguments: '{}' } },
      ];
      const result = svc.prepareMessages(
        [{ role: 'assistant', content: null, tool_calls: toolCalls }],
        false,
      );
      expect(result[0].tool_calls).toEqual(toolCalls);
    });

    it('preserva tool_call_id y name en tool', async () => {
      const svc = await importService();
      const result = svc.prepareMessages(
        [{ role: 'tool', content: 'ok', tool_call_id: '1', name: 'f' }],
        false,
      );
      expect(result[0].tool_call_id).toBe('1');
      expect(result[0].name).toBe('f');
    });

    it('filtra roles invalidos', async () => {
      const svc = await importService();
      const result = svc.prepareMessages(
        [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          { role: 'function', content: 'x' },
        ] as any,
        true,
      );
      expect(result).toHaveLength(2);
      expect(result.map((m: any) => m.role)).toEqual(['system', 'user']);
    });

    it('serializa content array a JSON', async () => {
      const svc = await importService();
      const result = svc.prepareMessages(
        [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }],
        false,
      );
      expect(result[0].content).toBe(JSON.stringify([{ type: 'text', text: 'hola' }]));
    });
  });

  describe('buildPayload', () => {
    it('incluye thinking y reasoning_effort cuando thinking=true', async () => {
      process.env.DEEPSEEK_THINKING_EFFORT = 'max';
      const svc = await importService();
      const payload = svc.buildPayload(
        { model: 'deepseek-multimodal-flash', messages: [{ role: 'user', content: 'hola' }] },
        { target: 'deepseek', model: 'deepseek-v4-flash', thinking: true },
      );
      expect(payload.thinking).toEqual({ type: 'enabled' });
      expect(payload.reasoning_effort).toBe('max');
    });

    it('omite thinking y reasoning_effort cuando thinking=false', async () => {
      const svc = await importService();
      const payload = svc.buildPayload(
        { model: 'deepseek-multimodal-flash-nothink', messages: [{ role: 'user', content: 'hola' }] },
        { target: 'deepseek', model: 'deepseek-v4-flash', thinking: false },
      );
      expect(payload.thinking).toBeUndefined();
      expect(payload.reasoning_effort).toBeUndefined();
    });

    it('NO incluye reasoning_content cuando thinking=false aunque venga en mensajes (regresion AnthingLLM 400)', async () => {
      const svc = await importService();
      const payload = svc.buildPayload(
        {
          model: 'deepseek-multimodal-flash-nothink',
          messages: [
            { role: 'user', content: 'hola' },
            { role: 'assistant', content: 'respuesta', reasoning_content: 'pensamiento previo' },
            { role: 'user', content: 'seguime' },
          ],
        },
        { target: 'deepseek', model: 'deepseek-v4-flash', thinking: false },
      );
      const serialized = JSON.stringify(payload.messages);
      expect(serialized).not.toContain('pensamiento previo');
      expect(serialized).not.toContain('reasoning_content');
    });

    it('preserva reasoning_content cuando thinking=true (compatibilidad OpenCode/Claude Code)', async () => {
      const svc = await importService();
      const payload = svc.buildPayload(
        {
          model: 'deepseek-multimodal-flash',
          messages: [
            { role: 'assistant', content: 'respuesta', reasoning_content: 'pensamiento' },
          ],
        },
        { target: 'deepseek', model: 'deepseek-v4-flash', thinking: true },
      );
      expect(payload.messages[0].reasoning_content).toBe('pensamiento');
    });

    it('respeta max_tokens del request limitado por el maximo configurado', async () => {
      const svc = await importService();
      const payload = svc.buildPayload(
        {
          model: 'deepseek-multimodal-flash',
          messages: [{ role: 'user', content: 'hola' }],
          max_tokens: 1000,
        },
        { target: 'deepseek', model: 'deepseek-v4-flash', thinking: true },
      );
      expect(payload.max_tokens).toBe(1000);
    });
  });
});
