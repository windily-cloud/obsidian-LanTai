import { noopAsync } from 'obsidian-dev-utils/function';
import {
	describe,
	expect,
	it
} from 'vitest';

import type {
	VaultImage,
	VaultImageBrowser
} from '../../adapters/obsidian/vault-image-browser.obsidian.ts';
import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type {
	ObjectStorageBrowser,
	ObjectStorageFile,
	ObjectStorageListResult
} from '../object-storage.ts';
import type { StorageSecrets } from '../storage-secrets.ts';
import type {
	UploadHistoryEntry,
	UploadHistoryStore
} from '../upload-history.ts';

import { BucketGallerySource } from '../bucket-gallery-source.ts';
import { resolveGalleryBrowserStorage } from '../gallery-source-factory.ts';
import { RecentUploadsSource } from '../recent-uploads-source.ts';
import { VaultGallerySource } from '../vault-gallery-source.ts';

const PUBLIC_BASE = 'https://cdn.example.com';

interface FakeBrowserStorageOptions {
	readonly existsError?: Error;
}

type ObjectStorageListOptions = NonNullable<Parameters<ObjectStorageBrowser['list']>[0]>;

class FakeBrowserStorage implements ObjectStorageBrowser {
	public readonly deletedKeys: string[] = [];
	public readonly files: ObjectStorageFile[];
	private readonly existsError: Error | undefined;
	private readonly searchable: ObjectStorageFile[];

	public constructor(files: ObjectStorageFile[], options: FakeBrowserStorageOptions = {}) {
		this.files = [...files].sort((left, right) => left.key.localeCompare(right.key));
		this.searchable = files;
		this.existsError = options.existsError;
	}

	public buildPublicUrl(objectKey: string): Promise<string> {
		return Promise.resolve(`${PUBLIC_BASE}/${objectKey}`);
	}

	public delete(objectKey: string): Promise<void> {
		this.deletedKeys.push(objectKey);
		return noopAsync();
	}

	public exists(objectKey: string): Promise<boolean> {
		if (this.existsError) {
			return Promise.reject(this.existsError);
		}
		return Promise.resolve(this.files.some((file) => file.key === objectKey));
	}

	public list(options: ObjectStorageListOptions = {}): Promise<ObjectStorageListResult> {
		const startIndex = options.cursor === undefined
			? 0
			: this.files.findIndex((file) => file.key === options.cursor) + 1;
		const slice = this.files.slice(startIndex, startIndex + (options.limit ?? 10));
		const last = slice.at(-1);
		return Promise.resolve(
			startIndex + slice.length < this.files.length && last
				? { cursor: last.key, items: slice }
				: { items: slice }
		);
	}

	public async *search(query: string): AsyncGenerator<ObjectStorageFile, void> {
		await noopAsync();
		for (const file of this.searchable) {
			if (file.key.toLowerCase().includes(query.toLowerCase())) {
				yield file;
			}
		}
	}
}

class FakeHistoryStore implements UploadHistoryStore {
	public entries: UploadHistoryEntry[];

	public constructor(entries: UploadHistoryEntry[]) {
		this.entries = entries;
	}

	public append(entry: UploadHistoryEntry): Promise<void> {
		this.entries = [entry, ...this.entries];
		return noopAsync();
	}

	public list(profileId: string): UploadHistoryEntry[] {
		return this.entries.filter((entry) => entry.profileId === profileId);
	}

	public listAll(): UploadHistoryEntry[] {
		return [...this.entries];
	}

	public ready(): Promise<void> {
		return noopAsync();
	}

	public removeByKey(profileId: string, key: string): Promise<void> {
		this.entries = this.entries.filter(
			(entry) => !(entry.profileId === profileId && entry.key === key)
		);
		return noopAsync();
	}
}

class FakeVaultBrowser implements VaultImageBrowser {
	public readonly trashedPaths: string[] = [];

	public constructor(private readonly images: VaultImage[]) {}

	public listImages(): VaultImage[] {
		return [...this.images].sort((left, right) => right.mtime - left.mtime);
	}

	public resourceUrl(path: string): string {
		return `app://resource/${path}`;
	}

	public trash(path: string): Promise<void> {
		this.trashedPaths.push(path);
		return noopAsync();
	}
}

