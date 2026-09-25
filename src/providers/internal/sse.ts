// NOTE(@hadydotai): Never again, here I thought to myself oh, I
// don't need a dependency for this. Like fuck I don't. But alas, I've been
// sinking a few hours into this.
// This is attempting to be as faithful to the spec as possible:
// https://html.spec.whatwg.org/multipage/server-sent-events.html
//
// Caveat: I'm ignoring fields like `id` and `retry` because this reader
// is not implementing automatic reconnection and other frivolities. Though
// it probably should.
// FIXME(@hadydotai): Implement frivolities.

export interface SseEvent {
	event: string;
	data: string;
}

async function* readLines(
	body: ReadableStream<Uint8Array>,
	signal: AbortSignal,
): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	function onAbort() {
		void reader.cancel(signal.reason).catch(() => {});
	}

	signal.addEventListener("abort", onAbort, { once: true });

	try {
		signal.throwIfAborted();
		while (true) {
			const { done, value } = await reader.read();

			signal.throwIfAborted();

			buffer += done
				? decoder.decode()
				: decoder.decode(value, { stream: true });

			while (true) {
				const end = buffer.search(/[\r\n]/);

				if (end === -1) {
					break;
				}

				const carriageReturn = buffer[end] === "\r";

				// trailing CR could be the first half of a CRLF
				if (carriageReturn && end === buffer.length - 1 && !done) {
					break;
				}
				const line = buffer.slice(0, end);
				const separatorLength = 
					carriageReturn 
					&& buffer[end + 1] === "\n" ? 2 : 1;

				buffer = buffer.slice(end + separatorLength);

				yield line;

				signal.throwIfAborted();
			}
			if (done) {
				return;
			}
		}
	} finally {
		signal.removeEventListener("abort", onAbort);
		try {
			await reader.cancel();
		} catch {
			// NOTE(@hadydotai): Cleanup shouldn't replace the original stream err
		} finally {
			reader.releaseLock();
		}
	}
}

export async function* readSse(
	body: ReadableStream<Uint8Array>,
	signal: AbortSignal,
): AsyncGenerator<SseEvent> {
	let eventName = "";
	let data: string[] = [];

	for await (const line of readLines(body, signal)) {
		if (line === "") {
			if (data.length > 0) {
				yield {
					event: eventName || "message",
					data: data.join("\n"),
				};
			}

			eventName = "";
			data = [];
			continue;
		}

		// SSE comments, sometimes used as keepalive directives.
		if (line.startsWith(":")) {
			continue;
		}

		const colon = line.indexOf(":");
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? "" : line.slice(colon + 1);

		// SSE removes at most one space after the colon.
		if (value.startsWith(" ")) {
			value = value.slice(1);
		}

		if (field === "event") {
			eventName = value;
		} else if (field === "data") {
			data.push(value);
		}
	}
}
