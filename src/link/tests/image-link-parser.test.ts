import {
	describe,
	expect,
	it
} from 'vitest';

import { ImageLinkParser } from '../image-link-parser.ts';

describe('ImageLinkParser', () => {
	const parser = new ImageLinkParser();

	it('parses markdown and wiki image links', () => {
		const md = [
			'![a](folder/photo.png)',
			'![[other.png]]',
			'![r](https://cdn.example.com/x/y.png?q=1)'
		].join('\n');
		const refs = parser.parse(md);
		expect(refs).toHaveLength(3);
		expect(refs[0]).toMatchObject({
			isRemote: false,
			kind: 'markdown',
			target: 'folder/photo.png'
		});
		expect(refs[1]).toMatchObject({
			isRemote: false,
			kind: 'wiki',
			target: 'other.png'
		});
		expect(refs[2]).toMatchObject({
			isRemote: true,
			kind: 'markdown',
			target: 'https://cdn.example.com/x/y.png?q=1'
		});
	});

	it('parses remote url without file extension', () => {
		const refs = parser.parse('![](https://cdn.example.com/image/abc)');
		expect(refs[0]?.target).toBe('https://cdn.example.com/image/abc');
		expect(refs[0]?.isRemote).toBe(true);
	});

	it('parses a Markdown image title', () => {
		const ref = parser.parse('![caption](image.png "Image title")')[0];

		expect(ref).toMatchObject({
			markdownTitle: '"Image title"',
			target: 'image.png'
		});
	});

	it('preserves source ranges and link decorations', () => {
		const markdown = 'x ![caption|300](photo.png) y ![[other.png|alias|250]]';
		const refs = parser.parse(markdown);

		expect(refs[0]).toMatchObject({
			decorations: ['caption', '300'],
			end: 27,
			start: 2
		});
		expect(markdown.slice(refs[0]?.start, refs[0]?.end)).toBe('![caption|300](photo.png)');
		expect(refs[1]).toMatchObject({
			decorations: ['alias', '250'],
			end: markdown.length,
			start: 30
		});
	});
});
