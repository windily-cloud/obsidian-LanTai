import type {
	GalleryDataSource,
	GalleryImage,
	GalleryImagePage
} from './gallery-source.ts';
import type { ObjectStorageBrowser } from './object-storage.ts';
import type {
	UploadHistoryEntry,
	UploadHistoryStore
} from './upload-history.ts';

import { probeObjectExists } from './probe-object-exists.ts';

export class RecentUploadsSource implements GalleryDataSource {
	public readonly kind = 'recent' as const;
	private filtered: GalleryImage[] = [];
	private offset = 0;

	public constructor(
		private readonly history: UploadHistoryStore,
		private readonly storage: ObjectStorageBrowser,
		private readonly profileId: string
	) {}

	public async delete(image: GalleryImage): Promise<void> {
		await this.storage.delete(image.key);
		await this.history.removeByKey(this.profileId, image.key);
	}

	public loadMore(limit: number): Promise<GalleryImagePage> {
		const items = this.filtered.slice(this.offset, this.offset + limit);
		this.offset += items.length;
		return Promise.resolve({ hasMore: this.offset < this.filtered.length, items });
	}

	public purge(image: GalleryImage): Promise<void> {
		return this.history.removeByKey(this.profileId, image.key);
	}

	public setQuery(query: string): void {
		this.offset = 0;
		const normalizedQuery = query.trim().toLowerCase();
		this.filtered = this.history
			.list(this.profileId)
			.filter((entry) => !normalizedQuery || entry.key.toLowerCase().includes(normalizedQuery))
			.map(toGalleryImage);
	}

	public thumbnailUrl(image: GalleryImage): Promise<string> {
		return this.storage.buildPublicUrl(image.key);
	}

	/**
	 * Returns whether the remote object is confirmed present.
	 * Permission/probe failures resolve to `true` so broken-image cleanup does not purge.
	 */
	public async verify(image: GalleryImage): Promise<boolean> {
		const result = await probeObjectExists(this.storage, image.key);
		return result !== false;
	}
}

function toGalleryImage(entry: UploadHistoryEntry): GalleryImage {
	return {
		key: entry.key,
		kind: 'recent',
		name: entry.key.split('/').at(-1) ?? entry.key,
		profileId: entry.profileId,
		timestamp: entry.timestamp,
		url: entry.url
	};
}
