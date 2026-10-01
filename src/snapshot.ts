export function snapshot<T>(value: T): T {
	const copy = structuredClone(value);
	const seen = new WeakSet<object>();

	function freeze(current: unknown): void {
		if (
			current === null ||
			typeof current !== "object" ||
			seen.has(current)
		) {
			return;
		}

		seen.add(current);
		for (const child of Object.values(current)) {
			freeze(child);
		}

		Object.freeze(current);
	}
	freeze(copy);
	return copy;
}

