import type {
	Body,
	ListOptions,
	ListResult,
	SearchOptions,
	StoredFile
} from 'files-sdk';

import type {
	ObjectStorage,
	ObjectStorageBrowser,
	ObjectStorageFile,
	ObjectStorageListOptions,
	ObjectStorageListResult
} from './object-storage.ts';

export interface FilesClient {
	delete(key: string): Promise<void>;
	exists(key: string): Promise<boolean>;
	list(options?: ListOptions): Promise<ListResult>;
	search(pattern: string, options?: SearchOptions): AsyncGenerator<StoredFile, void>;
	upload(key: string, body: Body): Promise<unknown>;
	url(key: string): Promise<string>;
}

export interface FilesSdkObjectStorageConstructorParams {
	readonly files: FilesClient;
}

interface StoredFileSummary {
	key: string;
	lastModified?: number;
	size: number;
}

export class FilesSdkObjectStorage implements ObjectStorage, ObjectStorageBrowser {
	private readonly files: FilesClient;

	public constructor(params: FilesSdkObjectStorageConstructorParams) {
		this.files = params.files;
	}

	public buildPublicUrl(objectKey: string): Promise<string> {
		return this.files.url(objectKey);
	}

	public delete(objectKey: string): Promise<void> {
		return this.files.delete(objectKey);
	}

	public exists(objectKey: string): Promise<boolean> {
		return this.files.exists(objectKey);
	}

	// eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- shared storage port options.
	public async list(options?: ObjectStorageListOptions): Promise<ObjectStorageListResult> {
		const result = await this.files.list(options);
		return {
			...(result.cursor === undefined ? {} : { cursor: result.cursor }),
			items: result.items.map(toObjectStorageFile)
		};
	}

	public async *search(query: string): AsyncGenerator<ObjectStorageFile, void> {
		for await (
			const file of this.files.search(query, {
				caseInsensitive: true,
				match: 'substring'
			})
		) {
			yield toObjectStorageFile(file);
		}
	}

	public async upload(objectKey: string, bytes: Uint8Array): Promise<void> {
		await this.files.upload(objectKey, bytes);
	}
}

function toObjectStorageFile(file: StoredFileSummary): ObjectStorageFile {
	return {
		key: file.key,
		...(file.lastModified === undefined ? {} : { lastModified: file.lastModified }),
		size: file.size
	};
}
