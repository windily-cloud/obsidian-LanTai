import type { ImageLinkFormatter } from './image-link-formatter.ts';
import type { ImageLinkParser } from './image-link-parser.ts';
import type {
	ImageLayout,
	ImageRef
} from './image-ref.ts';

import { t } from '../i18n/index.ts';

const IMAGE_LAYOUTS = new Set<ImageLayout>(['center', 'left', 'right']);
const MARKDOWN_FIRST_LAYOUT_INDEX = 1;

export class ImageLinkService {
	public constructor(
		private readonly parser: ImageLinkParser,
		private readonly formatter: ImageLinkFormatter
	) {}

	public convertNote(content: string, to: 'markdown' | 'wiki'): string {
		const refs = this.parser.parse(content);
		let result = content;
		for (let i = refs.length - 1; i >= 0; i--) {
			const ref = refs[i];
			if (!ref || ref.isRemote) {
				continue;
			}
			const formatted = this.formatter.format({ linkStyle: to, target: ref.target });
			result = `${result.slice(0, ref.start)}${formatted}${result.slice(ref.end)}`;
		}
		return result;
	}

	public formatLayout(ref: ImageRef, layout: ImageLayout): string {
		const content = this.setLayout(ref.source, { ...ref, end: ref.source.length, start: 0 }, layout);
		return content;
	}

	public formatRemoveEmbed(): string {
		return '';
	}

	public formatResetSize(ref: ImageRef): string {
		const decorations = ref.decorations.filter((decoration) => !isSizeDecoration(decoration));
		return formatDecoratedLink(ref, decorations);
	}

	public formatTarget(target: string, linkStyle: 'markdown' | 'wiki'): string {
		return this.formatter.format({ linkStyle, target });
	}

	public formatTargetFromRef(
		ref: ImageRef,
		target: string,
		linkStyle: 'markdown' | 'wiki'
	): string {
		const isRemote = /^https?:\/\//i.test(target);
		const kind: ImageRef['kind'] = isRemote || linkStyle === 'markdown' ? 'markdown' : 'wiki';
		return formatDecoratedLink(
			{
				...ref,
				isRemote,
				kind,
				markdownTitle: kind === 'markdown' ? ref.markdownTitle : null,
				target
			},
			ref.decorations
		);
	}

	public getLayout(ref: ImageRef): ImageLayout | null {
		const firstLayoutIndex = ref.kind === 'markdown' ? MARKDOWN_FIRST_LAYOUT_INDEX : 0;
		return ref.decorations.slice(firstLayoutIndex).find(isImageLayout) ?? null;
	}

	/** Exposed for unit tests. */
	public hasSize(ref: ImageRef): boolean {
		return ref.decorations.some(isSizeDecoration);
	}

	/** Exposed for unit tests. */
	public parse(content: string): ImageRef[] {
		return this.parser.parse(content);
	}

	/** Exposed for unit tests. */
	public replace(
		content: string,
		ref: ImageRef,
		toTarget: string,
		linkStyle: 'markdown' | 'wiki'
	): string {
		if (content.slice(ref.start, ref.end) !== ref.source) {
			throw new Error(t('errors.linkChangedBeforeUpdate'));
		}
		const replacement = this.formatTargetFromRef(ref, toTarget, linkStyle);
		return `${content.slice(0, ref.start)}${replacement}${content.slice(ref.end)}`;
	}

	/** Exposed for unit tests. */
	public setLayout(content: string, ref: ImageRef, layout: ImageLayout): string {
		if (content.slice(ref.start, ref.end) !== ref.source) {
			throw new Error(t('errors.linkChangedBeforeLayout'));
		}
		const decorations = ref.kind === 'markdown' && ref.decorations.length === 0
			? ['']
			: [...ref.decorations];
		const firstLayoutIndex = ref.kind === 'markdown' ? MARKDOWN_FIRST_LAYOUT_INDEX : 0;
		const existingLayoutIndex = decorations.findIndex(
			(decoration, index) => index >= firstLayoutIndex && isImageLayout(decoration)
		);
		if (existingLayoutIndex === -1) {
			decorations.push(layout);
		} else {
			decorations[existingLayoutIndex] = layout;
			for (let index = decorations.length - 1; index > existingLayoutIndex; index--) {
				if (isImageLayout(decorations[index])) {
					decorations.splice(index, 1);
				}
			}
		}
		const reordered = moveSizeDecorationsToEnd(decorations, firstLayoutIndex);
		const formatted = formatDecoratedLink(ref, reordered);
		return `${content.slice(0, ref.start)}${formatted}${content.slice(ref.end)}`;
	}
}

function formatDecoratedLink(ref: ImageRef, decorations: string[]): string {
	if (ref.kind === 'wiki') {
		return decorations.length === 0
			? `![[${ref.target}]]`
			: `![[${ref.target}|${decorations.join('|')}]]`;
	}
	const alt = decorations.join('|');
	const title = ref.markdownTitle ? ` ${ref.markdownTitle}` : '';
	return `![${alt}](${ref.target}${title})`;
}

function isImageLayout(value: string | undefined): value is ImageLayout {
	return value !== undefined && IMAGE_LAYOUTS.has(value as ImageLayout);
}

function isSizeDecoration(value: string): boolean {
	return /^\d+$/.test(value) || /^\d+x\d+$/i.test(value);
}

function moveSizeDecorationsToEnd(
	decorations: readonly string[],
	firstMovableIndex: number
): string[] {
	const prefix = decorations.slice(0, firstMovableIndex);
	const movable = decorations.slice(firstMovableIndex);
	const nonSize: string[] = [];
	const sizes: string[] = [];
	for (const decoration of movable) {
		if (isSizeDecoration(decoration)) {
			sizes.push(decoration);
		} else {
			nonSize.push(decoration);
		}
	}
	return [...prefix, ...nonSize, ...sizes];
}
