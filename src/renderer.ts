import type { Child } from "./element.js";
import { walk } from "./walk.js";

export interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

export function renderMessages(tree: Child): Message[] {
	const messages: Message[] = [];

	walk(tree, (node) => {
		console.log(">>>>", node);
		if (typeof node !== "object") {
			throw new Error("Free form text must sit inside a <message> boundary.");
		}

		// FIXME(@hadydotai): We're not handling this at the moment
		if (node.type === "agent") {
			return;
		}

		// FIXME(@hadydotai): We're only handling this at the moment, so
		// things like <tool> <retry> or whatever I cook up will need to be
		// handled on this level.
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
			role,
			content: parts.join(""),
		})

		return false;
	});

	return messages;
}
