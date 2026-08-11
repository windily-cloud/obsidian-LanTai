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
	key: string;
	kind: GallerySourceKind;
	name: string;
	profileId?: string;
	size?: number;
	timestamp?: number;
	url?: string;
}

export interface GalleryImagePage {
	readonly hasMore: boolean;
	readonly items: GalleryImage[];
}

export type GallerySourceKind = 'bucket' | 'recent' | 'vault';
