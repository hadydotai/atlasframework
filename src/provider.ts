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

export type ModelEvent =
	| {
			type: "text-delta";
			text: string;
		}
	| {
			type: "reasoning-delta";
			text: string;
		}
	| {
			type: "done";
			response: ModelResponse;
		};

export interface CallContext {
	signal: AbortSignal;
}

export interface Provider {
	complete(
		request: ModelRequest,
		context: CallContext,
	): Promise<ModelResponse>;

	stream?(
		request: ModelRequest,
		context: CallContext,
	): AsyncIterable<ModelEvent>;
}

