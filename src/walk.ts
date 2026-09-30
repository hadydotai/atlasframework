import type { ConversationEntry } from "./conversation.js";
import type { AtlasElement, Child } from "./element.js";
import type { HookContext } from "./hooks.js";
import { withHookContext } from "./hooks.js";

type Visitor = (
	node: AtlasElement | ConversationEntry | string | number,
	depth: number,
) => void | false | Promise<void | false>;

function isChildArray(child: Child): child is readonly Child[] {
	return Array.isArray(child);
}

// NOTE(@hadydotai): Not sure how React does, will need to revisit
// but I reckon a simple depth-first pre-order is sufficient for most
// agentic usecases. We might find it useful to traverse differently in
// the future but for now, I'm imaging this as a a plain representation
// of a prompt turn by turn constructed declaratively. So I doubt I'll need
// something advanced here.
export async function walk(
	child: Child, 
	visit: Visitor, 
	depth = 0,
	context?: HookContext,
): Promise<void> {
	const signal = context?.turn.signal;
	signal?.throwIfAborted();

	if (child == null || typeof child === "boolean") {
		return;
	}

	if (isChildArray(child)) {
		for (const item of child) {
			await walk(item, visit, depth, context);
		}
		return;
	}

	if (typeof child === "object" && "kind" in child) {
		await visit(child, depth);
		signal?.throwIfAborted();
		return;
	}

	if (
		typeof child === "object" &&
		typeof child.type === "function"
	) {
		const component = child.type;
		// NOTE(@hadydotai): components will get hook context as it starts
		// executing, we restore that context (the whole point behind 
		// `withHookContext`) before await the result,
		// so another execution (I'm thinking nested) doesn't accidentally inherit
		// it
		const output = withHookContext(context, () => component(child.props));
		const resolved = await output;
		signal?.throwIfAborted();

		await walk(resolved, visit, depth, context);
		return;
	}

	const result = await visit(child, depth);
	signal?.throwIfAborted();

	if (result === false) {
		return;
	}

	// NOTE(@hadydotai): Here we're definitely bumping up the depth
	// because well, it's likely an element with children nodes.
	// I probably need named tag on AtlasElement but this at this
	// point should be an AtlasElement with children.
	if (typeof child === "object") {
		await walk(child.props.children, visit, depth + 1, context);
	}
}