describe('BucketGallerySource', () => {
	it('lists image keys in key order with pagination', async () => {
		const storage = new FakeBrowserStorage([
			{ key: 'a.png', size: 1 },
			{ key: 'b.jpg', size: 2 },
			{ key: 'c.txt', size: 3 },
			{ key: 'd.webp', size: 4 }
		]);
		const source = new BucketGallerySource(storage, 'p1');
		source.setQuery('');

		const first = await source.loadMore(2);
		expect(first.items.map((item) => item.key)).toEqual(['a.png', 'b.jpg']);
		expect(first.hasMore).toBe(true);
		expect(first.items.every((item) => item.kind === 'bucket')).toBe(true);

		const second = await source.loadMore(2);
		expect(second.items.map((item) => item.key)).toEqual(['d.webp']);
		expect(second.hasMore).toBe(false);
	});

	it('skips non-image keys while paginating', async () => {
		const storage = new FakeBrowserStorage([
			{ key: 'a.txt', size: 1 },
			{ key: 'b.png', size: 2 }
		]);
		const source = new BucketGallerySource(storage, 'p1');
		source.setQuery('');

		const page = await source.loadMore(10);
		expect(page.items.map((item) => item.key)).toEqual(['b.png']);
		expect(page.hasMore).toBe(false);
	});

	it('searches with a generator and resets on query change', async () => {
		const storage = new FakeBrowserStorage([
			{ key: 'cat.png', size: 1 },
			{ key: 'dog.jpg', size: 2 },
			{ key: 'catalog.png', size: 3 }
		]);
		const source = new BucketGallerySource(storage, 'p1');
		source.setQuery('cat');
		const page = await source.loadMore(10);
		expect(page.items.map((item) => item.key)).toEqual(['cat.png', 'catalog.png']);
		expect(page.hasMore).toBe(false);
	});

	it('deletes through the storage', async () => {
		const storage = new FakeBrowserStorage([{ key: 'a.png', size: 1 }]);
		const source = new BucketGallerySource(storage, 'p1');
		await source.delete({ key: 'a.png', kind: 'bucket', name: 'a.png' });
		expect(storage.deletedKeys).toEqual(['a.png']);
	});
});

describe('RecentUploadsSource', () => {
	const entries: UploadHistoryEntry[] = [
		{ key: 'new.png', profileId: 'p1', timestamp: 2000, url: `${PUBLIC_BASE}/new.png` },
		{ key: 'old.png', profileId: 'p1', timestamp: 1000, url: `${PUBLIC_BASE}/old.png` },
		{ key: 'other.png', profileId: 'p2', timestamp: 3000, url: `${PUBLIC_BASE}/other.png` }
	];

	it('lists every profile, newest first', async () => {
		const source = new RecentUploadsSource(
			new FakeHistoryStore(entries),
			() => Promise.resolve(new FakeBrowserStorage([]))
		);
		source.setQuery('');
		const page = await source.loadMore(10);
		expect(page.items.map((item) => item.key)).toEqual(['other.png', 'new.png', 'old.png']);
		expect(page.hasMore).toBe(false);
	});

	it('uses the stored url without resolving storage', async () => {
		let resolved = 0;
		const source = new RecentUploadsSource(
			new FakeHistoryStore(entries),
			() => {
				resolved += 1;
				return Promise.resolve(new FakeBrowserStorage([]));
			}
		);
		source.setQuery('');
		const page = await source.loadMore(1);
		const first = page.items[0];
		if (first === undefined) {
			throw new Error('expected an item');
		}
		expect(await source.thumbnailUrl(first)).toBe(`${PUBLIC_BASE}/other.png`);
		expect(resolved).toBe(0);
	});

	it('deletes through the storage for that entry profileId', async () => {
		const history = new FakeHistoryStore(entries);
		const storageP2 = new FakeBrowserStorage([]);
		const source = new RecentUploadsSource(history, (profileId) => {
			if (profileId !== 'p2') {
				throw new Error(`unexpected profile ${profileId}`);
			}
			return Promise.resolve(storageP2);
		});
		await source.delete({ key: 'other.png', kind: 'recent', name: 'other.png', profileId: 'p2' });
		expect(storageP2.deletedKeys).toEqual(['other.png']);
		expect(history.entries.map((entry) => entry.key)).toEqual(['new.png', 'old.png']);
	});

	it('filters by query and paginates', async () => {
		const many = Array.from(
			{ length: 5 },
			(_, index) => ({
				key: `img-${String(index)}.png`,
				profileId: 'p1',
				timestamp: index,
				url: `${PUBLIC_BASE}/img-${String(index)}.png`
			})
		);
		const source = new RecentUploadsSource(
			new FakeHistoryStore(many),
			() => Promise.resolve(new FakeBrowserStorage([]))
		);
		source.setQuery('img-');
		const first = await source.loadMore(2);
		const second = await source.loadMore(2);
		expect(first.items).toHaveLength(2);
		expect(second.items).toHaveLength(2);
		expect(first.hasMore).toBe(true);
		expect(second.hasMore).toBe(true);
	});

	it('deletes remotely and from history', async () => {
		const history = new FakeHistoryStore(entries);
		const storage = new FakeBrowserStorage([]);
		const source = new RecentUploadsSource(history, () => Promise.resolve(storage));
		await source.delete({ key: 'old.png', kind: 'recent', name: 'old.png', profileId: 'p1' });
		expect(storage.deletedKeys).toEqual(['old.png']);
		expect(history.entries.map((entry) => entry.key)).toEqual(['new.png', 'other.png']);
	});

	it('purges from history without touching remote', async () => {
		const history = new FakeHistoryStore(entries);
		const storage = new FakeBrowserStorage([]);
		const source = new RecentUploadsSource(history, () => Promise.resolve(storage));
		await source.purge({ key: 'old.png', kind: 'recent', name: 'old.png', profileId: 'p1' });
		expect(storage.deletedKeys).toEqual([]);
		expect(history.entries.map((entry) => entry.key)).toEqual(['new.png', 'other.png']);
	});

	it('treats exists permission errors as still present during verify', async () => {
		const history = new FakeHistoryStore(entries);
		const storage = new FakeBrowserStorage([], {
			existsError: Object.assign(new Error('UnknownError'), { code: 'Unknown' })
		});
		const source = new RecentUploadsSource(history, () => Promise.resolve(storage));
		expect(
			await source.verify({
				key: 'missing.png',
				kind: 'recent',
				name: 'missing.png',
				profileId: 'p1'
			})
		).toBe(true);
	});

	it('reports missing objects as not present', async () => {
		const history = new FakeHistoryStore(entries);
		const storage = new FakeBrowserStorage([]);
		const source = new RecentUploadsSource(history, () => Promise.resolve(storage));
		expect(
			await source.verify({
				key: 'old.png',
				kind: 'recent',
				name: 'old.png',
				profileId: 'p1'
			})
		).toBe(false);
	});
});

