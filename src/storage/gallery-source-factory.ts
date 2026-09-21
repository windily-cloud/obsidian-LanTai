import type { VaultImageBrowser } from '../adapters/obsidian/vault-image-browser.obsidian.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	CreateGallerySourceInput,
	GalleryDataSource
} from './gallery-source.ts';
import type { LanTaiObjectStorage } from './lantai-object-storage.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser
} from './object-storage.ts';
import type { StorageSecrets } from './storage-secrets.ts';
import type { UploadHistoryStore } from './upload-history.ts';

import { t } from '../i18n/index.ts';
import { BucketGallerySource } from './bucket-gallery-source.ts';
import { LanTaiGallerySource } from './lantai-gallery-source.ts';
import { RecentUploadsSource } from './recent-uploads-source.ts';
import { validateStorageSecrets } from './storage-credential-guard.ts';
import { VaultGallerySource } from './vault-gallery-source.ts';

interface GallerySourceFactoryInput extends CreateGallerySourceInput {
	readonly history: UploadHistoryStore;
	resolveBrowserStorage(profileId: string): Promise<ObjectStorageBrowser>;
	storageFactory(profile: StorageProfile, secrets: StorageSecrets): Promise<ObjectStorage & ObjectStorageBrowser>;
	readonly vaultImages: VaultImageBrowser;
}

interface ResolveGalleryBrowserStorageParams {
	createStorage(profile: StorageProfile, secrets: StorageSecrets): Promise<ObjectStorageBrowser>;
	getSecret(name: string): null | string;
	readonly profileId: string;
	readonly profiles: readonly StorageProfile[];
}

export async function createGallerySource(
	input: GallerySourceFactoryInput
): Promise<GalleryDataSource> {
	switch (input.kind) {
		case 'bucket': {
			const { profile, secrets } = input;
			if (!profile || !secrets) {
				throw new Error('Storage profile or secrets are missing');
			}
			const storage = await input.storageFactory(profile, secrets);
			return new BucketGallerySource(storage, profile.id);
		}
		case 'lantai': {
			const { profile } = input;
			if (!profile) {
				throw new Error('Storage profile is missing');
			}
			// Lantai 没有配置档级凭证：工厂会从账号级设置读取 baseUrl 与 API key。
			const storage = await input.storageFactory(
				profile,
				input.secrets ?? { accessKeyId: '', secretAccessKey: '' }
			);
			// 这里的窄化是安全的：storageFactory 对 provider === 'lantai' 返回 LanTaiObjectStorage。
			return new LanTaiGallerySource(storage as LanTaiObjectStorage, profile.id);
		}
		case 'recent': {
			await input.history.ready();
			return new RecentUploadsSource(
				input.history,
				(profileId): Promise<ObjectStorageBrowser> => input.resolveBrowserStorage(profileId)
			);
		}
		case 'vault':
			return new VaultGallerySource(input.vaultImages);
		default: {
			const _exhaustive: never = input.kind;
			return _exhaustive;
		}
	}
}

/** 最近时间线按条目 `profileId` 解析对应存储：兰台走 REST，S3 走桶凭证。 */
export function resolveGalleryBrowserStorage(
	params: ResolveGalleryBrowserStorageParams
): Promise<ObjectStorageBrowser> {
	const profile = params.profiles.find((item) => item.id === params.profileId);
	if (profile === undefined) {
		return Promise.reject(new Error(t('errors.noActiveStorageProfile')));
	}
	if (profile.provider === 'lantai') {
		return params.createStorage(profile, { accessKeyId: '', secretAccessKey: '' });
	}
	const accessKeyId = params.getSecret(profile.accessKeyIdSecretName);
	const secretAccessKey = params.getSecret(profile.secretAccessKeySecretName);
	if (!accessKeyId || !secretAccessKey) {
		return Promise.reject(new Error(t('errors.storageSecretsMissing')));
	}
	const secretProblem = validateStorageSecrets({
		accessKeyId,
		accessKeyIdSecretName: profile.accessKeyIdSecretName,
		secretAccessKey,
		secretAccessKeySecretName: profile.secretAccessKeySecretName
	});
	if (secretProblem) {
		return Promise.reject(new Error(secretProblem));
	}
	return params.createStorage(profile, { accessKeyId, secretAccessKey });
}
