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
		{
  	  type: "provider",
  	  replay: {
  	    integration: "anthropic",
  	    model: "MODEL_ID",
  	    payload: {
  	      type: "thinking",
  	      thinking: "Example retained content.",
  	      signature: "fake-signature-for-offline-testing",
  	    },
  	  },
  	},
		{
  	  type: "tool-call",
  	  id: "toolu_example",
  	  name: "read_file",
  	  input: {
  	    path: "src/index.ts",
  	  },
  	},
  	{
  	  type: "tool-result",
  	  callId: "toolu_example",
  	  content: "export const answer = 42;",
  	},
	],
};

const body = encodeRequest(request, {
	model: "MODEL_ID",
	maxTokens: 1024,
});

console.log(JSON.stringify(body, null, 2));
