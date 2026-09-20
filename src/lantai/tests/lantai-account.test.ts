import {
	describe,
	expect,
	it
} from 'vitest';

import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from '../../storage/object-storage-transport.ts';

import {
	apiKeysUrl,
	formatBytes,
	LanTaiAccountClient,
	LanTaiAccountError,
	normalizeBaseUrl,
	parseAccountSummary,
	parseImageSettings,
	usagePercent
} from '../lantai-account.ts';

interface FakeResponse {
	body?: string;
	status: number;
}

class FakeTransport implements ObjectStorageTransport {
	public failNext = false;
	public readonly requests: ObjectStorageRequest[] = [];
	private readonly responses: FakeResponse[] = [];

	public push(response: FakeResponse): void {
		this.responses.push(response);
	}

	public send(request: ObjectStorageRequest): Promise<ObjectStorageResponse> {
		if (this.failNext) {
			this.failNext = false;
			return Promise.reject(new Error('network down'));
		}
		this.requests.push(request);
		const next = this.responses.shift() ?? { status: 200 };
		return Promise.resolve({
			body: new TextEncoder().encode(next.body ?? ''),
			headers: {},
			status: next.status
		});
	}
}

function accountBody(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		email: 'me@example.com',
		imageProcessingSettings: { format: 'webp', quality: 80 },
		plan: 'pro',
		planExpiresAt: '2026-10-01T00:00:00.000Z',
		quotaBytes: 1024,
		trafficQuotaBytes: 2048,
		trafficUsedBytes: 512,
		usedBytes: 256,
		...overrides
	});
}

function requestAt(transport: FakeTransport, index: number): ObjectStorageRequest {
	const request = transport.requests[index];
	if (request === undefined) {
		throw new Error(`expected a request at index ${String(index)}`);
	}
	return request;
}

describe('normalizeBaseUrl', () => {
	it('去空白与尾部斜杠', () => {
		expect(normalizeBaseUrl('  https://lantai.pkmer.cn/  ')).toBe('https://lantai.pkmer.cn');
		expect(normalizeBaseUrl('https://a.example///')).toBe('https://a.example');
	});

	it('apiKeysUrl 指向网页端 API Keys 分栏', () => {
		expect(apiKeysUrl('https://lantai.pkmer.cn/')).toBe(
			'https://lantai.pkmer.cn/settings?tab=api-keys'
		);
	});
});

describe('parseImageSettings', () => {
	it('合法设置原样通过', () => {
		expect(parseImageSettings({ format: 'avif', quality: 66 })).toEqual({
			format: 'avif',
			quality: 66
		});
	});

	it('非法格式/越界质量/非对象一律 null', () => {
		expect(parseImageSettings({ format: 'heic', quality: 80 })).toBeNull();
		expect(parseImageSettings({ format: 'webp', quality: 0 })).toBeNull();
		expect(parseImageSettings({ format: 'webp', quality: 101 })).toBeNull();
		expect(parseImageSettings({ format: 'webp', quality: 80.5 })).toBeNull();
		expect(parseImageSettings(null)).toBeNull();
		expect(parseImageSettings('webp')).toBeNull();
	});
});

describe('parseAccountSummary', () => {
	it('解析完整响应', () => {
		expect(parseAccountSummary(JSON.parse(accountBody()))).toEqual({
			email: 'me@example.com',
			imageProcessingSettings: { format: 'webp', quality: 80 },
			plan: 'pro',
			planExpiresAt: '2026-10-01T00:00:00.000Z',
			quotaBytes: 1024,
			trafficQuotaBytes: 2048,
			trafficUsedBytes: 512,
			usedBytes: 256
		});
	});

	it('缺少图片设置视为响应不可用', () => {
		expect(parseAccountSummary(JSON.parse(accountBody({ imageProcessingSettings: undefined }))))
			.toBeNull();
	});

	it('数值字段缺失回落 0，planExpiresAt 缺失回落 null', () => {
		const summary = parseAccountSummary(
			JSON.parse(accountBody({ planExpiresAt: null, usedBytes: undefined }))
		);
		expect(summary?.usedBytes).toBe(0);
		expect(summary?.planExpiresAt).toBeNull();
	});

	it('非对象返回 null', () => {
		expect(parseAccountSummary(null)).toBeNull();
		expect(parseAccountSummary(42)).toBeNull();
	});
});

