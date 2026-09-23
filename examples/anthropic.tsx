import { createRuntime } from "atlasframework";
import { anthropic } from "atlasframework/providers/anthropic";

const provider = anthropic({
	apiKey: "offline",
	model: "MODEL_ID",
	maxTokens: 1024,

	async fetch(input, init) {
		const request = new Request(input, init);

		console.log(request.method, request.url);
		console.dir(await request.json(), { depth: null });

		return Response.json(
			{
				id: "msg_example",
				type: "message",
				role: "assistant",
				model: "MODEL_ID",
				content: [
					{
						type: "text",
						text: "The adapter received and decoded this response.",
					},
				],
				stop_reason: "end_turn",
				usage: {
					input_tokens: 12,
					output_tokens: 9,
				},
			},
			{
				headers: {
					"request-id": "req_example",
				},
			},
		);
	},
});

const runtime = createRuntime(provider);
const response = await runtime.run(
	<agent name="reviewer">
		<message role="system">Review carefully.</message>
		<message role="user">
			{"console.log('Hello, Sailor!')"}
		</message>
	</agent>,
);

console.dir(response, { depth: null });
