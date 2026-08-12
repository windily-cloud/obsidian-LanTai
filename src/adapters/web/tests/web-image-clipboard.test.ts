import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { WebImageClipboard } from '../web-image-clipboard.ts';

describe('WebImageClipboard', () => {
	it('writes PNG bytes as an image/png clipboard item', async () => {
		const writeItems = vi.fn().mockResolvedValue(undefined);
		const clipboard = new WebImageClipboard({ writeItems });
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

		await clipboard.copy(bytes);

		expect(writeItems).toHaveBeenCalledWith([
			{ bytes, type: 'image/png' }
		]);
	});

	it('writes JPEG bytes as an image/jpeg clipboard item', async () => {
		const writeItems = vi.fn().mockResolvedValue(undefined);
		const clipboard = new WebImageClipboard({ writeItems });
		const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);

		await clipboard.copy(bytes);

		expect(writeItems).toHaveBeenCalledWith([
			{ bytes, type: 'image/jpeg' }
		]);
	});
});
