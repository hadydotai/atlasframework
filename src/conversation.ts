import type {
	Message,
	ModelOutput,
	ToolResult,
} from "./protocol.js";
import { readNonEmptyString, readString } from "./protocol.js";
import { snapshot } from "./snapshot.js";

export interface ConversationMessage {
	readonly kind: "message";
	readonly id: string;
	readonly message: Readonly<Pick<Message, "type" | "role" | "content">>;
}

export interface ConversationExchange {
	readonly kind: "exchange";
	readonly id: string;
	readonly output: readonly ModelOutput[];
	readonly results: readonly ToolResult[];
}

export type ConversationEntry =
	| ConversationMessage
	| ConversationExchange;

export type Conversation = readonly ConversationEntry[];

export function createConversationMessage(
	id: string,
	role: Message["role"],
	content: string,
): ConversationMessage {
	readNonEmptyString(id, "Conversation message ID");

	if (
		role !== "system" &&
		role !== "user" &&
		role !== "assistant"
	) {
		throw new Error("A conversation message needs a valid role.");
	}

	return Object.freeze({
		kind: "message",
		id,
		message: Object.freeze({
			type: "message",
			role,
			content: readString(content, "Message content"),
		}),
	});
}

export function createConversationExchange(
	id: string,
	output: readonly ModelOutput[],
	results: readonly ToolResult[],
): ConversationExchange {
	readNonEmptyString(id, "Conversation exchange ID");

	const exchange: ConversationExchange = snapshot({
		kind: "exchange",
		id,
		output,
		results,
	});

	const pending = new Set<string>();
	for (const item of exchange.output) {
		if (item.type !== "tool-call") { continue; }
		const callId = readNonEmptyString(item.id, "Tool call ID");
		if (pending.has(callId)) {
			throw new Error(`Duplicate tool call ID in exchange: ${callId}`);
		}
		pending.add(callId);
	}

	for (const result of exchange.results) {
		const callId = readNonEmptyString(result.callId, "Tool result call ID");
		if (!pending.delete(callId)) {
			throw new Error(`Tool result has no matching pending tool call in this exchange: ${callId}`);
		}
	}

	if (pending.size > 0) {
		throw new Error(`Exchange is missing tool results for ${Array.from(pending).join(", ")}`);
	}

	return exchange;
}

export function snapshotConversation(
	entries: Conversation,
): Conversation {
	const ids = new Set<string>();
	const conversation: ConversationEntry[] = [];

	for (const entry of entries) {
		readNonEmptyString(entry.id, "Conversation entry ID");

		if (ids.has(entry.id)) {
			throw new Error(`Duplicate conversation entry ID: ${entry.id}`);
		}
		ids.add(entry.id);
		switch (entry.kind) {
			case "message":
				if (
					entry.message.type !== "message" ||
					("replay" in entry.message && entry.message.replay !== undefined)
			) {
				throw new Error("Message records hold authored messages, retain provider output in an exchange.");
			}
				conversation.push(
					createConversationMessage(
						entry.id,
						entry.message.role,
						entry.message.content,
					),
				);
				break;
			case "exchange":
				conversation.push(
					createConversationExchange(
						entry.id,
						entry.output,
						entry.results,
					),
				);
				break;
			default:
				throw new Error("Unknown conversation entry kind.");
		}
	}
	return Object.freeze(conversation);
}
