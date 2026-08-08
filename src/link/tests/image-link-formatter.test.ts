import {
	describe,
	expect,
	it
} from 'vitest';

import { ImageLinkFormatter } from '../image-link-formatter.ts';

describe('ImageLinkFormatter', () => {
	it('forces markdown for remote targets even when style is wiki', () => {
		const formatter = new ImageLinkFormatter();
		expect(
			formatter.format({ linkStyle: 'wiki', target: 'https://cdn.example.com/a.png' })
		).toBe('![](https://cdn.example.com/a.png)');
	});

	it('uses wiki for local when style is wiki', () => {
		expect(new ImageLinkFormatter().format({ linkStyle: 'wiki', target: 'a/b.png' })).toBe(
			'![[a/b.png]]'
		);
	});
});
