import { Files } from 'files-sdk';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { StorageSecrets } from '../storage-secrets.ts';

export async function createAlibabaFiles(
	profile: StorageProfile,
	secrets: StorageSecrets
): Promise<Files> {
	const { alibaba } = await import('files-sdk/alibaba');
	return new Files({
		adapter: alibaba({
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			publicBaseUrl: profile.publicBaseUrl,
			region: profile.region ?? '',
			secretAccessKey: secrets.secretAccessKey
		})
	});
}
