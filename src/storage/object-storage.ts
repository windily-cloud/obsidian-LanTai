export interface ObjectStat {
	readonly size: number;
}

export interface ObjectStorage {
	buildPublicUrl(objectKey: string): Promise<string>;
	/**
	 * `false` = 对象键由服务端生成，客户端无法预测键，因此冲突探测与覆盖判定不适用（lantai）。
	 * 缺省（`undefined`）视为 `true`。
	 */
	readonly clientKeyed?: boolean;
	download(objectKey: string): Promise<Uint8Array>;
	exists(objectKey: string): Promise<boolean>;
	stat(objectKey: string): Promise<null | ObjectStat>;
	upload(input: ObjectStorageUploadInput): Promise<ObjectStorageUploadResult>;
}

export interface ObjectStorageBrowser {
	buildPublicUrl(objectKey: string): Promise<string>;
	delete(objectKey: string): Promise<void>;
	exists(objectKey: string): Promise<boolean>;
	list(options?: ObjectStorageListOptions): Promise<ObjectStorageListResult>;
	search(query: string): AsyncGenerator<ObjectStorageFile, void>;
}

export interface ObjectStorageFile {
	/** 仅带元数据的后端（兰台）提供。 */
	description?: null | string;
	/** 仅带元数据的后端（兰台）提供：压缩后的图片元数据。 */
	image?: ObjectStorageImageMetadata;
	key: string;
	lastModified?: number;
	/** 仅带元数据的后端（兰台）提供：压缩前字节数。 */
	originalSize?: number;
	/** 仅带元数据的后端（兰台）提供：是否经过压缩管线。 */
	processed?: boolean;
	size: number;
	/** 仅带元数据的后端（兰台）提供。 */
	tags?: string[];
	/** 仅带元数据的后端（兰台）提供。 */
	title?: null | string;
	/** 仅带元数据的后端（兰台）提供：服务端下发的公网 URL，省掉逐项换取。 */
	url?: string;
}

export interface ObjectStorageImageMetadata {
	readonly format: string;
	readonly height: number;
	readonly width: number;
}

export interface ObjectStorageListResult {
	readonly cursor?: string;
	readonly items: ObjectStorageFile[];
}

/** 上传入参。对象键由客户端按配置档模板生成，但存储可以选择忽略它。 */
export interface ObjectStorageUploadInput {
	readonly bytes: Uint8Array;
	/** 客户端按模板生成的对象键。服务端生成键的存储（lantai）会忽略此值。 */
	readonly objectKey: string;
	readonly originalName?: string;
}

/** 上传结果。`key` 与 `url` 一律以存储为准——服务端可能重写扩展名。 */
export interface ObjectStorageUploadResult {
	readonly key: string;
	readonly url: string;
}

interface ObjectStorageListOptions {
	readonly cursor?: string;
	readonly limit?: number;
	readonly prefix?: string;
}
