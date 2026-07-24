/**
 * Tipos compatibles con la API de OpenAI
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessageContent[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string | null;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface MessageContent {
  type:
    | "text"
    | "image_url"
    | "audio_url"
    | "video_url"
    | "document_url"
    | "image"
    | "file"
    | "input_audio";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
  audio_url?: {
    url: string;
    format?: string;
  };
  input_audio?: {
    data: string;
    format: string;
  };
  video_url?: {
    url: string;
    format?: string;
  };
  document_url?: {
    url: string;
    format?: string;
  };
  image?: string | Uint8Array | Buffer | ArrayBuffer | URL;
  file?: {
    data: string | Uint8Array | Buffer | ArrayBuffer | URL;
    mediaType: string;
  };
  mediaType?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: any[];
  tool_choice?: any;
  response_format?: any;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  logprobs?: any | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: "assistant" | "tool";
    content?: string | null;
    tool_calls?: any[];
  };
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  logprobs?: any | null;
}

export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}
