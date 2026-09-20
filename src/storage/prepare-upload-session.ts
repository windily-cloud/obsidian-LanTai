import type { ActionResult } from '../actions/action-result.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type { ObjectStorage } from './object-storage.ts';
import type { StorageSecrets } from './storage-secrets.ts';

import { t } from '../i18n/index.ts';
import { validateStorageSecrets } from './storage-credential-guard.ts';

export interface PreparedUploadSession {
	readonly ok: true;
	readonly profile: StorageProfile;
	readonly storage: ObjectStorage;
}

export interface UploadSessionFailure {
	readonly ok: false;
	readonly result: ActionResult;
}

type CreateObjectStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage>;

interface PrepareUploadSessionInput {
	readonly createStorage: CreateObjectStorage;
	getSecret(name: string): null | string;
	readonly settings: PluginSettings;
}

export function actionErrorResult(error: unknown): ActionResult {
	return {
		message: error instanceof Error ? error.message : t('errors.imageActionFailed'),
		ok: false,
		reason: 'error'
	};
}

export async function prepareUploadSession(
	input: PrepareUploadSessionInput
): Promise<PreparedUploadSession | UploadSessionFailure> {
	const profile = input.settings.profiles.find(
		(item) => item.id === input.settings.activeProfileId
	);
	if (!profile) {
		return {
			ok: false,
			result: {
				message: t('errors.noActiveStorageProfile'),
				ok: false,
				reason: 'missing'
			}
		};
	}
	// Lantai：没有 bucket / 公网前缀 / AK-SK，凭证是账号级的 API key，
	// 由存储工厂在运行时从设置与 SecretStorage 读取。
	if (profile.provider === 'lantai') {
		try {
			const storage = await input.createStorage(profile, {
				accessKeyId: '',
				secretAccessKey: ''
			});
			return { ok: true, profile, storage };
		} catch (error) {
			return { ok: false, result: actionErrorResult(error) };
		}
	}

	if (!profile.publicBaseUrl.trim()) {
		return {
			ok: false,
			result: {
				message: t('errors.publicBaseUrlRequired'),
				ok: false,
				reason: 'missing'
			}
		};
	}
	const accessKeyId = input.getSecret(profile.accessKeyIdSecretName);
	const secretAccessKey = input.getSecret(profile.secretAccessKeySecretName);
	if (!accessKeyId || !secretAccessKey) {
		return {
			ok: false,
			result: {
				message: t('errors.storageSecretsMissing'),
				ok: false,
				reason: 'missing'
			}
		};
	}
	const secretProblem = validateStorageSecrets({
		accessKeyId,
		accessKeyIdSecretName: profile.accessKeyIdSecretName,
		secretAccessKey,
		secretAccessKeySecretName: profile.secretAccessKeySecretName
	});
	if (secretProblem) {
		return {
			ok: false,
			result: { message: secretProblem, ok: false, reason: 'missing' }
		};
	}
	const storage = await input.createStorage(profile, {
		accessKeyId,
		secretAccessKey
	});
	return { ok: true, profile, storage };
}
