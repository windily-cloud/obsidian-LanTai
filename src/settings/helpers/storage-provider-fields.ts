import type { StorageProvider } from '../sections/s3/storage-profile.ts';

import { t } from '../../i18n/index.ts';

export type StorageProfileFieldKey =
	| 'accessKeyIdSecretName'
	| 'accountId'
	| 'bucket'
	| 'endpoint'
	| 'forcePathStyle'
	| 'objectKeyTemplate'
	| 'publicBaseUrl'
	| 'region'
	| 'secretAccessKeySecretName';

export interface StorageProviderField {
	key: StorageProfileFieldKey;
	label: string;
	required: boolean;
	secret?: boolean;
}

function credentialFields(): StorageProviderField[] {
	return [
		{
			key: 'accessKeyIdSecretName',
			label: t('settings.fieldAccessKeyId'),
			required: true,
			secret: true
		},
		{
			key: 'secretAccessKeySecretName',
			label: t('settings.fieldSecretAccessKey'),
			required: true,
			secret: true
		}
	];
}

function fieldsFor(provider: StorageProvider): StorageProviderField[] {
	const head: StorageProviderField[] = [
		{ key: 'bucket', label: t('settings.fieldBucket'), required: true },
		{ key: 'publicBaseUrl', label: t('settings.fieldPublicBaseUrl'), required: true }
	];
	const tail: StorageProviderField[] = [
		...credentialFields(),
		{ key: 'objectKeyTemplate', label: t('settings.fieldObjectKeyTemplate'), required: true }
	];

	switch (provider) {
		case 'alibaba':
		case 's3':
		case 'tencent':
			return [...head, { key: 'region', label: t('settings.fieldRegion'), required: true }, ...tail];
		case 'r2':
			return [...head, { key: 'accountId', label: t('settings.fieldAccountId'), required: true }, ...tail];
		case 's3Compatible':
			return [
				...head,
				{ key: 'endpoint', label: t('settings.fieldEndpoint'), required: true },
				{ key: 'region', label: t('settings.fieldRegion'), required: false },
				{ key: 'forcePathStyle', label: t('settings.fieldForcePathStyle'), required: false },
				...tail
			];
		default: {
			const _exhaustive: never = provider;
			return _exhaustive;
		}
	}
}

export const StorageProviderFields = { fieldsFor };
