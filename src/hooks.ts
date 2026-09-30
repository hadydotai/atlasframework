import type { Conversation } from "./conversation.js";
import type { ToolResult } from "./protocol.js";
import type { ModelResponse } from "./provider.js";
import type { TurnPlan } from "./renderer.js";

export interface CompletedTurn {
	readonly index: number;
	readonly plan: TurnPlan;
	readonly response: ModelResponse;
	readonly toolResults: readonly ToolResult[];
}

export interface TurnContext {
	readonly index: number;
	readonly signal: AbortSignal;
	readonly previous?: CompletedTurn;
}

export interface HookContext {
	readonly turn: TurnContext;
	readonly conversation: Conversation;
}

let activeContext: HookContext | undefined;

function readContext(hook: string): HookContext {
	if (activeContext === undefined) {
		throw new Error(`${hook}() can only be called while Atlas is evaluating a component.`);
	}
	return activeContext;
}

export function useTurn(): TurnContext {
	return readContext("useTurn").turn;
}

export function useConversation(): Conversation {
	return readContext("useConversation").conversation;
}

export function withHookContext<T>(context: HookContext, evaluate: () => T): T {
	const previousContext = activeContext;
	activeContext = context;

	try {
		return evaluate();
	} finally {
		activeContext = previousContext;
	}
}
