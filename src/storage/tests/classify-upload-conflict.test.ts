import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import { classifyUploadConflict } from '../classify-upload-conflict.ts';

describe('classifyUploadConflict', () => {
	it('returns free when the object is absent', async () => {
		const result = await classifyUploadConflict({
			localBytes: new Uint8Array([1, 2, 3]),
			objectKey: 'a.png',
			storage: {
				download: vi.fn(),
				stat: vi.fn().mockResolvedValue(null)
			}
		});
		expect(result).toBe('free');
	});

	it('returns unknown when stat throws a permission error', async () => {
		const result = await classifyUploadConflict({
			localBytes: new Uint8Array([1]),
			objectKey: 'a.png',
			storage: {
				download: vi.fn(),
				stat: vi.fn().mockRejectedValue(
					Object.assign(new Error('UnknownError'), { code: 'Unknown' })
				)
			}
		});
		expect(result).toBe('unknown');
	});

	it('returns different when remote size differs', async () => {
		const download = vi.fn();
		const result = await classifyUploadConflict({
			localBytes: new Uint8Array([1, 2, 3]),
			objectKey: 'a.png',
			storage: {
				download,
				stat: vi.fn().mockResolvedValue({ size: 9 })
			}
		});
		expect(result).toBe('different');
		expect(download).not.toHaveBeenCalled();
	});

	it('returns same when size and bytes match', async () => {
		const localBytes = new Uint8Array([1, 2, 3]);
		const result = await classifyUploadConflict({
			localBytes,
			objectKey: 'a.png',
			storage: {
				download: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
				stat: vi.fn().mockResolvedValue({ size: 3 })
			}
		});
		expect(result).toBe('same');
	});

	it('returns different when size matches but bytes differ', async () => {
		const result = await classifyUploadConflict({
			localBytes: new Uint8Array([1, 2, 3]),
			objectKey: 'a.png',
			storage: {
				download: vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9])),
				stat: vi.fn().mockResolvedValue({ size: 3 })
			}
		});
		expect(result).toBe('different');
	});

	it('returns different when download fails after a size match', async () => {
		const result = await classifyUploadConflict({
			localBytes: new Uint8Array([1, 2, 3]),
			objectKey: 'a.png',
			storage: {
				download: vi.fn().mockRejectedValue(new Error('boom')),
				stat: vi.fn().mockResolvedValue({ size: 3 })
			}
		});
		expect(result).toBe('different');
	});
});
