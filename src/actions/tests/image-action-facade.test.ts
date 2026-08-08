import {
	describe,
	expect,
	it
} from 'vitest';

import type { ImageRef } from '../../link/image-ref.ts';

import { classifyRefs } from '../image-action-facade.ts';

describe('classifyRefs', () => {
	it('separates local and remote image references while preserving order', () => {
		const refs: ImageRef[] = [
			{
				decorations: [],
				end: 14,
				isRemote: false,
				kind: 'wiki',
				markdownTitle: null,
				source: '![[local.png]]',
				start: 0,
				target: 'local.png'
			},
			{
				decorations: [],
				end: 25,
				isRemote: true,
				kind: 'markdown',
				markdownTitle: null,
				source: '![](https://example.com/a)',
				start: 0,
				target: 'https://example.com/a'
			},
			{
				decorations: [],
				end: 22,
				isRemote: false,
				kind: 'markdown',
				markdownTitle: null,
				source: '![](folder/second.jpg)',
				start: 0,
				target: 'folder/second.jpg'
			}
		];

		expect(classifyRefs(refs)).toEqual({
			local: [refs[0], refs[2]],
			remote: [refs[1]]
		});
	});
});
