import type { Plugin } from 'obsidian';

import type { RemoteImageReferenceFinder } from '../link/remote-image-reference-finder.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type { ObjectStorageBrowser } from '../storage/object-storage.ts';
import type { StorageSecrets } from '../storage/storage-secrets.ts';

import {
	STORAGE_GALLERY_VIEW_TYPE,
	StorageGalleryView
} from './storage-gallery-view.ts';

export interface RegisterStorageGalleryParams {
	createStorage(profile: StorageProfile, secrets: StorageSecrets): Promise<ObjectStorageBrowser>;
	readonly findReferences: RemoteImageReferenceFinder;
	getSecret(name: string): null | string;
	readonly plugin: Plugin;
	saveSettings(): Promise<void>;
	readonly settings: PluginSettings;
}

export function registerStorageGallery(params: RegisterStorageGalleryParams): void {
	params.plugin.registerView(STORAGE_GALLERY_VIEW_TYPE, (leaf) =>
		new StorageGalleryView({
			createStorage: (profile, secrets): Promise<ObjectStorageBrowser> => params.createStorage(profile, secrets),
			findReferences: params.findReferences,
			getSecret: (name): null | string => params.getSecret(name),
			leaf,
			saveSettings: (): Promise<void> => params.saveSettings(),
			settings: params.settings
		}));

	params.plugin.addRibbonIcon('cloud', 'Browse S3 images', () => {
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
