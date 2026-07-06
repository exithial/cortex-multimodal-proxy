import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  anthropicAdapter,
} from '../../../src/services/anthropicAdapter';
import type { AnthropicRequest, AnthropicMessage, AnthropicContentBlock } from '../../../src/types/anthropic';
import type { ChatCompletionResponse, ChatCompletionChunk } from '../../../src/types/openai';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('anthropicAdapter', () => {
  describe('mapClaudeModelToInternal', () => {
    it('debe mapear haiku a mimo-v2.5 (passthrough)', () => {
      const result = anthropicAdapter.mapClaudeModelToInternal('haiku');
      expect(result).toBe('mimo-v2.5');
    });

    it('debe mapear sonnet a proxy/deepseek-v4-pro', () => {
      const result = anthropicAdapter.mapClaudeModelToInternal('sonnet');
      expect(result).toBe('proxy/deepseek-v4-pro');
    });

    it('debe mapear opus a proxy/glm-5.2', () => {
      const result = anthropicAdapter.mapClaudeModelToInternal('opus');
      expect(result).toBe('proxy/glm-5.2');
    });

    it('debe usar proxy/deepseek-v4-pro como default para modelos desconocidos', () => {
      const result = anthropicAdapter.mapClaudeModelToInternal('unknown-model');
      expect(result).toBe('proxy/deepseek-v4-pro');
    });
  });

  describe('anthropicToInternal', () => {
    it('debe convertir request simple de Anthropic a OpenAI', () => {
      const request: AnthropicRequest = {
        model: 'sonnet',
        messages: [
          { role: 'user', content: 'Hola' },
        ],
        max_tokens: 1000,
      };

      const result = anthropicAdapter.anthropicToInternal(request);

      expect(result.model).toBe('proxy/deepseek-v4-pro');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hola');
      expect(result.max_tokens).toBe(1000);
    });

    it('debe incluir mensaje system si existe', () => {
      const request: AnthropicRequest = {
        model: 'sonnet',
        system: 'Eres un asistente útil',
        messages: [
          { role: 'user', content: 'Hola' },
        ],
        max_tokens: 1000,
      };

      const result = anthropicAdapter.anthropicToInternal(request);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toBe('Eres un asistente útil');
    });

    it('debe convertir mensajes multipart', () => {
      const request: AnthropicRequest = {
        model: 'sonnet',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe esta imagen' },
              { type: 'image', source: { type: 'url', data: 'https://example.com/img.png' } },
            ] as AnthropicContentBlock[],
          },
        ],
        max_tokens: 1000,
      };

      const result = anthropicAdapter.anthropicToInternal(request);

      expect(Array.isArray(result.messages[0].content)).toBe(true);
      const content = result.messages[0].content as any[];
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('text');
      expect(content[1].type).toBe('image_url');
    });

    it('debe convertir imagen base64 a URL data', () => {
      const request: AnthropicRequest = {
        model: 'sonnet',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'iVBORw0KGgoAAAANS',
                },
              },
            ] as AnthropicContentBlock[],
          },
        ],
        max_tokens: 1000,
      };

      const result = anthropicAdapter.anthropicToInternal(request);

      const content = result.messages[0].content as any[];
      expect(content[0].type).toBe('image_url');
      expect(content[0].image_url.url).toBe('data:image/png;base64,iVBORw0KGgoAAAANS');
    });

    it('debe convertir tools de Anthropic a OpenAI', () => {
      const request: AnthropicRequest = {
        model: 'sonnet',
        messages: [{ role: 'user', content: 'Usa la herramienta' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Obtiene el clima',
            input_schema: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
        ],
        max_tokens: 1000,
      };

      const result = anthropicAdapter.anthropicToInternal(request);

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].type).toBe('function');
      expect(result.tools![0].function.name).toBe('get_weather');
    });

    it('debe mapear tool_use a tool_calls', () => {
      const request: AnthropicRequest = {
        model: 'sonnet',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool_123',
                name: 'get_weather',
                input: { city: 'Madrid' },
              },
            ] as AnthropicContentBlock[],
          },
        ],
        max_tokens: 1000,
      };

      const result = anthropicAdapter.anthropicToInternal(request);

      expect(result.messages[0].tool_calls).toHaveLength(1);
      expect(result.messages[0].tool_calls![0].id).toBe('tool_123');
      expect(result.messages[0].tool_calls![0].function.name).toBe('get_weather');
    });
  });

  describe('internalToAnthropic', () => {
    it('debe convertir respuesta OpenAI a Anthropic', () => {
      const openaiResponse: ChatCompletionResponse = {
        id: 'resp_123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hola, ¿cómo estás?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      const result = anthropicAdapter.internalToAnthropic(openaiResponse, 'sonnet');

      expect(result.id).toBe('resp_123');
      expect(result.role).toBe('assistant');
      expect(result.model).toBe('sonnet');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Hola, ¿cómo estás?');
      expect(result.stop_reason).toBe('end_turn');
    });

    it('debe mapear tool_calls a tool_use', () => {
      const openaiResponse: ChatCompletionResponse = {
        id: 'resp_123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: JSON.stringify({ city: 'Madrid' }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };

      const result = anthropicAdapter.internalToAnthropic(openaiResponse, 'sonnet');

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('tool_use');
      expect(result.content[0].id).toBe('call_123');
      expect(result.content[0].name).toBe('get_weather');
      expect(result.content[0].input).toEqual({ city: 'Madrid' });
      expect(result.stop_reason).toBe('tool_use');
    });

    it('debe mapear finish_reason length a max_tokens', () => {
      const openaiResponse: ChatCompletionResponse = {
        id: 'resp_123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Respuesta cortada...' },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 },
      };

      const result = anthropicAdapter.internalToAnthropic(openaiResponse, 'sonnet');

      expect(result.stop_reason).toBe('max_tokens');
    });
  });

  describe('createAnthropicStream', () => {
    async function* mockOpenAIStream(): AsyncGenerator<string> {
      yield 'data: {"choices":[{"delta":{"content":"Hola"},"index":0}]}';
      yield 'data: {"choices":[{"delta":{"content":" mundo"},"index":0}]}';
      yield 'data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}';
      yield 'data: [DONE]';
    }

    it('debe convertir stream OpenAI a formato Anthropic', async () => {
      const stream = anthropicAdapter.createAnthropicStream(
        mockOpenAIStream(),
        'sonnet',
        'req_123'
      );

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some(c => c.includes('message_start'))).toBe(true);
      expect(chunks.some(c => c.includes('content_block_start'))).toBe(true);
      expect(chunks.some(c => c.includes('Hola'))).toBe(true);
      expect(chunks.some(c => c.includes('mundo'))).toBe(true);
      expect(chunks.some(c => c.includes('message_stop'))).toBe(true);
    });
  });

  describe('mapReasoningToThinking', () => {
    it('debe convertir reasoning a thinking block', () => {
      const result = anthropicAdapter.mapReasoningToThinking('Pensando en la respuesta...');

      expect(result.type).toBe('thinking');
      expect(result.thinking).toBe('Pensando en la respuesta...');
    });
  });
});
