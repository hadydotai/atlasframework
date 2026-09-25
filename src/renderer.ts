import type { Child } from "./element.js";
import type { Message } from "./protocol.js";
import { readNonEmptyString } from "./protocol.js";
import { walk } from "./walk.js";
import type { ModelRequest } from "./provider.js";

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

export function renderTurn(tree: Child): TurnPlan {
	const state: { agent?: AgentProps } = {};
	const messages: Message[] = [];

	walk(tree, (node, depth) => {
		if (typeof node !== "object") {
			throw new Error("Free form text must sit inside a <message> boundary.");
		}

		if (node.type === "agent") {
			if (depth !== 0 || state.agent !== undefined) {
				// FIXME(@hadydotai): The framework currently doesn't have an understanding
				// of sub-agents, so we're going to prevent nesting <agent> tags
				throw new Error("<agent> tags cannot have nested <agent> tags.");
			}

			// TODO(@hadydotai): I'd like those to actually be typed, we already know
			// for our intrinsic tags what props we should accept and it should 
			// be a closed set for intrinsics. Currently it isn't, we treat all element
			// props the same whether they're framework native or user land.
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

		messages.push({
			type: "message",
			role,
			content: parts.join(""),
		})

		return false;
	});

	const agent = state.agent;
	if (agent === undefined) {
		throw new Error("A turn needs a root <agent>.");
	}
	if (messages.length === 0) {
		throw new Error("An agent turn needs at least one message.");
	}

	const items = Object.freeze(messages.map((msg) => Object.freeze(msg)));
	// TODO(@hadydotai): I'm thinking that perhaps we'll be able to even change
	// those values from one turn to the next, and I'm wondering if we'll need something
	// similar to hooks in React. Something like `useTurnState` for values that
	// change from one turn to the other. Maybe? I need to understand how React
	// invalidates part of its tree in response to a state mutation.
	return Object.freeze({
		agent: agent.name,
		provider: agent.provider,
		request: Object.freeze({
			model: agent.model,
			maxTokens: agent.maxTokens,
			items,
		}),
	});
}
