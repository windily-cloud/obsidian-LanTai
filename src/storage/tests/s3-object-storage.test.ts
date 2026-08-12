import {
	describe,
	expect,
	it
} from 'vitest';

import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from '../object-storage-transport.ts';
import type { S3Connection } from '../s3-connection.ts';

import { probeObjectExists } from '../probe-object-exists.ts';
import { S3ObjectStorage } from '../s3-object-storage.ts';

interface FakeTransportPushResponse {
	readonly body?: string;
	readonly headers?: Record<string, string>;
	readonly status: number;
}

const CONNECTION: S3Connection = {
	accessKeyId: 'ak',
	bucket: 'pics',
	endpoint: 'https://minio.example.com',
	forcePathStyle: true,
	publicBaseUrl: 'https://cdn.example.com',
	region: 'us-east-1',
	secretAccessKey: 'sk'
};

describe('S3ObjectStorage.upload', () => {
	it('sends a signed PUT with the bytes as body', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 200 });
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await storage.upload('images/cat.png', new Uint8Array([1, 2, 3]));

		const request = transport.singleRequest();
		expect(request.method).toBe('PUT');
		expect(request.url).toBe('https://minio.example.com/pics/images/cat.png');
		expect(request.headers['content-type']).toBe('image/png');
		expect(request.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=ak\//u);
		expect(request.headers['x-amz-date']).toBeDefined();
		expect(request.headers['x-amz-content-sha256']).toBe(
			await sha256Hex(new Uint8Array([1, 2, 3]))
		);
		expect(request.body).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('maps a rejected upload to a storage error', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>',
			status: 403
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(storage.upload('images/cat.png', new Uint8Array([1])))
			.rejects.toMatchObject({ code: 'Unauthorized', message: 'Access Denied' });
	});

	it('keeps ! percent-encoded as %21 on the wire URL', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 200 });
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await storage.upload('images/Follow me!.jpg', new Uint8Array([1]));

		const request = transport.singleRequest();
		expect(request.url).toBe('https://minio.example.com/pics/images/Follow%20me%21.jpg');
		expect(request.url).not.toContain('me!');
	});
});

describe('S3ObjectStorage.exists', () => {
	it('lists with prefix and returns true on an exact key match', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: [
				'<ListBucketResult>',
				'<Contents><Key>images/cat.png</Key><Size>10</Size></Contents>',
				'<IsTruncated>false</IsTruncated>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(storage.exists('images/cat.png')).resolves.toBe(true);
		const request = transport.singleRequest();
		expect(request.method).toBe('GET');
		expect(request.url).toContain('list-type=2');
		expect(request.url).toContain(`prefix=${encodeURIComponent('images/cat.png')}`);
		expect(request.url).toContain('max-keys=2');
	});

	it('returns false when the list answers 404', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 404 });
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(storage.exists('images/cat.png')).resolves.toBe(false);
	});

	it('returns false when the prefix list is empty', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',
			status: 200
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(storage.exists('images/cat.png')).resolves.toBe(false);
	});

	it('ignores longer keys that only share the prefix', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: [
				'<ListBucketResult>',
				'<Contents><Key>images/cat.png.bak</Key><Size>10</Size></Contents>',
				'<IsTruncated>false</IsTruncated>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(storage.exists('images/cat.png')).resolves.toBe(false);
	});

	it('throws mapped errors so the probe can soften permission failures', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>',
			status: 403
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(probeObjectExists(storage, 'images/cat.png')).resolves.toBeNull();
	});
});

describe('S3ObjectStorage.delete', () => {
	it('sends a signed DELETE', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 204 });
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await storage.delete('images/cat.png');

		const request = transport.singleRequest();
		expect(request.method).toBe('DELETE');
		expect(request.url).toBe('https://minio.example.com/pics/images/cat.png');
	});

	it('rejects with a mapped error on failure', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 500 });
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		await expect(storage.delete('images/cat.png'))
			.rejects.toMatchObject({ code: 'Provider' });
	});
});

