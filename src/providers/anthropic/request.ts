import type { ModelRequest } from "../../provider.js";
import type { ConversationItem, JsonValue } from "../../protocol.js";

interface TextBlock {
	type: "text";
	text: string;
}

interface ContentBlock {
	type: string;
	[field: string]: JsonValue;
}

interface WireMessage {
	role: "user" | "assistant";
	content: ContentBlock[];
}

export interface AnthropicRequestBody {
	model: string;
	max_tokens: number;
	system?: TextBlock[];
	messages: WireMessage[];
}

function encodeBlock(item: ConversationItem, model: string): ContentBlock {
	const replay = "replay" in item ? item.replay : undefined;
	if (replay !== undefined) {
		if (item.type === "message" && item.role !== "assistant") {
			throw new Error("Native response replay belongs to assistant messages.");
		}
		if (
			replay.integration !== "anthropic" ||
			replay.model !== model ||
			replay.upstream !== undefined
		) {
			throw new Error("Replay data does not match this direct Anthropic model.");
		}

		const payload = replay.payload;
		if (
			payload == null ||
			typeof payload !== "object" ||
			Array.isArray(payload) ||
			typeof payload.type !== "string"
		) {
			throw new Error("Anthropic replay must contain one native content block.");
		}
		return {
			...payload,
			type: payload.type,
		};
	}

	switch (item.type) {
		case "message":
			return {
				type: "text",
				text: item.content,
			};
		case "tool-call":
			if (
				item.input === null ||
				typeof item.input !== "object" ||
				Array.isArray(item.input)
			) {
				throw new Error("Anthropic tool input must be a JSON object.");
			}

			return {
				type: "tool_use",
				id: item.id,
				name: item.name,
				input: item.input,
			};
		case "tool-result":
			return {
				type: "tool_result",
				tool_use_id: item.callId,
				content: item.content,
			};
		case "provider":
			throw new Error("A provider item requires replay data.");
	}
}

export function encodeRequest(req: ModelRequest): AnthropicRequestBody {
	if (req.model.trim().length === 0) {
		throw new Error("An anthropic model ID is required.");
	}
	if (
		!Number.isSafeInteger(req.maxTokens) ||
		req.maxTokens < 0
	) {
		throw new Error("maxTokens must be a nonnegative integer.");
	}

	const system: TextBlock[] = [];
	const messages: WireMessage[] = [];

	for (const item of req.items) {
		if (item.type === "message" && item.role === "system") {
			if (item.replay !== undefined) {
				throw new Error("System instructions cannot carry response replay data.");
			}
			system.push({
				type: "text",
				text: item.content,
			});
			continue;
		}

		let role: WireMessage["role"] = "assistant";
		if (
			item.type === "tool-result" ||
			(item.type === "message" && item.role === "user")
		) {
			role = "user";
		}
		const block = encodeBlock(item, req.model);
		const previous = messages.at(-1);
		if (previous && previous.role === role) {
			if (
				block.type === "tool_result" &&
				previous.content.some(
					(existing) => existing.type !== "tool_result",
				)
			) {
				throw new Error("Tool results must precede other user content.");
			}
			previous.content.push(block);
		} else {
			messages.push({
				role,
				content: [block],
			});
		}
	}

	if (messages.length === 0) {
		throw new Error("An Anthropic request needs a conversation message.");
	}

	const body: AnthropicRequestBody = {
		model: req.model,
		max_tokens: req.maxTokens,
		messages,
	};

	if (system.length > 0) {
		body.system = system;
	}

	return body;
}
