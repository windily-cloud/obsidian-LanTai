import type { VaultImageBrowser } from '../adapters/obsidian/vault-image-browser.obsidian.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	CreateGallerySourceInput,
	GalleryDataSource
} from './gallery-source.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser
} from './object-storage.ts';
import type { StorageSecrets } from './storage-secrets.ts';
import type { UploadHistoryStore } from './upload-history.ts';

import { BucketGallerySource } from './bucket-gallery-source.ts';
import { RecentUploadsSource } from './recent-uploads-source.ts';
import { VaultGallerySource } from './vault-gallery-source.ts';

export interface GallerySourceFactoryInput extends CreateGallerySourceInput {
	readonly history: UploadHistoryStore;
	readonly storageFactory: CreateStorage;
	readonly vaultImages: VaultImageBrowser;
}

type CreateStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage & ObjectStorageBrowser>;

export async function createGallerySource(
	input: GallerySourceFactoryInput
): Promise<GalleryDataSource> {
	switch (input.kind) {
		case 'bucket':
		case 'recent': {
			const { profile, secrets } = input;
			if (!profile || !secrets) {
				throw new Error('Storage profile or secrets are missing');
			}
			const storage = await input.storageFactory(profile, secrets);
			if (input.kind === 'recent') {
				await input.history.ready();
				return new RecentUploadsSource(input.history, storage, profile.id);
			}
			return new BucketGallerySource(storage, profile.id);
		}
		case 'vault':
			return new VaultGallerySource(input.vaultImages);
		default: {
			const _exhaustive: never = input.kind;
			return _exhaustive;
		}
	}
}
