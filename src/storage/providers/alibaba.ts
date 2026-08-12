import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { S3Connection } from '../s3-connection.ts';
import type { StorageSecrets } from '../storage-secrets.ts';
import type { StorageProviderAdapter } from './storage-provider-adapter.ts';

import { t } from '../../i18n/index.ts';

export class AlibabaOssProviderAdapter implements StorageProviderAdapter {
	public createConnection(profile: StorageProfile, secrets: StorageSecrets): S3Connection {
		if (!profile.region) {
			throw new Error(t('errors.storageRegionRequired', { provider: 'Alibaba Cloud OSS' }));
		}
		return {
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			endpoint: `https://oss-${profile.region}.aliyuncs.com`,
			forcePathStyle: false,
			publicBaseUrl: profile.publicBaseUrl,
			region: profile.region,
			secretAccessKey: secrets.secretAccessKey
		};
	}
}
