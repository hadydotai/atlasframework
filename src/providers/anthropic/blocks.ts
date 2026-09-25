import type { JsonValue } from "../../protocol.js";
import type { ModelEvent } from "../../provider.js";

type JsonObject = { [key: string]: JsonValue };

function readString(
	value: JsonValue | undefined,
	label: string,
): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string.`);
	}
	return value;
}

export function createBlockAccumulator(initial: JsonObject) {
	const block = structuredClone(initial);

	readString(block.type, "Content block type");

	let inputJson: string | undefined;
	let closed = false;

	function assertOpen() {
		if (closed) {
			throw new Error("Content block is already closed.");
		}
	}

	function append(field: string, fragment: string) {
		block[field] = readString(block[field], `Content block ${field}`) + fragment;
	}

	function push(delta: JsonObject): ModelEvent | undefined {
		assertOpen();

		switch (delta.type) {
			case "text_delta": {
				const text = readString(delta.text, "Text delta");
				if (block.type === "thinking") {
					append("thinking", text);
					return { type: "reasoning-delta", text };
				}

				if (block.type !== "text") {
					throw new Error("Text delta received for an incompatiable block.");
				}

				append("text", text);
				return { type: "text-delta", text };
			}

			case "thinking_delta": {
				if (block.type !== "thinking") {
					throw new Error("Thinking delta received outside a thinking block.");
				}
				const text = readString(delta.thinking, "Thinking delta");
				append("thinking", text)
				return { type: "reasoning-delta", text };
			}

			case "signature_delta": {
				if (block.type !== "thinking") {
					throw new Error("Signature received outside a thinking block.");
				}

				const signature = readString(delta.signature, "Signature delta");

				append("signature", signature);
				return;
			}

			case "input_json_delta": {
				if (
					block.type !== "tool_use" &&
					block.type !== "server_tool_use"
				) {
					throw new Error("Tool input received outside a tool-use block.");
				}
				const fragment = readString(delta.partial_json, "Tool input delta");

				inputJson = (inputJson ?? "") + fragment;
				return;
			}

			default:
				throw new Error(`Unsupported Anthropic content delta: ${String(delta.type)}`);
		}
	}

	function finish(): JsonObject {
		assertOpen();

		if (inputJson !== undefined) {
			const input: JsonValue = JSON.parse(inputJson);

			if (
				input === null ||
				typeof input !== "object" ||
				Array.isArray(input)
			) {
				throw new Error("Assembled tool input must be a JSON object.");
			}
			block.input = input;
		}

		closed = true;
		return block
	}

	return { push, finish };
}
