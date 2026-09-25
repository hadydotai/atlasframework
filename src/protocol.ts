// NOTE(@hadydotai): Everytime I work in TypeScript I'm reminded of why I
// generally don't. I still can't believe THIS type, is still not baked in
// it. "Oh but Hady, there's a package for that!", I got a package for you,
// `pnpm add have-some-self-respect`.
export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface ReplayData {
	integration: string;
	model: string;
	upstream?: string;
	payload: JsonValue;
}

export interface Message {
	type: "message";
	role: "system" | "user" | "assistant";
	content: string;
	// NOTE(@hadydotai): Now I have some logic here, replay is optional because
	// I'm finding this to be the simplest way to determine a message produced out
	// of JSX vs one returned to us by a provider adapter. Provider adapter will
	// almost always contain a replay in the `Message`
	replay?: ReplayData;
}

export interface ToolCall {
	type: "tool-call",
	id: string;
	name: string;
	input: JsonValue;
	replay?: ReplayData;
}

export interface ToolResult {
	type: "tool-result";
	callId: string;
	content: string;
}

export interface ProviderItem {
	type: "provider";
	replay: ReplayData;
}

export type ConversationItem =
	| Message
	| ToolCall
	| ToolResult
	| ProviderItem;

export type AssistantMessage = Message & {
	role: "assistant";
};

export type ModelOutput =
	| AssistantMessage
	| ToolCall
	| ProviderItem;

export type StopReason =
	| "end-turn"
	| "tool-use"
	| "pause-turn"
	| "max-tokens"
	| "refusal"
	| "other";

export interface Usage {
	inputTokens?: number;
	outputTokens?: number;
	cachedInputTokens?: number;
	cacheWriteTokens?: number;
	reasoningTokens?: number;
}

export function readString(value: unknown, label: string): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string.`);
	}

	return value;
}

export function readNonEmptyString(value: unknown, label: string): string {
	const str = readString(value, label)
	if (str.trim() === "") {
		throw new Error(`${label} must be a non-empty string.`);
	}

	return str;
}
