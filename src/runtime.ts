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
	stream(): AsyncGenerator<ExecutionEvent>;
	run(): Promise<ModelResponse>;
}

export function createRuntime(
	providers: Readonly<Record<string, Provider>>,
) {
	const registry = Object.freeze({ ...providers });

	function resolveProvider(name: string): Provider {
		if (!Object.hasOwn(registry, name) || registry[name] === undefined) {
			throw new Error(`Unknown provider: ${name}`);
		}
		return registry[name];
	}

	function createExecution(tree: Child, opts: RunOptions = {}): Execution {
		const signal = opts.signal ?? new AbortController().signal;

		if (
			opts.maxTurns !== undefined &&
			(!Number.isSafeInteger(opts.maxTurns) || opts.maxTurns <= 0)
		) {
				throw new Error("maxTurns must either be unset or set to a positive integer above zero.");
			}

		let started = false;
		let context: HookContext = Object.freeze({
			turn: Object.freeze({ index: 0, signal }),
			conversation: Object.freeze([]),
		});

		let preparation: Promise<{
			rendered: RenderedTurn;
			provider: Provider;
		}> | undefined;

		function prepare() {
			if (preparation === undefined) {
				const currentContext = context;
				preparation = Promise.resolve().then(async () => {
					signal.throwIfAborted();
					const renderedTurn = await renderTurn(tree, currentContext);
					signal.throwIfAborted();
					return { 
						rendered: renderedTurn,
						provider: resolveProvider(renderedTurn.plan.provider),
					};
				});
			}
			return preparation;
		}

		async function inspect(): Promise<TurnPlan> {
			return (await prepare()).rendered.plan;
		}

		function bindToolCalls(
			response: ModelResponse,
			rendered: RenderedTurn,
		) {
			const ids = new Set<string>();
			const bindings = response.items
				.filter((item): item is ToolCall => item.type === "tool-call")
				.map((call) => {
					const id = readNonEmptyString(call.id, "Tool call ID");
					const name = readNonEmptyString(call.name, "Tool call name");
					if (ids.has(id)) {
						throw new Error(`Duplicate tool call ID: ${id}`);
					}
					ids.add(id);

					const tool = rendered.tools.get(name);
					if (tool === undefined) {
						throw new Error(`Tool was not declared for this turn: ${name}`);
					}
					return { call, tool };
				});

			if (bindings.length === 0) {
				throw new Error("Provider stopped for tool use without any tool calls.");
			}
			return bindings;
		}

		async function* stream(): AsyncGenerator<ExecutionEvent> {
			if (started) {
				throw new Error("This execution has already started. Create a new execution to run again.");
			}
			started = true;

			while (true) {
				const { rendered, provider } = await prepare();
				const index = context.turn.index;
				signal.throwIfAborted();

				yield Object.freeze({
					type: "turn-start",
					index,
					plan: rendered.plan,
				});
				signal.throwIfAborted();
				let response: ModelResponse | undefined;
				const callContext = Object.freeze({ signal });


				if (provider.stream) {
					for await (
						const event of provider.stream(
							rendered.plan.request,
							callContext,
						)
					) {
							signal.throwIfAborted();
							if (response !== undefined) {
								throw new Error("Provider emitted an event after its `done` event.");
							}

							if (event.type === "done") {
								response = snapshot(event.response);
							} else {
								yield Object.freeze({
									...event,
									index,
								});
								signal.throwIfAborted();
							}
						}
				} else {
					response = snapshot(
						await provider.complete(rendered.plan.request, callContext),
					);
				}
				signal.throwIfAborted();
				if (response === undefined) {
					throw new Error("Provider stream ended without a `done` event.");
				}
				yield Object.freeze({
					type: "model-response",
					index,
					response,
				});
				signal.throwIfAborted();

				const results: ToolResult[] = [];
				const continuing = response.stopReason === "tool-use";
				if (continuing) {
					const bindings = bindToolCalls(response, rendered);

					if (opts.maxTurns) {
						if (index + 1 >= opts.maxTurns) {
							throw new Error(`Execution reached maxTurns = ${opts.maxTurns}. Pending tools were not executed.`);
						}
					}

					for (const { call, tool } of bindings) {
						signal.throwIfAborted();
						yield Object.freeze({
							type: "tool-start",
							index,
							call,
						});
						signal.throwIfAborted();

						const output = await tool.call(
							structuredClone(call.input),
							{
								callId: call.id,
								signal,
							},
						);
						signal.throwIfAborted();

						const result: ToolResult = Object.freeze({
							type: "tool-result",
							callId: call.id,
							content: readString(output, "Tool result"),
						});

						results.push(result);

						yield Object.freeze({
							type: "tool-end",
							index,
							result,
						});
						signal.throwIfAborted();
					}
				}

				const completed: CompletedTurn = Object.freeze({
					index,
					plan: rendered.plan,
					response,
					toolResults: Object.freeze(results),
				});

				yield Object.freeze({
					type: "turn-end",
					turn: completed,
				});
				signal.throwIfAborted();

				if (!continuing) {
					yield Object.freeze({ type: "done", response });
					return;
				}

				const exchange = createConversationExchange(
					globalThis.crypto.randomUUID(),
					response.items,
					completed.toolResults,
				);
				const conversation: Conversation = Object.freeze([
					...rendered.conversation,
					exchange,
				]);
				context = Object.freeze({
					turn: Object.freeze({
						index: index + 1,
						signal,
						previous: completed,
					}),
					conversation,
				});
				preparation = undefined;
			}
		}

		async function run(): Promise<ModelResponse> {
			for await (const event of stream()) {
				if (event.type === "done") {
					return event.response;
				}
			}

			throw new Error("Execution ended without a response.");
		}


		return { inspect, stream, run };
	}

	function stream(tree: Child, opts: RunOptions = {}): AsyncGenerator<ExecutionEvent> {
		return createExecution(tree, opts).stream();
	}

	function run(tree: Child, opts: RunOptions = {}): Promise<ModelResponse> {
		return createExecution(tree, opts).run();
	}

	return { createExecution, stream, run };
}
