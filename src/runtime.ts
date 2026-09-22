import type { Child } from "./element.js";
import type { ModelResponse, Provider } from "./provider.js";
import { renderMessages } from "./renderer.js";

export interface RunOptions {
	signal?: AbortSignal;
}

export function createRuntime(provider: Provider) {
	return {
		async run(tree: Child, options: RunOptions = {}): Promise<ModelResponse> {
			const signal = options.signal ?? new AbortController().signal;
			signal.throwIfAborted();

			const messages = renderMessages(tree);
			signal.throwIfAborted();

			const response = await provider.complete(
				{ items: messages },
				{ signal },
			);
			signal.throwIfAborted();

			return response;
		},
	};
}
