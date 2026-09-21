import {
	describe,
	expect,
	it
} from 'vitest';

import type {
	GalleryImage,
	GalleryImagePage
} from '../gallery-source.ts';
import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from '../object-storage-transport.ts';

import { LanTaiGallerySource } from '../lantai-gallery-source.ts';
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
		contentType: 'image/webp',
		createdAt: '2026-09-01T00:00:00.000Z',
		description: null,
		key: '1758000000000.webp',
		name: 'photo.png',
		processed: true,
		size: 1234,
		tags: [],
		title: null,
		updatedAt: '2026-09-01T00:00:00.000Z',
		url: 'https://cdn.lantai.pkmer.cn/u1/1758000000000.webp',
		...overrides
	};
}

function bodyOf(request: ObjectStorageRequest): unknown {
	return JSON.parse(new TextDecoder().decode(request.body));
}

function createSource(transport: FakeTransport): LanTaiGallerySource {
	const storage = new LanTaiObjectStorage({
		apiKey: 'lt_test',
		baseUrl: 'https://lantai.pkmer.cn',
		transport
	});
	return new LanTaiGallerySource(storage, 'profile-lantai');
}

function page(items: Record<string, unknown>[], cursor?: string): FakeResponse {
	return {
		body: JSON.stringify({ ...(cursor === undefined ? {} : { cursor }), items }),
		status: 200
	};
}

function requestAt(transport: FakeTransport, index: number): ObjectStorageRequest {
	const request = transport.requests[index];
	if (request === undefined) {
		throw new Error(`expected a request at index ${String(index)}`);
	}
	return request;
}

