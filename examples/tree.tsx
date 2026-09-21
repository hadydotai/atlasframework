import { renderMessages } from "atlasframework";

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

const messages = renderMessages(tree);
console.dir(messages, { depth: null });

// npm run build
// npx tsc -p examples/tsconfig.json
// npm run demo
