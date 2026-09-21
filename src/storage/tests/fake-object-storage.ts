import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	ObjectStat,
	ObjectStorage,
	ObjectStorageBrowser,
	ObjectStorageListResult,
	ObjectStorageUploadInput,
	ObjectStorageUploadResult
} from '../object-storage.ts';

interface FakeObjectStorageConstructorParams {
	readonly clientKeyed?: boolean;
	readonly existing?: string[];
	readonly existsError?: Error;
	readonly listError?: Error;
	readonly objectBytes?: Readonly<Record<string, Uint8Array>>;
	readonly publicBaseUrl: string;
	/** 模拟服务端生成键（兰台雪花 key）：upload 回此值而不是入参 objectKey。 */
	readonly uploadedObject?: FakeUploadedObject;
	readonly uploadErrors?: Error[];
}

interface FakeUploadedObject {
	readonly key: string;
	readonly url?: string;
}

/** Test double for ObjectStorage (+ optional browser methods for connection tests). */
export class FakeObjectStorage implements ObjectStorage, ObjectStorageBrowser {
	public readonly clientKeyed?: boolean;
	/** Exposed for unit tests. */
	public readonly deletedKeys: string[] = [];
	/** Exposed for unit tests. */
	public readonly uploadedKeys: string[] = [];
	/** Exposed for unit tests. */
	public readonly uploads: ObjectStorageUploadInput[] = [];
	private readonly existing: Set<string>;
	private readonly existsError: Error | undefined;
	private readonly listError: Error | undefined;
	private readonly objectBytes: Map<string, Uint8Array>;
	private readonly publicBaseUrl: string;
	private readonly uploadedObject: FakeUploadedObject | undefined;
	private readonly uploadErrors: Error[];

	public constructor(params: FakeObjectStorageConstructorParams) {
		if (params.clientKeyed !== undefined) {
			this.clientKeyed = params.clientKeyed;
		}
		this.publicBaseUrl = params.publicBaseUrl.replace(/\/+$/, '');
		this.existing = new Set(params.existing ?? []);
		this.existsError = params.existsError;
		this.listError = params.listError;
		this.objectBytes = new Map(Object.entries(params.objectBytes ?? {}));
		this.uploadErrors = [...(params.uploadErrors ?? [])];
		this.uploadedObject = params.uploadedObject;
		for (const key of this.objectBytes.keys()) {
			this.existing.add(key);
		}
	}

	public buildPublicUrl(objectKey: string): Promise<string> {
		const path = objectKey
			.replace(/^\/+/, '')
			.split('/')
			.map((segment) => {
				if (segment === '.') {
					return '%252E';
				}
				if (segment === '..') {
					return '%252E%252E';
				}
				return encodeURIComponent(segment);
			})
			.join('/');
		return Promise.resolve(`${this.publicBaseUrl}/${path}`);
	}

	public delete(objectKey: string): Promise<void> {
		this.deletedKeys.push(objectKey);
		this.existing.delete(objectKey);
		this.objectBytes.delete(objectKey);
		return noopAsync();
	}

	public download(objectKey: string): Promise<Uint8Array> {
		if (this.existsError) {
			return Promise.reject(this.existsError);
		}
		const bytes = this.objectBytes.get(objectKey);
		if (bytes === undefined) {
			return Promise.reject(new Error(`FakeObjectStorage: missing object ${objectKey}`));
		}
		return Promise.resolve(bytes);
	}

	public exists(objectKey: string): Promise<boolean> {
		if (this.existsError) {
			return Promise.reject(this.existsError);
		}
		return Promise.resolve(this.existing.has(objectKey));
	}

	public list(): Promise<ObjectStorageListResult> {
		if (this.listError) {
			return Promise.reject(this.listError);
		}
		return Promise.resolve({ items: [] });
	}

	public async *search(): AsyncGenerator<never, void> {
		// No-op search for tests
	}

	public stat(objectKey: string): Promise<null | ObjectStat> {
		if (this.existsError) {
			return Promise.reject(this.existsError);
		}
		if (!this.existing.has(objectKey)) {
			return Promise.resolve(null);
		}
		const bytes = this.objectBytes.get(objectKey);
		return Promise.resolve({ size: bytes?.length ?? 0 });
	}

	public async upload(input: ObjectStorageUploadInput): Promise<ObjectStorageUploadResult> {
		const nextError = this.uploadErrors.shift();
		if (nextError) {
			return Promise.reject(nextError);
		}
		const key = this.uploadedObject?.key ?? input.objectKey;
		const url = this.uploadedObject?.url ?? await this.buildPublicUrl(key);
		this.uploads.push(input);
		this.uploadedKeys.push(input.objectKey);
		this.existing.add(key);
		this.objectBytes.set(key, input.bytes);
		return { key, url };
	}
}
