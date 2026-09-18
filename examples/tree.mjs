import { createElement as e, walk } from "atlasframework";

/**
	* Okay, so that's kind of the rough idea, imagine a react component style
	* agent definition. What you see within that function's body is what the
	* LLM sees too. Whatever you're returning there and how it's being shaped (it's
	* a functional component, so that function is executed on every turn) is what
	* the LLM will see on every turn. That's the entirety of your context
	* definition, right there and then.
	*
	* <agent name="reviewer">
	* <message role="system">Review the code for repetitive patterns.</message>
	* <message role="user">console.log('Hello, Sailor!')</message>
	* </agent>
 */
const tree = e("agent", {
	name: "reviewer",
	children: [
		e("message", {
			role: "system",
			children: "Review the code for repetitive patterns.",
		}),
		e("message", {
			role: "user",
			children: "console.log('Hello, Sailor!')",
		}),
	],
});

console.dir(tree, { depth: null });

walk(tree, (node, depth) => {
	const indent = "  ".repeat(depth);
	if (typeof node === "object") {
		console.log(`${indent}<${node.type}>`);
	} else {
		console.log(`${indent}${node}`);
	}
});

// Run it:
// npm run build && node examples/tree.mjs
