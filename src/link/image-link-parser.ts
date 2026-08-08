import type { ImageRef } from './image-ref.ts';

const MD_IMAGE_RE = /!\[(?<alt>[^\]]*)\]\(\s*<?(?<target>[^)\s>]+)>?(?:\s+(?<title>"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const WIKI_IMAGE_RE = /!\[\[(?<target>[^\]|]+)(?:\|(?<suffix>[^\]]*))?\]\]/g;

interface MatchCandidate {
	index: number;
	ref: ImageRef;
}

export class ImageLinkParser {
	public parse(markdown: string): ImageRef[] {
		const candidates: MatchCandidate[] = [];
		for (const match of markdown.matchAll(MD_IMAGE_RE)) {
			const groups = match.groups;
			const alt = groups?.['alt'] ?? '';
			const target = groups?.['target'];
			const source = match[0];
			if (!target || !source) {
				continue;
			}
			candidates.push({
				index: match.index,
				ref: {
					decorations: splitDecorations(alt),
					end: match.index + source.length,
					isRemote: /^https?:\/\//i.test(target),
					kind: 'markdown',
					markdownTitle: groups['title'] ?? null,
					source,
					start: match.index,
					target
				}
			});
		}
		for (const match of markdown.matchAll(WIKI_IMAGE_RE)) {
			const groups = match.groups;
			const target = groups?.['target']?.trim();
			const source = match[0];
			if (!target || !source) {
				continue;
			}
			candidates.push({
				index: match.index,
				ref: {
					decorations: splitDecorations(groups?.['suffix'] ?? ''),
					end: match.index + source.length,
					isRemote: /^https?:\/\//i.test(target),
					kind: 'wiki',
					markdownTitle: null,
					source,
					start: match.index,
					target
				}
			});
		}
		candidates.sort((a, b) => a.index - b.index);
		return candidates.map((c) => c.ref);
	}
}

function splitDecorations(value: string): string[] {
	return value === '' ? [] : value.split('|');
}
