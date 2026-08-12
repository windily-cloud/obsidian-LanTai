import {
	describe,
	expect,
	it
} from 'vitest';

import type { RequestUrlLike } from '../request-url-object-storage-transport.ts';

import { RequestUrlObjectStorageTransport } from '../request-url-object-storage-transport.ts';

interface CapturedRequestUrlCall {
	readonly body?: ArrayBuffer;
	readonly contentType?: string;
	readonly headers?: Record<string, string>;
	readonly method?: string;
	readonly throw?: boolean;
	readonly url: string;
}

interface RequestUrlStubResult {
	readonly arrayBuffer: ArrayBuffer;
	readonly headers: Record<string, string>;
	readonly status: number;
}

describe('RequestUrlObjectStorageTransport', () => {
	it('forwards method, url, headers, and body with throw:false', async () => {
		const calls: CapturedRequestUrlCall[] = [];
		const transport = new RequestUrlObjectStorageTransport({
			requestUrl: captureRequestUrl(calls, {
				arrayBuffer: new Uint8Array([9]).buffer,
				headers: { 'Content-Type': 'text/plain', 'X-Amz-Id': '1' },
				status: 200
			})
		});

		const response = await transport.send({
			body: new Uint8Array([1, 2]),
			headers: { 'authorization': 'sig', 'content-type': 'application/octet-stream' },
			method: 'PUT',
			url: 'https://example.com/bucket/key'
		});

		expect(calls).toEqual([{
			body: new Uint8Array([1, 2]).buffer,
			contentType: 'application/octet-stream',
			headers: { 'authorization': 'sig', 'content-type': 'application/octet-stream' },
			method: 'PUT',
			throw: false,
			url: 'https://example.com/bucket/key'
		}]);
		expect(response.status).toBe(200);
		expect(response.body).toEqual(new Uint8Array([9]));
		expect(response.headers).toEqual({
			'content-type': 'text/plain',
			'x-amz-id': '1'
		});
	});

	it('returns non-2xx status without throwing so callers can map errors', async () => {
		const transport = new RequestUrlObjectStorageTransport({
			requestUrl: captureRequestUrl([], {
				arrayBuffer: new TextEncoder().encode('<Error><Code>AccessDenied</Code></Error>').buffer,
				headers: {},
				status: 403
			})
		});

		const response = await transport.send({
			headers: {},
			method: 'HEAD',
			url: 'https://example.com/bucket/missing'
		});

		expect(response.status).toBe(403);
		expect(new TextDecoder().decode(response.body)).toContain('AccessDenied');
	});

	it('strips hop-by-hop headers that requestUrl/OkHttp set themselves', async () => {
		const calls: CapturedRequestUrlCall[] = [];
		const transport = new RequestUrlObjectStorageTransport({
			requestUrl: captureRequestUrl(calls, emptyOk())
		});

		await transport.send({
			body: new Uint8Array([1, 2, 3]),
			headers: {
				'Authorization': 'AWS4-HMAC-SHA256 Credential=ak',
				'Connection': 'keep-alive',
				'Content-Length': '3',
				'Content-Type': 'image/png',
				'Expect': '100-continue',
				'Host': 'bucket.s3.amazonaws.com',
				'Transfer-Encoding': 'chunked',
				'X-Amz-Content-Sha256': 'abc',
				'X-Amz-Date': '20260101T000000Z'
			},
			method: 'PUT',
			url: 'https://bucket.s3.amazonaws.com/key'
		});

		expect(calls[0]?.headers).toEqual({
			'authorization': 'AWS4-HMAC-SHA256 Credential=ak',
			'content-type': 'image/png',
			'x-amz-content-sha256': 'abc',
			'x-amz-date': '20260101T000000Z'
		});
		expect(calls[0]?.contentType).toBe('image/png');
	});

	it('omits contentType when the request has no content-type header', async () => {
		const calls: CapturedRequestUrlCall[] = [];
		const transport = new RequestUrlObjectStorageTransport({
			requestUrl: captureRequestUrl(calls, emptyOk())
		});

		await transport.send({
			headers: {},
			method: 'HEAD',
			url: 'https://example.com/bucket/key'
		});

		expect(calls[0]).not.toHaveProperty('contentType');
		expect(calls[0]?.body).toBeUndefined();
	});

	it('copies an offset Uint8Array view into a standalone ArrayBuffer', async () => {
		const calls: CapturedRequestUrlCall[] = [];
		const transport = new RequestUrlObjectStorageTransport({
			requestUrl: captureRequestUrl(calls, emptyOk())
		});
		const pool = new Uint8Array([0, 0, 9, 8, 7, 0]);
		const view = pool.subarray(2, 5);

		await transport.send({
			body: view,
			headers: { 'content-type': 'application/octet-stream' },
			method: 'PUT',
			url: 'https://example.com/bucket/key'
		});

		const body = calls[0]?.body;
		expect(body).toBeInstanceOf(ArrayBuffer);
		expect(body?.byteLength).toBe(3);
		expect(new Uint8Array(body ?? new ArrayBuffer(0))).toEqual(new Uint8Array([9, 8, 7]));
		expect(body).not.toBe(pool.buffer);
	});
});

function captureRequestUrl(
	calls: CapturedRequestUrlCall[],
	result: RequestUrlStubResult
): RequestUrlLike {
	return (params): Promise<RequestUrlStubResult> => {
		calls.push(params);
		return Promise.resolve(result);
	};
}

function emptyOk(): RequestUrlStubResult {
	return {
		arrayBuffer: new ArrayBuffer(0),
		headers: {},
		status: 200
	};
}
