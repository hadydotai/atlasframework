import type { JsonValue } from "../../protocol.js";
import type { ModelEvent } from "../../provider.js";
import { readSse } from "../internal/sse.js";
import { createBlockAccumulator } from "./blocks.js";
import { decodeResponse, readObject } from "./response.js";

type JsonObject = { [key: string]: JsonValue };
type BlockAccumulator = ReturnType<typeof createBlockAccumulator>;

function readIndex(value: JsonValue | undefined): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 0
	) {
		throw new Error("Content block index must be a nonnegative integer.");
	}
	return value;
}

export async function* decodeStream(
	body: ReadableStream<Uint8Array>,
	model: string,
	signal: AbortSignal,
): AsyncGenerator<ModelEvent> {
	let message: JsonObject | undefined;
	let messageDeltaSeen = false;

	const openBlocks = new Map<number, BlockAccumulator>();
	const completedBlocks = new Map<number, JsonObject>();

	function requireMessage(): JsonObject {
		if (message === undefined) {
			throw new Error("Anthropic event received before message_start.");
		}
		return message;
	}

	function requireBlockPhase() {
		requireMessage();
		if (messageDeltaSeen) {
			throw new Error("Content block event received after message_delta.");
		}
	}

	for await (const sse of readSse(body, signal)) {
		signal.throwIfAborted();

		const parsed: JsonValue = JSON.parse(sse.data);
		const event = readObject(parsed, "Anthropic stream event");

		if (
			typeof event.type !== "string" ||
			event.type !== sse.event
		) {
			throw new Error("Anthropic SSE name and payload type must match.");
		}

		switch (event.type) {
			case "ping": continue;
			case "error": {
				const error = readObject(event.error, "Anthropic stream error");
				throw new Error(
					`Anthropic stream error (${String(error.type)}): ${String(error.message)}`,
					{ cause: error },
				);
			}

			case "message_start": {
				if (message !== undefined) {
					throw new Error("Duplicate Anthropic message_start.");
				}
				const initial = readObject(event.message, "Initial message");

				if (
					initial.type !== "message" ||
					initial.role !== "assistant" ||
					!Array.isArray(initial.content) ||
					initial.content.length !== 0
				) {
					throw new Error("Invalid Anthropic message_start.");
				}

				message = initial;
				break;
			}

			case "content_block_start": {
				requireBlockPhase();
				const index = readIndex(event.index);
				if (openBlocks.has(index) || completedBlocks.has(index)) {
					throw new Error(`Duplicate content block index: ${index}`);
				}

				const block = readObject(event.content_block, "Content block");
				openBlocks.set(index, createBlockAccumulator(block));
				break;
			}

			case "content_block_delta":
			case "content_block_stop": {
				requireBlockPhase();

				const index = readIndex(event.index);
				const block = openBlocks.get(index);

				if (block === undefined) {
					throw new Error(`Content block ${index} is not open.`);
				}

				if (event.type === "content_block_delta") {
					const delta = readObject(event.delta, "Content block delta");
					const output = block.push(delta);

					if (output !== undefined) {
						yield output;
					}
				} else {
					completedBlocks.set(index, block.finish());
					openBlocks.delete(index);
				}
				break;
			}

			case "message_delta": {
				const current = requireMessage();

				if (openBlocks.size !== 0) {
					throw new Error("Message delta received with unfinished blocks.");
				}

				const delta = readObject(event.delta, "Message delta");

				message = {...current, ...delta};
				messageDeltaSeen = true;

				if (event.usage !== undefined) {
					message.usage = {
						...readObject(current.usage ?? {}, "Previous usage"),
						...readObject(event.usage, "Usage update"),
					};
				}

				break;
			}

			case "message_stop": {
				const current = requireMessage();

				if (!messageDeltaSeen || openBlocks.size !== 0) {
					throw new Error("Anthropic message stopped before completion.");
				}

				const content: JsonObject[] = [];
				for (let index = 0; index < completedBlocks.size; index++) {
					const block = completedBlocks.get(index);
					if (block === undefined) {
						throw new Error(`Missing content block index: ${index}`);
					}

					content.push(block);
				}

				const response = decodeResponse(
					JSON.stringify({...current, content}),
					model,
				);

				delete response.raw;
				signal.throwIfAborted();
				yield { type: "done", response };
				return;
			}

			default:
				// NOTE(@hadydotai): Allow new top-level event types we don't
				// currently handle or interpret.
				continue;
		}
	}

	signal.throwIfAborted();
	// NOTE(@hadydotai): Because of the sheer amount of slopware these labs
	// are shipping, I'm being extremely, fucking, defensive everywhere.
	// So while this here should never be reached. Who knows.
	throw new Error("Anthropic stream ended without message_stop.");
}
