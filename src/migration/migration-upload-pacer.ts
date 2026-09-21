import { StorageRequestError } from '../storage/storage-request-error.ts';

/**
 * LanTai object uploads allow 600 requests / 60s per user.
 * 100ms is a 10 files/s ceiling that matches that cap; slower uploads skip the wait.
 * AWS throttling guidance uses a 1s base delay and exponential backoff with jitter.
 */
export const MIGRATION_MIN_INTERVAL_MS = 100;
/** Exposed for unit tests. */
export const MIGRATION_THROTTLE_BASE_MS = 1_000;
const MIGRATION_THROTTLE_MAX_MS = 32_000;
export const MIGRATION_THROTTLE_MAX_RETRIES = 5;

const HTTP_SLOW_DOWN = 503;
const HTTP_TOO_MANY_REQUESTS = 429;

interface MigrationUploadPacerConstructorOptions {
	readonly intervalMs?: number;
	now?(): number;
	random?(): number;
	sleep?(ms: number): Promise<void>;
}

const BACKOFF_FACTOR = 2;
const JITTER_MIN = 0.5;
const JITTER_SPAN = 0.5;

export class MigrationUploadPacer {
	private readonly intervalMs: number;
	private lastStartedAt = Number.NEGATIVE_INFINITY;
	private readonly now: () => number;
	private readonly random: () => number;
	private readonly sleep: (ms: number) => Promise<void>;

	public constructor(params: MigrationUploadPacerConstructorOptions = {}) {
		this.intervalMs = params.intervalMs ?? MIGRATION_MIN_INTERVAL_MS;
		this.now = (): number => (params.now === undefined ? Date.now() : params.now());
		this.random = (): number => (params.random === undefined ? Math.random() : params.random());
		this.sleep = (ms): Promise<void> => (params.sleep === undefined ? delay(ms) : params.sleep(ms));
	}

	public async waitRetry(attempt: number, retryAfterMs?: number): Promise<void> {
		const delayMs = retryAfterMs ?? this.backoffMs(attempt);
		await this.sleep(delayMs);
		this.lastStartedAt = this.now();
	}

	public async waitTurn(): Promise<void> {
		const elapsed = this.now() - this.lastStartedAt;
		const wait = this.intervalMs - elapsed;
		if (wait > 0) {
			await this.sleep(wait);
		}
		this.lastStartedAt = this.now();
	}

	private backoffMs(attempt: number): number {
		const exp = Math.min(
			MIGRATION_THROTTLE_MAX_MS,
			MIGRATION_THROTTLE_BASE_MS * (BACKOFF_FACTOR ** attempt)
		);
		const jitter = JITTER_MIN + this.random() * JITTER_SPAN;
		return Math.floor(exp * jitter);
	}
}

export function isThrottledStorageError(error: unknown): boolean {
	if (error instanceof StorageRequestError) {
		return error.status === HTTP_TOO_MANY_REQUESTS || error.status === HTTP_SLOW_DOWN;
	}
	if (!(error instanceof Error)) {
		return false;
	}
	return /\b429\b/u.test(error.message) || /slow\s*down/iu.test(error.message);
}

export function throttleRetryAfterMs(error: unknown): number | undefined {
	if (error instanceof StorageRequestError) {
		return error.retryAfterMs;
	}
	return undefined;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}
