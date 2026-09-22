import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from './object-storage-transport.ts';
import type {
	GallerySortKey,
	GallerySortOrder,
	ObjectStat,
	ObjectStorage,
	ObjectStorageBrowser,
	ObjectStorageFile,
	ObjectStorageListResult,
	ObjectStorageUploadInput,
	ObjectStorageUploadResult
} from './object-storage.ts';

import { t } from '../i18n/index.ts';
import {
	isEmptySearch,
	parseLanTaiSearchQuery
} from './lantai-search-query.ts';
import { contentTypeForObjectKey } from './mime-type.ts';
import {
	parseRetryAfterMs,
	StorageRequestError
} from './storage-request-error.ts';

const DEFAULT_PAGE_SIZE = 100;
/** 精确探测单键时的候选上限：服务端 list 是前缀匹配，取回少量候选后精确比对。 */
const EXACT_PROBE_LIMIT = 50;
const HTTP_NOT_FOUND = 404;
const HTTP_OK_MAX_EXCLUSIVE = 300;
const HTTP_OK_MIN = 200;

/** PATCH `/api/v1/objects/key/:key` 的可改元数据。 */
export interface LanTaiMetadataPatch {
	readonly description?: null | string;
	readonly name?: null | string;
	readonly title?: null | string;
}

interface LanTaiAttachmentDto {
	readonly createdAt: string;
	readonly description?: null | string;
	readonly image?: LanTaiImageMetadata;
	readonly key: string;
	readonly name?: null | string;
	readonly originalSize?: number;
	readonly processed?: boolean;
	readonly size: number;
	readonly tags?: string[];
	readonly title?: null | string;
	readonly url: string;
}

/** 后端错误体 `{ error: { code, message } }` 的宽松形状。 */
interface LanTaiErrorBody {
	readonly code?: unknown;
	readonly message?: unknown;
}

interface LanTaiErrorEnvelope {
	readonly error?: LanTaiErrorBody;
}

/** `/api/v1` 附件 DTO 中本客户端用到的字段。 */
interface LanTaiImageMetadata {
	readonly format: string;
	readonly height: number;
	readonly width: number;
}

interface LanTaiObjectStorageConstructorParams {
	readonly apiKey: string;
	readonly baseUrl: string;
	readonly transport: ObjectStorageTransport;
}

interface LanTaiObjectStorageListOptions {
	readonly cursor?: string;
	readonly limit?: number;
	readonly order?: GallerySortOrder;
	readonly prefix?: string;
	readonly sort?: GallerySortKey;
}

interface LanTaiObjectStorageSearchPageParams {
	readonly cursor?: string;
	readonly limit?: number;
	readonly order?: GallerySortOrder;
	readonly query: string;
	readonly sort?: GallerySortKey;
}

interface LanTaiPage {
	readonly cursor?: string;
	readonly items: LanTaiAttachmentDto[];
}

interface LanTaiSendExtras {
	readonly body?: Uint8Array;
	readonly headers?: Record<string, string>;
}

interface LanTaiUrlResponse {
	readonly url: string;
}

/**
 * 兰台官方后端的 REST 对象存储。
 *
 * 与 S3 家族的两点本质差异，都直接源于后端设计（见 docs/adr/0005-lantai-rest-provider.md）：
 * - 对象键由**服务端生成**（`clientKeyed = false`），因此冲突探测/覆盖判定不适用，
 *   写进笔记的链接一律取服务端返回的 `url`。
 * - 认证是 `Authorization: Bearer <API key>`，不是 SigV4。
 */
export class LanTaiObjectStorage implements ObjectStorage, ObjectStorageBrowser {
	/** 对象键由服务端生成：客户端无法预测键。 */
	public readonly clientKeyed = false;

	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly transport: ObjectStorageTransport;

	public constructor(params: LanTaiObjectStorageConstructorParams) {
		this.apiKey = params.apiKey;
		this.baseUrl = params.baseUrl.replace(/\/+$/u, '');
		this.transport = params.transport;
	}

	/** 追加标签（后端 `POST /objects/key/:key/tags`）。 */
	public async addTags(objectKey: string, names: readonly string[]): Promise<void> {
		const response = await this.send('POST', `${this.objectUrl(objectKey)}/tags`, {
			body: encodeJson({ tags: [...names] }),
			headers: { 'content-type': 'application/json' }
		});
		this.assertOk(response);
	}

