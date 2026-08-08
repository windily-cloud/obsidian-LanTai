import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { SystemImageClipboard } from '../system-image-clipboard.ts';

describe('SystemImageClipboard', () => {
	it('writes decoded image bytes to the Electron image clipboard', () => {
		const image = { isEmpty: vi.fn().mockReturnValue(false) };
		const createFromBuffer = vi.fn().mockReturnValue(image);
		const writeImage = vi.fn();
		const clipboard = new SystemImageClipboard({ createFromBuffer, writeImage });
		const bytes = new Uint8Array([1, 2, 3]);

		clipboard.copy(bytes);

		expect(createFromBuffer).toHaveBeenCalledWith(Buffer.from(bytes));
		expect(writeImage).toHaveBeenCalledWith(image);
	});

	it('rejects bytes Electron cannot decode as an image', () => {
		const clipboard = new SystemImageClipboard({
			createFromBuffer: vi.fn().mockReturnValue({
				isEmpty: () => {
					return true;
				}
			}),
			writeImage: vi.fn()
		});

		expect(() => {
			clipboard.copy(new Uint8Array([1, 2, 3]));
		}).toThrow(
			'The remote content could not be decoded as an image.'
		);
	});
});
