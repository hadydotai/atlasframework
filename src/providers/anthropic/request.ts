import type { ModelRequest } from "../../provider.js";

interface TextBlock {
	type: "text";
	text: string;
}

interface WireMessage {
	role: "user" | "assistant";
	content: TextBlock[];
}

export interface AnthropicRequestOptions {
	model: string;
	maxTokens: number;
}

export interface AnthropicRequestBody {
	model: string;
	max_tokens: number;
	system?: TextBlock[];
	messages: WireMessage[];
}

export function encodeRequest(req: ModelRequest, opts: AnthropicRequestOptions): AnthropicRequestBody {
	if (opts.model.trim().length === 0) {
		throw new Error("An anthropic model ID is required.");
	}
	if (
		!Number.isSafeInteger(opts.maxTokens) ||
		opts.maxTokens < 0
	) {
		throw new Error("maxTokens must be a nonnegative integer.");
	}

	const system: TextBlock[] = [];
	const messages: WireMessage[] = [];

	for (const item of req.items) {
		if (item.type !== "message") {
			throw new Error(`Anthropic encoding for ${item.type} is not implemented yet.`);
		}
		
		if (item.replay !== undefined) {
			throw new Error("Anthropic replay encoding is not implemented yet.");
		}

		const block: TextBlock = {
			type: "text",
			text: item.content,
		};

		if (item.role === "system") {
			system.push(block);
			continue;
		}

		const previous = messages.at(-1);
		if (previous?.role === item.role) {
			previous!.content.push(block);
		} else {
			messages.push({
				role: item.role,
				content: [block],
			});
		}
	}

	if (messages.length === 0) {
		throw new Error("An Anthropic request needs a conversation message.");
	}

	const body: AnthropicRequestBody = {
		model: opts.model,
		max_tokens: opts.maxTokens,
		messages,
	};

	if (system.length > 0) {
		body.system = system;
	}

	return body;
}
