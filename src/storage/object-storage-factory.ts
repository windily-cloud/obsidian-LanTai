import type {
	StorageProfile,
	StorageProvider
} from '../settings/sections/s3/storage-profile.ts';
import type { ObjectStorageTransport } from './object-storage-transport.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser
} from './object-storage.ts';
import type { StorageProviderAdapter } from './providers/storage-provider-adapter.ts';
import type { StorageSecrets } from './storage-secrets.ts';

import { AlibabaOssProviderAdapter } from './providers/alibaba.ts';
import { CloudflareR2ProviderAdapter } from './providers/r2.ts';
import { S3CompatibleProviderAdapter } from './providers/s3-compatible.ts';
import { AwsS3ProviderAdapter } from './providers/s3.ts';
import { TencentCosProviderAdapter } from './providers/tencent.ts';
import { S3ObjectStorage } from './s3-object-storage.ts';

export type { StorageSecrets } from './storage-secrets.ts';

type CreateObjectStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage & ObjectStorageBrowser>;

/** Registry of S3-compatible provider adapters. Add a provider = new class + one entry. */
const PROVIDER_ADAPTERS: Readonly<Record<StorageProvider, StorageProviderAdapter>> = {
	alibaba: new AlibabaOssProviderAdapter(),
	r2: new CloudflareR2ProviderAdapter(),
	s3: new AwsS3ProviderAdapter(),
	s3Compatible: new S3CompatibleProviderAdapter(),
	tencent: new TencentCosProviderAdapter()
};

/**
 * Builds a `(profile, secrets) => ObjectStorage` factory bound to a transport
 * (typically Obsidian `requestUrl`; tests inject a fake).
 */
export function createObjectStorageFactory(transport: ObjectStorageTransport): CreateObjectStorage {
	return (profile, secrets): Promise<ObjectStorage & ObjectStorageBrowser> => {
		const adapter = PROVIDER_ADAPTERS[profile.provider];
		const connection = adapter.createConnection(profile, secrets);
		return Promise.resolve(new S3ObjectStorage({ connection, transport }));
	};
}
