import { walk } from "atlasframework";

interface ReviewerProps {
	code: string;
}

function Reviewer({ code }: ReviewerProps) {
	console.log("Reviewer executed");
	return (
		<agent name="reviewer">
			<message role="system">
				Review the code for reptitive patterns.
			</message>
			<message role="user">{code}</message>
		</agent>
	);
}

const tree = (
	<Reviewer code="console.log('Hello, Sailor!')" />
);

console.log("Tree created");
console.dir(tree, { depth: null });

console.log("Walking");

walk(tree, (node, depth) => {
	const indent = "  ".repeat(depth);
	if (typeof node === "object") {
		console.log(`${indent}<${node.type}>`);
	} else {
		console.log(`${indent}${node}`);
	}
});

// npm run build
// npx tsc -p examples/tsconfig.json
// npm run demo
