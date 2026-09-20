import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';

import { t } from '../i18n/index.ts';

/** 兰台雪花 key 在上传前未知，向导只展示此模式字符串。 */
// eslint-disable-next-line no-template-curly-in-string -- pattern shown to users, not interpolated
export const LANTAI_MIGRATION_URL_PATTERN = 'https://cdn.lantai.pkmer.cn/${id}';

export function buildMigrationUrlPattern(profile: StorageProfile): string {
	if (profile.provider === 'lantai') {
		return LANTAI_MIGRATION_URL_PATTERN;
	}
	const base = profile.publicBaseUrl.trim().replace(/\/+$/u, '');
	const key = profile.objectKeyTemplate.replace(/^\/+/u, '');
	return `${base}/${key}`;
}

export function migrationProfileBlockReason(profile: null | StorageProfile): null | string {
	if (!profile) {
		return t('errors.noActiveStorageProfile');
	}
	if (profile.provider !== 'lantai' && !profile.publicBaseUrl.trim()) {
		return t('errors.publicBaseUrlRequired');
	}
	return null;
}
