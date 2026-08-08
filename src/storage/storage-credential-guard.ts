export interface StorageSecretBinding {
	readonly accessKeyId: string;
	readonly accessKeyIdSecretName: string;
	readonly secretAccessKey: string;
	readonly secretAccessKeySecretName: string;
}

export function formatActionError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'Image action failed.';
	}
	const code = readErrorCode(error);
	if (code && (error.message === 'UnknownError' || error.message === code)) {
		if (code === 'Unauthorized') {
			return 'Storage authorization failed. Check Access Key ID, Secret Access Key, bucket, and region.';
		}
		return `Storage error (${code}).`;
	}
	if (code && code !== error.message) {
		return `${code}: ${error.message}`;
	}
	return error.message;
}

export function validateStorageSecrets(
	binding: StorageSecretBinding
): null | string {
	if (binding.accessKeyIdSecretName === binding.secretAccessKeySecretName) {
		return 'Access Key ID and Secret Access Key must use different secrets.';
	}
	if (binding.accessKeyId === binding.secretAccessKey) {
		return 'Access Key ID and Secret Access Key resolve to the same value. Bind different secrets.';
	}
	return null;
}

function readErrorCode(error: Error): null | string {
	if (!('code' in error) || typeof error.code !== 'string' || !error.code) {
		return null;
	}
	return error.code;
}
