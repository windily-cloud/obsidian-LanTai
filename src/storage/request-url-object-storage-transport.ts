import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from './object-storage-transport.ts';

/** Minimal Obsidian `requestUrl` shape used by the transport (injectable for unit tests). */
export type RequestUrlLike = (params: RequestUrlParams) => Promise<RequestUrlResult>;

interface RequestUrlObjectStorageTransportConstructorParams {
	readonly requestUrl: RequestUrlLike;
}

interface RequestUrlParams {
	readonly body?: ArrayBuffer;
	readonly contentType?: string;
	readonly headers?: Record<string, string>;
	readonly method?: string;
	readonly throw?: boolean;
	readonly url: string;
}

interface RequestUrlResult {
	readonly arrayBuffer: ArrayBuffer;
	readonly headers: Record<string, string>;
	readonly status: number;
}

const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'content-length',
	'expect',
	'host',
	'transfer-encoding'
]);

/**
 * Object-storage transport backed by Obsidian `requestUrl` (CORS-free on desktop and mobile).
 * Uses `throw: false` so non-2xx responses stay available for S3 error mapping.
 */
export class RequestUrlObjectStorageTransport implements ObjectStorageTransport {
	private readonly requestUrl: RequestUrlLike;

	public constructor(params: RequestUrlObjectStorageTransportConstructorParams) {
		this.requestUrl = params.requestUrl;
	}

	public async send(request: ObjectStorageRequest): Promise<ObjectStorageResponse> {
		const headers = headersForRequestUrl(request.headers);
		const contentType = headers['content-type'];
		const response = await this.requestUrl({
			...(request.body === undefined ? {} : { body: toStandaloneArrayBuffer(request.body) }),
			...(contentType === undefined ? {} : { contentType }),
			headers,
			method: request.method,
			throw: false,
			url: request.url
		});
		return {
			body: new Uint8Array(response.arrayBuffer),
			headers: lowercaseHeaders(response.headers),
			status: response.status
		};
	}
}

function headersForRequestUrl(headers: Record<string, string>): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const name = key.toLowerCase();
		if (HOP_BY_HOP_HEADERS.has(name)) {
			continue;
		}
		normalized[name] = value;
	}
	return normalized;
}

function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		normalized[key.toLowerCase()] = value;
	}
	return normalized;
}

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	if (
		bytes.buffer instanceof ArrayBuffer
		&& bytes.byteOffset === 0
		&& bytes.byteLength === bytes.buffer.byteLength
	) {
		return bytes.buffer;
	}
	return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice().buffer;
}
