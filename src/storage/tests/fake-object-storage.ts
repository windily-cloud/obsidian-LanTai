import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	ObjectStorage,
	ObjectStorageBrowser,
	ObjectStorageListResult
} from '../object-storage.ts';

interface FakeObjectStorageConstructorParams {
	readonly existing?: string[];
	readonly existsError?: Error;
	readonly listError?: Error;
	readonly publicBaseUrl: string;
}

/** Test double for ObjectStorage (+ optional browser methods for connection tests). */
export class FakeObjectStorage implements ObjectStorage, ObjectStorageBrowser {
	/** Exposed for unit tests. */
	public readonly deletedKeys: string[] = [];
	/** Exposed for unit tests. */
	public readonly uploadedKeys: string[] = [];
	private readonly existing: Set<string>;
	private readonly existsError: Error | undefined;
	private readonly listError: Error | undefined;
	private readonly publicBaseUrl: string;

	public constructor(params: FakeObjectStorageConstructorParams) {
		this.publicBaseUrl = params.publicBaseUrl.replace(/\/+$/, '');
		this.existing = new Set(params.existing ?? []);
		this.existsError = params.existsError;
		this.listError = params.listError;
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
		return noopAsync();
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

	public upload(objectKey: string, _bytes: Uint8Array): Promise<void> {
		this.uploadedKeys.push(objectKey);
		this.existing.add(objectKey);
		return noopAsync();
	}
}
