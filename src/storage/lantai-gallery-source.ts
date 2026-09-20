import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	GalleryDataSource,
	GalleryImage,
	GalleryImagePage,
	GalleryManageableSource,
	GalleryMetadataPatch
} from './gallery-source.ts';
import type { LanTaiObjectStorage } from './lantai-object-storage.ts';
import type { ObjectStorageFile } from './object-storage.ts';

import { isImageKey } from '../path/image-extension.ts';

/**
 * 兰台源的画廊数据源。
 *
 * 与 `BucketGallerySource` 的差别：列表项自带 `url` / `title` / `description` / `tags`
 * （后端 Phase 1 的 Bearer 面已对齐 session 面），因此缩略图不需要逐项换取 URL，
 * 详情弹窗也不需要额外请求。删除是软删（7 天回收期），与 S3 的硬删语义不同。
 *
 * 额外实现 `GalleryManageableSource`，提供 web 控制台同款的元数据与标签编辑。
 */
export class LanTaiGallerySource implements GalleryDataSource, GalleryManageableSource {
	public readonly kind = 'lantai' as const;
	private cursor: string | undefined;
	private hasMore = true;
	private query = '';
	private searchIterator: AsyncGenerator<ObjectStorageFile, void> | undefined;

	public constructor(
		private readonly storage: LanTaiObjectStorage,
		private readonly profileId: string
	) {}

	public addTags(image: GalleryImage, names: readonly string[]): Promise<void> {
		return this.storage.addTags(image.key, names);
	}

	public delete(image: GalleryImage): Promise<void> {
		return this.storage.delete(image.key);
	}

	public async loadMore(limit: number): Promise<GalleryImagePage> {
		if (!this.hasMore) {
			return { hasMore: false, items: [] };
		}
		const items: GalleryImage[] = [];
		if (this.query) {
			await this.loadSearchPage(items, limit);
		} else {
			await this.loadListPage(items, limit);
		}
		return { hasMore: this.hasMore, items };
	}

	public purge(): Promise<void> {
		return noopAsync();
	}

	public removeTag(image: GalleryImage, name: string): Promise<void> {
		return this.storage.removeTag(image.key, name);
	}

	public setQuery(query: string): void {
		this.query = query;
		this.cursor = undefined;
		this.hasMore = true;
		const previousIterator = this.searchIterator;
		this.searchIterator = undefined;
		if (previousIterator) {
			previousIterator.return().then(() => undefined, () => undefined);
		}
		// `tag:` 前缀语法由 LanTaiObjectStorage.search 解析并映射到 /objects/search。
		this.searchIterator = this.storage.search(query);
	}

	public thumbnailUrl(image: GalleryImage): Promise<string> | string {
		// 列表项自带服务端下发的 URL；缺省时才回退到换取接口。
		return image.url ?? this.storage.buildPublicUrl(image.key);
	}

	public async updateMetadata(image: GalleryImage, patch: GalleryMetadataPatch): Promise<void> {
		await this.storage.updateMetadata(image.key, patch);
	}

	public verify(image: GalleryImage): Promise<boolean> {
		return this.storage.exists(image.key);
	}

	private async loadListPage(items: GalleryImage[], limit: number): Promise<void> {
		do {
			const page = await this.storage.list({
				...(this.cursor === undefined ? {} : { cursor: this.cursor }),
				limit
			});
			for (const file of page.items) {
				if (isImageKey(file.key)) {
					items.push(toGalleryImage(file, this.profileId));
				}
			}
			this.cursor = page.cursor;
			this.hasMore = page.cursor !== undefined;
		} while (items.length < limit && this.hasMore);
	}

	private async loadSearchPage(items: GalleryImage[], limit: number): Promise<void> {
		const iterator = this.searchIterator;
		if (!iterator) {
			this.hasMore = false;
			return;
		}
		while (items.length < limit) {
			const result = await iterator.next();
			if (result.done) {
				this.hasMore = false;
				break;
			}
			if (isImageKey(result.value.key)) {
				items.push(toGalleryImage(result.value, this.profileId));
			}
		}
	}
}

function toGalleryImage(file: ObjectStorageFile, profileId: string): GalleryImage {
	return {
		description: file.description ?? null,
		key: file.key,
		kind: 'lantai',
		name: file.key.split('/').at(-1) ?? file.key,
		profileId,
		size: file.size,
		tags: file.tags ?? [],
		...(file.lastModified === undefined ? {} : { timestamp: file.lastModified }),
		title: file.title ?? null,
		...(file.url === undefined ? {} : { url: file.url }),
		...(file.image === undefined
			? {}
			: {
				image: {
					format: file.image.format,
					height: file.image.height,
					width: file.image.width
				}
			}),
		...(file.originalSize === undefined ? {} : { originalSize: file.originalSize }),
		...(file.processed === undefined ? {} : { processed: file.processed })
	};
}
