import { createRuntime } from "atlasframework";
import type { Provider } from "atlasframework";

function delay(millis: number, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted();

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, millis);
		function onAbort() {
			clearTimeout(timer);
			reject(signal.reason);
		}

		signal.addEventListener("abort", onAbort, { once: true });
	});
}

const provider: Provider = {
	async complete(request, { signal }) {
		console.log("Fake provider received:");
		console.dir(request, { depth: null });

		await delay(1_000, signal);

		return {
			items: [
				{
					type: "provider",
					replay: {
						integration: "fake",
						model: "fake-reviewer-model",
						payload: {
							continuation: "example-opaque-value",
						},
					},
				},
				{
					type: "message",
					role: "assistant",
					content: `Fake review: received ${request.items.length} items.`,
				}
			],
			stopReason: "end-turn",
		};
	},
};

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

const runtime = createRuntime(provider);
console.log("Starting a run");

const controller = new AbortController();
const cancelTimer = setTimeout(() => {
	controller.abort(new Error("Stopped by fake caller"));
}, 100);

try {
	const response = await runtime.run(tree, {
		signal: controller.signal,
	});

	console.log("Run completed: ");
	console.dir(response, { depth: null });
} catch (err) {
	console.error(
		err instanceof Error ? err.message: err,
	);
} finally {
	clearTimeout(cancelTimer);
}

// npm run build
// npx tsc -p examples/tsconfig.json
// npm run demo
