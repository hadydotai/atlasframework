import type { Child } from "./element.js";
import type { Conversation } from "./conversation.js";
import { createConversationExchange } from "./conversation.js";
import type { CompletedTurn, HookContext } from "./hooks.js";
import type {
	ModelEvent,
	ModelResponse,
	Provider,
} from "./provider.js";
import type { ToolCall, ToolResult } from "./protocol.js";
import { readNonEmptyString, readString } from "./protocol.js";
import { renderTurn } from "./renderer.js";
import type { RenderedTurn, TurnPlan } from "./renderer.js";
import { snapshot } from "./snapshot.js";

export interface RunOptions {
	signal?: AbortSignal;
	maxTurns?: number;
}

export type ExecutionEvent =
	| (Exclude<ModelEvent, { type: "done" }> & {
			readonly index: number;
		})
	| {
			readonly type: "turn-start";
			readonly index: number;
			readonly plan: TurnPlan;
		}
	| {
			readonly type: "turn-end";
			readonly turn: CompletedTurn;
		}
	| {
			// NOTE(@hadydotai): Model completion which normally would be
			// a "done" `ModelEvent` would become `model-response` here.
			readonly type: "model-response";
			readonly index: number;
			readonly response: ModelResponse
		}
	| {
			readonly type: "tool-start";
			readonly index: number;
			readonly call: ToolCall;
		}
	|
		{
			readonly type: "tool-end";
			readonly index: number;
			readonly result: ToolResult;
		}
	| {
			// TODO(@hadydotai): I'm not entirely sure I like this
			// but we need an execution "end" event which is different
			// from "turn-end"
			readonly type: "done";
			readonly response: ModelResponse;
		}

export interface Execution {
	inspect(): Promise<TurnPlan>;
	stream(): AsyncGenerator<ModelEvent>;
	run(): Promise<ModelResponse>;
	callTool(callId: string): Promise<ToolResult>;
}

export function createRuntime(
	providers: Readonly<Record<string, Provider>>,
) {
	const registry = Object.freeze({ ...providers });

	function resolveProvider(name: string): Provider {
		if (!Object.hasOwn(registry, name)) {
			throw new Error(`Unknown provider: ${name}`);
		}

		const provider = registry[name];
		if (provider === undefined) {
			throw new Error(`Provider is not configured: ${name}`);
		}

		return provider;
	}

	function createExecution(tree: Child, opts: RunOptions = {}): Execution {
		const signal = opts.signal ?? new AbortController().signal;

		let preparation: Promise<{
			rendered: RenderedTurn;
			provider: Provider;
		}> | undefined;
		let started = false;
		let toolCalls: Map<string, ToolCall> | undefined;
		const invocations = new Map<string, Promise<ToolResult>>();

		function prepare() {
			if (preparation === undefined) {
				preparation = Promise.resolve().then(async () => {
					signal.throwIfAborted();
					const context: HookContext = Object.freeze({
						turn: Object.freeze({ index: 0, signal }),
						conversation: Object.freeze([]),
					});

					const renderedTurn = await renderTurn(tree, context);
					signal.throwIfAborted();

					const provider = resolveProvider(renderedTurn.plan.provider);
					return { rendered: renderedTurn, provider };
				});
			}

			return preparation;
		}

		async function inspect(): Promise<TurnPlan> {
			const prepared = await prepare();
			return prepared.rendered.plan;
		}

		function captureToolCalls(response: ModelResponse): void {
			if (response.stopReason !== "tool-use") { return; }
			const calls = new Map<string, ToolCall>();
			for (const item of response.items) {
				if (item.type !== "tool-call") { continue; }

				const id = readNonEmptyString(item.id, "Tool call ID");
				const name = readNonEmptyString(item.name, "Tool call name");
				if (calls.has(id)) {
					throw new Error(`Duplicate tool call ID: ${id}`);
				}
				calls.set(id, {
					type: "tool-call",
					id,
					name,
					input: structuredClone(item.input),
				});
			}

			if (calls.size === 0) {
				throw new Error("Provider stopped for tool use without returning any tool calls.");
			}
			toolCalls = calls;
		}

		async function* stream(): AsyncGenerator<ModelEvent> {
			if (started) {
				throw new Error("This execution has already started. Create a new execution to run again.");
			}
			started = true;

			const { rendered: renderedTurn, provider } = await prepare();
			signal.throwIfAborted();

			const context = { signal };
			let response: ModelResponse | undefined;

			if (provider.stream) {
				for await (const event of provider.stream(renderedTurn.plan.request, context)) {
					signal.throwIfAborted();
					if (response !== undefined) {
						throw new Error("Provider emitted an event after its `done` event.");
					}

					if (event.type === "done") {
						response = event.response;
					} else {
						yield event;
						signal.throwIfAborted();
					}
				}
			} else {
				response = await provider.complete(renderedTurn.plan.request, context);
			}

			signal.throwIfAborted();
			if (response === undefined) {
				throw new Error("Provider stream ended without a `done` event.");
			}

			captureToolCalls(response);

			yield { type: "done", response };
		}

		async function run(): Promise<ModelResponse> {
			for await (const event of stream()) {
				if (event.type === "done") {
					return event.response;
				}
			}

			throw new Error("Execution ended without a response.");
		}

		async function callTool(callId: string): Promise<ToolResult> {
			if (toolCalls === undefined) {
				throw new Error("Tools can be invoked only after a completed tool-use response.");
			}

			const call = toolCalls.get(callId);
			if (call === undefined) {
				throw new Error(`Unknown tool call ID: ${callId}`);
			}

			const { rendered: renderedTurn } = await prepare();
			let invocation = invocations.get(callId);

			if (invocation === undefined) {
				const tool = renderedTurn.tools.get(call.name);
				if (tool === undefined) {
					throw new Error(`Tool was not declared for this turn: ${call.name}`);
				}
				invocation = Promise.resolve().then(async () => {
					signal.throwIfAborted();
					const output = await tool.call(call.input, {
						callId,
						signal
					});
					signal.throwIfAborted();
					const content = readString(output, "Tool result");

					return Object.freeze({
						type: "tool-result",
						callId,
						content,
					});
				});
				invocations.set(callId, invocation);
			}
			return invocation;
		}

		return { inspect, stream, run, callTool };
	}

	function stream(tree: Child, opts: RunOptions = {}): AsyncGenerator<ModelEvent> {
		return createExecution(tree, opts).stream();
	}

	function run(tree: Child, opts: RunOptions = {}): Promise<ModelResponse> {
		return createExecution(tree, opts).run();
	}

	return { createExecution, stream, run };
}
