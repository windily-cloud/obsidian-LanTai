import { noopAsync } from 'obsidian-dev-utils/function';
import {
	describe,
	expect,
	it
} from 'vitest';

import { StorageRequestError } from '../../storage/storage-request-error.ts';
import {
	isThrottledStorageError,
	MIGRATION_MIN_INTERVAL_MS,
	MIGRATION_THROTTLE_BASE_MS,
	MigrationUploadPacer,
	throttleRetryAfterMs
} from '../migration-upload-pacer.ts';

describe('MigrationUploadPacer', () => {
	it('spaces successive turns by the configured interval', async () => {
		const sleeps: number[] = [];
		let now = 0;
		const pacer = new MigrationUploadPacer({
			intervalMs: MIGRATION_MIN_INTERVAL_MS,
			now: (): number => now,
			sleep: (ms): Promise<void> => {
				sleeps.push(ms);
				now += ms;
				return noopAsync();
			}
		});
		await pacer.waitTurn();
		await pacer.waitTurn();
		expect(sleeps).toEqual([MIGRATION_MIN_INTERVAL_MS]);
	});

	it('backs off exponentially with full-range jitter when Retry-After is absent', async () => {
		const sleeps: number[] = [];
		const pacer = new MigrationUploadPacer({
			intervalMs: 0,
			random: (): number => 1,
			sleep: (ms): Promise<void> => {
				sleeps.push(ms);
				return noopAsync();
			}
		});
		await pacer.waitRetry(0);
		await pacer.waitRetry(1);
		expect(sleeps).toEqual([
			MIGRATION_THROTTLE_BASE_MS,
			MIGRATION_THROTTLE_BASE_MS * 2
		]);
	});
});

describe('isThrottledStorageError', () => {
	it('detects 429 and 503 statuses', () => {
		expect(isThrottledStorageError(new StorageRequestError('Provider', 'x', { status: 429 }))).toBe(true);
		expect(isThrottledStorageError(new StorageRequestError('Provider', 'x', { status: 503 }))).toBe(true);
		expect(isThrottledStorageError(new StorageRequestError('Provider', 'x', { status: 500 }))).toBe(false);
	});
});

describe('throttleRetryAfterMs', () => {
	it('reads Retry-After from StorageRequestError', () => {
		const error = new StorageRequestError('Provider', 'x', { retryAfterMs: 12, status: 429 });
		expect(throttleRetryAfterMs(error)).toBe(12);
	});
});
