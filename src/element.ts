import type { ConversationEntry } from "./conversation.js";

export type Child =
	| AtlasElement
	| ConversationEntry
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly Child[];

export interface ElementProps {
	children?: Child;
	[name: string]: unknown;
}

export type Component = (props: any) => Child;

export function Fragment(
	props: { children?: Child },
): Child {
	return props.children;
}

export interface AtlasElement {
	type: string | Component;
	props: ElementProps;
}

export function createElement(
	type: AtlasElement["type"],
	props: ElementProps = {},
): AtlasElement {
	return { type, props };
}
