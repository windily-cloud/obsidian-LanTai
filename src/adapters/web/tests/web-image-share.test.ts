import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { WebImageShare } from '../web-image-share.ts';

describe('WebImageShare', () => {
	it('shares a file when the web share API is available', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const adapter = new WebImageShare({ share });
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);

		await adapter.shareFile({ bytes, name: 'photo.png' });

		expect(share).toHaveBeenCalledTimes(1);
		const data = share.mock.calls[0]?.[0] as ShareData;
		expect(data.files?.[0]?.name).toBe('photo.png');
	});

	it('shares a URL', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		const adapter = new WebImageShare({ share });

		await adapter.shareUrl('https://cdn.example.com/a.png');

		expect(share).toHaveBeenCalledWith({ url: 'https://cdn.example.com/a.png' });
	});
});
