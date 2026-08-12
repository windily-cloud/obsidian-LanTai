import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { S3Connection } from '../s3-connection.ts';
import type { StorageSecrets } from '../storage-secrets.ts';
import type { StorageProviderAdapter } from './storage-provider-adapter.ts';

import { t } from '../../i18n/index.ts';

export class CloudflareR2ProviderAdapter implements StorageProviderAdapter {
	public createConnection(profile: StorageProfile, secrets: StorageSecrets): S3Connection {
		if (!profile.accountId) {
			throw new Error(t('errors.storageAccountIdRequired'));
		}
		return {
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			endpoint: `https://${profile.accountId}.r2.cloudflarestorage.com`,
			forcePathStyle: true,
			publicBaseUrl: profile.publicBaseUrl,
			region: 'auto',
			secretAccessKey: secrets.secretAccessKey
		};
	}
}