describe('VaultGallerySource', () => {
	it('lists vault images sorted by mtime and paginates', async () => {
		const browser = new FakeVaultBrowser([
			{ mtime: 100, name: 'a.png', path: 'x/a.png', size: 1 },
			{ mtime: 300, name: 'b.jpg', path: 'x/b.jpg', size: 2 },
			{ mtime: 200, name: 'c.webp', path: 'x/c.webp', size: 3 }
		]);
		const source = new VaultGallerySource(browser);
		source.setQuery('');
		const first = await source.loadMore(2);
		const second = await source.loadMore(2);
		expect(first.items.map((item) => item.key)).toEqual(['x/b.jpg', 'x/c.webp']);
		expect(second.items.map((item) => item.key)).toEqual(['x/a.png']);
		expect(second.hasMore).toBe(false);
	});

	it('filters by path query', async () => {
		const browser = new FakeVaultBrowser([
			{ mtime: 100, name: 'a.png', path: 'photos/a.png', size: 1 },
			{ mtime: 200, name: 'b.jpg', path: 'docs/b.jpg', size: 2 }
		]);
		const source = new VaultGallerySource(browser);
		source.setQuery('photos');
		const page = await source.loadMore(10);
		expect(page.items.map((item) => item.key)).toEqual(['photos/a.png']);
	});

	it('trashes through the browser', async () => {
		const browser = new FakeVaultBrowser([{ mtime: 100, name: 'a.png', path: 'photos/a.png', size: 1 }]);
		const source = new VaultGallerySource(browser);
		await source.delete({ key: 'photos/a.png', kind: 'vault', name: 'a.png' });
		expect(browser.trashedPaths).toEqual(['photos/a.png']);
	});
});

describe('resolveGalleryBrowserStorage', () => {
	it('creates LanTai storage without bucket secrets', async () => {
		const created: string[] = [];
		await resolveGalleryBrowserStorage({
			createStorage: (profile) => {
				created.push(profile.id);
				return Promise.resolve(new FakeBrowserStorage([]));
			},
			getSecret: (): null => null,
			profileId: 'lantai',
			profiles: [lantaiProfile(), bucketProfile()]
		});
		expect(created).toEqual(['lantai']);
	});

	it('creates S3 storage with that profile secrets', async () => {
		const seen: string[] = [];
		await resolveGalleryBrowserStorage({
			createStorage: (profile, secrets: StorageSecrets) => {
				seen.push(profile.id, secrets.accessKeyId, secrets.secretAccessKey);
				return Promise.resolve(new FakeBrowserStorage([]));
			},
			getSecret: (name): string => `${name}-value`,
			profileId: 'p1',
			profiles: [lantaiProfile(), bucketProfile()]
		});
		expect(seen).toEqual(['p1', 'p1-access-key-value', 'p1-secret-key-value']);
	});
});

function bucketProfile(): StorageProfile {
	return {
		accessKeyIdSecretName: 'p1-access-key',
		bucket: 'photos',
		id: 'p1',
		name: 'Photos',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: '${originalName}.${ext}',
		provider: 's3',
		publicBaseUrl: PUBLIC_BASE,
		secretAccessKeySecretName: 'p1-secret-key'
	};
}

function lantaiProfile(): StorageProfile {
	return {
		accessKeyIdSecretName: 'lt-access',
		bucket: '',
		id: 'lantai',
		name: 'LanTai',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: '${originalName}.${ext}',
		provider: 'lantai',
		publicBaseUrl: '',
		secretAccessKeySecretName: 'lt-secret'
	};
}
