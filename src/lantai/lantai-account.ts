import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from '../storage/object-storage-transport.ts';

import { t } from '../i18n/index.ts';
import { LANTAI_API_KEYS_PATH } from './lantai-credentials.ts';

/** 与后端 `@lantai/common` 的 IMAGE_OUTPUT_FORMATS 保持一致。 */
export const LANTAI_IMAGE_FORMATS = ['original', 'webp', 'jpeg', 'png', 'avif'] as const;

/** `GET /api/v1/me` 的响应（本插件用到的字段）。 */
export interface LanTaiAccountSummary {
	email: string;
	imageProcessingSettings: LanTaiImageSettings;
	plan: string;
	planExpiresAt: null | string;
	quotaBytes: number;
	trafficQuotaBytes: number;
	trafficUsedBytes: number;
	usedBytes: number;
}

export type LanTaiImageFormat = (typeof LANTAI_IMAGE_FORMATS)[number];

export interface LanTaiImageSettings {
	format: LanTaiImageFormat;
	quality: number;
}

type LanTaiFailureKind = 'invalidKey' | 'unreachable';

/** 账号接口失败：区分「key 被拒」与「连不上/响应异常」，以便设置页给出可执行的提示。 */
export class LanTaiAccountError extends Error {
	/** Exposed for unit tests. */
	public readonly kind: LanTaiFailureKind;

	public constructor(kind: LanTaiFailureKind, message: string) {
		super(message);
		this.name = 'LanTaiAccountError';
		this.kind = kind;
	}
}

const BYTES_PER_UNIT = 1024;
const HTTP_OK_MAX_EXCLUSIVE = 300;
const HTTP_OK_MIN = 200;
const HTTP_UNAUTHORIZED = 401;
const MAX_PERCENT = 100;
const MAX_QUALITY = 100;
const MIN_QUALITY = 1;
const SIZE_UNITS = ['KB', 'MB', 'GB'] as const;

/** Bearer 认证的账号接口客户端（`GET/PATCH /api/v1/me`）。 */
export class LanTaiAccountClient {
	private readonly transport: ObjectStorageTransport;

	public constructor(transport: ObjectStorageTransport) {
		this.transport = transport;
	}

	/** 读取账号信息；失败时抛 `LanTaiAccountError`。 */
	public async fetch(baseUrl: string, apiKey: string): Promise<LanTaiAccountSummary> {
		return this.parseOrThrow(await this.request('GET', baseUrl, apiKey, '/api/v1/me'));
	}

	/** 写入图片处理设置并回显最新账号信息。 */
	public async saveImageSettings(
		baseUrl: string,
		apiKey: string,
		settings: LanTaiImageSettings
	): Promise<LanTaiAccountSummary> {
		const response = await this.request('PATCH', baseUrl, apiKey, '/api/v1/me', {
			imageProcessingSettings: settings
		});
		return this.parseOrThrow(response);
	}

	private parseOrThrow(response: ObjectStorageResponse): LanTaiAccountSummary {
		if (response.status === HTTP_UNAUTHORIZED) {
			throw new LanTaiAccountError('invalidKey', t('errors.lantaiKeyRejected'));
		}
		if (response.status < HTTP_OK_MIN || response.status >= HTTP_OK_MAX_EXCLUSIVE) {
			throw new LanTaiAccountError(
				'unreachable',
				t('errors.lantaiResponseError', { status: String(response.status) })
			);
		}
		const summary = parseAccountSummary(safeParseJson(response));
		if (summary === null) {
			throw new LanTaiAccountError(
				'unreachable',
				t('errors.lantaiResponseError', { status: String(response.status) })
			);
		}
		return summary;
	}

