import { parseS3ErrorXml } from './s3-xml.ts';

type StorageErrorCode = 'Conflict' | 'NotFound' | 'Provider' | 'Unauthorized';

const NOT_FOUND_CODES = new Set(['NoSuchKey', 'NotFound']);
const UNAUTHORIZED_CODES = new Set(['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch']);
const CONFLICT_CODES = new Set(['PreconditionFailed']);

const HTTP_CONFLICT = 409;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_PRECONDITION_FAILED = 412;
const HTTP_UNAUTHORIZED = 401;

const FALLBACK_MESSAGES: Readonly<Record<StorageErrorCode, string>> = {
	Conflict: 'Conflict',
	NotFound: 'Not found',
	Provider: 'Object storage error',
	Unauthorized: 'Unauthorized'
};

interface StorageRequestErrorConstructorOptions {
	readonly cause?: Error;
	readonly status?: number;
}

/** Storage failure carrying a normalized `code`, compatible with the existing error guards. */
export class StorageRequestError extends Error {
	/** Normalized provider-agnostic error code used by exists/credential guards. */
	public readonly code: StorageErrorCode;

	public constructor(
		code: StorageErrorCode,
		message: string,
		options: StorageRequestErrorConstructorOptions = {}
	) {
		super(message, { cause: options.cause });
		this.name = 'StorageRequestError';
		this.code = code;
	}
}

/** Maps an S3 XML error response to a {@link StorageRequestError} (mirrors the old SDK semantics). */
export function mapS3ErrorResponse(status: number, body: string): StorageRequestError {
	const { code: rawCode, message } = parseS3ErrorXml(body);
	const code = classify(rawCode, status);
	const cause = rawCode === undefined
		? undefined
		: Object.assign(new Error(message ?? rawCode), { code: rawCode });
	return new StorageRequestError(code, message ?? FALLBACK_MESSAGES[code], {
		...(cause === undefined ? {} : { cause }),
		status
	});
}

function classify(rawCode: string | undefined, status: number): StorageErrorCode {
	if ((rawCode !== undefined && NOT_FOUND_CODES.has(rawCode)) || status === HTTP_NOT_FOUND) {
		return 'NotFound';
	}
	if (
		(rawCode !== undefined && UNAUTHORIZED_CODES.has(rawCode))
		|| status === HTTP_UNAUTHORIZED
		|| status === HTTP_FORBIDDEN
	) {
		return 'Unauthorized';
	}
	if (
		(rawCode !== undefined && CONFLICT_CODES.has(rawCode))
		|| status === HTTP_CONFLICT
		|| status === HTTP_PRECONDITION_FAILED
	) {
		return 'Conflict';
	}
	return 'Provider';
}
