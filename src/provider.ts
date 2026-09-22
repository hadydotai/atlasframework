import type { 
	ConversationItem,
	JsonValue,
	ModelOutput,
	StopReason,
	Usage,
} from "./protocol.js";

export interface ModelRequest {
	items: readonly ConversationItem[];
}

export interface ModelResponse {
	items: readonly ModelOutput[];
	stopReason: StopReason;
	usage?: Usage;
	raw?: JsonValue;
}

export interface CallContext {
	signal: AbortSignal;
}

export interface Provider {
	complete(request: ModelRequest, context: CallContext): Promise<ModelResponse>;
}

