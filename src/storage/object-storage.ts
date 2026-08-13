export interface ObjectStat {
	readonly size: number;
}

export interface ObjectStorage {
	buildPublicUrl(objectKey: string): Promise<string>;
	download(objectKey: string): Promise<Uint8Array>;
	exists(objectKey: string): Promise<boolean>;
	stat(objectKey: string): Promise<null | ObjectStat>;
	upload(objectKey: string, bytes: Uint8Array): Promise<void>;
}

export interface ObjectStorageBrowser {
	buildPublicUrl(objectKey: string): Promise<string>;
	delete(objectKey: string): Promise<void>;
	exists(objectKey: string): Promise<boolean>;
	list(options?: ObjectStorageListOptions): Promise<ObjectStorageListResult>;
	search(query: string): AsyncGenerator<ObjectStorageFile, void>;
}

export interface ObjectStorageFile {
	key: string;
	lastModified?: number;
	size: number;
}

export interface ObjectStorageListResult {
	readonly cursor?: string;
	readonly items: ObjectStorageFile[];
}

interface ObjectStorageListOptions {
	readonly cursor?: string;
	readonly limit?: number;
	readonly prefix?: string;
}
