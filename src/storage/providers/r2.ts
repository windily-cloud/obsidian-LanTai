import { Files } from 'files-sdk';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { StorageSecrets } from '../storage-secrets.ts';

export async function createR2Files(
	profile: StorageProfile,
	secrets: StorageSecrets
): Promise<Files> {
	const { r2 } = await import('files-sdk/r2');
	return new Files({
		adapter: r2({
			accessKeyId: secrets.accessKeyId,
			accountId: profile.accountId ?? '',
			bucket: profile.bucket,
			publicBaseUrl: profile.publicBaseUrl,
			secretAccessKey: secrets.secretAccessKey
		})
	});
}