	private async request(
		method: ObjectStorageRequest['method'],
		baseUrl: string,
		apiKey: string,
		path: string,
		body?: unknown
	): Promise<ObjectStorageResponse> {
		const payload = body === undefined
			? undefined
			: new TextEncoder().encode(JSON.stringify(body));
		try {
			return await this.transport.send({
				...(payload === undefined ? {} : { body: payload }),
				headers: {
					accept: 'application/json',
					authorization: `Bearer ${apiKey}`,
					...(payload === undefined ? {} : { 'content-type': 'application/json' })
				},
				method,
				url: `${normalizeBaseUrl(baseUrl)}${path}`
			});
		} catch {
			throw new LanTaiAccountError(
				'unreachable',
				t('errors.lantaiUnreachable', { baseUrl: normalizeBaseUrl(baseUrl) })
			);
		}
	}
}

/** 网页端签发 API Key 的直达链接。 */
export function apiKeysUrl(baseUrl: string): string {
	return `${normalizeBaseUrl(baseUrl)}${LANTAI_API_KEYS_PATH}`;
}

/** 用量/文件大小展示：B → KB → MB → GB。 */
export function formatBytes(bytes: number): string {
	if (bytes < BYTES_PER_UNIT) {
		return `${String(bytes)} B`;
	}
	let value = bytes / BYTES_PER_UNIT;
	let unitIndex = 0;
	while (value >= BYTES_PER_UNIT && unitIndex < SIZE_UNITS.length - 1) {
		value /= BYTES_PER_UNIT;
		unitIndex += 1;
	}
	return `${value.toFixed(1)} ${SIZE_UNITS[unitIndex] ?? 'GB'}`;
}

/** 规范化服务地址：去空白、去尾部斜杠。 */
export function normalizeBaseUrl(raw: string): string {
	return raw.trim().replace(/\/+$/u, '');
}

/** 解析 `GET /api/v1/me` 的响应；缺少或非法的图片设置视为响应不可用。 */
export function parseAccountSummary(raw: unknown): LanTaiAccountSummary | null {
	if (typeof raw !== 'object' || raw === null) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const settings = parseImageSettings(record['imageProcessingSettings']);
	if (settings === null) {
		return null;
	}
	const email = record['email'];
	const plan = record['plan'];
	const planExpiresAt = record['planExpiresAt'];
	return {
		email: typeof email === 'string' ? email : '',
		imageProcessingSettings: settings,
		plan: typeof plan === 'string' ? plan : 'free',
		planExpiresAt: typeof planExpiresAt === 'string' ? planExpiresAt : null,
		quotaBytes: toFiniteNumber(record['quotaBytes']),
		trafficQuotaBytes: toFiniteNumber(record['trafficQuotaBytes']),
		trafficUsedBytes: toFiniteNumber(record['trafficUsedBytes']),
		usedBytes: toFiniteNumber(record['usedBytes'])
	};
}

/**
 * 严格解析 `imageProcessingSettings`；非法返回 null。
 * 与后端 `PATCH /api/v1/me` 的口径一致：写入路径不静默回落默认值。
 */
export function parseImageSettings(raw: unknown): LanTaiImageSettings | null {
	if (typeof raw !== 'object' || raw === null) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const format = record['format'];
	const quality = record['quality'];
	if (typeof format !== 'string' || !isLanTaiImageFormat(format)) {
		return null;
	}
	if (
		typeof quality !== 'number'
		|| !Number.isInteger(quality)
		|| quality < MIN_QUALITY
		|| quality > MAX_QUALITY
	) {
		return null;
	}
	return { format, quality };
}

/** 配额条百分比：0 配额时为 0，上限 100。 */
export function usagePercent(used: number, quota: number): number {
	if (quota <= 0) {
		return 0;
	}
	return Math.min(MAX_PERCENT, (used / quota) * MAX_PERCENT);
}

function isLanTaiImageFormat(value: string): value is LanTaiImageFormat {
	return (LANTAI_IMAGE_FORMATS as readonly string[]).includes(value);
}

function safeParseJson(response: ObjectStorageResponse): unknown {
	try {
		return JSON.parse(new TextDecoder().decode(response.body));
	} catch {
		return null;
	}
}

function toFiniteNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