	public async buildPublicUrl(objectKey: string): Promise<string> {
		const response = await this.send('GET', this.url('/api/v1/objects/url', { key: objectKey }));
		this.assertOk(response);
		const body = parseJson(response) as LanTaiUrlResponse;
		return body.url;
	}

	public async delete(objectKey: string): Promise<void> {
		const response = await this.send('DELETE', this.objectUrl(objectKey));
		this.assertOk(response);
	}

	public async download(objectKey: string): Promise<Uint8Array> {
		const response = await this.send('GET', this.objectUrl(objectKey));
		this.assertOk(response);
		return response.body;
	}

	public async exists(objectKey: string): Promise<boolean> {
		return (await this.stat(objectKey)) !== null;
	}

	public async list(options?: LanTaiObjectStorageListOptions): Promise<ObjectStorageListResult> {
		const hasPrefix = options?.prefix !== undefined && options.prefix !== '';
		return this.fetchPage('/api/v1/objects', {
			...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
			...(options?.limit === undefined ? {} : { limit: String(options.limit) }),
			...(hasPrefix ? { prefix: options.prefix } : {}),
			...(hasPrefix ? {} : sortQuery(options?.sort, options?.order))
		});
	}

	/** 移除标签。注意：后端的 `name` 走 JSON body，而不是查询参数。 */
	public async removeTag(objectKey: string, name: string): Promise<void> {
		const response = await this.send('DELETE', `${this.objectUrl(objectKey)}/tags`, {
			body: encodeJson({ name }),
			headers: { 'content-type': 'application/json' }
		});
		this.assertOk(response);
	}

	public async *search(query: string): AsyncGenerator<ObjectStorageFile, void> {
		let cursor: string | undefined;
		do {
			const page = await this.searchPage({
				...(cursor === undefined ? {} : { cursor }),
				limit: DEFAULT_PAGE_SIZE,
				query
			});
			for (const item of page.items) {
				yield item;
			}
			cursor = page.cursor;
		} while (cursor !== undefined);
	}

	public searchPage(params: LanTaiObjectStorageSearchPageParams): Promise<ObjectStorageListResult> {
		const parsed = parseLanTaiSearchQuery(params.query);
		const path = isEmptySearch(parsed) ? '/api/v1/objects' : '/api/v1/objects/search';
		return this.fetchPage(path, {
			...(params.cursor === undefined ? {} : { cursor: params.cursor }),
			limit: String(params.limit ?? DEFAULT_PAGE_SIZE),
			...(parsed.keyword === '' ? {} : { q: parsed.keyword }),
			...(parsed.tag === '' ? {} : { tag: parsed.tag }),
			...sortQuery(params.sort, params.order)
		});
	}

	public async stat(objectKey: string): Promise<null | ObjectStat> {
		// 刻意不用 HEAD：Android Obsidian 的 requestUrl 在「HEAD + Content-Length + 空响应体」
		// 下会抛 IOException（同 S3ObjectStorage.stat 的注释），改用 list + 前缀候选精确比对。
		const response = await this.send(
			'GET',
			this.url('/api/v1/objects', {
				limit: String(EXACT_PROBE_LIMIT),
				prefix: objectKey
			})
		);
		if (response.status === HTTP_NOT_FOUND) {
			return null;
		}
		this.assertOk(response);
		const page = parseJson(response) as LanTaiPage;
		const match = page.items.find((item) => item.key === objectKey);
		return match === undefined ? null : { size: match.size };
	}

	/** 改写附件元数据（后端 `PATCH /objects/key/:key`）。 */
	public async updateMetadata(objectKey: string, patch: LanTaiMetadataPatch): Promise<void> {
		const response = await this.send('PATCH', this.objectUrl(objectKey), {
			body: encodeJson(patch),
			headers: { 'content-type': 'application/json' }
		});
		this.assertOk(response);
	}

