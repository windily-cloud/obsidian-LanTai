import {
	describe,
	expect,
	it
} from 'vitest';

import { ImageLinkFormatter } from '../image-link-formatter.ts';
import { ImageLinkParser } from '../image-link-parser.ts';
import { ImageLinkService } from '../image-link-service.ts';

describe('ImageLinkService', () => {
	const service = new ImageLinkService(new ImageLinkParser(), new ImageLinkFormatter());

	it('replaces a single image source', () => {
		const ref = service.parse('before ![[old.png]] after')[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}
		const next = service.replace(
			'before ![[old.png]] after',
			ref,
			'https://cdn.example.com/new.png',
			'wiki'
		);
		expect(next).toBe('before ![](https://cdn.example.com/new.png) after');
	});

	it('replaces only the selected repeated occurrence', () => {
		const source = '![[same.png]] then ![[same.png]]';
		const ref = service.parse(source)[1];
		if (!ref) {
			throw new Error('Expected second image ref');
		}

		expect(service.replace(source, ref, 'new.png', 'wiki')).toBe(
			'![[same.png]] then ![[new.png]]'
		);
	});

	it('converts local wiki images to markdown', () => {
		expect(service.convertNote('x ![[a.png]] y', 'markdown')).toBe('x ![](a.png) y');
	});

	it.each(
		[
			['![[image.png]]', 'center', '![[image.png|center]]'],
			['![caption](image.png)', 'left', '![caption|left](image.png)'],
			['![](https://cdn.example.com/image.png)', 'right', '![|right](https://cdn.example.com/image.png)']
		] as const
	)('sets %s layout to %s', (source, layout, expected) => {
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}
		expect(service.setLayout(source, ref, layout)).toBe(expected);
	});

	it('preserves aliases and keeps size last while replacing an existing layout', () => {
		const source = '![[image.png|alias|300|left]] and ![caption|250|right](other.png)';
		const refs = service.parse(source);
		const wikiRef = refs[0];
		if (!wikiRef) {
			throw new Error('Expected wiki image ref');
		}

		const wikiUpdated = service.setLayout(source, wikiRef, 'center');
		expect(wikiUpdated).toBe('![[image.png|alias|center|300]] and ![caption|250|right](other.png)');

		const markdownRef = service.parse(wikiUpdated)[1];
		if (!markdownRef) {
			throw new Error('Expected Markdown image ref');
		}
		expect(service.setLayout(wikiUpdated, markdownRef, 'left')).toBe(
			'![[image.png|alias|center|300]] and ![caption|left|250](other.png)'
		);
	});

	it.each(
		[
			['![[image.png|300]]', '![[image.png|center|300]]'],
			['![|32x54|left](image.png)', '![|center|32x54](image.png)'],
			['![|left|41x41](image.png)', '![|center|41x41](image.png)'],
			[
				'![caption|left|41x41|right](image.png)',
				'![caption|center|41x41](image.png)'
			],
			['![[image.png|left|41x41]]', '![[image.png|center|41x41]]'],
			[
				'![[image.png|100|left|right|alias]]',
				'![[image.png|center|alias|100]]'
			]
		] as const
	)('keeps size last when setting layout for %s', (source, expected) => {
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}

		expect(service.setLayout(source, ref, 'center')).toBe(expected);
	});

	it.each(
		[
			['![|32x54|left](image.png)', 'left'],
			['![|left|41x41](image.png)', 'left'],
			['![caption|left|41x41|right](image.png)', 'left'],
			['![[image.png|100|center|alias]]', 'center']
		] as const
	)('detects the first layout field in %s', (source, expected) => {
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}

		expect(service.getLayout(ref)).toBe(expected);
	});

	it('preserves Markdown alt text that equals a layout name', () => {
		const source = '![left](image.png)';
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}

		expect(service.getLayout(ref)).toBeNull();
		expect(service.setLayout(source, ref, 'center')).toBe('![left|center](image.png)');
	});

	it('preserves a Markdown image title when setting layout', () => {
		const source = '![caption](image.png "Image title")';
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}

		expect(service.setLayout(source, ref, 'right')).toBe(
			'![caption|right](image.png "Image title")'
		);
	});

	it('updates only the selected occurrence of a repeated image', () => {
		const source = '![[same.png]] then ![[same.png]]';
		const second = service.parse(source)[1];
		if (!second) {
			throw new Error('Expected second image ref');
		}

		expect(service.setLayout(source, second, 'right')).toBe(
			'![[same.png]] then ![[same.png|right]]'
		);
	});

	it.each(
		[
			['![[image.png|300]]', true],
			['![[image.png|alias|32x54|left]]', true],
			['![caption|250](image.png)', true],
			['![[image.png|left]]', false],
			['![caption](image.png)', false]
		] as const
	)('detects size decorations in %s', (source, expected) => {
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}
		expect(service.hasSize(ref)).toBe(expected);
	});

	it.each(
		[
			['![[image.png|alias|300|left]]', '![[image.png|alias|left]]'],
			['![caption|250|right](other.png)', '![caption|right](other.png)'],
			['![|32x54|left](image.png)', '![|left](image.png)'],
			['![[image.png|100|center|alias]]', '![[image.png|center|alias]]']
		] as const
	)('resets size fields in %s', (source, expected) => {
		const ref = service.parse(source)[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}
		expect(service.formatResetSize(ref)).toBe(expected);
	});

	it('formats remove-embed as an empty replacement', () => {
		const ref = service.parse('before ![[image.png]] after')[0];
		if (!ref) {
			throw new Error('Expected image ref');
		}
		expect(service.formatRemoveEmbed()).toBe('');
	});
});
