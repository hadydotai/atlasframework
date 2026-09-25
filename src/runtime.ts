import type { Child } from "./element.js";
import type { ModelEvent, ModelResponse, Provider } from "./provider.js";
import { renderMessages } from "./renderer.js";

export interface RunOptions {
	signal?: AbortSignal;
}

export function createRuntime(provider: Provider) {
		async function* stream(tree: Child, opts: RunOptions = {}): AsyncGenerator<ModelEvent> {
			const signal = opts.signal ?? new AbortController().signal;
			signal.throwIfAborted();

			const messages = renderMessages(tree);
			signal.throwIfAborted();

			const request = { items: messages };
			const context =  { signal };

			let response: ModelResponse | undefined;
			if (provider.stream) {
				for await (const event of provider.stream(request, context)) {
					signal.throwIfAborted();
					if (response !== undefined) {
						throw new Error("Provider emitted an event after its done event.");
					}

					if (event.type === "done") {
						response = event.response;
					} else {
						yield event;
						signal.throwIfAborted();
					}
				}
			} else {
				response = await provider.complete(request, context);
			}
			signal.throwIfAborted();
			if (response === undefined) {
				throw new Error("Provider stream ended without a done event.");
			}
			yield {
				type: "done",
				response,
			};
		}

		async function run(tree: Child, opts: RunOptions = {}): Promise<ModelResponse> {
			let response: ModelResponse | undefined;
			for await (const event of stream(tree, opts)) {
				if (event.type === "done") {
					response = event.response;
				}
			}
			if (response === undefined) {
				throw new Error("Run ended without a response.");
			}
			return response;
		}

	return { run, stream };
}
