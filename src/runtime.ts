import type { Child } from "./element.js";
import type { ModelResponse, Provider } from "./provider.js";
import { renderMessages } from "./renderer.js";

export function createRuntime(provider: Provider) {
	return {
		async run(tree: Child): Promise<ModelResponse> {
			const messages = renderMessages(tree);
			return provider.complete({ messages });
		},
	};
}
