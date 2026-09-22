import type { Message } from "./renderer.js";

export interface ModelRequest {
	messages: readonly Message[];
}

export interface ModelResponse {
	role: "assistant";
	content: string;
}

export interface Provider {
	complete(request: ModelRequest): Promise<ModelResponse>;
}

