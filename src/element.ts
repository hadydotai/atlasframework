export type Child =
	| AtlasElement
	| string
	| number
	| boolean
	| null
	| undefined
	| Child[];

export interface ElementProps {
	children?: Child;
	[name: string]: unknown;
}

export type Component = (props: any) => Child;

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
