import { noopAsync } from 'obsidian-dev-utils/function';

import type { ObjectStorage } from '../object-storage.ts';

export interface FakeObjectStorageConstructorParams {
	readonly existing?: string[];
	readonly publicBaseUrl: string;
}

export class FakeObjectStorage implements ObjectStorage {
	public readonly uploadedKeys: string[] = [];
	private readonly existing: Set<string>;
	private readonly publicBaseUrl: string;

	public constructor(params: FakeObjectStorageConstructorParams) {
		this.publicBaseUrl = params.publicBaseUrl.replace(/\/+$/, '');
		this.existing = new Set(params.existing ?? []);
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

	public exists(objectKey: string): Promise<boolean> {
		return Promise.resolve(this.existing.has(objectKey));
	}

	public upload(objectKey: string, _bytes: Uint8Array): Promise<void> {
		this.uploadedKeys.push(objectKey);
		this.existing.add(objectKey);
		return noopAsync();
	}
}
