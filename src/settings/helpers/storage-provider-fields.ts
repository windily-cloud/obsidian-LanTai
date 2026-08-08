import type { StorageProvider } from '../sections/s3/storage-profile.ts';

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
			label: 'Access Key ID',
			required: true,
			secret: true
		},
		{
			key: 'secretAccessKeySecretName',
			label: 'Secret Access Key',
			required: true,
			secret: true
		}
	];
}

function fieldsFor(provider: StorageProvider): StorageProviderField[] {
	const head: StorageProviderField[] = [
		{ key: 'bucket', label: 'Bucket', required: true },
		{ key: 'publicBaseUrl', label: 'Public Base URL', required: true }
	];
	const tail: StorageProviderField[] = [
		...credentialFields(),
		{ key: 'objectKeyTemplate', label: 'Object key template', required: true }
	];

	switch (provider) {
		case 'alibaba':
		case 's3':
		case 'tencent':
			return [...head, { key: 'region', label: 'Region', required: true }, ...tail];
		case 'r2':
			return [...head, { key: 'accountId', label: 'Account ID', required: true }, ...tail];
		case 's3Compatible':
			return [
				...head,
				{ key: 'endpoint', label: 'Endpoint', required: true },
				{ key: 'region', label: 'Region', required: false },
				{ key: 'forcePathStyle', label: 'Force Path Style', required: false },
				...tail
			];
		default: {
			const _exhaustive: never = provider;
			return _exhaustive;
		}
	}
}

export const StorageProviderFields = { fieldsFor };