describe('S3ObjectStorage.buildPublicUrl', () => {
	it('joins publicBaseUrl when set (files-sdk url() public path)', async () => {
		const storage = new S3ObjectStorage({
			connection: CONNECTION,
			transport: new FakeTransport()
		});

		await expect(storage.buildPublicUrl('images/cat.png'))
			.resolves.toBe('https://cdn.example.com/images/cat.png');
	});

	it('returns a query-signed GET URL when publicBaseUrl is empty', async () => {
		const storage = new S3ObjectStorage({
			connection: { ...CONNECTION, publicBaseUrl: '' },
			transport: new FakeTransport()
		});

		const url = await storage.buildPublicUrl('images/cat.png');
		expect(url).toContain('https://minio.example.com/pics/images/cat.png');
		expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
		expect(url).toContain('X-Amz-Signature=');
		expect(url).toContain('X-Amz-Expires=3600');
	});

	it('treats a whitespace-only publicBaseUrl as unset', async () => {
		const storage = new S3ObjectStorage({
			connection: { ...CONNECTION, publicBaseUrl: '  ' },
			transport: new FakeTransport()
		});

		const url = await storage.buildPublicUrl('images/cat.png');
		expect(url).toContain('X-Amz-Signature=');
	});
});

describe('S3ObjectStorage.list', () => {
	it('GETs list-type=2 and parses Contents into items', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: [
				'<?xml version="1.0"?><ListBucketResult>',
				'<Contents><Key>a.png</Key><Size>10</Size>',
				'<LastModified>2024-01-02T03:04:05.000Z</LastModified></Contents>',
				'<Contents><Key>b.png</Key><Size>20</Size></Contents>',
				'<IsTruncated>false</IsTruncated>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		const result = await storage.list({ limit: 100 });

		const request = transport.singleRequest();
		expect(request.method).toBe('GET');
		expect(request.url).toContain('list-type=2');
		expect(request.url).toContain('max-keys=100');
		expect(request.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 /u);
		expect(result.items).toEqual([
			{ key: 'a.png', lastModified: Date.parse('2024-01-02T03:04:05.000Z'), size: 10 },
			{ key: 'b.png', size: 20 }
		]);
		expect(result.cursor).toBeUndefined();
	});

	it('surfaces NextContinuationToken as cursor when truncated', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: [
				'<ListBucketResult>',
				'<Contents><Key>a.png</Key><Size>1</Size></Contents>',
				'<IsTruncated>true</IsTruncated>',
				'<NextContinuationToken>tok-2</NextContinuationToken>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		const result = await storage.list({ cursor: 'tok-1' });

		expect(transport.singleRequest().url).toContain('continuation-token=tok-1');
		expect(result.cursor).toBe('tok-2');
	});
});

describe('S3ObjectStorage.search', () => {
	it('paginates list and yields case-insensitive substring matches', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: [
				'<ListBucketResult>',
				'<Contents><Key>Photos/Cat.png</Key><Size>1</Size></Contents>',
				'<Contents><Key>other.txt</Key><Size>2</Size></Contents>',
				'<IsTruncated>true</IsTruncated>',
				'<NextContinuationToken>next</NextContinuationToken>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		transport.push({
			body: [
				'<ListBucketResult>',
				'<Contents><Key>docs/cat-notes.md</Key><Size>3</Size></Contents>',
				'<IsTruncated>false</IsTruncated>',
				'</ListBucketResult>'
			].join(''),
			status: 200
		});
		const storage = new S3ObjectStorage({ connection: CONNECTION, transport });

		const keys: string[] = [];
		for await (const file of storage.search('CAT')) {
			keys.push(file.key);
		}

		expect(keys).toEqual(['Photos/Cat.png', 'docs/cat-notes.md']);
		expect(transport.requestCount()).toBe(2);
	});
});

class FakeTransport implements ObjectStorageTransport {
	private readonly requests: ObjectStorageRequest[] = [];
	private readonly responses: ObjectStorageResponse[] = [];

	public push(response: FakeTransportPushResponse): void {
		this.responses.push({
			body: new TextEncoder().encode(response.body ?? ''),
			headers: response.headers ?? {},
			status: response.status
		});
	}

	public requestCount(): number {
		return this.requests.length;
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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const copy = new Uint8Array(bytes);
	const digest = await crypto.subtle.digest('SHA-256', copy);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}
