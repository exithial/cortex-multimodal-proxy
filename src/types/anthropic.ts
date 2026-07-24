export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface AnthropicContentBlock {
  type:
    | "text"
    | "image"
    | "audio_url"
    | "video_url"
    | "document_url"
    | "tool_use"
    | "tool_result"
    | "thinking"
    | "input_audio"
    | "clipboard"
    | "file";
  text?: string;
  source?: {
    type: "base64" | "url";
    media_type: string;
    data: string;
  };
  url?: string;
  format?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;
  thinking?: string;
  data?: string;
  file?: {
    data: string;
    mediaType?: string;
  };
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicInputMessage[];
  max_tokens: number;
  metadata?: {
    user_id?: string;
  };
  stop_sequences?: string[];
  stream?: boolean;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: AnthropicTool[];
}

export interface AnthropicInputMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface AnthropicStreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "ping"
    | "error";
  message?: Partial<AnthropicMessage>;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: "text_delta" | "input_json_delta";
    text?: string;
    partial_json?: string;
  };
  index?: number;
  usage?: {
    output_tokens: number;
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface AnthropicError {
  type: "error";
  error: {
    type:
      | "invalid_request_error"
      | "authentication_error"
      | "permission_error"
      | "not_found_error"
      | "rate_limit_error"
      | "api_error"
      | "overloaded_error";
    message: string;
  };
}
