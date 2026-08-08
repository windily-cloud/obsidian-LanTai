import { Files } from 'files-sdk';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { StorageSecrets } from '../storage-secrets.ts';

export async function createS3Files(
	profile: StorageProfile,
	secrets: StorageSecrets
): Promise<Files> {
	const { s3 } = await import('files-sdk/s3');
	return new Files({
		adapter: s3({
			bucket: profile.bucket,
			credentials: {
				accessKeyId: secrets.accessKeyId,
				secretAccessKey: secrets.secretAccessKey
			},
			publicBaseUrl: profile.publicBaseUrl,
			region: profile.region ?? 'us-east-1'
		})
	});
}
