import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { S3Connection } from '../s3-connection.ts';
import type { StorageSecrets } from '../storage-secrets.ts';
import type { StorageProviderAdapter } from './storage-provider-adapter.ts';

import { t } from '../../i18n/index.ts';

export class TencentCosProviderAdapter implements StorageProviderAdapter {
	public createConnection(profile: StorageProfile, secrets: StorageSecrets): S3Connection {
		if (!profile.region) {
			throw new Error(t('errors.storageRegionRequired', { provider: 'Tencent COS' }));
		}
		return {
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			endpoint: `https://cos.${profile.region}.myqcloud.com`,
			forcePathStyle: false,
			publicBaseUrl: profile.publicBaseUrl,
			region: profile.region,
			secretAccessKey: secrets.secretAccessKey
		};
	}
}
