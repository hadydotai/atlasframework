import {createElement } from "./element.js";
import type { AtlasElement, Child, Component, ElementProps } from "./element.js";
import type { Message } from "./protocol.js";

export { Fragment } from "./element.js";

export function jsx(
	type: AtlasElement["type"], 
	props: ElementProps | null,
): AtlasElement {
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
	// What a JSX expression produces
	export type Element = AtlasElement;
	// What can appear as a tag
	// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-1.html#decoupled-type-checking-between-jsx-elements-and-jsx-tag-types
	export type ElementType = keyof IntrinsicElements | Component;

	export interface ElementChildrenAttribute {
		children: unknown;
	}

	export interface IntrinsicElements {
		agent: {
			name: string;
			children?: Child;
		};

		message: {
			role: Message["role"];
			children?: Child;
		};
	}
}
