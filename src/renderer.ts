import type { Child } from "./element.js";
import type { Conversation, ConversationEntry } from "./conversation.js";
import {
	createConversationMessage,
	snapshotConversation,
} from "./conversation.js";
import type { ConversationItem, JsonValue, Message } from "./protocol.js";
import { readNonEmptyString } from "./protocol.js";
import type { ModelRequest } from "./provider.js";
import type { Tool, ToolSpec } from "./tool.js";
import { walk } from "./walk.js";

export interface AgentProps {
	name: string;
	provider: string;
	model: string;
	maxTokens: number;
	children?: Child;
}

export interface TurnPlan {
	readonly agent: string;
	readonly provider: string;
	readonly request: ModelRequest;
}

export interface RenderedTurn {
	readonly plan: TurnPlan;
	readonly conversation: Conversation;
	readonly tools: ReadonlyMap<string, Tool>;
}

function snapshotJson(value: unknown, ancestors = new Set<object>()): JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value !== "object") {
		throw new Error("<tool> schemas must contain only valid JSON values.");
	}

	if (ancestors.has(value)) {
		throw new Error("<tool> schemas cannot contain circular references.");
	}

	ancestors.add(value);
	try {
		let copy: JsonValue;
		if (Array.isArray(value)) {
			copy = Array.from(value, (item) => snapshotJson(item, ancestors));
		} else {
			const proto = Object.getPrototypeOf(value);
			if (proto !== Object.prototype && proto !== null) {
				throw new Error("<tool> schemas must contain plain JSON objects.");
			}
			copy = Object.fromEntries(
				Object.entries(value).map(([key, item]) => 
					[key, snapshotJson(item, ancestors)]
			));
		}
		Object.freeze(copy);
		return copy;
	} finally {
		ancestors.delete(value);
	}
}

function snapshotTool(value: unknown): Tool {
	if (value === null || typeof value !== "object") {
		throw new Error("<tool> needs a Tool in its use prop.");
	}

	const candidate = value as Partial<Tool>;
	const spec = candidate.spec;

	if (
		spec === null ||
		typeof spec !== "object" ||
		typeof candidate.call !== "function"
	) {
		throw new Error("<tool> needs a spec and a function to call.");
	}

	const name = readNonEmptyString(spec.name, "Tool name");
	const description = readNonEmptyString(spec.description, "Tool description");
	const schema = snapshotJson(spec.inputSchema);

	if (
		schema === null ||
		typeof schema !== "object" ||
		Array.isArray(schema) ||
		schema.type !== "object"
	) {
		throw new Error("<tool> input schema must have type object.");
	}

	const inputSchema: ToolSpec["inputSchema"] = Object.freeze({
		...schema,
		type: "object",
	});

	return Object.freeze({
		spec: Object.freeze({ name, description, inputSchema }),
		call: candidate.call.bind(value),
	});
}

export function renderTurn(tree: Child): RenderedTurn {
	const state: { agent?: AgentProps } = {};
	const entries: ConversationEntry[] = [];
	const tools = new Map<string, Tool>();

	walk(tree, (node, depth) => {
		if (typeof node !== "object") {
			throw new Error("Free form text must sit inside a <message> boundary.");
		}

		if ("kind" in node) {
			if (state.agent === undefined || depth === 0) {
				throw new Error("Conversation records must be inside the root <agent>.");
			}
			entries.push(node);
			return false;
		}

		if (node.type === "agent") {
			if (depth !== 0 || state.agent !== undefined) {
				// FIXME(@hadydotai): The framework currently doesn't have an understanding
				// of sub-agents, so we're going to prevent nesting <agent> tags
				throw new Error("<agent> tags cannot have nested <agent> tags.");
			}

			const maxTokens = node.props.maxTokens;
			if (
				typeof maxTokens !== "number" ||
				!Number.isSafeInteger(maxTokens) ||
				maxTokens <= 0
			) {
				throw new Error("<agent> maxTokens must be a positive integer.");
			}
			state.agent = {
				name: readNonEmptyString(node.props.name, "Agent name"),
				provider: readNonEmptyString(node.props.provider, "Agent provider"),
				model: readNonEmptyString(node.props.model, "Agent model"),
				maxTokens,
			};

			return;
		}

		// FIXME(@hadydotai): This is definitely stricter than it really ought to be
		// but for now we'll deal with it. I'd like to have a tight belt and see if we
		// actually run up against any real limitations than have the tree be valid
		// in 101 different ways to achieve the same outcome.
		if (state.agent === undefined || depth === 0) {
			throw new Error("<message> tags must be inside the root <agent>.");
		}

		if (node.type === "tool") {
			if (node.props.children !== undefined) {
				throw new Error("<tool> cannot contain children.");
			}

			const tool = snapshotTool(node.props.use);
			if (tools.has(tool.spec.name)) {
				throw new Error(`Duplicate tool name: ${tool.spec.name}`);
			}
			tools.set(tool.spec.name, tool);
			return false;
		}

		if (node.type !== "message") {
			throw new Error(`Unknown element: ${String(node.type)}`);
		}

		const role = node.props.role;
		if (
			role !== "system" &&
			role !== "user" &&
			role !== "assistant"
		) {
			// NOTE(@hadydotai): I'm doing poor-man's validations throughout
			// until I figure out how I want to do proper validations and
			// on what stage. Doing this here in the renderer is in my opinion
			// already too late.
			// We have design time type safety on the intrinsic components
			// so this won't even compile with typescript but we probably should
			// validate at the walking stage.
			throw new Error("A <message> needs a valid role.");
		}

		const parts: string[] = [];

		walk(node.props.children, (child) => {
			if (typeof child === "object") {
				throw new Error("A <message> can contain text but not nested elements.");
			}
			parts.push(String(child));
		});

		entries.push(
			createConversationMessage(
				globalThis.crypto.randomUUID(),
				role,
				parts.join(""),
			),
		);
		return false;
	});

	const agent = state.agent;
	if (agent === undefined) {
		throw new Error("A turn needs a root <agent>.");
	}
	const conversation = snapshotConversation(entries);
	const items = Object.freeze(
		conversation.flatMap<ConversationItem>((entry) =>
			entry.kind === "message"
				? [entry.message]
				: [...entry.output, ...entry.results]),
	);
	if (items.length === 0) {
		throw new Error("An agent turn needs conversation content.");
	}

	const specs = Object.freeze(
		Array.from(tools.values(), (tool) => tool.spec),
	);

	// TODO(@hadydotai): I'm thinking that perhaps we'll be able to even change
	// those values from one turn to the next, and I'm wondering if we'll need something
	// similar to hooks in React. Something like `useTurnState` for values that
	// change from one turn to the other. Maybe? I need to understand how React
	// invalidates part of its tree in response to a state mutation.
	const request: ModelRequest = Object.freeze({
		model: agent.model,
		maxTokens: agent.maxTokens,
		items,
		...(specs.length > 0 ? { tools: specs } : {}),
	});

	const plan: TurnPlan = Object.freeze({
		agent: agent.name,
		provider: agent.provider,
		request,
	});
	return { plan, conversation, tools };
}
