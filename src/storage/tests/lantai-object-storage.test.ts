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

import { LanTaiObjectStorage } from '../lantai-object-storage.ts';

interface FakeResponse {
	body?: string;
	status: number;
}

class FakeTransport implements ObjectStorageTransport {
	public readonly requests: ObjectStorageRequest[] = [];
	private readonly responses: FakeResponse[] = [];

	public push(response: FakeResponse): void {
		this.responses.push(response);
	}

	public send(request: ObjectStorageRequest): Promise<ObjectStorageResponse> {
		this.requests.push(request);
		const next = this.responses.shift() ?? { status: 200 };
		return Promise.resolve({
			body: new TextEncoder().encode(next.body ?? ''),
			headers: {},
			status: next.status
		});
	}
}

function attachment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		contentType: 'image/png',
		createdAt: '2026-09-01T00:00:00.000Z',
		description: null,
		key: '1758000000000.png',
		name: 'photo.png',
		size: 1234,
		title: null,
		updatedAt: '2026-09-01T00:00:00.000Z',
		url: 'https://cdn.lantai.pkmer.cn/u1/1758000000000.png',
		...overrides
	};
}

function createStorage(transport: FakeTransport): LanTaiObjectStorage {
	// 故意带尾斜杠：构造器应当规范化掉
	return new LanTaiObjectStorage({
		apiKey: 'lt_test',
		baseUrl: 'https://lantai.pkmer.cn/',
		transport
	});
}

function requestAt(transport: FakeTransport, index: number): ObjectStorageRequest {
	const request = transport.requests[index];
	if (request === undefined) {
		throw new Error(`expected a request at index ${String(index)}`);
	}
	return request;
}

