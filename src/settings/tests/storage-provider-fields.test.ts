import {
	describe,
	expect,
	it
} from 'vitest';

import { StorageProviderFields } from '../helpers/storage-provider-fields.ts';

describe('StorageProviderFields', () => {
	it('requires endpoint for s3Compatible', () => {
		const fields = StorageProviderFields.fieldsFor('s3Compatible');
		expect(fields.some((f) => f.key === 'endpoint' && f.required)).toBe(true);
	});

	it('requires accountId for r2', () => {
		expect(StorageProviderFields.fieldsFor('r2').some((f) => f.key === 'accountId')).toBe(true);
	});

	it('orders s3 fields: bucket, publicBaseUrl, region, credentials, template', () => {
		expect(StorageProviderFields.fieldsFor('s3').map((f) => f.key)).toEqual([
			'bucket',
			'publicBaseUrl',
			'region',
			'accessKeyIdSecretName',
			'secretAccessKeySecretName',
			'objectKeyTemplate'
		]);
	});

	it('orders r2 fields with accountId after publicBaseUrl', () => {
		expect(StorageProviderFields.fieldsFor('r2').map((f) => f.key)).toEqual([
			'bucket',
			'publicBaseUrl',
			'accountId',
			'accessKeyIdSecretName',
			'secretAccessKeySecretName',
			'objectKeyTemplate'
		]);
	});

	it('orders s3Compatible fields with endpoint, region, forcePathStyle before credentials', () => {
		expect(StorageProviderFields.fieldsFor('s3Compatible').map((f) => f.key)).toEqual([
			'bucket',
			'publicBaseUrl',
			'endpoint',
			'region',
			'forcePathStyle',
			'accessKeyIdSecretName',
			'secretAccessKeySecretName',
			'objectKeyTemplate'
		]);
	});

	it('uses short labels for access key fields', () => {
		const fields = StorageProviderFields.fieldsFor('s3');
		expect(fields.find((f) => f.key === 'accessKeyIdSecretName')?.label).toBe('Access Key ID');
		expect(fields.find((f) => f.key === 'secretAccessKeySecretName')?.label).toBe(
			'Secret Access Key'
		);
	});
});
