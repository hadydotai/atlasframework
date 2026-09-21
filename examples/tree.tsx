import { renderMessages } from "atlasframework";

interface ReviewerProps {
	code: string;
}

function Code({ code } : { code: string }) {
	return ["Source code:\n", code];
}

function ReviewMessages({ code }: ReviewerProps) {
	return (
		<>
			<message role="system">
				Review the code for reptitive patterns.
			</message>
			<message role="user">
				{/* This is a contrived example but tests whether we can traverse
					nested function components inside <message> tags
					that return whatever is acceptable to <message> tags. In our
					current implementation thats strings, arrays of strings, and
					numbers. Though we don't specifically call out arrays of
					non-string values. Actually, thinking about it now as I type this,
					no need because if it's stringifable then we should be okay.
					We'll likely behave like react too in that regard, need to give it
					more thought
				*/}
				<Code code={code} />
			</message>
		</>
	)
}

function Reviewer({ code }: ReviewerProps) {
	console.log("Reviewer executed");
	return (
		<agent name="reviewer">
			<ReviewMessages code={code} />
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
