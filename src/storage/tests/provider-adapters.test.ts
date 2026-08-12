import {
	describe,
	expect,
	it
} from 'vitest';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { StorageSecrets } from '../storage-secrets.ts';

import { AlibabaOssProviderAdapter } from '../providers/alibaba.ts';
import { CloudflareR2ProviderAdapter } from '../providers/r2.ts';
import { S3CompatibleProviderAdapter } from '../providers/s3-compatible.ts';
import { AwsS3ProviderAdapter } from '../providers/s3.ts';
import { TencentCosProviderAdapter } from '../providers/tencent.ts';

const SECRETS: StorageSecrets = {
	accessKeyId: 'ak',
	secretAccessKey: 'sk'
};

describe('AwsS3ProviderAdapter', () => {
	it('derives the AWS endpoint from the region', () => {
		const connection = new AwsS3ProviderAdapter().createConnection(
			profile({ bucket: 'pics', region: 'eu-west-1' }),
			SECRETS
		);

		expect(connection).toEqual({
			accessKeyId: 'ak',
			bucket: 'pics',
			endpoint: 'https://s3.eu-west-1.amazonaws.com',
			forcePathStyle: false,
			publicBaseUrl: 'https://cdn.example.com',
			region: 'eu-west-1',
			secretAccessKey: 'sk'
		});
	});

	it('defaults the region to us-east-1', () => {
		const connection = new AwsS3ProviderAdapter().createConnection(profile({ bucket: 'pics' }), SECRETS);

		expect(connection.endpoint).toBe('https://s3.us-east-1.amazonaws.com');
		expect(connection.region).toBe('us-east-1');
	});
});

describe('S3CompatibleProviderAdapter', () => {
	it('uses the profile endpoint and defaults to path-style addressing', () => {
		const connection = new S3CompatibleProviderAdapter().createConnection(
			profile({ bucket: 'pics', endpoint: 'https://minio.example.com' }),
			SECRETS
		);

		expect(connection).toEqual({
			accessKeyId: 'ak',
			bucket: 'pics',
			endpoint: 'https://minio.example.com',
			forcePathStyle: true,
			publicBaseUrl: 'https://cdn.example.com',
			region: 'us-east-1',
			secretAccessKey: 'sk'
		});
	});

	it('respects an explicit forcePathStyle override', () => {
		const connection = new S3CompatibleProviderAdapter().createConnection(
			profile({ endpoint: 'https://minio.example.com', forcePathStyle: false }),
			SECRETS
		);

		expect(connection.forcePathStyle).toBe(false);
	});

	it('requires an endpoint', () => {
		expect(() => new S3CompatibleProviderAdapter().createConnection(profile({}), SECRETS))
			.toThrow('Endpoint is required for S3-compatible profiles.');
	});
});

describe('CloudflareR2ProviderAdapter', () => {
	it('derives the R2 endpoint from the account ID with path-style addressing', () => {
		const connection = new CloudflareR2ProviderAdapter().createConnection(
			profile({ accountId: 'abc123', bucket: 'pics' }),
			SECRETS
		);

		expect(connection).toEqual({
			accessKeyId: 'ak',
			bucket: 'pics',
			endpoint: 'https://abc123.r2.cloudflarestorage.com',
			forcePathStyle: true,
			publicBaseUrl: 'https://cdn.example.com',
			region: 'auto',
			secretAccessKey: 'sk'
		});
	});

	it('requires an account ID', () => {
		expect(() => new CloudflareR2ProviderAdapter().createConnection(profile({}), SECRETS))
			.toThrow('Account ID is required for Cloudflare R2 profiles.');
	});
});

describe('AlibabaOssProviderAdapter', () => {
	it('derives the OSS endpoint from the region', () => {
		const connection = new AlibabaOssProviderAdapter().createConnection(
			profile({ bucket: 'pics', region: 'cn-hangzhou' }),
			SECRETS
		);

		expect(connection).toEqual({
			accessKeyId: 'ak',
			bucket: 'pics',
			endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
			forcePathStyle: false,
			publicBaseUrl: 'https://cdn.example.com',
			region: 'cn-hangzhou',
			secretAccessKey: 'sk'
		});
	});

	it('requires a region', () => {
		expect(() => new AlibabaOssProviderAdapter().createConnection(profile({}), SECRETS))
			.toThrow('Region is required for Alibaba Cloud OSS profiles.');
	});
});

describe('TencentCosProviderAdapter', () => {
	it('derives the COS endpoint from the region', () => {
		const connection = new TencentCosProviderAdapter().createConnection(
			profile({
				bucket: 'pics-1250000000',
				publicBaseUrl: 'https://cdn.example.com',
				region: 'ap-guangzhou'
			}),
			SECRETS
		);

		expect(connection).toEqual({
			accessKeyId: 'ak',
			bucket: 'pics-1250000000',
			endpoint: 'https://cos.ap-guangzhou.myqcloud.com',
			forcePathStyle: false,
			publicBaseUrl: 'https://cdn.example.com',
			region: 'ap-guangzhou',
			secretAccessKey: 'sk'
		});
	});

	it('requires a region', () => {
		expect(() => new TencentCosProviderAdapter().createConnection(profile({}), SECRETS))
			.toThrow('Region is required for Tencent COS profiles.');
	});
});

function profile(overrides: Partial<StorageProfile>): StorageProfile {
	return {
		accessKeyIdSecretName: 'ak-secret',
		bucket: 'bucket',
		id: 'profile-id',
		name: 'Profile',
		objectKeyTemplate: '{noteFilePath}/{originalName}',
		provider: 's3',
		publicBaseUrl: 'https://cdn.example.com',
		secretAccessKeySecretName: 'sk-secret',
		...overrides
	};
}
