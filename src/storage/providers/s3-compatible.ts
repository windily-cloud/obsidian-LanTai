import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { S3Connection } from '../s3-connection.ts';
import type { StorageSecrets } from '../storage-secrets.ts';
import type { StorageProviderAdapter } from './storage-provider-adapter.ts';

import { t } from '../../i18n/index.ts';

export class S3CompatibleProviderAdapter implements StorageProviderAdapter {
	public createConnection(profile: StorageProfile, secrets: StorageSecrets): S3Connection {
		if (!profile.endpoint) {
			throw new Error(t('errors.storageEndpointRequired'));
		}
		return {
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			endpoint: profile.endpoint,
			forcePathStyle: profile.forcePathStyle ?? true,
			publicBaseUrl: profile.publicBaseUrl,
			region: profile.region ?? 'us-east-1',
			secretAccessKey: secrets.secretAccessKey
		};
	}
}
