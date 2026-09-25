import type { ModelResponse } from "../../provider.js";
import type {
	JsonValue,
	ModelOutput,
	ReplayData,
	StopReason,
} from "../../protocol.js";

export function readObject(
	value: JsonValue | undefined,
	label: string,
): { [key: string]: JsonValue } {
	if (
		value === undefined ||
		value === null ||
		typeof value !== "object" ||
		Array.isArray(value)
	) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return value
}

function readTokenCount(value: JsonValue | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 0
	) {
		throw new Error("A reported token count must be a nonnegative integer.")
	}
	return value;
}

function decodeStopReason(reason: string): StopReason {
	switch (reason) {
		case "end_turn":
		case "stop_sequence":
			return "end-turn";

		case "tool_use": return "tool-use";
		case "pause_turn": return "pause-turn";
		case "max_tokens": return "max-tokens";
		case "refusal": return "refusal";
		
		default:
			return "other";
	}
}

export function decodeResponse(json: string, model: string): ModelResponse {
	const raw: JsonValue = JSON.parse(json);
	const body = readObject(raw, "Anthropic response");

	if (
		body.type !== "message" ||
		body.role !== "assistant" ||
		!Array.isArray(body.content) ||
		typeof body.stop_reason !== "string"
	) {
		throw new Error("Invalid Anthropic message response.");
	}

	const items = body.content.map((value): ModelOutput => {
		const block = readObject(value, "Content block");

		if (typeof block.type !== "string") {
			throw new Error("A content block needs a string type.");
		}

		const replay: ReplayData = {
			integration: "anthropic",
			model,
			payload: structuredClone(block),
		};

		switch (block.type) {
			case "text":
				if (typeof block.text !== "string") {
					throw new Error("A text block needs a string text.");
				}
				return {
					type: "message",
					role: "assistant",
					content: block.text,
					replay,
				};
			case "tool_use":
				if (
					typeof block.id !== "string" ||
					block.id.length === 0 ||
					typeof block.name !== "string" ||
					block.name.length === 0
				) {
					throw new Error("A tool-use block needs an ID and a name.");
				}
				const input = readObject(block.input, "Tool input");
				return {
					type: "tool-call",
					id: block.id,
					name: block.name,
					input: structuredClone(input),
					replay,
				};

			default:
				return {
					type: "provider",
					replay,
				};
		}
	});

	const response: ModelResponse = {
		items,
		stopReason: decodeStopReason(body.stop_reason),
		raw,
	};

	if (body.usage !== undefined) {
		const usage = readObject(body.usage, "Usage");

		response.usage = {
			inputTokens: readTokenCount(usage.input_tokens),
			outputTokens: readTokenCount(usage.output_tokens),
			cachedInputTokens: readTokenCount(usage.cache_read_input_tokens),
			cacheWriteTokens: readTokenCount(usage.cache_creation_input_tokens),
		};
	}

	return response;
}
