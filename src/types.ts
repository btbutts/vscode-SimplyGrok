import * as vscode from "vscode";

export type MessageType = "workspace" | "tab" | "function" | "selection";
export type GrokChoice = { message: { content: string } };
export type GrokChoices = GrokChoice[];
export type StatefulGrokOutput = { content: Array<{ text: string }> };  // Matches /v1/responses output[].content[] (multi-block safe)
export type StatefulGrokOutputs = StatefulGrokOutput[];
export type StatefulGrokContentBlock = {
  text: string;
  type?: string;
  logprobs?: any[];
  annotations?: any[];
};  // Matches /v1/responses output[].content[] blocks (multi-block safe; e.g., output_text)
export type StatefulGrokOutputItem = {
  content?: StatefulGrokContentBlock[];  // Optional: absent in reasoning blocks
  summary?: Array<{ text: string; type: string }>;  // e.g., reasoning.summary[]
  type?: string;  // e.g., "reasoning", "message"
  role?: string;  // e.g., "assistant"
  id: string;
  status?: string;
};  // Matches /v1/responses output[] items (heterogeneous: reasoning vs message)
export type Context = {
  workspaceFolder?: vscode.WorkspaceFolder;
  apiKey: string;
  model: string;
  question: string;
  stateful: boolean;
};

/**
 * Interface for non-stateful /v1/chat/completions response (minimal: only fields used).
 */
export interface ChatCompletionResponse {
  choices: GrokChoices;
}

/**
 * Interface for stateful /v1/responses response (minimal: only fields used).
 */
export interface StatefulAPIResponse {
  output: StatefulGrokOutputs;
}

/**
 * Discriminated union for both API endpoints.
 * Narrow with isChatCompletionResponse / isStatefulAPIResponse guards.
 */
export type GrokAPIResponse = ChatCompletionResponse | StatefulAPIResponse;

/**
 * Type guard: Narrows GrokAPIResponse to ChatCompletionResponse if 'choices' present + non-empty.
 * Used in handleSendToGrok for type-safe displayResponse(response.choices).
 */
export function isChatCompletionResponse(response: GrokAPIResponse): response is ChatCompletionResponse {
  return 'choices' in response && Array.isArray(response.choices) && response.choices.length > 0;
}

/**
 * Type guard: Narrows GrokAPIResponse to StatefulAPIResponse if 'output' present + non-empty.
 * Used in handleSendToGrok for type-safe displayStatefulResponse(response.output).
 */
export function isStatefulAPIResponse(response: GrokAPIResponse): response is StatefulAPIResponse {
  return 'output' in response && Array.isArray(response.output) && response.output.length > 0;
}

/**
 * Custom error for failures loading question editor HTML from resources/media/questionEditor.html.
 * Extends Error for runtime checks (instanceof); includes cause for error chaining.
 */
export class QuestionEditorLoadError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'QuestionEditorLoadError';
  }
}
