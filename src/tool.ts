import type { JsonValue } from "./protocol.js";

export interface ToolSpec {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		type: "object",
		[key: string]: JsonValue,
	};
}

export interface ToolContext {
	readonly callId: string;
	readonly signal: AbortSignal;
}

export interface Tool {
	readonly spec: ToolSpec;
	call(input: JsonValue, context: ToolContext): string | Promise<string>;
}
