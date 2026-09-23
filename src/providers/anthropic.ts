import type { Provider } from "../provider.js";
import { encodeRequest } from "./anthropic/request.js";
import type { AnthropicRequestOptions } from "./anthropic/request.js";
import { decodeResponse } from "./anthropic/response.js";

export interface AnthropicOptions extends AnthropicRequestOptions {
	apiKey: string;
	fetch?: typeof globalThis.fetch;
}

export class AnthropicHttpError extends Error {
	readonly status: number;
	readonly requestId: string | null;
	readonly body: string;
	// Retryable is simply information for the caller
	// we won't retry automatically, but we flag as retryable on rate-limits
	// and server errors
	readonly retryable: boolean;

	constructor(
		status: number,
		requestId: string | null,
		body: string,
	) {
		super(`Anthropic request failed with HTTP ${status}.`);

		this.name = "AnthropicHttpError";
		this.status = status
		this.requestId = requestId;
		this.body = body;
		this.retryable = status === 429 || status >= 500;
	}
}

export function anthropic(opts: AnthropicOptions): Provider {
	const { apiKey, model, maxTokens } = opts;
	if (apiKey.trim().length === 0) {
		throw new Error("An Anthropic API key is required.");
	}

	const send = opts.fetch ?? globalThis.fetch.bind(globalThis);

	return {
		async complete(request, { signal }) {
			signal.throwIfAborted();

			const body = encodeRequest(request, {
				model,
				maxTokens,
			});

			// TODO(@hadydotai): I should make the base url configurable
			// so we can override it for providers that support anthropic style
			// APIs
			const response = await send(
				"https://api.anthropic.com/v1/messages",
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"anthropic-version": "2023-06-01",
						"x-api-key": apiKey,
					},
					body: JSON.stringify(body),
					signal,
				},
			);

			const text = await response.text();
			signal.throwIfAborted();

			if (!response.ok) {
				throw new AnthropicHttpError(
					response.status,
					response.headers.get("request-id"),
					text,
				);
			}

			return decodeResponse(text, model);
		},
	};
}
