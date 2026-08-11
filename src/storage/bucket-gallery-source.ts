import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	GalleryDataSource,
	GalleryImage,
	GalleryImagePage
} from './gallery-source.ts';
import type {
	ObjectStorageBrowser,
	ObjectStorageFile
} from './object-storage.ts';

import { isImageKey } from '../path/image-extension.ts';

export class BucketGallerySource implements GalleryDataSource {
	public readonly kind = 'bucket' as const;
	private cursor: string | undefined;
	private hasMore = true;
	private query = '';
	private searchIterator: AsyncGenerator<ObjectStorageFile, void> | undefined;

	public constructor(
		private readonly storage: ObjectStorageBrowser,
		private readonly profileId: string
	) {}

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

	public setQuery(query: string): void {
		this.query = query;
		this.cursor = undefined;
		this.hasMore = true;
		const previousIterator = this.searchIterator;
		this.searchIterator = undefined;
		if (previousIterator) {
			previousIterator.return().then(() => undefined, () => undefined);
		}
		if (query) {
			this.searchIterator = this.storage.search(query);
		}
	}

	public thumbnailUrl(image: GalleryImage): Promise<string> {
		return this.storage.buildPublicUrl(image.key);
	}

	public verify(): Promise<boolean> {
		return Promise.resolve(true);
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
		key: file.key,
		kind: 'bucket',
		name: file.key.split('/').at(-1) ?? file.key,
		profileId,
		size: file.size,
		...(file.lastModified === undefined ? {} : { timestamp: file.lastModified })
	};
}
