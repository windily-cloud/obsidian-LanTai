import { Files } from 'files-sdk';

import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser
} from './object-storage.ts';
import type { StorageSecrets } from './storage-secrets.ts';

import { FilesSdkObjectStorage } from './files-sdk-object-storage.ts';
import { createAlibabaFiles } from './providers/alibaba.ts';
import { createR2Files } from './providers/r2.ts';
import { createS3CompatibleFiles } from './providers/s3-compatible.ts';
import { createS3Files } from './providers/s3.ts';
import { createTencentFiles } from './providers/tencent.ts';

export type { StorageSecrets } from './storage-secrets.ts';

export async function createObjectStorage(
	profile: StorageProfile,
	secrets: StorageSecrets
): Promise<ObjectStorage & ObjectStorageBrowser> {
	const files = await createFiles(profile, secrets);
	return new FilesSdkObjectStorage({ files });
}

async function createFiles(
	profile: StorageProfile,
	secrets: StorageSecrets
): Promise<Files> {
	switch (profile.provider) {
		case 'alibaba':
			return createAlibabaFiles(profile, secrets);
		case 'r2':
			return createR2Files(profile, secrets);
		case 's3':
			return createS3Files(profile, secrets);
		case 's3Compatible':
			return createS3CompatibleFiles(profile, secrets);
		case 'tencent':
			return createTencentFiles(profile, secrets);
		default: {
			const _exhaustive: never = profile.provider;
			return _exhaustive;
		}
	}
}
