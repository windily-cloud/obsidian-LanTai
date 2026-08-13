import type { ObjectStat } from './object-storage.ts';

import { isPermissionProbeError } from './probe-object-exists.ts';

export type UploadConflictClass = 'different' | 'free' | 'same' | 'unknown';

interface ClassifyUploadConflictInput {
	readonly localBytes: Uint8Array;
	readonly objectKey: string;
	readonly storage: ClassifyUploadConflictStorage;
}

interface ClassifyUploadConflictStorage {
	download(objectKey: string): Promise<Uint8Array>;
	stat(objectKey: string): Promise<null | ObjectStat>;
}

export async function classifyUploadConflict(
	input: ClassifyUploadConflictInput
): Promise<UploadConflictClass> {
	let remote: null | ObjectStat;
	try {
		remote = await input.storage.stat(input.objectKey);
	} catch (error) {
		if (isPermissionProbeError(error)) {
			return 'unknown';
		}
		throw error;
	}

	if (remote === null) {
		return 'free';
	}
	if (remote.size !== input.localBytes.length) {
		return 'different';
	}

	let remoteBytes: Uint8Array;
	try {
		remoteBytes = await input.storage.download(input.objectKey);
	} catch {
		return 'different';
	}

	return bytesEqual(input.localBytes, remoteBytes) ? 'same' : 'different';
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}
