import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { S3Connection } from '../s3-connection.ts';
import type { StorageSecrets } from '../storage-secrets.ts';
import type { StorageProviderAdapter } from './storage-provider-adapter.ts';

export class AwsS3ProviderAdapter implements StorageProviderAdapter {
	public createConnection(profile: StorageProfile, secrets: StorageSecrets): S3Connection {
		const region = profile.region ?? 'us-east-1';
		return {
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			endpoint: `https://s3.${region}.amazonaws.com`,
			forcePathStyle: false,
			publicBaseUrl: profile.publicBaseUrl,
			region,
			secretAccessKey: secrets.secretAccessKey
		};
	}
}
