import {
	describe,
	expect,
	it
} from 'vitest';

import { ImageLinkParser } from '../link/image-link-parser.ts';
import { findRenderedImageRef } from './resolve-rendered-image.ts';

/**
 * Compatibility suite kept next to the controller; matching logic lives in
 * resolve-rendered-image.ts (see resolve-rendered-image.test.ts for full coverage).
 */
describe('findRenderedImageRef (controller re-export)', () => {
	const parser = new ImageLinkParser();

	it('matches repeated rendered images to their corresponding source occurrence', () => {
		const root = createDiv();
		const firstImage = root.createEl('img', { attr: { src: 'same.png' } });
		const secondImage = root.createEl('img', { attr: { src: 'same.png' } });
		const refs = parser.parse('![[same.png]] then ![[same.png]]');

		expect(findRenderedImageRef(refs, firstImage, root)?.start).toBe(0);
		expect(findRenderedImageRef(refs, secondImage, root)?.start).toBe(19);
	});
});
