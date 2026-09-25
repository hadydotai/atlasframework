import type { Child } from "./element.js";
import type {
	ModelEvent,
	ModelResponse,
	Provider,
} from "./provider.js";
import { renderTurn } from "./renderer.js";
import type { TurnPlan } from "./renderer.js";

export interface RunOptions {
	signal?: AbortSignal;
}

export interface Execution {
	inspect(): Promise<TurnPlan>;
	stream(): AsyncGenerator<ModelEvent>;
	run(): Promise<ModelResponse>;
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
			turn: TurnPlan;
			provider: Provider;
		}> | undefined;
		let started = false;

		function prepare() {
			if (preparation === undefined) {
				preparation = Promise.resolve().then(() => {
					signal.throwIfAborted();
					const turn = renderTurn(tree);
					signal.throwIfAborted();

					const provider = resolveProvider(turn.provider);
					return { turn, provider };
				});
			}

			return preparation;
		}

		async function inspect(): Promise<TurnPlan> {
			const prepared = await prepare();
			return prepared.turn;
		}

		async function* stream(): AsyncGenerator<ModelEvent> {
			if (started) {
				throw new Error("This execution has already started. Create a new execution to run again.");
			}
			started = true;

			const { turn, provider } = await prepare();
			signal.throwIfAborted();

			const context = { signal };
			let response: ModelResponse | undefined;

			if (provider.stream) {
				for await (const event of provider.stream(turn.request, context)) {
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
				response = await provider.complete(turn.request, context);
			}

			signal.throwIfAborted();
			if (response === undefined) {
				throw new Error("Provider stream ended without a `done` event.");
			}

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

		return { inspect, stream, run };
	}

	function stream(tree: Child, opts: RunOptions = {}): AsyncGenerator<ModelEvent> {
		return createExecution(tree, opts).stream();
	}

	function run(tree: Child, opts: RunOptions = {}): Promise<ModelResponse> {
		return createExecution(tree, opts).run();
	}

	return { createExecution, stream, run };
}
