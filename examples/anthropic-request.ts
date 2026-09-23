import { encodeRequest } from "../src/providers/anthropic/request.js";
import type { ModelRequest } from "atlasframework";

const request: ModelRequest = {
	items: [
		{
			type: "message",
			role: "system",
			content: "Review carefully.",
		},
		{
			type: "message",
			role: "user",
			content: "console.log('Hello, Sailor!')",
		},
		{
			type: "message",
			role: "user",
			content: "Focus on correctness.",
		},
	],
};

const body = encodeRequest(request, {
	model: "MODEL_ID",
	maxTokens: 1024,
});

console.log(JSON.stringify(body, null, 2));