describe('LanTaiObjectStorage', () => {
	it('标记对象键由服务端生成', () => {
		expect(createStorage(new FakeTransport()).clientKeyed).toBe(false);
	});

	it('buildPublicUrl 取服务端下发的权威 URL，并带 Bearer 头', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ url: 'https://cdn/x.png' }), status: 200 });

		const url = await createStorage(transport).buildPublicUrl('notes/a.png');

		expect(url).toBe('https://cdn/x.png');
		const request = requestAt(transport, 0);
		expect(request.method).toBe('GET');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects/url?key=notes%2Fa.png');
		expect(request.headers['authorization']).toBe('Bearer lt_test');
	});

	it('upload 走 POST /api/v1/objects，忽略模板 key，用响应里的 key/url', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify(attachment()), status: 201 });

		const result = await createStorage(transport).upload({
			bytes: new Uint8Array([1, 2, 3]),
			objectKey: 'images/photo.png',
			originalName: 'photo.png'
		});

		expect(result).toEqual({
			key: '1758000000000.png',
			url: 'https://cdn.lantai.pkmer.cn/u1/1758000000000.png'
		});
		const request = requestAt(transport, 0);
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects');
		expect(request.headers['x-lantai-name']).toBe('photo.png');
		expect(request.headers['content-type']).toBe('image/png');
		// 模板 key 不出现在请求里
		expect(request.url).not.toContain('images');
	});

	it('upload 无 originalName 时按模板 key 的扩展名推 content-type', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify(attachment()), status: 201 });

		await createStorage(transport).upload({
			bytes: new Uint8Array([1]),
			objectKey: 'images/photo.webp'
		});

		const request = requestAt(transport, 0);
		expect(request.headers['content-type']).toBe('image/webp');
		expect(request.headers['x-lantai-name']).toBeUndefined();
	});

	it('stat 用 list + 前缀候选做精确比对，且不使用 HEAD', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: JSON.stringify({
				items: [attachment({ key: 'notes/a.png.bak', size: 1 }), attachment()]
			}),
			status: 200
		});

		const stat = await createStorage(transport).stat('1758000000000.png');

		expect(stat).toEqual({ size: 1234 });
		expect(requestAt(transport, 0).method).toBe('GET');
		expect(transport.requests.every((request) => request.method !== 'HEAD')).toBe(true);
	});

	it('stat 无精确匹配时为 null', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: JSON.stringify({ items: [attachment({ key: 'other.png' })] }),
			status: 200
		});

		expect(await createStorage(transport).stat('1758000000000.png')).toBeNull();
	});

	it('list 映射为 ObjectStorageFile 并带 lastModified', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: JSON.stringify({ cursor: 'next', items: [attachment()] }),
			status: 200
		});

		const page = await createStorage(transport).list({ limit: 48, prefix: 'notes/' });

		expect(page.cursor).toBe('next');
		expect(page.items).toEqual([
			{
				description: null,
				key: '1758000000000.png',
				lastModified: Date.parse('2026-09-01T00:00:00.000Z'),
				size: 1234,
				tags: [],
				title: null,
				url: 'https://cdn.lantai.pkmer.cn/u1/1758000000000.png'
			}
		]);
		expect(requestAt(transport, 0).url).toContain('limit=48');
		expect(requestAt(transport, 0).url).toContain('prefix=notes%2F');
		expect(requestAt(transport, 0).url).not.toContain('sort=');
	});

	it('list 无 prefix 时带上 sort 与 order', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ items: [] }), status: 200 });

		await createStorage(transport).list({ limit: 48, order: 'asc', sort: 'createdAt' });

		const url = requestAt(transport, 0).url;
		expect(url).toContain('sort=createdAt');
		expect(url).toContain('order=asc');
	});

	it('searchPage 带 sort 且只取一页', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: JSON.stringify({ cursor: 'c1', items: [attachment({ key: 'a.png' })] }),
			status: 200
		});
		transport.push({
			body: JSON.stringify({ items: [attachment({ key: 'b.png' })] }),
			status: 200
		});

		const page = await createStorage(transport).searchPage({
			limit: 1,
			order: 'desc',
			query: 'tag:风景',
			sort: 'size'
		});

		expect(page.items.map((item) => item.key)).toEqual(['a.png']);
		expect(page.cursor).toBe('c1');
		expect(transport.requests).toHaveLength(1);
		const url = requestAt(transport, 0).url;
		expect(url).toContain('/api/v1/objects/search?');
		expect(url).toContain('sort=size');
		expect(url).toContain('order=desc');
	});

	it('search 无关键词无标签时退化为 list', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ items: [] }), status: 200 });

		for await (const _file of createStorage(transport).search('   ')) {
			// 消费生成器
		}

		expect(requestAt(transport, 0).url).toContain('/api/v1/objects?');
		expect(requestAt(transport, 0).url).not.toContain('/search');
	});

	it('search 把 tag: 前缀映射为 tag 参数，其余作为 q', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ items: [attachment()] }), status: 200 });

		const keys: string[] = [];
		for await (const file of createStorage(transport).search('tag:风景 山湖')) {
			keys.push(file.key);
		}

		expect(keys).toEqual(['1758000000000.png']);
		const url = requestAt(transport, 0).url;
		expect(url).toContain('/api/v1/objects/search?');
		expect(url).toContain('tag=%E9%A3%8E%E6%99%AF');
		expect(url).toContain('q=%E5%B1%B1%E6%B9%96');
	});

	it('search 跟随 cursor 直到取尽', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: JSON.stringify({ cursor: 'c1', items: [attachment({ key: 'a.png' })] }),
			status: 200
		});
		transport.push({
			body: JSON.stringify({ items: [attachment({ key: 'b.png' })] }),
			status: 200
		});

		const keys: string[] = [];
		for await (const file of createStorage(transport).search('x')) {
			keys.push(file.key);
		}

		expect(keys).toEqual(['a.png', 'b.png']);
		expect(transport.requests).toHaveLength(2);
		expect(requestAt(transport, 1).url).toContain('cursor=c1');
	});

	it('delete 对对象键做单段编码', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 204 });

		await createStorage(transport).delete('notes/a.png');

		const request = requestAt(transport, 0);
		expect(request.method).toBe('DELETE');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects/key/notes%2Fa.png');
	});

	it('非 2xx 抛出后端 error.code / message', async () => {
		const transport = new FakeTransport();
		transport.push({
			body: JSON.stringify({
				error: { code: 'QuotaExceeded', message: 'Storage quota exceeded' }
			}),
			status: 403
		});

		await expect(
			createStorage(transport).upload({ bytes: new Uint8Array([1]), objectKey: 'a.png' })
		).rejects.toThrow(/QuotaExceeded.*Storage quota exceeded/u);
	});

	it('非 JSON 错误体退回 HTTP 状态码', async () => {
		const transport = new FakeTransport();
		transport.push({ body: '<html>502</html>', status: 502 });

		await expect(createStorage(transport).buildPublicUrl('a.png')).rejects.toThrow(/HTTP 502/u);
	});
});
