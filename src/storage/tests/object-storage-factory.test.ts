import {
	describe,
	expect,
	it
} from 'vitest';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from '../object-storage-transport.ts';

import { createObjectStorageFactory } from '../object-storage-factory.ts';

interface FakeTransportPushResponse {
	readonly body?: string;
	readonly status: number;
}

describe('createObjectStorageFactory', () => {
	it('builds R2 path-style storage from the provider adapter', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: [
				'<ListBucketResult>',
				'<Contents><Key>a.png</Key><Size>1</Size></Contents>',
				'<IsTruncated>false</IsTruncated>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		const create = createObjectStorageFactory(transport);

		const storage = await create(
			profile({
				accountId: 'acct',
				bucket: 'pics',
				provider: 'r2'
			}),
			{ accessKeyId: 'ak', secretAccessKey: 'sk' }
		);
		await expect(storage.exists('a.png')).resolves.toBe(true);

		expect(transport.singleRequest().url)
			.toBe('https://acct.r2.cloudflarestorage.com/pics?list-type=2&max-keys=2&prefix=a.png');
	});

	it('builds Tencent virtual-hosted COS storage', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
			status: 200
		});
		const create = createObjectStorageFactory(transport);

		const storage = await create(
			profile({
				bucket: 'pics-1250000000',
				provider: 'tencent',
				region: 'ap-guangzhou'
			}),
			{ accessKeyId: 'ak', secretAccessKey: 'sk' }
		);
		await expect(storage.exists('a.png')).resolves.toBe(false);

		expect(transport.singleRequest().url)
			.toBe('https://pics-1250000000.cos.ap-guangzhou.myqcloud.com/?list-type=2&max-keys=2&prefix=a.png');
	});
});

class FakeTransport implements ObjectStorageTransport {
	private readonly requests: ObjectStorageRequest[] = [];
	private readonly responses: ObjectStorageResponse[] = [];

	public push(response: FakeTransportPushResponse): void {
		this.responses.push({
			body: new TextEncoder().encode(response.body ?? ''),
			headers: {},
			status: response.status
		});
	}

	public send(request: ObjectStorageRequest): Promise<ObjectStorageResponse> {
		this.requests.push(request);
		const response = this.responses.shift();
		if (!response) {
			throw new Error('FakeTransport: no response queued');
		}
		return Promise.resolve(response);
	}

	public singleRequest(): ObjectStorageRequest {
		expect(this.requests).toHaveLength(1);
		const [request] = this.requests;
		if (!request) {
			throw new Error('FakeTransport: no request recorded');
		}
		return request;
	}
}

function profile(partial: Partial<StorageProfile> & Pick<StorageProfile, 'bucket' | 'provider'>): StorageProfile {
	return {
		accessKeyIdSecretName: 'ak',
		bucket: partial.bucket,
		id: 'p1',
		name: 'P',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: '${originalName}.${ext}',
		provider: partial.provider,
		publicBaseUrl: partial.publicBaseUrl ?? 'https://cdn.example.com',
		secretAccessKeySecretName: 'sk',
		...(partial.accountId === undefined ? {} : { accountId: partial.accountId }),
		...(partial.endpoint === undefined ? {} : { endpoint: partial.endpoint }),
		...(partial.forcePathStyle === undefined ? {} : { forcePathStyle: partial.forcePathStyle }),
		...(partial.region === undefined ? {} : { region: partial.region })
	};
}