describe('LanTaiGallerySource', () => {
	it('kind 为 lantai', () => {
		expect(createSource(new FakeTransport()).kind).toBe('lantai');
	});

	it('loadMore 过滤非图片键并映射元数据', async () => {
		const transport = new FakeTransport();
		transport.push(page([
			attachment({ description: '清晨', tags: ['风景', '晨雾'], title: '晨雾山湖' }),
			attachment({ contentType: 'text/plain', key: 'notes/readme.txt' })
		]));

		const result = await createSource(transport).loadMore(48);

		expect(result.items).toEqual([
			{
				description: '清晨',
				image: undefined,
				key: '1758000000000.webp',
				kind: 'lantai',
				name: '1758000000000.webp',
				originalSize: undefined,
				processed: true,
				profileId: 'profile-lantai',
				size: 1234,
				tags: ['风景', '晨雾'],
				timestamp: Date.parse('2026-09-01T00:00:00.000Z'),
				title: '晨雾山湖',
				url: 'https://cdn.lantai.pkmer.cn/u1/1758000000000.webp'
			}
		]);
		expect(result.hasMore).toBe(false);
	});

	it('带 cursor 时继续翻页', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment({ key: 'a.webp' })], 'c1'));
		transport.push(page([attachment({ key: 'b.webp' })]));

		const source = createSource(transport);
		const first = await source.loadMore(1);
		const second = await source.loadMore(1);

		expect(first.hasMore).toBe(true);
		expect(first.items.map((item) => item.key)).toEqual(['a.webp']);
		expect(second.hasMore).toBe(false);
		expect(second.items.map((item) => item.key)).toEqual(['b.webp']);
		expect(requestAt(transport, 1).url).toContain('cursor=c1');
	});

	it('缩略图直接用服务端下发的 URL，不额外请求', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment()]));
		const source = createSource(transport);
		const item = firstItem(await source.loadMore(48));

		const url = await source.thumbnailUrl(item);

		expect(url).toBe('https://cdn.lantai.pkmer.cn/u1/1758000000000.webp');
		// 只有列表那一次请求
		expect(transport.requests).toHaveLength(1);
	});

	it('列表项缺 URL 时回退到换取接口', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment({ url: undefined })]));
		const source = createSource(transport);
		const item = firstItem(await source.loadMore(48));
		transport.push({ body: JSON.stringify({ url: 'https://cdn/x.webp' }), status: 200 });

		expect(await source.thumbnailUrl(item)).toBe('https://cdn/x.webp');
		expect(requestAt(transport, 1).url).toContain('/api/v1/objects/url?key=');
	});

	it('setQuery 把 tag: 前缀映射到搜索端点', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment()]));
		const source = createSource(transport);

		source.setQuery('tag:风景 山湖');
		const result = await source.loadMore(48);

		expect(result.items).toHaveLength(1);
		const url = requestAt(transport, 0).url;
		expect(url).toContain('/api/v1/objects/search?');
		expect(url).toContain('tag=%E9%A3%8E%E6%99%AF');
		expect(url).toContain('q=%E5%B1%B1%E6%B9%96');
	});

	it('空查询走列表端点而不是搜索端点', async () => {
		const transport = new FakeTransport();
		transport.push(page([]));
		const source = createSource(transport);

		source.setQuery('');
		await source.loadMore(48);

		expect(requestAt(transport, 0).url).toContain('/api/v1/objects?');
		expect(requestAt(transport, 0).url).not.toContain('/search');
	});

	it('默认按 createdAt desc 请求列表', async () => {
		const transport = new FakeTransport();
		transport.push(page([]));
		await createSource(transport).loadMore(48);

		const url = requestAt(transport, 0).url;
		expect(url).toContain('sort=createdAt');
		expect(url).toContain('order=desc');
	});

	it('setSort 后下一页使用新排序且不带旧 cursor', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment({ key: 'a.webp' })], 'c1'));
		transport.push(page([attachment({ key: 'b.webp' })]));
		const source = createSource(transport);
		await source.loadMore(1);
		source.setSort('name', 'asc');
		await source.loadMore(48);

		const url = requestAt(transport, 1).url;
		expect(url).toContain('sort=name');
		expect(url).toContain('order=asc');
		expect(url).not.toContain('cursor=c1');
	});

	it('search 按页消费 cursor，不一次拉尽', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment({ key: 'a.webp' })], 'c1'));
		transport.push(page([attachment({ key: 'b.webp' })]));
		const source = createSource(transport);
		source.setQuery('tag:风景');
		source.setSort('size', 'desc');

		const first = await source.loadMore(1);

		expect(first.items.map((item) => item.key)).toEqual(['a.webp']);
		expect(first.hasMore).toBe(true);
		expect(transport.requests).toHaveLength(1);
		const url = requestAt(transport, 0).url;
		expect(url).toContain('/api/v1/objects/search?');
		expect(url).toContain('sort=size');
		expect(url).toContain('order=desc');

		const second = await source.loadMore(1);
		expect(second.items.map((item) => item.key)).toEqual(['b.webp']);
		expect(transport.requests).toHaveLength(2);
	});

	it('delete 走对象键单段编码的 DELETE', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 204 });

		await createSource(transport).delete(galleryImage('notes/a.webp'));

		const request = requestAt(transport, 0);
		expect(request.method).toBe('DELETE');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects/key/notes%2Fa.webp');
	});

	it('addTags 以 {tags:[...]} 提交', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ items: [] }), status: 200 });

		await createSource(transport).addTags(galleryImage('notes/a.webp'), ['风景', '晨雾']);

		const request = requestAt(transport, 0);
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects/key/notes%2Fa.webp/tags');
		expect(bodyOf(request)).toEqual({ tags: ['风景', '晨雾'] });
	});

	it('removeTag 把 name 放在 JSON body 里（不是查询参数）', async () => {
		const transport = new FakeTransport();
		transport.push({ status: 204 });

		await createSource(transport).removeTag(galleryImage('notes/a.webp'), '风景');

		const request = requestAt(transport, 0);
		expect(request.method).toBe('DELETE');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects/key/notes%2Fa.webp/tags');
		expect(bodyOf(request)).toEqual({ name: '风景' });
	});

	it('updateMetadata 以 PATCH 提交可改字段', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify(attachment()), status: 200 });

		await createSource(transport).updateMetadata(galleryImage('notes/a.webp'), {
			description: '说明',
			name: 'a.webp',
			title: '标题'
		});

		const request = requestAt(transport, 0);
		expect(request.method).toBe('PATCH');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/objects/key/notes%2Fa.webp');
		expect(bodyOf(request)).toEqual({ description: '说明', name: 'a.webp', title: '标题' });
	});

	it('verify 用前缀探测判断存在性', async () => {
		const transport = new FakeTransport();
		transport.push(page([attachment({ key: 'notes/a.webp' })]));

		expect(await createSource(transport).verify(galleryImage('notes/a.webp'))).toBe(true);

		const empty = new FakeTransport();
		empty.push(page([]));
		expect(await createSource(empty).verify(galleryImage('notes/a.webp'))).toBe(false);
	});

	it('purge 是空操作且不产生请求', async () => {
		const transport = new FakeTransport();

		await createSource(transport).purge();

		expect(transport.requests).toHaveLength(0);
	});
});

function firstItem(result: GalleryImagePage): GalleryImage {
	const item = result.items[0];
	if (item === undefined) {
		throw new Error('expected at least one item');
	}
	return item;
}

function galleryImage(key: string): GalleryImage {
	return { key, kind: 'lantai', name: key };
}
