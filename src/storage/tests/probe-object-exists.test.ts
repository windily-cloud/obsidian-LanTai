import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import {
	isPermissionProbeError,
	probeObjectExists
} from '../probe-object-exists.ts';

describe('isPermissionProbeError', () => {
	it('recognizes AccessDenied, Unauthorized, and UnknownError', () => {
		expect(isPermissionProbeError(Object.assign(new Error('Access Denied'), { code: 'AccessDenied' }))).toBe(true);
		expect(isPermissionProbeError(Object.assign(new Error('UnknownError'), { code: 'Unauthorized' }))).toBe(true);
		expect(isPermissionProbeError(new Error('UnknownError'))).toBe(true);
		expect(isPermissionProbeError(new Error('Access Denied'))).toBe(true);
	});

	it('rejects unrelated errors', () => {
		expect(isPermissionProbeError(new Error('Bucket not found'))).toBe(false);
		expect(isPermissionProbeError(new Error('Network timeout'))).toBe(false);
		expect(isPermissionProbeError('string')).toBe(false);
	});

	it('walks cause chains', () => {
		const cause = Object.assign(new Error('Access Denied'), { code: 'AccessDenied' });
		const outer = new Error('FilesError: Access Denied', { cause });
		expect(isPermissionProbeError(outer)).toBe(true);
	});
});

describe('probeObjectExists', () => {
	it('returns true/false from exists', async () => {
		expect(await probeObjectExists({ exists: vi.fn().mockResolvedValue(true) }, 'a.png')).toBe(true);
		expect(await probeObjectExists({ exists: vi.fn().mockResolvedValue(false) }, 'a.png')).toBe(false);
	});

	it('returns null when exists throws a permission error', async () => {
		const result = await probeObjectExists({
			exists: vi.fn().mockRejectedValue(Object.assign(new Error('UnknownError'), { code: 'Unknown' }))
		}, 'a.png');
		expect(result).toBeNull();
	});

	it('rethrows non-permission errors', async () => {
		await expect(
			probeObjectExists({
				exists: vi.fn().mockRejectedValue(new Error('Bucket not found'))
			}, 'a.png')
		).rejects.toThrow('Bucket not found');
	});
});
