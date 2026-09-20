import {
	describe,
	expect,
	it
} from 'vitest';

import type { HasLocalImageReferenceInput } from '../has-local-image-reference.ts';

import { hasLocalImageReference } from '../has-local-image-reference.ts';
import { ImageLinkParser } from '../image-link-parser.ts';

const LOCAL_PATH = 'Journal/photo.png';
const NOTE_PATH = 'Journal/MyNote.md';
const parser = new ImageLinkParser();

describe('hasLocalImageReference', () => {
	it('returns false when the only local ref is excluded', () => {
		const content = '![[photo.png]]';
		const excluded = parser.parse(content)[0];
		if (!excluded) {
			throw new Error('Expected image ref');
		}

		expect(hasLocalImageReference(baseInput({
			exclude: { noteFilePath: NOTE_PATH, start: excluded.start },
			notes: [{ content, path: NOTE_PATH }]
		}))).toBe(false);
	});

	it('returns true when another occurrence of the same file remains', () => {
		const content = '![[photo.png]] then ![[photo.png]]';
		const excluded = parser.parse(content)[0];
		if (!excluded) {
			throw new Error('Expected image ref');
		}

		expect(hasLocalImageReference(baseInput({
			exclude: { noteFilePath: NOTE_PATH, start: excluded.start },
			notes: [{ content, path: NOTE_PATH }]
		}))).toBe(true);
	});

	it('ignores a rewritten snowflake CDN url as a remaining local ref', () => {
		expect(hasLocalImageReference(baseInput({
			notes: [{
				content: '![](https://cdn.lantai.pkmer.cn/u1/1758.webp)',
				path: NOTE_PATH
			}]
		}))).toBe(false);
	});

	it('returns true when another note still embeds the local file', () => {
		const content = '![[photo.png]]';
		const excluded = parser.parse(content)[0];
		if (!excluded) {
			throw new Error('Expected image ref');
		}

		expect(hasLocalImageReference(baseInput({
			exclude: { noteFilePath: NOTE_PATH, start: excluded.start },
			notes: [
				{ content, path: NOTE_PATH },
				{ content: 'see ![[photo.png]]', path: 'Journal/Other.md' }
			]
		}))).toBe(true);
	});
});

function baseInput(
	partial: Partial<HasLocalImageReferenceInput> & Pick<HasLocalImageReferenceInput, 'notes'>
): HasLocalImageReferenceInput {
	return {
		localPath: LOCAL_PATH,
		parse: (content: string) => parser.parse(content),
		resolvePath,
		...partial
	};
}

function resolvePath(target: string, _noteFilePath: string): null | string {
	const fileName = target.split('/').at(-1) ?? target;
	return fileName === 'photo.png' ? LOCAL_PATH : null;
}
