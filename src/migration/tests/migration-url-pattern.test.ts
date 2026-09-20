import {
	describe,
	expect,
	it
} from 'vitest';

import type { StorageProfile } from '../../settings/sections/s3/storage-profile.ts';

import { t } from '../../i18n/index.ts';
import {
	buildMigrationUrlPattern,
	LANTAI_MIGRATION_URL_PATTERN,
	migrationProfileBlockReason
} from '../migration-url-pattern.ts';

function profile(partial: Partial<StorageProfile> & Pick<StorageProfile, 'provider'>): StorageProfile {
	return {
		accessKeyIdSecretName: 'ak',
		bucket: 'bucket',
		id: 'p1',
		name: 'Profile',
		// eslint-disable-next-line no-template-curly-in-string -- name-template token syntax
		objectKeyTemplate: 'images/${originalName}.${ext}',
		publicBaseUrl: 'https://cdn.example.com/',
		secretAccessKeySecretName: 'sk',
		...partial
	};
}

describe('buildMigrationUrlPattern', () => {
	it('joins publicBaseUrl and the raw objectKeyTemplate without resolving tokens', () => {
		const pattern = buildMigrationUrlPattern(profile({ provider: 's3' }));
		expect(pattern).toBe(
			// eslint-disable-next-line no-template-curly-in-string -- asserting unresolved tokens
			'https://cdn.example.com/images/${originalName}.${ext}'
		);
		expect(pattern).not.toContain('photo');
	});

	it('uses the fixed LanTai pattern', () => {
		expect(buildMigrationUrlPattern(profile({
			provider: 'lantai',
			publicBaseUrl: ''
		}))).toBe(LANTAI_MIGRATION_URL_PATTERN);
	});
});

describe('migrationProfileBlockReason', () => {
	it('requires an active profile', () => {
		expect(migrationProfileBlockReason(null)).toBe(t('errors.noActiveStorageProfile'));
	});

	it('requires publicBaseUrl for S3 profiles', () => {
		expect(migrationProfileBlockReason(profile({ provider: 's3', publicBaseUrl: '  ' }))).toBe(
			t('errors.publicBaseUrlRequired')
		);
	});

	it('does not require publicBaseUrl for LanTai', () => {
		expect(migrationProfileBlockReason(profile({ provider: 'lantai', publicBaseUrl: '' }))).toBeNull();
	});
});
