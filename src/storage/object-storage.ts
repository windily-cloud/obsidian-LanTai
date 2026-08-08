export interface ObjectStorage {
	buildPublicUrl(objectKey: string): Promise<string>;
	exists(objectKey: string): Promise<boolean>;
	upload(objectKey: string, bytes: Uint8Array): Promise<void>;
}

export interface ObjectStorageBrowser {
	buildPublicUrl(objectKey: string): Promise<string>;
	delete(objectKey: string): Promise<void>;
	list(options?: ObjectStorageListOptions): Promise<ObjectStorageListResult>;
	search(query: string): AsyncGenerator<ObjectStorageFile, void>;
}

export interface ObjectStorageFile {
	key: string;
	lastModified?: number;
	size: number;
}

export interface ObjectStorageListOptions {
	readonly cursor?: string;
	readonly limit?: number;
}

export interface ObjectStorageListResult {
	readonly cursor?: string;
	readonly items: ObjectStorageFile[];
}