describe('formatBytes', () => {
	it('不足 1KB 显示字节，跨单位进位到 KB/MB/GB', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1024)).toBe('1.0 KB');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
		expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
	});
});

describe('usagePercent', () => {
	it('0 配额为 0，且上限 100', () => {
		expect(usagePercent(10, 0)).toBe(0);
		expect(usagePercent(50, 100)).toBe(50);
		expect(usagePercent(500, 100)).toBe(100);
	});
});

describe('LanTaiAccountClient', () => {
	it('fetch 用 Bearer 读 /api/v1/me', async () => {
		const transport = new FakeTransport();
		transport.push({ body: accountBody(), status: 200 });

		const summary = await new LanTaiAccountClient(transport).fetch(
			'https://lantai.pkmer.cn/',
			'lt_key'
		);

		expect(summary.email).toBe('me@example.com');
		const request = requestAt(transport, 0);
		expect(request.method).toBe('GET');
		expect(request.url).toBe('https://lantai.pkmer.cn/api/v1/me');
		expect(request.headers['authorization']).toBe('Bearer lt_key');
	});

	it('401 归类为 invalidKey', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ error: { code: 'Unauthorized' } }), status: 401 });

		const error = await new LanTaiAccountClient(transport)
			.fetch('https://a.example', 'lt_bad')
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(LanTaiAccountError);
		expect((error as LanTaiAccountError).kind).toBe('invalidKey');
	});

	it('非 2xx 归类为 unreachable', async () => {
		const transport = new FakeTransport();
		transport.push({ body: 'boom', status: 500 });

		const error = await new LanTaiAccountClient(transport)
			.fetch('https://a.example', 'lt_key')
			.catch((caught: unknown) => caught);

		expect((error as LanTaiAccountError).kind).toBe('unreachable');
	});

	it('响应能解析但结构不对时归类为 unreachable', async () => {
		const transport = new FakeTransport();
		transport.push({ body: JSON.stringify({ nope: true }), status: 200 });

		const error = await new LanTaiAccountClient(transport)
			.fetch('https://a.example', 'lt_key')
			.catch((caught: unknown) => caught);

		expect((error as LanTaiAccountError).kind).toBe('unreachable');
	});

	it('传输层抛错归类为 unreachable', async () => {
		const transport = new FakeTransport();
		transport.failNext = true;

		const error = await new LanTaiAccountClient(transport)
			.fetch('https://a.example', 'lt_key')
			.catch((caught: unknown) => caught);

		expect((error as LanTaiAccountError).kind).toBe('unreachable');
	});

	it('saveImageSettings 以 PATCH 发送 JSON 体并回显', async () => {
		const transport = new FakeTransport();
		transport.push({ body: accountBody({ imageProcessingSettings: { format: 'png', quality: 42 } }), status: 200 });

		const summary = await new LanTaiAccountClient(transport).saveImageSettings(
			'https://lantai.pkmer.cn',
			'lt_key',
			{ format: 'png', quality: 42 }
		);

		expect(summary.imageProcessingSettings).toEqual({ format: 'png', quality: 42 });
		const request = requestAt(transport, 0);
		expect(request.method).toBe('PATCH');
		expect(request.headers['content-type']).toBe('application/json');
		expect(new TextDecoder().decode(request.body)).toBe(
			JSON.stringify({ imageProcessingSettings: { format: 'png', quality: 42 } })
		);
	});
});
