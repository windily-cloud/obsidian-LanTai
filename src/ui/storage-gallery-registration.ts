import type { Plugin } from 'obsidian';

import type { RemoteImageReferenceFinder } from '../link/remote-image-reference-finder.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	CreateGallerySourceInput,
	GalleryDataSource
} from '../storage/gallery-source.ts';
import type { ObjectStorage } from '../storage/object-storage.ts';
import type { StorageSecrets } from '../storage/storage-secrets.ts';
import type { GalleryUploadRequest } from './gallery-uploader.ts';

import { t } from '../i18n/index.ts';
import {
	STORAGE_GALLERY_VIEW_TYPE,
	StorageGalleryView
} from './storage-gallery-view.ts';

interface RegisterStorageGalleryParams {
	createGallerySource(input: CreateGallerySourceInput): Promise<GalleryDataSource>;
	createUploadStorage(
		profile: StorageProfile,
		secrets: StorageSecrets
	): Promise<ObjectStorage>;
	readonly findReferences: RemoteImageReferenceFinder;
	getSecret(name: string): null | string;
	pickAndUpload(params: GalleryUploadRequest): void;
	readonly plugin: Plugin;
	saveSettings(): Promise<void>;
	readonly settings: PluginSettings;
}

export function registerStorageGallery(params: RegisterStorageGalleryParams): void {
	params.plugin.registerView(STORAGE_GALLERY_VIEW_TYPE, (leaf) =>
		new StorageGalleryView({
			createGallerySource: (input): Promise<GalleryDataSource> => params.createGallerySource(input),
			createUploadStorage: (profile, secrets): Promise<ObjectStorage> => params.createUploadStorage(profile, secrets),
			findReferences: params.findReferences,
			getSecret: (name): null | string => params.getSecret(name),
			leaf,
			pickAndUpload: (uploadParams): void => {
				params.pickAndUpload(uploadParams);
			},
			saveSettings: (): Promise<void> => params.saveSettings(),
			settings: params.settings
		}));

	params.plugin.addRibbonIcon('cloud', t('gallery.browseRibbon'), () => {
		openStorageGallery(params.plugin).catch((error: unknown) => {
			console.error('Failed to open S3 image gallery', error);
		});
	});
}

async function openStorageGallery(plugin: Plugin): Promise<void> {
	const existingLeaf = plugin.app.workspace.getLeavesOfType(STORAGE_GALLERY_VIEW_TYPE)[0];
	const leaf = existingLeaf ?? plugin.app.workspace.getLeaf(true);
	if (!existingLeaf) {
		await leaf.setViewState({ active: true, type: STORAGE_GALLERY_VIEW_TYPE });
	} else if (leaf.view instanceof StorageGalleryView) {
		await leaf.view.refresh();
	}
	await plugin.app.workspace.revealLeaf(leaf);
}