	public async upload(input: ObjectStorageUploadInput): Promise<ObjectStorageUploadResult> {
		// 传入的 objectKey 是客户端按配置档模板算出来的，但兰台忽略它：服务端生成雪花键并可能重写扩展名，
		// 因此原始文件名必须通过 x-lantai-name 传过去。
		const response = await this.send('POST', this.url('/api/v1/objects', {}), {
			body: input.bytes,
			headers: {
				'content-type': contentTypeForObjectKey(input.originalName ?? input.objectKey),
				...(input.originalName === undefined ? {} : { 'x-lantai-name': input.originalName })
			}
		});
		this.assertOk(response);
		const dto = parseJson(response) as LanTaiAttachmentDto;
		return { key: dto.key, url: dto.url };
	}

	private assertOk(response: ObjectStorageResponse): void {
		if (response.status >= HTTP_OK_MIN && response.status < HTTP_OK_MAX_EXCLUSIVE) {
			return;
		}
		throw requestError(response);
	}

	private async fetchPage(
		path: string,
		query: Record<string, string>
	): Promise<ObjectStorageListResult> {
		const response = await this.send('GET', this.url(path, query));
		this.assertOk(response);
		const page = parseJson(response) as LanTaiPage;
		return {
			...(page.cursor === undefined ? {} : { cursor: page.cursor }),
			items: page.items.map(toFile)
		};
	}

	private objectUrl(objectKey: string): string {
		return this.url(`/api/v1/objects/key/${encodeURIComponent(objectKey)}`, {});
	}

	private async send(
		method: ObjectStorageRequest['method'],
		url: string,
		extra: LanTaiSendExtras = {}
	): Promise<ObjectStorageResponse> {
		return this.transport.send({
			...(extra.body === undefined ? {} : { body: extra.body }),
			headers: {
				accept: 'application/json',
				authorization: `Bearer ${this.apiKey}`,
				...(extra.headers ?? {})
			},
			method,
			url
		});
	}

	private url(path: string, query: Record<string, string>): string {
		const search = new URLSearchParams(query).toString();
		return search === '' ? `${this.baseUrl}${path}` : `${this.baseUrl}${path}?${search}`;
	}
}

function encodeJson(value: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value));
}

function parseJson(response: ObjectStorageResponse): unknown {
	return JSON.parse(new TextDecoder().decode(response.body));
}

/** 后端错误体是 `{ error: { code, message } }`；非 JSON 时退回 HTTP 状态码。 */
function requestError(response: ObjectStorageResponse): Error {
	const body = tryParseError(response);
	const code = typeof body?.error?.code === 'string'
		? body.error.code
		: `HTTP ${String(response.status)}`;
	const message = typeof body?.error?.message === 'string' ? body.error.message : '';
	const retryAfterMs = parseRetryAfterMs(response.headers);
	const cause = Object.assign(new Error(message), { code });
	return new StorageRequestError(
		'Provider',
		message === ''
			? t('errors.storageError', { code })
			: message,
		{
			cause,
			...(retryAfterMs === undefined ? {} : { retryAfterMs }),
			status: response.status
		}
	);
}

function sortQuery(
	sort: GallerySortKey | undefined,
	order: GallerySortOrder | undefined
): Record<string, string> {
	if (sort === undefined) {
		return {};
	}
	return {
		sort,
		...(order === undefined ? {} : { order })
	};
}

function toFile(dto: LanTaiAttachmentDto): ObjectStorageFile {
	const timestamp = Date.parse(dto.createdAt);
	return {
		key: dto.key,
		...(Number.isNaN(timestamp) ? {} : { lastModified: timestamp }),
		// 列表端点已 join 标签（后端 Phase 1），这里透传给画廊详情弹窗。
		description: dto.description ?? null,
		...(dto.name === undefined || dto.name === null ? {} : { name: dto.name }),
		size: dto.size,
		tags: dto.tags ?? [],
		title: dto.title ?? null,
		url: dto.url,
		...(dto.image === undefined ? {} : { image: dto.image }),
		...(dto.originalSize === undefined ? {} : { originalSize: dto.originalSize }),
		...(dto.processed === undefined ? {} : { processed: dto.processed })
	};
}

function tryParseError(response: ObjectStorageResponse): LanTaiErrorEnvelope | null {
	try {
		return parseJson(response) as LanTaiErrorEnvelope;
	} catch {
		return null;
	}
}
