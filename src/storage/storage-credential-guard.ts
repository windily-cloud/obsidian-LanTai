import { t } from '../i18n/index.ts';

interface StorageSecretBinding {
	readonly accessKeyId: string;
	readonly accessKeyIdSecretName: string;
	readonly secretAccessKey: string;
	readonly secretAccessKeySecretName: string;
}

export function formatActionError(error: unknown): string {
	if (!(error instanceof Error)) {
		return t('errors.imageActionFailed');
	}
	const code = readErrorCode(error);
	if (code && (error.message === 'UnknownError' || error.message === code)) {
		if (code === 'Unauthorized') {
			return t('errors.storageAuthFailed');
		}
		return t('errors.storageError', { code });
	}
	if (code && code !== error.message) {
		return t('errors.storageErrorWithMessage', { code, message: error.message });
	}
	return error.message;
}

export function validateStorageSecrets(
	binding: StorageSecretBinding
): null | string {
	if (binding.accessKeyIdSecretName === binding.secretAccessKeySecretName) {
		return t('errors.accessKeysMustDiffer');
	}
	if (binding.accessKeyId === binding.secretAccessKey) {
		return t('errors.accessKeysSameValue');
	}
	return null;
}

function readErrorCode(error: Error): null | string {
	if (!('code' in error) || typeof error.code !== 'string' || !error.code) {
		return null;
	}
	return error.code;
}
