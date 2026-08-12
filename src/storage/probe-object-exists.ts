interface ObjectExistsProbe {
	exists(objectKey: string): Promise<boolean>;
}

const PERMISSION_CODES = new Set([
	'AccessDenied',
	'Unauthorized',
	'Unknown',
	'UnknownError'
]);

const PERMISSION_MESSAGE_RE = /access\s*denied|unknown\s*error/i;
/** Obsidian Android requestUrl / OkHttp native abort — treat as soft-unknown. */
const STREAM_CLOSED_RE = /stream\s*closed/i;

export function isPermissionProbeError(error: unknown): boolean {
	let current: unknown = error;
	const seen = new Set<unknown>();
	while (current instanceof Error && !seen.has(current)) {
		seen.add(current);
		const code = readErrorCode(current);
		if (code && PERMISSION_CODES.has(code)) {
			return true;
		}
		if (PERMISSION_MESSAGE_RE.test(current.message)) {
			return true;
		}
		if (STREAM_CLOSED_RE.test(current.message)) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

/**
 * Soft-probes whether an object key exists.
 * Returns `true`/`false` when the provider answers; `null` when Head/exists
 * is denied so callers can continue with upload (Put-only credentials).
 */
export async function probeObjectExists(
	storage: ObjectExistsProbe,
	objectKey: string
): Promise<boolean | null> {
	try {
		return await storage.exists(objectKey);
	} catch (error) {
		if (isPermissionProbeError(error)) {
			return null;
		}
		throw error;
	}
}

function readErrorCode(error: Error): null | string {
	if (!('code' in error) || typeof error.code !== 'string' || !error.code) {
		return null;
	}
	return error.code;
}
