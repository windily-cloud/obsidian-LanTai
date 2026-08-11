import { noopAsync } from 'obsidian-dev-utils/function';

import type {
	VaultImage,
	VaultImageBrowser
} from '../adapters/obsidian/vault-image-browser.obsidian.ts';
import type {
	GalleryDataSource,
	GalleryImage,
	GalleryImagePage
} from './gallery-source.ts';

export class VaultGallerySource implements GalleryDataSource {
	public readonly kind = 'vault' as const;
	private filtered: GalleryImage[] = [];
	private offset = 0;

	public constructor(private readonly browser: VaultImageBrowser) {}

	public async delete(image: GalleryImage): Promise<void> {
		await this.browser.trash(image.key);
	}

	public loadMore(limit: number): Promise<GalleryImagePage> {
		const items = this.filtered.slice(this.offset, this.offset + limit);
		this.offset += items.length;
		return Promise.resolve({ hasMore: this.offset < this.filtered.length, items });
	}

	public purge(): Promise<void> {
		return noopAsync();
	}

	public setQuery(query: string): void {
		this.offset = 0;
		const normalizedQuery = query.trim().toLowerCase();
		this.filtered = this.browser
			.listImages()
			.filter((image) => !normalizedQuery || image.path.toLowerCase().includes(normalizedQuery))
			.map(toGalleryImage);
	}

	public thumbnailUrl(image: GalleryImage): string {
		return this.browser.resourceUrl(image.key);
	}

	public verify(): Promise<boolean> {
		return Promise.resolve(true);
	}
}

function toGalleryImage(image: VaultImage): GalleryImage {
	return {
		key: image.path,
		kind: 'vault',
		name: image.name,
		size: image.size,
		timestamp: image.mtime
	};
}
