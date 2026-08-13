import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { coordinateUploadModes } from '../upload-conflict-coordinator.ts';

describe('coordinateUploadModes', () => {
	it('maps free and unknown to upload without prompting', async () => {
		const confirmOverwrite = vi.fn();
		await expect(coordinateUploadModes({
			classes: ['free', 'unknown'],
			confirmOverwrite,
			sameMode: 'linkOnly'
		})).resolves.toEqual(['upload', 'upload']);
		expect(confirmOverwrite).not.toHaveBeenCalled();
	});

	it('maps same to the provided sameMode without prompting', async () => {
		await expect(coordinateUploadModes({
			classes: ['same', 'same'],
			confirmOverwrite: vi.fn(),
			sameMode: 'skip'
		})).resolves.toEqual(['skip', 'skip']);
	});

	it('asks once and overwrites all different items when confirmed', async () => {
		const confirmOverwrite = vi.fn().mockResolvedValue(true);
		await expect(coordinateUploadModes({
			classes: ['free', 'different', 'same', 'different'],
			confirmOverwrite,
			sameMode: 'linkOnly'
		})).resolves.toEqual(['upload', 'overwrite', 'linkOnly', 'overwrite']);
		expect(confirmOverwrite).toHaveBeenCalledExactlyOnceWith(2);
	});

	it('skips different items when overwrite is declined', async () => {
		const confirmOverwrite = vi.fn().mockResolvedValue(false);
		await expect(coordinateUploadModes({
			classes: ['different', 'free', 'same'],
			confirmOverwrite,
			sameMode: 'linkOnly'
		})).resolves.toEqual(['skip', 'upload', 'linkOnly']);
		expect(confirmOverwrite).toHaveBeenCalledExactlyOnceWith(1);
	});
});
