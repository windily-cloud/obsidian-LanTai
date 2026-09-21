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

export type ResolveBrowserStorage = (profileId: string) => Promise<ObjectStorageBrowser>;

export class RecentUploadsSource implements GalleryDataSource {
	public readonly kind = 'recent' as const;
	private filtered: GalleryImage[] = [];
	private offset = 0;

	public constructor(
		private readonly history: UploadHistoryStore,
		private readonly resolveStorage: ResolveBrowserStorage
	) {}

	public async delete(image: GalleryImage): Promise<void> {
		const storage = await this.resolveStorage(image.profileId ?? '');
		await storage.delete(image.key);
		await this.history.removeByKey(image.profileId ?? '', image.key);
	}

	public loadMore(limit: number): Promise<GalleryImagePage> {
		const items = this.filtered.slice(this.offset, this.offset + limit);
		this.offset += items.length;
		return Promise.resolve({ hasMore: this.offset < this.filtered.length, items });
	}

	public purge(image: GalleryImage): Promise<void> {
		return this.history.removeByKey(image.profileId ?? '', image.key);
	}

	public setQuery(query: string): void {
		this.offset = 0;
		const normalizedQuery = query.trim().toLowerCase();
		this.filtered = this.history
			.listAll()
			.filter((entry) => !normalizedQuery || entry.key.toLowerCase().includes(normalizedQuery))
			.slice()
			.sort((left, right) => right.timestamp - left.timestamp)
			.map(toGalleryImage);
	}

	public async thumbnailUrl(image: GalleryImage): Promise<string> {
		if (image.url !== undefined && image.url !== '') {
			return image.url;
		}
		const storage = await this.resolveStorage(image.profileId ?? '');
		return storage.buildPublicUrl(image.key);
	}

	/**
	 * Returns whether the remote object is confirmed present.
	 * Permission/probe failures resolve to `true` so broken-image cleanup does not purge.
	 */
	public async verify(image: GalleryImage): Promise<boolean> {
		const storage = await this.resolveStorage(image.profileId ?? '');
		const result = await probeObjectExists(storage, image.key);
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
