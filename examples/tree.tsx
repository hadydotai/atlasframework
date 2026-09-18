import { walk } from "atlasframework";

const code = "console.log('Hello, Sailor!')";

const tree = (
	<agent name="reviewer">
		<message role="system">
			Review the code for reptitive patterns.
		</message>
		<message role="user">{code}</message>
	</agent>
);

console.dir(tree, { depth: null });

walk(tree, (node, depth) => {
	const indent = "  ".repeat(depth);
	if (typeof node === "object") {
		console.log(`${indent}<${node.type}>`);
	} else {
		console.log(`${indent}${node}`);
	}
});
