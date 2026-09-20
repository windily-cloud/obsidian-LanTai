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

	it('keeps percent-encoded pipes inside a wiki target', () => {
		const refs = parser.parse('![[其中包括图片：hero %7C cute-anime.png]]');
		expect(refs[0]?.target).toBe('其中包括图片：hero %7C cute-anime.png');
		expect(refs[0]?.decorations).toEqual([]);
	});

	describe('markdown context', () => {
		it('skips images inside a backtick fence', () => {
			const markdown = [
				'```markdown',
				'![[skip.png]]',
				'![x](skip.png)',
				'```',
				'![[keep.png]]'
			].join('\n');

			expect(targets(markdown)).toEqual(['keep.png']);
		});

		it('skips images inside a tilde fence', () => {
			const markdown = [
				'~~~markdown',
				'![[skip.png]]',
				'~~~',
				'![[keep.png]]'
			].join('\n');

			expect(targets(markdown)).toEqual(['keep.png']);
		});

		it('treats an unclosed fence as code through the rest of the note', () => {
			expect(targets(['```', '![[skip.png]]', '![[also.png]]'].join('\n'))).toEqual([]);
		});

		it('skips images inside inline code', () => {
			expect(targets('`![[skip.png]]` ![[keep.png]] `![x](skip.png)`')).toEqual(['keep.png']);
		});

		it('skips images inside a math block', () => {
			const markdown = [
				'$$',
				'![[skip.png]]',
				'![x](skip.png)',
				'$$',
				'![[keep.png]]'
			].join('\n');

			expect(targets(markdown)).toEqual(['keep.png']);
		});

		it('skips images inside inline math', () => {
			expect(targets('$![[skip.png]]$ ![[keep.png]] $![x](skip.png)$')).toEqual(['keep.png']);
		});

		it('does not treat currency dollar amounts as math', () => {
			expect(targets('Cost is $5 ![[keep.png]] and $10.')).toEqual(['keep.png']);
		});

		it('skips images in a footnote definition and its indented continuation', () => {
			const markdown = [
				'See the note.[^1]',
				'[^1]: ![[skip.png]]',
				'    ![[also-skip.png]]',
				'![[keep.png]]'
			].join('\n');

			expect(targets(markdown)).toEqual(['keep.png']);
		});

		it('skips images inside an inline footnote', () => {
			expect(targets('^[see ![[skip.png]]] ![[keep.png]]')).toEqual(['keep.png']);
		});

		it('parses a body image that only has a footnote marker after it', () => {
			expect(targets('![[keep.png]][^1]')).toEqual(['keep.png']);
		});

		it('parses images inside a table', () => {
			const markdown = [
				'| pic | other |',
				'| --- | --- |',
				'| ![[keep-wiki.png]] | ![x](keep-md.png) |'
			].join('\n');

			expect(targets(markdown)).toEqual(['keep-wiki.png', 'keep-md.png']);
		});

		it('parses images inside a callout', () => {
			const markdown = [
				'> [!note]',
				'> ![[keep.png]]'
			].join('\n');

			expect(targets(markdown)).toEqual(['keep.png']);
		});

		it('parses images inside a blockquote', () => {
			expect(targets('> ![[keep.png]]')).toEqual(['keep.png']);
		});

		it('parses keep contexts and skips protected ones in one note', () => {
			const markdown = [
				'```markdown',
				'![[skip-fence.png]]',
				'```',
				'`![[skip-inline-code.png]]`',
				'$$',
				'![[skip-math-block.png]]',
				'$$',
				'$![[skip-inline-math.png]]$',
				'[^1]: ![[skip-footnote.png]]',
				'^[see ![[skip-inline-footnote.png]]]',
				'| pic |',
				'| --- |',
				'| ![[keep-table.png]] |',
				'> [!note]',
				'> ![[keep-callout.png]]',
				'> ![[keep-quote.png]]',
				'![[keep-body.png]][^1]'
			].join('\n');

			expect(targets(markdown)).toEqual([
				'keep-table.png',
				'keep-callout.png',
				'keep-quote.png',
				'keep-body.png'
			]);
		});
	});
});

function targets(markdown: string): string[] {
	return new ImageLinkParser().parse(markdown).map((ref) => ref.target);
}
