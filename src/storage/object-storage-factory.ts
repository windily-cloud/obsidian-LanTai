import type {
	S3StorageProvider,
	StorageProfile
} from '../settings/sections/s3/storage-profile.ts';
import type { ObjectStorageTransport } from './object-storage-transport.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser
} from './object-storage.ts';
import type { StorageProviderAdapter } from './providers/storage-provider-adapter.ts';
import type { StorageSecrets } from './storage-secrets.ts';

import { t } from '../i18n/index.ts';
import { LanTaiObjectStorage } from './lantai-object-storage.ts';
import { AlibabaOssProviderAdapter } from './providers/alibaba.ts';
import { CloudflareR2ProviderAdapter } from './providers/r2.ts';
import { S3CompatibleProviderAdapter } from './providers/s3-compatible.ts';
import { AwsS3ProviderAdapter } from './providers/s3.ts';
import { TencentCosProviderAdapter } from './providers/tencent.ts';
import { S3ObjectStorage } from './s3-object-storage.ts';

export type { StorageSecrets } from './storage-secrets.ts';

/**
 * 兰台账号级凭证的来源。每次构造存储时读取，因此用户改设置或换 key 不需要重建工厂。
 */
export interface CreateObjectStorageFactoryOptions {
	/** SecretStorage 中的 API key；未配置时返回 null。 */
	apiKey(): null | string;
	/** 兰台服务地址。 */
	baseUrl(): string;
}

type CreateObjectStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage & ObjectStorageBrowser>;

/** Registry of S3-compatible provider adapters. Add a provider = new class + one entry. */
const PROVIDER_ADAPTERS: Readonly<Record<S3StorageProvider, StorageProviderAdapter>> = {
	alibaba: new AlibabaOssProviderAdapter(),
	r2: new CloudflareR2ProviderAdapter(),
	s3: new AwsS3ProviderAdapter(),
	s3Compatible: new S3CompatibleProviderAdapter(),
	tencent: new TencentCosProviderAdapter()
};

/**
 * Builds a `(profile, secrets) => ObjectStorage` factory bound to a transport
 * (typically Obsidian `requestUrl`; tests inject a fake).
 *
 * lantai 不走 `StorageProviderAdapter`：它既不是 S3 协议，也没有配置档级凭证。
 */
export function createObjectStorageFactory(
	transport: ObjectStorageTransport,
	lanTai?: CreateObjectStorageFactoryOptions
): CreateObjectStorage {
	return (profile, secrets): Promise<ObjectStorage & ObjectStorageBrowser> => {
		const { provider } = profile;
		if (provider === 'lantai') {
			return Promise.resolve(createLanTaiStorage(transport, lanTai));
		}
		const adapter = PROVIDER_ADAPTERS[provider];
		const connection = adapter.createConnection(profile, secrets);
		return Promise.resolve(new S3ObjectStorage({ connection, transport }));
	};
}

function createLanTaiStorage(
	transport: ObjectStorageTransport,
	options: CreateObjectStorageFactoryOptions | undefined
): LanTaiObjectStorage {
	if (options === undefined) {
		throw new Error(t('errors.lantaiBaseUrlMissing'));
	}
	const baseUrl = options.baseUrl().trim();
	if (baseUrl === '') {
		throw new Error(t('errors.lantaiBaseUrlMissing'));
	}
	const apiKey = options.apiKey()?.trim() ?? '';
	if (apiKey === '') {
		throw new Error(t('errors.lantaiApiKeyMissing'));
	}
	return new LanTaiObjectStorage({ apiKey, baseUrl, transport });
}
