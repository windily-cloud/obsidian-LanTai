import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type { StorageSecrets } from './storage-secrets.ts';

export interface CreateGallerySourceInput {
	kind: GallerySourceKind;
	profile: StorageProfile | undefined;
	secrets: StorageSecrets | undefined;
}

export interface GalleryDataSource {
	delete(image: GalleryImage): Promise<void>;
	readonly kind: GallerySourceKind;
	loadMore(limit: number): Promise<GalleryImagePage>;
	/** Remove from the local index only (e.g. broken image cleanup). Never touches the remote. */
	purge(image: GalleryImage): Promise<void>;
	setQuery(query: string): void;
	thumbnailUrl(image: GalleryImage): Promise<string> | string;
	verify(image: GalleryImage): Promise<boolean>;
}

export interface GalleryImage {
	/** 仅兰台源提供：可编辑的描述。 */
	description?: null | string;
	/** 仅兰台源提供：压缩后的图片元数据。 */
	image?: GalleryImageMetadata;
	key: string;
	kind: GallerySourceKind;
	name: string;
	/** 仅兰台源提供：压缩前字节数。 */
	originalSize?: number;
	/** 仅兰台源提供：是否经过压缩管线。 */
	processed?: boolean;
	profileId?: string;
	size?: number;
	/** 仅兰台源提供：标签名列表。 */
	tags?: string[];
	timestamp?: number;
	/** 仅兰台源提供：可编辑的标题。 */
	title?: null | string;
	url?: string;
}

/** 兰台源列表项携带的压缩后图片元数据。 */
export interface GalleryImageMetadata {
	readonly format: string;
	readonly height: number;
	readonly width: number;
}

export interface GalleryImagePage {
	readonly hasMore: boolean;
	readonly items: GalleryImage[];
}

/** 兰台源额外具备的管理能力（对齐 web 控制台：改元数据、增删标签）。 */
export interface GalleryManageableSource {
	addTags(image: GalleryImage, names: readonly string[]): Promise<void>;
	removeTag(image: GalleryImage, name: string): Promise<void>;
	updateMetadata(image: GalleryImage, patch: GalleryMetadataPatch): Promise<void>;
}

export interface GalleryMetadataPatch {
	description?: null | string;
	name?: null | string;
	title?: null | string;
}

export type GallerySourceKind = 'bucket' | 'lantai' | 'recent' | 'vault';

/** 该数据源是否支持兰台式的元数据/标签管理。 */
export function isManageableSource(
	source: GalleryDataSource
): source is GalleryDataSource & GalleryManageableSource {
	return 'addTags' in source && 'removeTag' in source && 'updateMetadata' in source;
}
