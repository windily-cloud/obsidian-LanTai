import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';
import type { S3Connection } from '../s3-connection.ts';
import type { StorageSecrets } from '../storage-secrets.ts';

/**
 * Unified provider adapter: derives a plain S3-protocol connection description
 * from a storage profile. One implementation per provider; adding a provider
 * means adding a class and registering it.
 */
export interface StorageProviderAdapter {
	createConnection(profile: StorageProfile, secrets: StorageSecrets): S3Connection;
}
