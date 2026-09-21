import type { AtlasElement, Child } from "./element.js";

type Visitor = (
	node: AtlasElement | string | number,
	depth: number,
) => void | false;

// NOTE(@hadydotai): Not sure how React does, will need to revisit
// but I reckon a simple depth-first pre-order is sufficient for most
// agentic usecases. We might find it useful to traverse differently in
// the future but for now, I'm imaging this as a a plain representation
// of a prompt turn by turn constructed declaratively. So I doubt I'll need
// something advanced here.
export function walk(child: Child, visit: Visitor, depth = 0): void {
	if (child == null || typeof child === "boolean") {
		return;
	}

	// NOTE(@hadydotai): Arrays group sibilings so we're not
	// increasing the depth here. I think.. will have to
	// revisit this.
	if (Array.isArray(child)) {
		for (const item of child) {
			walk(item, visit, depth);
		}
		return;
	}

	if (
		typeof child === "object" &&
		typeof child.type === "function"
	) {
		const output = child.type(child.props);
		walk(output, visit, depth);
		return;
	}

	if (visit(child, depth) === false) {
		return;
	}

	// NOTE(@hadydotai): Here we're definitely bumping up the depth
	// because well, it's likely an element with children nodes.
	// I probably need named tag on AtlasElement but this at this
	// point should be an AtlasElement with children.
	if (typeof child === "object") {
		walk(child.props.children, visit, depth + 1);
	}
}
