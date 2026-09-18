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

export interface AtlasElement {
	type: string;
	props: ElementProps;
}

export function createElement(type: string, props: ElementProps = {}): AtlasElement {
	return { type, props };
}
