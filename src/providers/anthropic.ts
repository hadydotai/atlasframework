import type { ModelRequest, Provider } from "../provider.js";
import { encodeRequest } from "./anthropic/request.js";
import { decodeResponse } from "./anthropic/response.js";
import { decodeStream } from "./anthropic/stream.js";

export interface AnthropicOptions {
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
	const { apiKey } = opts;
	if (apiKey.trim().length === 0) {
		throw new Error("An Anthropic API Key is required.");
	}

	const send = opts.fetch ?? globalThis.fetch.bind(globalThis);

	async function post(
		request: ModelRequest,
		signal: AbortSignal,
		stream: boolean,
	): Promise<Response> {
		const body = {
			...encodeRequest(request),
			stream,
		};

		// TODO(@hadydotai): Make the base URL configurable.
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

		if (!response.ok) {
			const text = await response.text();
			signal.throwIfAborted();
			throw new AnthropicHttpError(
				response.status,
				response.headers.get("request-id"),
				text,
			);
		}

		return response;
	}

	return {
		async complete(request, { signal }) {
			const response = await post(request, signal, false);
			const text = await response.text();
			signal.throwIfAborted();
			return decodeResponse(text, request.model);
		},
		async *stream(request, { signal }) {
			const response = await post(request, signal, true);
			try {
				signal.throwIfAborted();

				const contentType = response.headers
					.get("content-type")
					?.split(";")[0]
					?.trim()
					.toLowerCase();

				if (contentType !== "text/event-stream") {
					throw new Error(`Expected Anthropic SSE response, received: ${contentType ?? "no content-type"}`);
				}

				if (response.body === null) {
					throw new Error("Anthropic streaming response has no body.");
				}

				yield* decodeStream(response.body, request.model, signal);
			} finally {
				try {
					await response.body?.cancel();
				} catch {
					// NOTE(@hadydotai): Cleanup must not replace the original error.
				}
			}
		},
	};
}
