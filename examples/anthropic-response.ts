import { decodeResponse } from "../src/providers/anthropic/response.js";
import { encodeRequest } from "../src/providers/anthropic/request.js";

const fixture = {
	id: "msg_example",
	type: "message",
	role: "assistant",
	model: "MODEL_ID",
	content: [
		{
			type: "thinking",
			thinking: "Example retained content.",
			signature: "fake-signature-for-offline-testing",
		},
		{
			type: "text",
			text: "I will inspect the file.",
			citations: [],
		},
		{
			type: "tool_use",
			id: "toolu_example",
			name: "read_file",
			input: {
				path: "src/index.ts",
			},
		},
	],
	stop_reason: "tool_use",
	usage: {
		input_tokens: 12,
		output_tokens: 8,
		cache_read_input_tokens: 100,
		cache_creation_input_tokens: 0,
	},
};

const response = decodeResponse(
	JSON.stringify(fixture),
	"MODEL_ID",
);

console.dir(response, { depth: null });


const nextRequest = encodeRequest(
	{
		items: [
			{
				type: "message",
				role: "user",
				content: "Review src/index.ts.",
			},
			...response.items,
			{
				type: "tool-result",
				callId: "toolu_example",
				content: "export const answer = 42;",
			},
		],
	},
	{
		model: "MODEL_ID",
		maxTokens: 1024,
	},
);

const replayedContent = nextRequest.messages[1]?.content;

if (JSON.stringify(replayedContent) !== JSON.stringify(fixture.content)) {
	throw new Error("Native content changed during replay.");
}

console.log("Native blocks survived the round trip.");
