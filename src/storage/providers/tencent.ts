import { Files } from 'files-sdk';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { StorageSecrets } from '../storage-secrets.ts';

export async function createTencentFiles(
	profile: StorageProfile,
	secrets: StorageSecrets
): Promise<Files> {
	const { tencent } = await import('files-sdk/tencent');
	return new Files({
		adapter: tencent({
			accessKeyId: secrets.accessKeyId,
			bucket: profile.bucket,
			publicBaseUrl: profile.publicBaseUrl,
			region: profile.region ?? '',
			secretAccessKey: secrets.secretAccessKey
		})
	});
}
