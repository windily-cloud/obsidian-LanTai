export type ImageLayout = 'center' | 'left' | 'right';

export interface ImageRef extends ImageTarget {
	decorations: string[];
	end: number;
	kind: 'markdown' | 'wiki';
	markdownTitle: null | string;
	source: string;
	start: number;
}

/** Identity needed by download/copy/open without note offsets. */
export interface ImageTarget {
	readonly isRemote: boolean;
	readonly target: string;
}
