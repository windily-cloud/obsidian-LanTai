import {
	describe,
	expect,
	it,
	vi
} from 'vitest';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';

import {
	formatConnectionTestReport,
	testStorageConnection
} from '../test-storage-connection.ts';
import { FakeObjectStorage } from './fake-object-storage.ts';

function profile(partial?: Partial<StorageProfile>): StorageProfile {
	return {
		accessKeyIdSecretName: 'ak',
		bucket: 'my-bucket',
		id: 'p1',
		name: 'Test',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: 'https://cdn.example.com',
		secretAccessKeySecretName: 'sk',
		...partial
	};
}

describe('testStorageConnection', () => {
	it('fails when secrets are missing', async () => {
		const report = await testStorageConnection({
			createStorage: vi.fn(),
			getSecret: () => null,
			profile: profile()
		});
		expect(report.ok).toBe(false);
		expect(report.checks[0]).toMatchObject({ id: 'secrets', status: 'fail' });
	});

	it('reports head/list/upload separately when head and list are denied', async () => {
		const storage = new FakeObjectStorage({
			existsError: Object.assign(new Error('UnknownError'), { code: 'Unknown' }),
			listError: Object.assign(new Error('Access Denied'), { code: 'AccessDenied' }),
			publicBaseUrl: 'https://cdn.example.com'
		});
		const report = await testStorageConnection({
			createStorage: () => Promise.resolve(storage),
			getSecret: (name) => (name === 'ak' ? 'AK' : 'SK'),
			profile: profile()
		});
		expect(report.ok).toBe(false);
		expect(report.checks.find((check) => check.id === 'secrets')?.status).toBe('pass');
		expect(report.checks.find((check) => check.id === 'client')?.status).toBe('pass');
		expect(report.checks.find((check) => check.id === 'head')?.status).toBe('fail');
		expect(report.checks.find((check) => check.id === 'list')?.status).toBe('fail');
		expect(report.checks.find((check) => check.id === 'upload')?.status).toBe('pass');
	});

	it('passes when all probes succeed', async () => {
		const storage = new FakeObjectStorage({ publicBaseUrl: 'https://cdn.example.com' });
		const report = await testStorageConnection({
			createStorage: () => Promise.resolve(storage),
			getSecret: (name) => (name === 'ak' ? 'AK' : 'SK'),
			profile: profile()
		});
		expect(report.ok).toBe(true);
		expect(formatConnectionTestReport(report)).toContain('upload: OK');
		expect(storage.deletedKeys.length).toBe(1);
	});
});
