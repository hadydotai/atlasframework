import { createElement } from "./element.js";
import type { AtlasElement, Child, ElementProps } from "./element.js";

export function jsx(type: string, props: ElementProps | null): AtlasElement {
	return createElement(type, props ?? {});
}

// NOTE(@hadydotai): For compilers that use `jsxs()` for multiple static
// children, we treat both single and multi-elements the same.
export const jsxs = jsx;

// NOTE(@hadydotai): This whole thing is basically duct tape and gum.
// https://www.typescriptlang.org/docs/handbook/jsx.html#type-checking
// iykyk...
// Anyhow, this is how we teach TS what our native elements look like.
export namespace JSX {
	export type Element = AtlasElement;

	export interface ElementChildrenAttribute {
		children: unknown;
	}

	export interface IntrinsicElements {
		agent: {
			name: string;
			children?: Child;
		};

		message: {
			role: "system" | "user" | "assistant";
			children?: Child;
		};
	}
}
