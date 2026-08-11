import type { StorageProfile } from '../settings/sections/s3/storage-profile.ts';
import type {
	ObjectStorage,
	ObjectStorageBrowser
} from './object-storage.ts';
import type { StorageSecrets } from './storage-secrets.ts';

import {
	isPermissionProbeError,
	probeObjectExists
} from './probe-object-exists.ts';
import {
	formatActionError,
	isListAccessDenied
} from './storage-credential-guard.ts';

export type ConnectionCheckId = 'client' | 'head' | 'list' | 'secrets' | 'upload';

export interface ConnectionCheckResult {
	readonly detail?: string;
	readonly id: ConnectionCheckId;
	readonly status: ConnectionCheckStatus;
}

export type ConnectionCheckStatus = 'fail' | 'pass' | 'skip';

export interface StorageConnectionTestReport {
	readonly checks: ConnectionCheckResult[];
	readonly ok: boolean;
}

export interface TestStorageConnectionInput {
	readonly createStorage: CreateStorage;
	getSecret(name: string): null | string;
	readonly profile: StorageProfile;
}

type CreateStorage = (
	profile: StorageProfile,
	secrets: StorageSecrets
) => Promise<ObjectStorage & ObjectStorageBrowser>;

interface ResolveSecretsFailure {
	readonly detail: string;
	readonly ok: false;
}

interface ResolveSecretsSuccess {
	readonly ok: true;
	readonly value: StorageSecrets;
}

const PROBE_KEY_PREFIX = 'lantai-connection-test/';

export function formatConnectionTestReport(report: StorageConnectionTestReport): string {
	return report.checks
		.map((check) => {
			let mark: string;
			if (check.status === 'pass') {
				mark = 'OK';
			} else if (check.status === 'skip') {
				mark = 'SKIP';
			} else {
				mark = 'FAIL';
			}
			return check.detail ? `${check.id}: ${mark} — ${check.detail}` : `${check.id}: ${mark}`;
		})
		.join('\n');
}

/** Runs non-destructive-then-cleanup probes against a storage profile. */
export async function testStorageConnection(
	input: TestStorageConnectionInput
): Promise<StorageConnectionTestReport> {
	const checks: ConnectionCheckResult[] = [];
	const secrets = resolveSecrets(input.profile, (name) => input.getSecret(name));
	if (!secrets.ok) {
		checks.push({ detail: secrets.detail, id: 'secrets', status: 'fail' });
		return { checks, ok: false };
	}
	checks.push({ id: 'secrets', status: 'pass' });

	let storage: ObjectStorage & ObjectStorageBrowser;
	try {
		storage = await input.createStorage(input.profile, secrets.value);
		checks.push({ id: 'client', status: 'pass' });
	} catch (error) {
		checks.push({ detail: formatActionError(error), id: 'client', status: 'fail' });
		return { checks, ok: false };
	}

	checks.push(await checkHead(storage));
	checks.push(await checkList(storage));
	checks.push(await checkUpload(storage));

	return {
		checks,
		ok: checks.every((check) => check.status === 'pass')
	};
}

async function checkHead(storage: ObjectStorageBrowser): Promise<ConnectionCheckResult> {
	const probeKey = `${PROBE_KEY_PREFIX}head-probe-${String(Date.now())}`;
	try {
		const result = await probeObjectExists(storage, probeKey);
		if (result === null) {
			return {
				detail: 'HeadObject/exists denied (upload may still work)',
				id: 'head',
				status: 'fail'
			};
		}
		return {
			detail: result ? 'Unexpected: probe key already exists' : 'HeadObject allowed',
			id: 'head',
			status: 'pass'
		};
	} catch (error) {
		return { detail: formatActionError(error), id: 'head', status: 'fail' };
	}
}

async function checkList(storage: ObjectStorageBrowser): Promise<ConnectionCheckResult> {
	try {
		await storage.list({ limit: 1 });
		return { detail: 'ListBucket allowed', id: 'list', status: 'pass' };
	} catch (error) {
		if (isListAccessDenied(error) || isPermissionProbeError(error)) {
			return {
				detail: 'ListBucket denied (gallery "S3" needs this)',
				id: 'list',
				status: 'fail'
			};
		}
		return { detail: formatActionError(error), id: 'list', status: 'fail' };
	}
}

async function checkUpload(storage: ObjectStorage & ObjectStorageBrowser): Promise<ConnectionCheckResult> {
	// eslint-disable-next-line n/no-unsupported-features/node-builtins -- desktop randomUUID
	const key = `${PROBE_KEY_PREFIX}${crypto.randomUUID().replaceAll('-', '')}.txt`;
	try {
		await storage.upload(key, new TextEncoder().encode('lantai-connection-test'));
		try {
			await storage.delete(key);
		} catch (error) {
			return {
				detail: `Upload OK, but delete failed: ${formatActionError(error)}`,
				id: 'upload',
				status: 'fail'
			};
		}
		return { detail: 'PutObject + DeleteObject allowed', id: 'upload', status: 'pass' };
	} catch (error) {
		return { detail: formatActionError(error), id: 'upload', status: 'fail' };
	}
}

function resolveSecrets(
	profile: StorageProfile,
	getSecret: (name: string) => null | string
): ResolveSecretsFailure | ResolveSecretsSuccess {
	if (!profile.bucket.trim()) {
		return { detail: 'Bucket is empty', ok: false };
	}
	if (!profile.publicBaseUrl.trim()) {
		return { detail: 'Public Base URL is empty', ok: false };
	}
	const accessKeyId = getSecret(profile.accessKeyIdSecretName);
	const secretAccessKey = getSecret(profile.secretAccessKeySecretName);
	if (!accessKeyId || !secretAccessKey) {
		return { detail: 'Access Key ID or Secret Access Key is missing', ok: false };
	}
	return { ok: true, value: { accessKeyId, secretAccessKey } };
}
