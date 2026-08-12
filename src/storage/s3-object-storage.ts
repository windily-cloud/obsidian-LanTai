import type {
	ObjectStorageRequest,
	ObjectStorageResponse,
	ObjectStorageTransport
} from './object-storage-transport.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser,
	ObjectStorageFile,
	ObjectStorageListResult
} from './object-storage.ts';
import type { S3Connection } from './s3-connection.ts';

import {
	buildListObjectsUrl,
	buildObjectUrl,
	joinPublicUrl
} from './s3-urls.ts';
import { parseListObjectsV2Xml } from './s3-xml.ts';
import { SigV4Signer } from './sig-v4-signer.ts';
import { mapS3ErrorResponse } from './storage-request-error.ts';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
	bmp: 'image/bmp',
	gif: 'image/gif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	webp: 'image/webp'
};

const DEFAULT_LIST_PAGE_SIZE = 1000;
const EXISTS_PROBE_MAX_KEYS = 2;
const HTTP_NOT_FOUND = 404;
const HTTP_OK_MAX_EXCLUSIVE = 300;
const HTTP_OK_MIN = 200;

export interface S3ObjectStorageListOptions {
	readonly cursor?: string;
	readonly limit?: number;
	readonly prefix?: string;
}

interface S3ObjectStorageConstructorParams {
	readonly connection: S3Connection;
	readonly signer?: SigV4Signer;
	readonly transport: ObjectStorageTransport;
}

/**
 * S3-protocol object storage over a pluggable transport (browser/mobile safe).
 * Method names align with files-sdk: upload / exists / delete / list / search / url.
 */
export class S3ObjectStorage implements ObjectStorage, ObjectStorageBrowser {
	private readonly connection: S3Connection;
	private readonly signer: SigV4Signer;
	private readonly transport: ObjectStorageTransport;

	public constructor(params: S3ObjectStorageConstructorParams) {
		this.connection = params.connection;
		this.signer = params.signer ?? new SigV4Signer(params.connection);
		this.transport = params.transport;
	}

	/** Alias of files-sdk `url(key)`. */
	public async buildPublicUrl(objectKey: string): Promise<string> {
		if (this.connection.publicBaseUrl.trim()) {
			return joinPublicUrl(this.connection.publicBaseUrl.trim(), objectKey);
		}
		return this.signer.signQuery(buildObjectUrl(this.connection, objectKey));
	}

	public async delete(objectKey: string): Promise<void> {
		const response = await this.send({
			headers: {},
			method: 'DELETE',
			url: buildObjectUrl(this.connection, objectKey)
		});
		this.assertOk(response.status, response.body);
	}

	public async exists(objectKey: string): Promise<boolean> {
		// ListObjectsV2 with prefix — never HeadObject. Android Obsidian requestUrl
		// Reads response bodies; S3 HEAD returns Content-Length with an empty body and
		// OkHttp aborts with IOException Stream closed.
		const response = await this.send({
			headers: {},
			method: 'GET',
			url: buildListObjectsUrl(this.connection, { limit: EXISTS_PROBE_MAX_KEYS, prefix: objectKey })
		});
		if (response.status === HTTP_NOT_FOUND) {
			return false;
		}
		this.assertOk(response.status, response.body);
		const page = parseListObjectsV2Xml(new TextDecoder().decode(response.body));
		return page.items.some((item) => item.key === objectKey);
	}

	public async list(options?: S3ObjectStorageListOptions): Promise<ObjectStorageListResult> {
		const response = await this.send({
			headers: {},
			method: 'GET',
			url: buildListObjectsUrl(this.connection, {
				...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
				...(options?.limit === undefined ? {} : { limit: options.limit }),
				...(options?.prefix === undefined ? {} : { prefix: options.prefix })
			})
		});
		this.assertOk(response.status, response.body);
		return parseListObjectsV2Xml(new TextDecoder().decode(response.body));
	}

	public async *search(query: string): AsyncGenerator<ObjectStorageFile, void> {
		const needle = query.toLowerCase();
		let cursor: string | undefined;
		do {
			const page = await this.list({
				...(cursor === undefined ? {} : { cursor }),
				limit: DEFAULT_LIST_PAGE_SIZE
			});
			for (const item of page.items) {
				if (item.key.toLowerCase().includes(needle)) {
					yield item;
				}
			}
			cursor = page.cursor;
		} while (cursor !== undefined);
	}

	public async upload(objectKey: string, bytes: Uint8Array): Promise<void> {
		const response = await this.send({
			body: bytes,
			headers: { 'content-type': contentTypeForObjectKey(objectKey) },
			method: 'PUT',
			url: buildObjectUrl(this.connection, objectKey)
		});
		this.assertOk(response.status, response.body);
	}

	private assertOk(status: number, body: Uint8Array): void {
		if (status >= HTTP_OK_MIN && status < HTTP_OK_MAX_EXCLUSIVE) {
			return;
		}
		throw mapS3ErrorResponse(status, new TextDecoder().decode(body));
	}

	private async send(request: ObjectStorageRequest): Promise<ObjectStorageResponse> {
		const signed = await this.signer.sign(request);
		return this.transport.send(signed);
	}
}

function contentTypeForObjectKey(objectKey: string): string {
	const dot = objectKey.lastIndexOf('.');
	const extension = dot === -1 ? '' : objectKey.slice(dot + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
